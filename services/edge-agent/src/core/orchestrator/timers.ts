/**
 * Timer Manager - FSM Timer Lifecycle Management
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Encapsulates timer management logic for FSM automatic state transitions.
 * Manages three distinct timers (DWELL, SILENCE, POST-ROLL) with different
 * behaviors and lifecycle rules.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TIMER TYPES AND BEHAVIORS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. DWELL Timer (Fixed Confirmation Period)
 *    - Purpose: Confirm SUSTAINED presence before opening session
 *    - Behavior: FIXED period, NOT resetable by new detections
 *    - Duration: Configured via dwellMs (e.g., 2000ms = 2 seconds)
 *    - Active in: DWELL state only
 *    - Triggers: fsm.t.dwell.ok event after dwellMs expires
 *    - Effect: Transition DWELL → ACTIVE (opens session)
 *
 *    CRITICAL: Timer does NOT reset with new detections
 *    - Why? To confirm presence is SUSTAINED, not just momentary
 *    - If it reset, it would never expire during continuous detections
 *    - That would cause inverted behavior (session opens when nobody is present)
 *
 * 2. SILENCE Timer (Inactivity Timeout)
 *    - Purpose: Detect end of activity (no relevant detections)
 *    - Behavior: RESETABLE by relevant detections
 *    - Duration: Configured via silenceMs (e.g., 5000ms = 5 seconds)
 *    - Active in: ACTIVE state only
 *    - Triggers: fsm.t.silence.ok event if no detections for silenceMs
 *    - Effect: Transition ACTIVE → CLOSING (starts post-roll recording)
 *
 *    Reset conditions:
 *    - ai.detection with relevant=true → Reset timer (activity detected)
 *    - ai.keepalive → Do NOT reset (just heartbeat, no real detection)
 *
 * 3. POST-ROLL Timer (Post-Detection Recording)
 *    - Purpose: Record for fixed period after last detection
 *    - Behavior: FIXED period, runs once after entering CLOSING
 *    - Duration: Configured via postRollMs (e.g., 3000ms = 3 seconds)
 *    - Active in: CLOSING state only
 *    - Triggers: fsm.t.postroll.ok event after postRollMs expires
 *    - Effect: Transition CLOSING → IDLE (closes session)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * TIMER LIFECYCLE AND STATE TRANSITIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * State transition diagram with timer management:
 *
 * ```
 * IDLE (no timers)
 *   ↓ [ai.detection relevant=true]
 * DWELL (start DWELL timer)
 *   │ [timer FIXED for dwellMs, never reset]
 *   ↓ [fsm.t.dwell.ok after dwellMs]
 * ACTIVE (clear DWELL, start SILENCE timer)
 *   │ [ai.detection relevant=true] → RESET SILENCE timer
 *   │ [ai.keepalive] → Do NOT reset timer
 *   ↓ [fsm.t.silence.ok after silenceMs without detections]
 * CLOSING (clear SILENCE, start POST-ROLL timer)
 *   │ [timer FIXED for postRollMs]
 *   ↓ [fsm.t.postroll.ok after postRollMs]
 * IDLE (clear POST-ROLL, all timers inactive)
 * ```
 *
 * Re-activation during POST-ROLL:
 * ```
 * CLOSING (POST-ROLL running)
 *   ↓ [ai.detection relevant=true before postroll expires]
 * ACTIVE (clear POST-ROLL, restart SILENCE timer)
 *   │ [activity resumed, extend recording]
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE DECISIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Why separate TimerManager class?
 * - Separation of concerns: FSM is pure (reduce), timers are side effects
 * - Testability: Can test timer logic independently of FSM reducer
 * - Clarity: Timer management rules are complex, deserve dedicated module
 * - Reusability: Could be used by other state machines if needed
 *
 * Why publish events instead of direct callbacks?
 * - Decoupling: TimerManager doesn't know about FSM implementation
 * - Event-driven: Fits naturally into event bus architecture
 * - Debugging: Timer events visible in bus logs (easy to trace)
 * - Consistency: All FSM transitions are event-driven
 *
 * Why NodeJS.Timeout instead of custom timer abstraction?
 * - Simplicity: No need for extra abstraction layer
 * - Familiarity: Standard Node.js API (setTimeout/clearTimeout)
 * - Testability: Can mock setTimeout in tests if needed
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { TimerManager } from "./timers.js";
 * import { Bus } from "../bus/bus.js";
 *
 * // Initialize timer manager
 * const bus = new Bus();
 * const timerManager = new TimerManager(bus, {
 *   dwellMs: 2000,   // 2 seconds confirmation
 *   silenceMs: 5000, // 5 seconds inactivity
 *   postRollMs: 3000, // 3 seconds post-recording
 * });
 *
 * // In Orchestrator: Manage timers after each state transition
 * const prevState = "IDLE";
 * const currentState = "DWELL";
 * const event = { type: "ai.detection", relevant: true };
 *
 * timerManager.manageTimers(currentState, prevState, event);
 * // → Starts DWELL timer (will emit fsm.t.dwell.ok after 2s)
 *
 * // Subscribe to timer events
 * bus.subscribe("fsm.t.dwell.ok", (event) => {
 *   console.log("DWELL timer expired, ready to activate");
 *   // FSM will transition DWELL → ACTIVE
 * });
 *
 * // Cleanup on shutdown
 * timerManager.clearAll();
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Timer safety:
 * - All timers are cleared before starting new ones (prevents duplicates)
 * - clearAll() ensures no timers run after shutdown (avoids events post-cleanup)
 * - Timer events are harmless if FSM is in unexpected state (ignored)
 *
 * Edge cases:
 * - Multiple rapid state changes: Previous timers are cleared automatically
 * - Timer expires during state transition: Event is queued, handled by FSM
 * - Shutdown during timer: clearAll() prevents zombie timers
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTEGRATION POINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Used by:
 * - Orchestrator: Calls manageTimers() after each FSM state transition
 * - Main application: Calls clearAll() during graceful shutdown
 *
 * Dependencies:
 * - Event Bus: Publishes timer expiration events (fsm.t.*)
 * - FSM Types: Uses State type for state-based timer management
 * - Event Types: Uses AllEvents type for event-based timer reset logic
 *
 * @module core/orchestrator/timers
 */

