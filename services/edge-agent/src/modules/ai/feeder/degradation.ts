/**
 * Degradation Strategy - Format/Codec Degradation Management
 *
 * Manages degradation strategy when AI worker rejects frames
 * due to errors like FRAME_TOO_LARGE or UNSUPPORTED_FORMAT.
 *
 * Purpose:
 * ========
 *
 * Graceful Fallback:
 *   - Worker rejects raw NV12 frames (too large or unsupported)
 *   - Edge switches to JPEG codec (smaller size)
 *   - Preserves functionality at cost of CPU overhead
 *
 * Current Strategy:
 *   - Switch to JPEG codec if NV12 raw fails
 *   - Limit attempts (max 3)
 *   - Cooldown between attempts (5 seconds)
 *
 * Responsibilities:
 * =================
 *
 * Attempt Tracking:
 *   - Counts degradation attempts
 *   - Enforces max attempts limit
 *   - Prevents infinite degradation loops
 *
 * Cooldown Management:
 *   - Prevents rapid retries
 *   - Gives system time to stabilize
 *   - Reduces log/metric spam
 *
 * Metrics Recording:
 *   - Tracks degradation triggers
 *   - Monitors failure rates
 *   - Alerts on configuration issues
 *
 * Degradation Flow:
 * =================
 *
 * 1. Normal operation (NV12 raw @ 640×480)
 * 2. Worker rejects frame: ErrorCode = FRAME_TOO_LARGE
 * 3. DegradationManager.shouldDegrade(FRAME_TOO_LARGE) → true
 * 4. DegradationManager.startAttempt() → attempt 1/3
 * 5. Edge reconfigures: NV12 raw → JPEG compressed
 * 6. DegradationManager.finishAttempt() → cooldown for 5s
 * 7. If still fails: repeat until max attempts (3)
 * 8. If max reached: give up, log error
 *
 * Why Degradation?
 * ================
 *
 * Compatibility:
 *   - Different workers have different limits
 *   - JPEG compression reduces frame size
 *   - Fallback maintains functionality
 *
 * Robustness:
 *   - Handles configuration mismatches
 *   - Adapts to worker constraints
 *   - Prevents hard failures
 *
 * Trade-offs:
 *   - JPEG: Smaller size, but CPU overhead for encode/decode
 *   - Raw: Larger size, but zero CPU overhead
 *   - Prefer raw, fallback to JPEG if needed
 *
 * Error Codes Triggering Degradation:
 * ====================================
 *
 * FRAME_TOO_LARGE:
 *   - Frame exceeds maxFrameBytes from InitOk
 *   - Solution: Switch to JPEG (smaller compressed size)
 *
 * UNSUPPORTED_FORMAT:
 *   - Worker doesn't support NV12 (only I420, for example)
 *   - Solution: Reconfigure capture to use I420
 *   - Or: Use JPEG (universal compatibility)
 *
 * Future Enhancements:
 * ====================
 *
 * Multi-Step Degradation:
 *   1. Try NV12 raw @ full resolution
 *   2. Try I420 raw @ full resolution
 *   3. Try JPEG @ full resolution
 *   4. Try JPEG @ reduced resolution (e.g., 320×240)
 *   5. Give up
 *
 * Adaptive Resolution:
 *   - Reduce resolution incrementally
 *   - Maintain aspect ratio
 *   - Monitor quality impact
 */

import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import pb from "../../../proto/ai_pb_wrapper.js";

/**
 * Degradation Configuration
 */
export interface DegradationConfig {
  maxAttempts: number; // Maximum degradation attempts
  cooldownMs: number; // Cooldown between attempts (milliseconds)
}

export class DegradationManager {
  private attempts = 0;
  private isDegrading = false;
  private config: DegradationConfig;

