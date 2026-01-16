/**
 * Orchestrator - Central System Coordinator (Finite State Machine)
 *
 * The Orchestrator is the "brain" of the Edge Agent. It implements a pure
 * Finite State Machine (FSM) that coordinates all modules based on events.
 *
 * Core Responsibilities:
 * =====================
 *
 * 1. Event Processing
 *    - Listen to events from bus (ai.detection, ai.keepalive, timers, etc.)
 *    - Feed events into pure FSM reducer function
 *    - Execute resulting commands (side effects)
 *
 * 2. State Management
 *    - Maintain FSM context (state, sessionId, timestamps)
 *    - Coordinate state transitions based on event types
 *    - Manage timer lifecycle for each state
 *
 * 3. Module Coordination
 *    - Translate abstract commands to concrete adapter calls
 *    - Control video streaming, AI processing, session storage
 *    - Ensure modules are started/stopped in correct order
 *
 * FSM States:
 * ===========
 *
 * - IDLE: System at rest, waiting for detections
 *   * AI running at idle FPS (low rate to save resources)
 *   * No streaming active
 *   * No recording session
 *
 * - DWELL: Confirmation window (prevents false positives)
 *   * Fixed duration window (CONFIG.fsm.dwellMs)
 *   * Waits for consistent detections
 *   * Can abort back to IDLE if timer expires without detections
 *
 * - ACTIVE: Recording in progress
 *   * AI running at active FPS (higher rate for accuracy)
 *   * Streaming enabled (on-demand via MediaMTX)
 *   * Session open, frames + detections being ingested
 *   * Silence timer tracks time since last detection
 *
 * - CLOSING: Post-roll capture (recording buffer after last detection)
 *   * Fixed duration (CONFIG.fsm.postRollMs)
 *   * Captures trailing context after subject leaves frame
 *   * Can re-activate if new detection arrives
 *
 * State Transition Flow:
 * =====================
 *
 * ```
 * IDLE ──(ai.detection)──> DWELL
 *      ──(dwell timer OK)──> ACTIVE
 *      ──(silence timer OK)──> CLOSING
 *      ──(postroll timer OK)──> IDLE
 *
 * Special Cases:
 * CLOSING ──(ai.detection)──> ACTIVE  (re-activation, same session)
 * DWELL ──(dwell timer expires, no detections)──> IDLE  (abort)
 * ```
 *
 * Commands (Side Effects):
 * ========================
 *
 * FSM reduce function returns commands to execute:
 *
 * - StartStream: Start RTSP streaming to MediaMTX
 * - StopStream: Stop RTSP streaming
 * - OpenSession: Create new recording session in store
 * - CloseSession: Close session with end timestamp
 * - SetAIFpsMode: Change AI frame rate (idle/active)
 *   Note: With Protocol v1 and backpressure-based flow control, NV12 capture
 *   may ignore dynamic FPS changes (treated as a no-op). Kept for future
 *   compatibility if capture implements dual-rate again.
 *
 * Architecture Pattern:
 * ====================
 *
 * - Pure FSM: reduce(ctx, event) → {ctx, commands}
 * - Side Effects: Executed AFTER reduce (via executeCommand)
 * - Timers: Emit events that re-enter FSM (fsm.t.*)
 * - Adapters: Dependency injection (camera, AI, publisher, store)
 *
 * Why Pure FSM?
 * =============
 *
 * - Testable: reduce() is pure function (easy to unit test)
 * - Debuggable: All logic in one place (fsm.ts)
 * - Predictable: Same event + same state → same result
 * - Auditable: Commands are explicit (what side effects execute)
 *
 * Note on Detection Ingestion:
 * ============================
 *
 * Detections are NOT sent via orchestrator commands.
 * They are automatically ingested by SessionManager when:
 * - Session is active
 * - Relevant detections received from AI worker
 * - Frame is available in cache
 *
 * Orchestrator only manages session lifecycle (open/close).
 */

import { Bus } from "../bus/bus.js";
import type { CameraHub } from "../../modules/video/ports/camera-hub.js";
import type { AIEngine } from "../../modules/ai/ports/ai-engine.js";
import type { Publisher } from "../../modules/streaming/ports/publisher.js";
import type { SessionStore } from "../../modules/store/ports/session-store.js";
import { CONFIG } from "../../config/index.js";
import { logger } from "../../shared/logging.js";
import { metrics } from "../../shared/metrics.js";
import { reduce } from "./fsm.js";
import type { FSMContext, Command, State } from "./types.js";
import type { AllEvents } from "../bus/events.js";
import { TimerManager } from "./timers.js";

