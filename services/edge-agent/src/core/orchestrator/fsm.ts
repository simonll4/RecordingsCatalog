/**
 * Pure FSM - Finite State Machine (Brain of Edge Agent)
 *
 * This is the CENTRAL LOGIC of the Edge Agent. Implements the Pure Reducer pattern:
 * reduce(state, event) → {newState, commands}
 *
 * Characteristics:
 * ================
 *
 * - Pure Function: NO side effects, NO async, NO I/O
 * - Testable: Easy to test (deterministic input/output)
 * - Debuggable: All logic in one place
 * - Auditable: Generates explicit commands (externalized side effects)
 *
 * States:
 * =======
 *
 * - IDLE: Waiting for detections (AI @ idle FPS, no stream, no session)
 * - DWELL: FIXED confirmation window (CONFIG.fsm.dwellMs, prevents false positives)
 * - ACTIVE: Recording session (AI @ active FPS, stream ON, session open)
 * - CLOSING: Post-roll (CONFIG.fsm.postRollMs, extra recording after last detection)
 *
 * State Diagram:
 * ==============
 *
 * ```
 *                     ai.detection (relevant=true)
 *           IDLE ────────────────────────────────────> DWELL
 *            ↑                                           │
 *            │                                           │ fsm.t.dwell.ok
 *            │                                           ↓
 *            │                                        ACTIVE ←──────┐
 *            │                                           │          │
 *            │                                           │          │ ai.detection
 *            │                  fsm.t.silence.ok         │          │ (relevant=true)
 *            │                (no detections)            │          │
 *            │                                           ↓          │
 *            │                                        CLOSING ──────┘
 *            │                                           │
 *            │                          fsm.t.postroll.ok
 *            │                      (post-roll complete)
 *            └───────────────────────────────────────────┘
 * ```
 *
 * Processed Events:
 * =================
 *
 * - ai.detection: AI detection (with `relevant` flag)
 * - ai.keepalive: AI processing but no detections (does NOT reset timers)
 * - fsm.t.dwell.ok: Confirmation timer expired (anti-false-positive window)
 * - fsm.t.silence.ok: Silence timer expired (no relevant detections)
 * - fsm.t.postroll.ok: Post-roll timer expired (extra recording complete)
 * - session.open: Store returned sessionId (async response to OpenSession)
 *
 * Generated Commands:
 * ===================
 *
 * - StartStream: Starts GStreamer pipeline (SHM → RTSP MediaMTX)
 * - StopStream: Stops RTSP pipeline
 * - OpenSession: Creates session in store (async, returns sessionId via event)
 * - CloseSession: Closes session with endTs (marks end of recording)
 * - SetAIFpsMode: Changes AI capture speed (idle vs active FPS)
 *
 * Note: Detections are sent automatically via FrameIngester
 * (AI Engine → Session Store /ingest), do not require orchestrator commands.
 *
 * Why Pure FSM?
 * =============
 *
 * - Separation of concerns: Logic (here) vs Side Effects (orchestrator)
 * - Testing: Testing reduce() is trivial (no mocks, no async)
 * - Time-travel debugging: Replay events to reproduce bugs
 * - Auditability: Commands are complete log of what system did
 *
 * Implementation Details:
 * =======================
 *
 * Dwell Timer (Anti-False-Positive):
 *   - FIXED duration (CONFIG.fsm.dwellMs, e.g., 500ms)
 *   - Timer does NOT reset with new detections (would never expire)
 *   - Must maintain detections during entire window
 *   - If detections disappear before expiry, stays in DWELL until timeout
 *   - Prevents spurious transitions from brief detections
 *
 * Silence Timer (Activity Monitor):
 *   - Tracks time since last relevant detection
 *   - Resets on every relevant detection (extends session)
 *   - Expires after CONFIG.fsm.silenceMs (e.g., 2000ms)
 *   - Triggers transition to CLOSING (post-roll)
 *
 * Post-Roll Timer (Context Capture):
 *   - Records extra footage after last detection
 *   - Fixed duration (CONFIG.fsm.postRollMs, e.g., 1000ms)
 *   - Captures important context (e.g., car leaving frame)
 *   - Can be interrupted by new detection (reactivation)
 *
 * Session Management:
 *   - OpenSession command is async (store HTTP call)
 *   - Store returns sessionId via session.open event
 *   - FSM stores sessionId for CloseSession later
 *   - Reactivation keeps same sessionId (extends session)
 *
 * AI FPS Modes:
 *   - idle: Low FPS (e.g., 5 FPS) during IDLE/CLOSING
 *   - active: High FPS (e.g., 12 FPS) during ACTIVE
 *   - Saves CPU/GPU when not recording
 *   - Improves detection rate when recording
 */

import { Command, FSMContext } from "./types.js";
import { AllEvents } from "../bus/events.js";
import { metrics } from "../../shared/metrics.js";