import { logger } from "../../shared/logging.js";
import type { Bus } from "../bus/bus.js";
import type { State } from "./types.js";
import type { AllEvents } from "../bus/events.js";

/**
 * Timer Configuration
 *
 * Defines timeout durations for each FSM timer.
 *
 * @property dwellMs - DWELL confirmation period (milliseconds)
 *   - Purpose: Confirm SUSTAINED presence before opening session
 *   - Typical: 2000-5000ms (2-5 seconds)
 *   - Behavior: FIXED, not reset by new detections
 *
 * @property silenceMs - SILENCE inactivity timeout (milliseconds)
 *   - Purpose: Detect end of activity (no relevant detections)
 *   - Typical: 5000-10000ms (5-10 seconds)
 *   - Behavior: RESETABLE by relevant detections
 *
 * @property postRollMs - POST-ROLL recording duration (milliseconds)
 *   - Purpose: Record for fixed period after last detection
 *   - Typical: 3000-5000ms (3-5 seconds)
 *   - Behavior: FIXED, runs once after entering CLOSING
 */
export interface TimerConfig {
  dwellMs: number; // DWELL confirmation period
  silenceMs: number; // SILENCE inactivity timeout
  postRollMs: number; // POST-ROLL recording duration
}

/**
 * Timer Manager - Manages FSM timer lifecycle
 *
 * Encapsulates timer creation, reset, and cleanup logic for FSM transitions.
 * Publishes timer events to event bus when timers expire.
 *
 * @example
 * ```typescript
 * const timerManager = new TimerManager(bus, {
 *   dwellMs: 2000,
 *   silenceMs: 5000,
 *   postRollMs: 3000,
 * });
 *
 * timerManager.manageTimers("DWELL", "IDLE", event);
 * // → Starts DWELL timer
 *
 * timerManager.clearAll();
 * // → Cleans up all timers
 * ```
 */
export class TimerManager {
  private bus: Bus;
  private config: TimerConfig;

  // Active timers (undefined when inactive)
  private dwellTimer?: NodeJS.Timeout;
  private silenceTimer?: NodeJS.Timeout;
  private postRollTimer?: NodeJS.Timeout;

  constructor(bus: Bus, config: TimerConfig) {
    this.bus = bus;
    this.config = config;
  }

