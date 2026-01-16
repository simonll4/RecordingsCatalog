/**
 * Frame Cache - Temporal NV12/I420 Frame Cache for Detection Correlation
 *
 * Maintains frames in memory for limited time (TTL) so they can be
 * retrieved when detections arrive from AI worker.
 *
 * Purpose:
 * ========
 *
 * Frame Correlation:
 *   - AI processing is asynchronous (50-200ms latency)
 *   - Must correlate AI results with original frames
 *   - Cache stores frames until results arrive
 *
 * Flow:
 * =====
 *
 * 1. AI Feeder Caches Frame Before Sending to Worker
 *    ```typescript
 *    frameCache.set({
 *      seqNo: "123",
 *      data: nv12Buffer,
 *      meta: { width, height, format, planes },
 *      captureTs: "2025-01-11T12:00:00.000Z"
 *    });
 *    await aiClient.sendFrame(nv12Buffer, seqNo);
 *    ```
 *
 * 2. Worker Responds with frame_id (= seqNo)
 *    ```protobuf
 *    InferResult {
 *      frame_id: "123"
 *      detections: [...]
 *    }
 *    ```
 *
 * 3. Main Retrieves Frame from Cache
 *    ```typescript
 *    const frame = frameCache.get("123");
 *    if (frame) {
 *      const jpeg = await convertNV12ToJpeg(frame.data, frame.meta);
 *      await sessionStore.ingest(jpeg, detections);
 *    }
 *    ```
 *
 * 4. Frame Expires After TTL (default 2 seconds)
 *    - Automatic cleanup every 1 second
 *    - Prevents memory leak from unprocessed frames
 *
 * TTL (Time To Live):
 * ===================
 *
 * Default: 2000ms (2 seconds)
 *
 * Rationale:
 *   - AI processing: 50-200ms typical
 *   - Network delays: up to 500ms
 *   - Margin for retries: 1000ms
 *   - Total: ~2000ms sufficient
 *
 * Trade-offs:
 *   - Too short: Frames expire before results arrive (correlation fails)
 *   - Too long: Memory waste (frames never used)
 *   - 2s is good balance for typical scenarios
 *
 * Memory Management:
 * ==================
 *
 * Frame Size:
 *   - 640×480 NV12 ≈ 460 KB per frame
 *   - Window size = 4 frames
 *   - Max memory ≈ 2 MB (negligible)
 *
 * Cleanup Strategy:
 *   - Automatic cleanup every 1 second
 *   - Removes frames older than TTL
 *   - Prevents unbounded growth
 *
 * Edge Cases:
 * ===========
 *
 * Frame Not Found:
 *   - Result arrives but frame already expired
 *   - Possible causes: AI too slow, network delays
 *   - Solution: Increase TTL or investigate AI performance
 *
 * Frame Never Retrieved:
 *   - Frame sent but worker crashes before result
 *   - Cleanup will remove after TTL
 *   - No memory leak
 *
 * Reconnection:
 *   - Cache persists across reconnections
 *   - Frames may become orphaned (worker restarted)
 *   - Cleanup handles orphaned frames automatically
 */

import { logger } from "../../../shared/logging.js";
import type { NV12FrameMeta } from "../../video/adapters/gstreamer/nv12-capture-gst.js";

/**
 * Cached Frame Entry
 *
 * @property seqNo - Sequence number (string to avoid uint64 overflow)
 * @property data - Raw NV12/I420 frame data
 * @property meta - Metadata with format, resolution, plane information
 * @property captureTs - ISO timestamp when frame was captured
 * @property insertedAt - Unix timestamp (ms) when cached (for TTL)
 */
export type CachedFrame = {
  seqNo: string;
  data: Buffer;
  meta: NV12FrameMeta;
  captureTs: string;
  insertedAt: number;
};

export class FrameCache {
  private cache = new Map<string, CachedFrame>();
  private ttlMs: number;
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * Creates FrameCache with TTL
   *
   * @param ttlMs - Time to live in milliseconds (default: 2000ms = 2 seconds)
   *
   * @example
   * ```typescript
   * const cache = new FrameCache(2000); // 2s TTL
   * cache.set({ seqNo: "123", data: buffer, meta, captureTs });
   * const frame = cache.get("123"); // Retrieve within 2s
   * ```
   */
  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;

    // Periodic cleanup every 1 second
    this.cleanupInterval = setInterval(() => this.cleanup(), 1000);
  }

  /**
   * Insert Frame into Cache
   *
   * Stores frame with current timestamp for TTL calculation.
   * If frame with same seqNo exists, it's overwritten (shouldn't happen).
   *
   * @param frame - Frame to cache (without insertedAt, added automatically)
   *
   * @example
   * ```typescript
   * cache.set({
   *   seqNo: "123",
   *   data: nv12Buffer,
   *   meta: { width: 640, height: 480, format: "NV12", planes: [...] },
   *   captureTs: "2025-01-11T12:00:00.000Z"
   * });
   * ```
   */
  set(frame: Omit<CachedFrame, "insertedAt">): void {
    this.cache.set(frame.seqNo, {
      ...frame,
      insertedAt: Date.now(),
    });
  }

  /**
   * Retrieve Frame from Cache
   *
   * Returns frame if found and not expired.
   * Returns null if:
   *   - Frame doesn't exist
   *   - Frame expired (age > TTL)
   *
   * Expired frames are automatically deleted on access.
   *
   * @param seqNo - Sequence number to look up
   * @returns Frame if found and valid, null otherwise
   *
   * @example
   * ```typescript
   * const frame = cache.get("123");
   * if (frame) {
   *   // Frame found and valid
   *   const jpeg = await convertNV12ToJpeg(frame.data, frame.meta);
   * } else {
   *   // Frame expired or not found
   *   logger.warn("Frame not in cache", { seqNo: "123" });
   * }
   * ```
   */
  get(seqNo: string): CachedFrame | null {
    const frame = this.cache.get(seqNo);

    if (!frame) {
      return null;
    }

    // Check TTL
    const age = Date.now() - frame.insertedAt;
    if (age > this.ttlMs) {
      this.cache.delete(seqNo);
      logger.debug("Frame expired in cache", {
        module: "frame-cache",
        seqNo,
        age,
      });
      return null;
    }

    return frame;
  }

  /**
   * Cleanup Expired Frames
   *
   * Removes frames older than TTL.
   * Called automatically every 1 second.
   * Prevents memory leak from unprocessed frames.
   *
   * @private
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [seqNo, frame] of this.cache.entries()) {
      if (now - frame.insertedAt > this.ttlMs) {
        this.cache.delete(seqNo);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug("Frame cache cleanup", {
        module: "frame-cache",
        removed,
        remaining: this.cache.size,
      });
    }
  }

  /**
   * Get Current Cache Size
   *
   * @returns Number of frames currently cached
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear Entire Cache
   *
   * Removes all frames immediately.
   * Useful for:
   *   - Tests (reset between test cases)
   *   - Shutdown (release memory)
   *   - Reconnection (discard orphaned frames)
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Destroy Cache and Release Resources
   *
   * Stops cleanup interval and clears cache.
   * Call this during shutdown to prevent memory leaks.
   *
   * After calling destroy(), the cache should not be used again.
   *
   * @example
   * ```typescript
   * // During shutdown
   * frameCache.destroy();
   * ```
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.cache.clear();
    logger.debug("Frame cache destroyed", { module: "frame-cache" });
  }
}