// ==================== HELPERS ====================

/**
 * Create state transition with metrics tracking
 *
 * Records transition in Prometheus metrics (fsm_transitions_total counter).
 * Simplifies reduce() functions by centralizing metrics and context creation.
 *
 * @param from - Source state (e.g., "IDLE")
 * @param to - Target state (e.g., "DWELL")
 * @param ctx - Partial context to merge with new state
 * @param commands - Commands to execute for this transition
 * @returns New context + commands
 *
 * @example
 * ```typescript
 * return transition("IDLE", "DWELL", { sessionId: undefined }, [
 *   { type: "StartTimer", timer: "dwell" }
 * ]);
 * ```
 */
function transition(
  from: string,
  to: string,
  ctx: Partial<FSMContext>,
  commands: Command[]
): { ctx: FSMContext; commands: Command[] } {
  metrics.inc("fsm_transitions_total", { from, to });
  return {
    ctx: { state: to as any, ...ctx },
    commands,
  };
}

/**
 * No-op transition - Returns same context without changes
 *
 * Used when event is accepted but doesn't trigger state change
 * or command execution (e.g., keepalive during ACTIVE).
 *
 * @param ctx - Current context (unchanged)
 * @returns Same context + empty commands
 */
function noChange(ctx: FSMContext): { ctx: FSMContext; commands: Command[] } {
  return { ctx, commands: [] };
}

/**
 * Reduce - Pure FSM Reducer Function
 *
 * Takes current state + event and returns new state + commands.
 * Does NOT execute side effects (that's orchestrator's responsibility).
 *
 * Pattern:
 * ========
 *
 * ```typescript
 * const {ctx, commands} = reduce(currentCtx, event);
 * // orchestrator executes commands and updates ctx
 * ```
 *
 * Purity Guarantees:
 *   - No I/O (no file/network operations)
 *   - No async (no promises, callbacks)
 *   - No mutations (returns new objects)
 *   - No side effects (no logging, metrics in helpers only)
 *   - Deterministic (same input → same output)
 *
 * This makes reduce() trivial to test:
 *
 * ```typescript
 * const result = reduce({ state: "IDLE" }, { type: "ai.detection", relevant: true });
 * expect(result.ctx.state).toBe("DWELL");
 * expect(result.commands).toEqual([]);
 * ```
 *
 * @param ctx - Current context (state + sessionId)
 * @param event - Event to process (from event bus)
 * @returns New context + commands to execute
 */
export function reduce(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  const { state } = ctx;

  switch (state) {
    // ==================== IDLE ====================
    // Waiting for first relevant detection
    case "IDLE":
      return handleIdleState(ctx, event);

    // ==================== DWELL ====================
    // Anti-false-positive confirmation window
    case "DWELL":
      return handleDwellState(ctx, event);

    // ==================== ACTIVE ====================
    // Recording active session
    case "ACTIVE":
      return handleActiveState(ctx, event);

    // ==================== CLOSING ====================
    // Post-roll: extra recording after last detection
    case "CLOSING":
      return handleClosingState(ctx, event);

    default:
      // Unknown state (TypeScript should prevent this)
      return noChange(ctx);
  }
}

// ==================== STATE HANDLERS ====================

/**
 * IDLE State Handler - Waiting for First Relevant Detection
 *
 * System is quiescent:
 *   - AI running at idle FPS (low CPU/GPU)
 *   - No RTSP stream (no network/encoding overhead)
 *   - No active session (no storage writes)
 *
 * Transitions:
 * ============
 *
 * ai.detection (relevant=true) → DWELL:
 *   - First detection triggers confirmation window
 *   - No commands yet (wait for dwell timer to expire)
 *   - Orchestrator starts dwell timer externally
 *
 * All other events → IDLE:
 *   - Ignored (no effect)
 *
 * @param ctx - Current FSM context
 * @param event - Event to process
 * @returns Updated context + commands
 */
function handleIdleState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  if (event.type === "ai.detection" && event.relevant) {
    return transition("IDLE", "DWELL", { sessionId: undefined }, []);
  }
  return noChange(ctx);
}

/**
 * DWELL State Handler - Confirmation Window (Anti-False-Positive)
 *
 * FIXED-duration confirmation period (CONFIG.fsm.dwellMs).
 * Timer does NOT reset with new detections (would never expire).
 *
 * Purpose:
 * ========
 *
 * Prevents spurious transitions from brief detections:
 *   - Bird flies across camera (50ms detection)
 *   - Shadow moves briefly (100ms detection)
 *   - Lighting changes (transient false positive)
 *
 * Mechanism:
 * ==========
 *
 * - Enter with first relevant detection
 * - Timer runs for CONFIG.fsm.dwellMs (e.g., 500ms)
 * - If detections maintained during entire window → ACTIVE
 * - If detections disappear before expiry → stays in DWELL until timeout
 *
 * CRITICAL: Timer MUST NOT reset with new detections!
 * Otherwise, continuous activity would never let it expire.
 *
 * Transitions:
 * ============
 *
 * fsm.t.dwell.ok → ACTIVE:
 *   - Confirmation period complete
 *   - Start RTSP stream, open session, increase AI FPS
 *
 * ai.detection (relevant=true) → DWELL:
 *   - Accepted but timer does NOT reset
 *   - Just keeps system in DWELL state
 *
 * ai.keepalive → DWELL:
 *   - AI processing but no detections
 *   - No effect (ignored)
 *
 * @param ctx - Current FSM context
 * @param event - Event to process
 * @returns Updated context + commands
 */
