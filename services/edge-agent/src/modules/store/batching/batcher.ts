/**
 * Batcher - Generic Batching with Size Limit and Timer
 *
 * Groups items into batches and executes flush when:
 *   - Maximum batch size is reached
 *   - Auto-flush timer expires
 *
 * Purpose:
 * ========
 *
 * Efficient Bulk Operations:
 *   - Reduces HTTP requests (batch N items → 1 request)
 *   - Improves database performance (bulk INSERT)
 *   - Lowers network overhead (fewer round-trips)
 *
 * Automatic Flush:
 *   - Size-based: Flush when batch reaches maxSize
 *   - Time-based: Flush every flushIntervalMs
 *   - Manual: Caller can force flush() anytime
 *
 * Use Cases:
 * ==========
 *
 * Detection Batching:
 *   - Accumulate AI detections
 *   - Flush every 50 items OR 1 second
 *   - POST /detections with bulk insert
 *
 * Metrics Batching:
 *   - Accumulate metric events
 *   - Flush every 100 events OR 5 seconds
 *   - POST /metrics with bulk write
 *
 * Log Batching:
 *   - Accumulate log entries
 *   - Flush every 200 logs OR 2 seconds
 *   - POST /logs with bulk append
 *
 * Algorithm:
 * ==========
 *
 * Add Item:
 * ```
 * 1. Push item to batch array
 * 2. If batch.length >= maxSize:
 *    → Flush immediately (size limit reached)
 * 3. Else:
 *    → Schedule auto-flush timer (if not already scheduled)
 * ```
 *
 * Auto-Flush Timer:
 * ```
 * 1. Wait flushIntervalMs
 * 2. Execute flush()
 * 3. Clear timer
 * ```
 *
 * Flush:
 * ```
 * 1. Cancel pending timer
 * 2. Copy batch to local array
 * 3. Clear batch (release memory)
 * 4. Call onFlush(items)
 * 5. Handle errors (log, don't throw)
 * ```
 *
 * Configuration:
 * ==============
 *
 * maxSize:
 *   - Maximum batch size (1-1000)
 *   - Larger: Fewer requests, more latency
 *   - Smaller: More requests, lower latency
 *   - Typical: 50-100 items
 *
 * flushIntervalMs:
 *   - Auto-flush interval (100-10000ms)
 *   - Longer: More batching, more latency
 *   - Shorter: Less batching, lower latency
 *   - Typical: 1000-5000ms
 *
 * onFlush:
 *   - Async callback to process batch
 *   - Should handle errors internally
 *   - Receives array of items
 *
 * Trade-offs:
 * ===========
 *
 * Latency vs Throughput:
 *   - Large batches: High throughput, high latency
 *   - Small batches: Low latency, low throughput
 *   - Auto-flush: Ensures bounded latency
 *
 * Memory vs Network:
 *   - Batching uses memory (stores items)
 *   - But reduces network overhead (fewer requests)
 *   - Max memory: maxSize × item_size
 *
 * Error Handling:
 * ===============
 *
 * Flush Failures:
 *   - Logs error, discards batch
 *   - Does NOT retry (caller's responsibility)
 *   - Does NOT throw (isolates errors)
 *
 * Timer Cleanup:
 *   - Timers cleared on flush
 *   - Timers cleared on clear()
 *   - No timer leaks
 *
 * Example Usage:
 * ==============
 *
 * ```typescript
 * const batcher = new Batcher<Detection>({
 *   maxSize: 50,
 *   flushIntervalMs: 1000,
 *   module: "detection-batcher",
 *   onFlush: async (detections) => {
 *     await fetch("/api/detections", {
 *       method: "POST",
 *       body: JSON.stringify({ detections })
 *     });
 *   }
 * });
 *
 * // Add items (batches automatically)
 * await batcher.add({ cls: "person", conf: 0.95 });
 * await batcher.add({ cls: "helmet", conf: 0.88 });
 *
 * // Force flush (e.g., on shutdown)
 * await batcher.flush();
 *
 * // Cleanup (cancel timers)
 * batcher.clear();
 * ```
 */