/**
 * Module Adapters - Dependency Injection Interface
 *
 * The orchestrator controls these modules via abstract interfaces.
 * Concrete implementations are injected from main.ts.
 */
type Adapters = {
  camera: CameraHub; // Video capture (RTSP → SHM)
  capture: any; // NV12 capture with setMode(idle|active) method
  ai: AIEngine; // AI detection engine (session correlation)
  publisher: Publisher; // RTSP streaming (SHM → MediaMTX)
  store: SessionStore; // Session persistence API (create/close sessions)
};

export class Orchestrator {
  private bus: Bus;
  private adapters: Adapters;

  // FSM context (current state + metadata)
  // This is the "memory" of the state machine
  private ctx: FSMContext = { state: "IDLE" };

  // Timer manager (handles dwell/silence/postroll timers)
  private timers: TimerManager;

  constructor(bus: Bus, adapters: Adapters) {
    this.bus = bus;
    this.adapters = adapters;
    this.timers = new TimerManager(bus, {
      dwellMs: CONFIG.fsm.dwellMs, // Confirmation window duration
      silenceMs: CONFIG.fsm.silenceMs, // Max silence before closing
      postRollMs: CONFIG.fsm.postRollMs, // Post-roll buffer duration
    });
  }

  // ============================================================
  // LIFECYCLE MANAGEMENT
  // ============================================================

  /**
   * Initialize Orchestrator
   *
   * Startup sequence:
   * 1. Wait for camera hub to be ready (may take time for RTSP source)
   * 2. Subscribe to all relevant bus events
   * 3. Enter IDLE state, ready to process detections
   *
   * This must be called after camera.start() but before any events are published.
   */
  async init(): Promise<void> {
    logger.info("Orchestrator initializing", { module: "orchestrator" });

    // Wait for camera hub to finish initialization
    // This can take time if RTSP source has network latency
    await this.adapters.camera.ready();
    logger.info("Camera ready, starting capture", { module: "orchestrator" });

    // Subscribe to all events that affect FSM state
    // These subscriptions must happen before AI starts publishing events
    this.bus.subscribe("ai.detection", (e) => this.handleEvent(e));
    this.bus.subscribe("ai.keepalive", (e) => this.handleEvent(e));
    this.bus.subscribe("session.open", (e) => this.handleEvent(e));
    this.bus.subscribe("session.close", (e) => this.handleEvent(e));
    this.bus.subscribe("fsm.t.dwell.ok", (e) => this.handleEvent(e));
    this.bus.subscribe("fsm.t.silence.ok", (e) => this.handleEvent(e));
    this.bus.subscribe("fsm.t.postroll.ok", (e) => this.handleEvent(e));

    logger.info("Orchestrator ready", {
      module: "orchestrator",
      state: this.ctx.state,
    });
  }

  /**
   * Graceful Shutdown
   *
   * Cleanup sequence:
   * 1. Clear all pending timers
   * 2. Stop modules in dependency order
   * 3. Close any active session (edge case handling)
   *
   * This ensures resources are properly released and sessions are finalized.
   */
  async shutdown() {
    logger.info("Shutting down orchestrator", { module: "orchestrator" });

    // Clear all pending timers (dwell/silence/postroll)
    this.timers.clearAll();

    // Stop modules in reverse dependency order
    // Publisher should already be stopped if in IDLE, but ensure cleanup
    await this.adapters.publisher.stop();
    await this.adapters.capture.stop();
    await this.adapters.camera.stop();

    // Close active session if exists (edge case: shutdown during recording)
    if (this.ctx.sessionId) {
      await this.adapters.store.close(this.ctx.sessionId);
    }
  }

  // ============================================================
  // EVENT PROCESSING & STATE MACHINE
  // ============================================================