function handleDwellState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  if (event.type === "fsm.t.dwell.ok") {
    // Confirmation window OK → start recording
    return transition("DWELL", "ACTIVE", { sessionId: undefined }, [
      { type: "StartStream" },
      { type: "OpenSession" },
      { type: "SetAIFpsMode", mode: "active" },
    ]);
  }

  if (event.type === "ai.detection" && event.relevant) {
    // Detection during DWELL → accepted but timer NOT reset
    return noChange(ctx);
  }

  if (event.type === "ai.keepalive") {
    // Keepalive during DWELL → accepted, no effect
    return noChange(ctx);
  }

  return noChange(ctx);
}

/**
 * ACTIVE State Handler - Recording Session
 *
 * System is fully active:
 *   - AI running at active FPS (high detection rate)
 *   - RTSP stream ON (publishing to MediaMTX)
 *   - Session open (storing detections + metadata)
 *
 * Transitions:
 * ============
 *
 * fsm.t.silence.ok → CLOSING:
 *   - No relevant detections for CONFIG.fsm.silenceMs
 *   - Start post-roll (extra recording)
 *   - Reduce AI FPS to idle (save resources during post-roll)
 *
 * session.open → ACTIVE:
 *   - Store returned sessionId (async response to OpenSession)
 *   - Save sessionId for later CloseSession
 *   - No state change, just update context
 *
 * ai.detection (relevant=true) → ACTIVE:
 *   - Detection resets silence timer (orchestrator handles)
 *   - Extends session indefinitely while detections continue
 *   - No FSM action needed (FrameIngester sends to store)
 *
 * ai.keepalive → ACTIVE:
 *   - AI processing but no detections
 *   - Does NOT reset silence timer (no activity)
 *   - No FSM action needed
 *
 * @param ctx - Current FSM context
 * @param event - Event to process
 * @returns Updated context + commands
 */
function handleActiveState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  const { sessionId } = ctx;

  if (event.type === "fsm.t.silence.ok") {
    // No relevant detections → start post-roll
    return transition("ACTIVE", "CLOSING", { sessionId }, [
      { type: "SetAIFpsMode", mode: "idle" },
    ]);
  }

  if (event.type === "session.open") {
    // Store returned sessionId → save in context
    return noChange({ ...ctx, sessionId: event.sessionId });
  }

  if (event.type === "ai.detection" || event.type === "ai.keepalive") {
    // Detections sent automatically via FrameIngester
    // Silence timer reset ONLY with ai.detection relevance (orchestrator)
    return noChange(ctx);
  }

  return noChange(ctx);
}

/**
 * CLOSING State Handler - Post-Roll (Extra Recording)
 *
 * Records additional footage after last detection to capture complete context:
 *   - Car exiting frame completely
 *   - Person walking out of view
 *   - Complete event closure
 *
 * Duration: CONFIG.fsm.postRollMs (e.g., 1000ms)
 *
 * Transitions:
 * ============
 *
 * fsm.t.postroll.ok → IDLE:
 *   - Post-roll complete
 *   - Stop RTSP stream, close session
 *   - Return to quiescent state
 *
 * ai.detection (relevant=true) → ACTIVE:
 *   - Reactivation: detected something during post-roll
 *   - Extend current session (keep same sessionId)
 *   - Do NOT close/reopen session (preserves continuity)
 *   - Increase AI FPS back to active
 *
 * @param ctx - Current FSM context
 * @param event - Event to process
 * @returns Updated context + commands
 */
function handleClosingState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  const { sessionId } = ctx;

  if (event.type === "fsm.t.postroll.ok") {
    // Post-roll complete → close session and return to IDLE
    return transition("CLOSING", "IDLE", { sessionId: undefined }, [
      { type: "StopStream", sessionId },
      { type: "CloseSession", sessionId: sessionId ?? "" },
    ]);
  }

  // Reactivation: detected something during post-roll
  if (event.type === "ai.detection" && event.relevant) {
    // Extend current session, return to ACTIVE
    // Do NOT close/reopen session, keep same sessionId
    return transition("CLOSING", "ACTIVE", { sessionId }, [
      { type: "SetAIFpsMode", mode: "active" },
    ]);
  }

  return noChange(ctx);
}