  /**
   * Manages timers based on current state and event
   *
   * Called by Orchestrator after each FSM state transition to:
   * - Clean up timers from previous state
   * - Start/reset timers for current state
   *
   * @param currentState - FSM state after transition
   * @param prevState - FSM state before transition
   * @param event - Event that triggered the transition
   *
   * @example
   * ```typescript
   * // Transition IDLE → DWELL (detection received)
   * timerManager.manageTimers("DWELL", "IDLE", {
   *   type: "ai.detection",
   *   relevant: true,
   * });
   * // → Starts DWELL timer
   *
   * // Transition DWELL → ACTIVE (dwell timer expired)
   * timerManager.manageTimers("ACTIVE", "DWELL", {
   *   type: "fsm.t.dwell.ok",
   * });
   * // → Clears DWELL timer, starts SILENCE timer
   *
   * // Stay in ACTIVE (relevant detection received)
   * timerManager.manageTimers("ACTIVE", "ACTIVE", {
   *   type: "ai.detection",
   *   relevant: true,
   * });
   * // → Resets SILENCE timer (activity detected)
   * ```
   */
  manageTimers(currentState: State, prevState: State, event: AllEvents): void {
    // Clean up timers when exiting a state
    this.cleanupOnStateExit(prevState, currentState);

    // Start/reset timers based on current state
    switch (currentState) {
      case "DWELL":
        this.manageDwell(prevState);
        break;
      case "ACTIVE":
        this.manageActive(prevState, event);
        break;
      case "CLOSING":
        this.manageClosing(prevState, event);
        break;
    }
  }

  /**
   * Cleans up timers when exiting a state
   *
   * Ensures no zombie timers continue running after state transition.
   * Called before starting new timers in the new state.
   *
   * @param prevState - State being exited
   * @param currentState - State being entered
   *
   * @example
   * ```typescript
   * // Transition DWELL → ACTIVE
   * cleanupOnStateExit("DWELL", "ACTIVE");
   * // → Clears DWELL timer
   *
   * // Transition ACTIVE → CLOSING
   * cleanupOnStateExit("ACTIVE", "CLOSING");
   * // → Clears SILENCE timer
   * ```
   */
  private cleanupOnStateExit(prevState: State, currentState: State): void {
    // Clear DWELL timer when leaving DWELL state
    if (prevState === "DWELL" && currentState !== "DWELL") {
      this.clearDwell();
    }
    // Clear SILENCE timer when leaving ACTIVE state
    if (prevState === "ACTIVE" && currentState !== "ACTIVE") {
      this.clearSilence();
    }
    // Clear POST-ROLL timer when leaving CLOSING state
    if (prevState === "CLOSING" && currentState !== "CLOSING") {
      this.clearPostRoll();
    }
  }

  /**
   * Manages DWELL timer (confirmation period)
   *
   * CRITICAL: Timer is FIXED and does NOT reset with new detections.
   *
   * Purpose: Confirm SUSTAINED presence during dwellMs period.
   * - If timer reset on every detection → Never expires during continuous activity
   * - Result: Session would only open when nobody is present (inverted behavior!)
   *
   * Behavior:
   * - Start timer ONLY when entering DWELL state (isEntering = true)
   * - Do NOT reset timer on subsequent detections while in DWELL
   * - Timer expires after dwellMs → Publish fsm.t.dwell.ok
   *
   * @param prevState - State before current transition
   *
   * @example
   * ```typescript
   * // Entering DWELL from IDLE
   * manageDwell("IDLE");
   * // → Starts DWELL timer (2000ms)
   *
   * // Still in DWELL (new detection received)
   * manageDwell("DWELL");
   * // → Does nothing (timer continues running, not reset)
   *
   * // After 2000ms: Timer expires
   * // → Publishes fsm.t.dwell.ok
   * // → FSM transitions DWELL → ACTIVE
   * ```
   */
  private manageDwell(prevState: State): void {
    const isEntering = prevState !== "DWELL";

    // Start timer ONLY when entering state (fixed confirmation period)
    if (isEntering) {
      this.clearDwell(); // Clear any existing timer (safety)
      this.dwellTimer = setTimeout(() => {
        this.bus.publish("fsm.t.dwell.ok", { type: "fsm.t.dwell.ok" });
      }, this.config.dwellMs);

      logger.debug("DWELL timer started (fixed period, will not reset)", {
        module: "timer-manager",
        dwellMs: this.config.dwellMs,
        note: "Timer will NOT reset on new detections (confirms sustained presence)",
      });
    }
  }