import { logger } from "../../../shared/logging.js";

/**
 * Batcher Configuration
 *
 * @template T - Type of items being batched
 */
export interface BatcherConfig<T> {
  /** Maximum batch size (flush immediately when reached) */
  maxSize: number;

  /** Auto-flush interval in milliseconds */
  flushIntervalMs: number;

  /** Callback to execute flush (async, should handle errors) */
  onFlush: (items: T[]) => Promise<void>;

  /** Module name for logging (optional) */
  module?: string;
}

export class Batcher<T> {
  private config: BatcherConfig<T>;
  private batch: T[] = [];
  private flushTimer?: NodeJS.Timeout;

  /**
   * Creates Batcher with Configuration
   *
   * @param config - Batcher configuration (maxSize, interval, onFlush)
   *
   * @example
   * ```typescript
   * const batcher = new Batcher<Detection>({
   *   maxSize: 50,
   *   flushIntervalMs: 1000,
   *   onFlush: async (items) => {
   *     await saveDetections(items);
   *   }
   * });
   * ```
   */
  constructor(config: BatcherConfig<T>) {
    this.config = config;
  }

  /**
   * Add Items to Batch
   *
   * Adds items to batch and flushes if maxSize reached.
   * Otherwise schedules auto-flush timer.
   *
   * @param items - Items to add to batch
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * // Add single item
   * await batcher.add({ cls: "person", conf: 0.95 });
   *
   * // Add multiple items
   * await batcher.add(
   *   { cls: "person", conf: 0.95 },
   *   { cls: "helmet", conf: 0.88 }
   * );
   * ```
   */
  async add(...items: T[]): Promise<void> {
    this.batch.push(...items);

    // Flush if maximum size reached
    if (this.batch.length >= this.config.maxSize) {
      await this.flush();
    } else {
      // Schedule auto-flush
      this.scheduleFlush();
    }
  }

  /**
   * Flush Current Batch
   *
   * Executes onFlush callback with current batch.
   * Clears batch and cancels pending timer.
   *
   * No-op if batch is empty.
   * Errors are logged but not thrown.
   *
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * // Manual flush (e.g., on shutdown)
   * await batcher.flush();
   *
   * // Auto-flush happens automatically
   * await batcher.add(...items); // Triggers flush if maxSize reached
   * ```
   */
  async flush(): Promise<void> {
    // Cancel pending timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    // No-op if batch is empty
    if (this.batch.length === 0) {
      return;
    }

    const items = [...this.batch];
    this.batch = [];

    logger.debug("Flushing batch", {
      module: this.config.module || "batcher",
      count: items.length,
    });

    try {
      await this.config.onFlush(items);
    } catch (err) {
      logger.error("Batch flush failed", {
        module: this.config.module || "batcher",
        count: items.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Schedule Auto-Flush Timer
   *
   * Schedules flush to run after flushIntervalMs.
   * Only schedules if no timer is already active.
   *
   * @private
   */
  private scheduleFlush(): void {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        void this.flush();
      }, this.config.flushIntervalMs);
    }
  }

  /**
   * Get Current Batch Size
   *
   * Returns number of items in batch (not yet flushed).
   *
   * @returns Number of items in batch
   *
   * @example
   * ```typescript
   * console.log(`Batch size: ${batcher.size()}`); // "Batch size: 12"
   * ```
   */
  size(): number {
    return this.batch.length;
  }

  /**
   * Clear Batch and Cancel Timers
   *
   * Discards current batch and cancels pending timer.
   * Useful for shutdown or reset scenarios.
   *
   * WARNING: Items in batch are lost (not flushed).
   * Call flush() first if items should be saved.
   *
   * @example
   * ```typescript
   * // Save items before clearing
   * await batcher.flush();
   * batcher.clear();
   *
   * // Discard items without saving
   * batcher.clear();
   * ```
   */
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.batch = [];
  }
}