  /**
   * Creates DegradationManager with configuration
   *
   * @param config - Optional configuration (defaults: maxAttempts=3, cooldownMs=5000)
   */
  constructor(config?: Partial<DegradationConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 3,
      cooldownMs: config?.cooldownMs ?? 5000,
    };
  }

  /**
   * Check if Can Attempt Degradation
   *
   * Returns true if:
   *   - Not currently degrading (cooldown complete)
   *   - Attempts < maxAttempts
   *
   * @returns true if can attempt degradation, false otherwise
   */
  canAttempt(): boolean {
    return !this.isDegrading && this.attempts < this.config.maxAttempts;
  }

  /**
   * Check if Attempt Limit Reached
   *
   * Returns true if no more degradation attempts allowed.
   * System should give up and log error.
   *
   * @returns true if max attempts reached, false otherwise
   */
  isLimitReached(): boolean {
    return this.attempts >= this.config.maxAttempts;
  }

  /**
   * Get Current Attempt Count
   *
   * @returns Number of degradation attempts so far (0 to maxAttempts)
   */
  getAttempts(): number {
    return this.attempts;
  }

  /**
   * Check if Error Code Should Trigger Degradation
   *
   * Returns true for:
   *   - FRAME_TOO_LARGE: Frame exceeds maxFrameBytes
   *   - UNSUPPORTED_FORMAT: Worker doesn't support format
   *
   * @param errorCode - Error code from InferResult
   * @returns true if should degrade, false otherwise
   */
  shouldDegrade(errorCode: pb.ai.ErrorCode): boolean {
    return (
      errorCode === pb.ai.ErrorCode.FRAME_TOO_LARGE ||
      errorCode === pb.ai.ErrorCode.UNSUPPORTED_FORMAT
    );
  }

  /**
   * Start Degradation Attempt
   *
   * Increments attempt counter and sets degrading flag.
   * Caller should reconfigure capture pipeline after this.
   *
   * @returns true if attempt started, false if limit reached
   *
   * @example
   * ```typescript
   * if (degradation.shouldDegrade(errorCode)) {
   *   if (degradation.startAttempt()) {
   *     // Reconfigure capture: NV12 raw → JPEG
   *     await reconfigureCapture("JPEG");
   *     degradation.finishAttempt(); // Start cooldown
   *   } else {
   *     // Max attempts reached, give up
   *     logger.error("Degradation failed after max attempts");
   *   }
   * }
   * ```
   */
  startAttempt(): boolean {
    if (!this.canAttempt()) {
      if (this.isLimitReached()) {
        logger.error("Max degradation attempts reached", {
          module: "degradation",
          attempts: this.attempts,
          max: this.config.maxAttempts,
        });
      }
      return false;
    }

    this.isDegrading = true;
    this.attempts++;

    logger.info("Degradation attempt started", {
      module: "degradation",
      attempt: this.attempts,
      max: this.config.maxAttempts,
    });

    return true;
  }

  /**
   * Finish Attempt and Start Cooldown
   *
   * Schedules cooldown timer to reset isDegrading flag.
   * Prevents rapid retries, gives system time to stabilize.
   *
   * @example
   * ```typescript
   * if (degradation.startAttempt()) {
   *   await reconfigureCapture("JPEG");
   *   degradation.finishAttempt(); // Start 5s cooldown
   * }
   * // After 5s, can attempt again if needed
   * ```
   */
  finishAttempt(): void {
    setTimeout(() => {
      this.isDegrading = false;
      logger.debug("Degradation cooldown complete", {
        module: "degradation",
      });
    }, this.config.cooldownMs);
  }

  /**
   * Record Metrics for Degradation Error
   *
   * Increments counters for specific error types.
   * Used for monitoring and alerting.
   *
   * Metrics:
   *   - ai_degrade_frame_too_large_total: FRAME_TOO_LARGE errors
   *   - ai_degrade_unsupported_format_total: UNSUPPORTED_FORMAT errors
   *
   * @param errorCode - Error code from InferResult
   */
  recordMetrics(errorCode: pb.ai.ErrorCode): void {
    if (errorCode === pb.ai.ErrorCode.FRAME_TOO_LARGE) {
      metrics.inc("ai_degrade_frame_too_large_total");
    }

    if (errorCode === pb.ai.ErrorCode.UNSUPPORTED_FORMAT) {
      metrics.inc("ai_degrade_unsupported_format_total");
    }
  }

  /**
   * Reset State
   *
   * Clears attempt counter and degrading flag.
   * Useful for:
   *   - Tests (reset between test cases)
   *   - Reconnection (fresh start after connection drop)
   *
   * @example
   * ```typescript
   * // Connection lost, reconnecting
   * degradation.reset(); // Clear history
   * await reconnect();
   * // Start fresh, can attempt degradation again
   * ```
   */
  reset(): void {
    this.attempts = 0;
    this.isDegrading = false;
    logger.debug("Degradation state reset", { module: "degradation" });
  }
}