  /**
   * Main Event Handler
   *
   * This is the heart of the orchestrator. Every event from the bus
   * flows through this method.
   *
   * Process:
   * 1. Log incoming event (debug level)
   * 2. Execute pure FSM reducer (reduce function in fsm.ts)
   * 3. Update context with new state
   * 4. Log state changes at INFO level (reduce log spam)
   * 5. Execute commands (side effects) returned by reducer
   * 6. Manage timers based on new state
   *
   * The FSM reducer is pure: given same (context, event), always returns
   * same (newContext, commands). This makes the logic testable and predictable.
   *
   * @param event - Event from bus (ai.detection, timers, etc.)
   */
  private handleEvent(event: AllEvents) {
    logger.debug("Event received", {
      module: "orchestrator",
      event: event.type,
      state: this.ctx.state,
    });

    // Save previous state to detect transitions
    const prevState = this.ctx.state;

    // Execute pure FSM: (context, event) → (newContext, commands)
    // The reduce function contains all state transition logic
    const { ctx, commands } = reduce(this.ctx, event);
    this.ctx = ctx;

    // Log state changes at INFO level (important events)
    // Keep no-op events at DEBUG level (reduce log spam)
    if (ctx.state !== prevState) {
      logger.info("FSM state transition", {
        module: "orchestrator",
        from: prevState,
        to: ctx.state,
        event: event.type,
        commands: commands.length,
      });
    } else {
      logger.debug("FSM processed event, no state change", {
        module: "orchestrator",
        state: ctx.state,
        event: event.type,
        commands: commands.length,
      });
    }

    // Execute side effects (commands) returned by FSM
    // These are async but we don't await (fire-and-forget pattern)
    commands.forEach((cmd) => void this.executeCommand(cmd));

    // Update timers based on new state and event
    // TimerManager handles start/cancel logic internally
    this.timers.manageTimers(ctx.state, prevState, event);
  }

  /**
   * Execute Command (Side Effect)
   *
   * Translates abstract Command objects from FSM reducer into concrete
   * adapter method calls. This separation keeps FSM pure and testable.
   *
   * Available Commands:
   * ===================
   *
   * StartStream
   *   - Start RTSP streaming to MediaMTX server
   *   - Enables remote viewing of live feed
   *   - Called when entering ACTIVE state
   *
   * StopStream
   *   - Stop RTSP streaming
   *   - Frees RTSP socket resources
   *   - Called when returning to IDLE state
   *
   * OpenSession
   *   - Create new recording session in session-store
   *   - Returns sessionId for frame correlation
   *   - Publishes session.open event with sessionId
   *   - Sets sessionId in AI adapter for frame tagging
   *   - Called when entering ACTIVE state
   *
   * CloseSession
   *   - Close recording session with end timestamp
   *   - Finalizes session in database
   *   - Publishes session.close event
   *   - Called when returning to IDLE from CLOSING
   *
   * SetAIFpsMode
   *   - Change AI processing frame rate
   *   - idle: Low FPS (e.g., 5fps) to save resources
   *   - active: High FPS (e.g., 12fps) for accurate tracking
   *   - Called on IDLE↔ACTIVE transitions
   *
   * Note on Detection Ingestion:
   * ============================
   * Detections are NOT sent via commands. They are automatically ingested
   * by SessionManager when:
   * - Session is active (orchestrator opened a session)
   * - Relevant detections received from AI worker
   * - Frame is available in cache
   *
   * The orchestrator only manages session lifecycle (open/close),
   * not the actual frame/detection uploads.
   *
   * @param cmd - Command object from FSM reducer (immutable)
   */
  private async executeCommand(cmd: Command) {
    logger.debug("Executing command", {
      module: "orchestrator",
      command: cmd.type,
    });

    switch (cmd.type) {
      case "StartStream":
        // Start RTSP publisher (SHM → MediaMTX server)
        await this.adapters.publisher.start();
        break;

      case "StopStream":
        // Stop RTSP publisher (releases socket resources)
        await this.adapters.publisher.stop();
        if (cmd.sessionId) {
          await this.adapters.ai.closeSession(cmd.sessionId);
        }
        break;

      case "OpenSession":
        // Create new session in session-store API
        const sessionId = await this.adapters.store.open(cmd.at);

        // Set sessionId in AI adapter for frame correlation
        // This ensures all subsequent frames are tagged with this sessionId
        this.adapters.ai.setSessionId(sessionId);

        // Publish session.open event to bus
        // SessionManager subscribes to this and updates its internal state
        this.bus.publish("session.open", {
          type: "session.open",
          sessionId,
          startTs: cmd.at ?? new Date().toISOString(),
        });
        break;

      case "CloseSession":
        // Close session with end timestamp (finalizes in database)
        if (cmd.sessionId) {
          await this.adapters.ai.closeSession(cmd.sessionId);
          await this.adapters.store.close(cmd.sessionId, cmd.at);

          // Publish session.close event to bus
          // SessionManager subscribes to this and clears its state
          this.bus.publish("session.close", {
            type: "session.close",
            sessionId: cmd.sessionId,
            endTs: cmd.at ?? new Date().toISOString(),
          });
        }
        break;

      case "SetAIFpsMode":
        // Change AI frame processing rate
        // idle: Low FPS (e.g., 5fps) - save CPU when nothing happening
        // active: High FPS (e.g., 12fps) - accurate tracking during recording
        this.adapters.capture.setMode(cmd.mode);
        break;
    }
  }
}