  /**
   * Manages ACTIVE timer (inactivity detection)
   *
   * SILENCE timer resets on relevant detections to detect end of activity.
   *
   * Behavior:
   * - Start timer when entering ACTIVE state
   * - RESET timer on relevant detection (ai.detection with relevant=true)
   * - Do NOT reset on keepalive (ai.keepalive is just heartbeat)
   * - Timer expires after silenceMs without detections → Publish fsm.t.silence.ok
   *
   * @param prevState - State before current transition
   * @param event - Event that triggered the transition
   *
   * @example
   * ```typescript
   * // Entering ACTIVE from DWELL
   * manageActive("DWELL", { type: "fsm.t.dwell.ok" });
   * // → Starts SILENCE timer (5000ms)
   *
   * // Relevant detection received
   * manageActive("ACTIVE", { type: "ai.detection", relevant: true });
   * // → Resets SILENCE timer (activity detected, extend recording)
   *
   * // Keepalive received (heartbeat)
   * manageActive("ACTIVE", { type: "ai.keepalive" });
   * // → Does NOT reset timer (not a real detection)
   *
   * // After 5000ms without relevant detections: Timer expires
   * // → Publishes fsm.t.silence.ok
   * // → FSM transitions ACTIVE → CLOSING
   * ```
   */
  private manageActive(prevState: State, event: AllEvents): void {
    const isEntering = prevState !== "ACTIVE";
    const isRelevantDetection = event.type === "ai.detection" && event.relevant;
    const shouldReset = isRelevantDetection && !isEntering;

    // Start timer when entering, or reset on relevant detection
    if (isEntering || shouldReset) {
      this.clearSilence(); // Clear existing timer
      this.silenceTimer = setTimeout(() => {
        this.bus.publish("fsm.t.silence.ok", { type: "fsm.t.silence.ok" });
      }, this.config.silenceMs);

      const reason = isEntering
        ? "entering ACTIVE state"
        : "relevant detection received";

      logger.debug(`SILENCE timer ${isEntering ? "started" : "reset"}`, {
        module: "timer-manager",
        silenceMs: this.config.silenceMs,
        reason,
        note: isEntering
          ? "Will expire if no relevant detections for silenceMs"
          : "Activity detected, extending recording period",
      });
    }
  }

  /**
   * Manages CLOSING timer (post-roll recording)
   *
   * POST-ROLL timer runs ONCE after entering CLOSING state.
   * Records for fixed period after last detection.
   *
   * Behavior:
   * - Start timer ONLY when entering CLOSING from ACTIVE
   * - Do NOT reset (fixed post-recording period)
   * - Timer expires after postRollMs → Publish fsm.t.postroll.ok
   *
   * Note: If relevant detection arrives during post-roll, FSM can
   * transition back to ACTIVE (re-activation), which clears this timer.
   *
   * @param prevState - State before current transition
   * @param event - Event that triggered the transition
   *
   * @example
   * ```typescript
   * // Entering CLOSING from ACTIVE (silence timer expired)
   * manageClosing("ACTIVE", { type: "fsm.t.silence.ok" });
   * // → Starts POST-ROLL timer (3000ms)
   *
   * // After 3000ms: Timer expires
   * // → Publishes fsm.t.postroll.ok
   * // → FSM transitions CLOSING → IDLE
   *
   * // Re-activation during post-roll:
   * // If detection arrives → FSM transitions CLOSING → ACTIVE
   * // → POST-ROLL timer is cleared (handled by cleanupOnStateExit)
   * ```
   */
  private manageClosing(prevState: State, event: AllEvents): void {
    // Start post-roll timer ONLY when entering from ACTIVE
    if (event.type === "fsm.t.silence.ok" && prevState === "ACTIVE") {
      this.postRollTimer = setTimeout(() => {
        this.bus.publish("fsm.t.postroll.ok", { type: "fsm.t.postroll.ok" });
      }, this.config.postRollMs);

      logger.debug("POST-ROLL timer started (fixed period)", {
        module: "timer-manager",
        postRollMs: this.config.postRollMs,
        note: "Recording will continue for postRollMs, then close session",
      });
    }
  }

  /**
   * Clears DWELL timer
   *
   * Called when exiting DWELL state or as safety cleanup before starting.
   */
  clearDwell(): void {
    if (this.dwellTimer) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = undefined;
    }
  }

  /**
   * Clears SILENCE timer
   *
   * Called when exiting ACTIVE state, or before resetting timer.
   */
  clearSilence(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = undefined;
    }
  }

  /**
   * Clears POST-ROLL timer
   *
   * Called when exiting CLOSING state (e.g., re-activation to ACTIVE).
   */
  clearPostRoll(): void {
    if (this.postRollTimer) {
      clearTimeout(this.postRollTimer);
      this.postRollTimer = undefined;
    }
  }

  /**
   * Clears all pending timers
   *
   * Used during graceful shutdown to prevent events after cleanup.
   * Ensures no zombie timers continue running after application exit.
   *
   * @example
   * ```typescript
   * // In main application shutdown handler
   * process.on("SIGTERM", () => {
   *   timerManager.clearAll();
   *   // ... other cleanup
   *   process.exit(0);
   * });
   * ```
   */
  clearAll(): void {
    this.clearDwell();
    this.clearSilence();
    this.clearPostRoll();
  }
}
