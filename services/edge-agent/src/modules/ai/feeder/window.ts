/**
 * AI Feeder Window Manager - Sliding Window Flow Control
 *
 * Implements sliding window flow control for AI frame processing.
 * Prevents overwhelming AI worker with too many frames.
 *
 * Purpose:
 * ========
 *
 * Flow Control:
 *   - Limits concurrent frames in AI worker (window size)
 *   - Prevents frame queue buildup (backpressure)
 *   - Maintains predictable latency
 *
 * Protocol v1 Window Management:
 *   - Worker advertises initial window size in InitOk (default: 4)
 *   - Worker can adjust window size dynamically via WindowUpdate
 *   - Client tracks inflight frames (sent but no result yet)
 *   - Client only sends when: inflight < windowSize
 *
 * Mechanism:
 * ==========
 *
 * Sliding Window Algorithm:
 *
 * ```
 * windowSize = 4  (max concurrent frames)
 * inflight = 0    (frames in worker, not yet processed)
 *
 * 1. Send frame → inflight++ (0→1)
 * 2. Send frame → inflight++ (1→2)
 * 3. Send frame → inflight++ (2→3)
 * 4. Send frame → inflight++ (3→4)
 * 5. Try send → BLOCKED (inflight=4, window=4, no credits)
 *
 * [Wait for result...]
 *
 * 6. Result received → inflight-- (4→3)
 * 7. Send frame → inflight++ (3→4)
 *
 * Credits available = windowSize - inflight
 * ```
 *
 * Dynamic Window Adjustment:
 *   - Worker can send WindowUpdate to change window size
 *   - Use cases:
 *     * Reduce window when worker overloaded (e.g., 4→2)
 *     * Increase window when worker idle (e.g., 4→8)
 *     * Adapt to GPU memory availability
 *
 * Benefits:
 * =========
 *
 * Latency Control:
 *   - Limits frame queue in worker (bounded latency)
 *   - Prevents 1+ second delays from queue buildup
 *
 * Backpressure:
 *   - Naturally applies backpressure upstream (CameraHub)
 *   - Stops feeding frames when worker saturated
 *
 * Predictability:
 *   - Fixed maximum latency: windowSize × processing_time
 *   - Example: 4 frames × 200ms = 800ms max latency
 *
 * Metrics Tracked:
 * ================
 *
 * ai_window_size (gauge):
 *   - Current window size (credits available)
 *   - Tracks worker capacity
 *
 * ai_inflight (gauge):
 *   - Frames currently in worker (not yet processed)
 *   - Tracks worker utilization
 *
 * window_size_set_events_total (counter):
 *   - Number of WindowUpdate messages received
 *   - Tracks window adjustments
 */

import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import pb from "../../../proto/ai_pb_wrapper.js";

export class WindowManager {
  private windowSize: number = 0;
  private inflight: number = 0;

  /**
   * Creates WindowManager with initial window size
   *
   * @param initialWindowSize - Default window size before InitOk (default: 4)
   */
  constructor(initialWindowSize: number = 4) {
    this.windowSize = initialWindowSize;
  }

  /**
   * Initialize Window Size from InitOk Response
   *
   * Called when handshake completes and worker advertises window size.
   * Resets inflight counter (fresh start after reconnection).
   *
   * @param windowSize - Worker-advertised window size (from InitOk.windowSize)
   *
   * @example
   * ```typescript
   * // After handshake completes
   * const initOk = await receiveInitOk();
   * windowManager.initialize(initOk.windowSize);
   * // Now can start sending frames
   * ```
   */
  initialize(windowSize: number): void {
    this.windowSize = windowSize;
    this.inflight = 0;
    metrics.gauge("ai_window_size", this.windowSize);
    metrics.gauge("ai_inflight", this.inflight);
  }

  /**
   * Process WindowUpdate from Worker
   *
   * Worker can dynamically adjust window size based on load.
   * Updates metrics and logs new window size.
   *
   * @param update - WindowUpdate message from worker (contains newWindowSize)
   *
   * @example
   * ```typescript
   * // Worker sends: WindowUpdate { newWindowSize: 2 }
   * // (reduce window because GPU memory low)
   * windowManager.handleWindowUpdate(update);
   * // Now can only send 2 concurrent frames instead of 4
   * ```
   */
  handleWindowUpdate(update: pb.ai.IWindowUpdate): void {
    this.windowSize = update.newWindowSize || this.windowSize;

    logger.debug("Window updated", {
      module: "window-manager",
      newWindowSize: this.windowSize,
      inflight: this.inflight,
      available: this.getAvailableCredits(),
    });

    metrics.gauge("ai_window_size", this.windowSize);
    metrics.inc("window_size_set_events_total");
  }

  /**
   * Check if Credits Available to Send Frame
   *
   * Returns true if inflight < windowSize (can send).
   * Returns false if inflight >= windowSize (must wait).
   *
   * @returns true if can send frame, false if must wait
   *
   * @example
   * ```typescript
   * if (windowManager.hasCredits()) {
   *   await sendFrame(frame);
   *   windowManager.onFrameSent();
   * } else {
   *   // Wait for result or drop frame (LATEST_WINS policy)
   * }
   * ```
   */
  hasCredits(): boolean {
    return this.inflight < this.windowSize;
  }

  /**
   * Get Available Credits
   *
   * Returns number of frames that can be sent immediately.
   * Useful for batch operations or metrics.
   *
   * @returns Number of available credits (0 to windowSize)
   */
  getAvailableCredits(): number {
    return Math.max(0, this.windowSize - this.inflight);
  }

  /**
   * Record Frame Sent
   *
   * Increments inflight counter when frame is sent to worker.
   * MUST be called AFTER successfully writing frame to TCP.
   *
   * @example
   * ```typescript
   * await tcpClient.writeFrame(frame);
   * windowManager.onFrameSent(); // Update counter
   * ```
   */
  onFrameSent(): void {
    this.inflight++;
    metrics.gauge("ai_inflight", this.inflight);
  }

  /**
   * Record Result Received
   *
   * Decrements inflight counter when worker sends InferResult.
   * Frees up one credit for next frame.
   *
   * @example
   * ```typescript
   * const result = await tcpClient.readInferResult();
   * windowManager.onResultReceived(); // Free credit
   * // Now hasCredits() may return true again
   * ```
   */
  onResultReceived(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    metrics.gauge("ai_inflight", this.inflight);
  }

  /**
   * Reset Counters
   *
   * Called on reconnection to reset state.
   * Assumes all inflight frames are lost (worker restarted).
   *
   * @example
   * ```typescript
   * // Connection lost
   * windowManager.reset(); // inflight = 0
   * // Reconnect and re-initialize
   * await handshake();
   * windowManager.initialize(newWindowSize);
   * ```
   */
  reset(): void {
    this.inflight = 0;
    metrics.gauge("ai_inflight", 0);
  }

  /**
   * Get Current State (for debugging)
   *
   * Returns snapshot of window manager state.
   * Useful for logging, metrics, health checks.
   *
   * @returns Object with windowSize, inflight, available credits
   */
  getState() {
    return {
      windowSize: this.windowSize,
      inflight: this.inflight,
      available: this.getAvailableCredits(),
    };
  }
}
