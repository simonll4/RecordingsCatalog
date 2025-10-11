import type { Frame, BackpressureConfig } from "@edge-agent/common";
import pino from "pino";

const logger = pino({ name: "frame-queue" });

export interface QueueStats {
  size: number;
  maxSize: number;
  droppedTotal: number;
  droppedSinceLastReport: number;
  latencyMs: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  enqueuedTotal: number;
  dequeuedTotal: number;
}

/**
 * Bounded frame queue with backpressure support
 *
 * Features:
 * - Ring buffer implementation for O(1) operations
 * - Drop oldest policy when queue is full
 * - Latency tracking (p50, p95)
 * - Periodic metrics logging
 *
 * Thread-safety: Not thread-safe, assumes single-threaded Node.js event loop
 */
export class BoundedFrameQueue {
  private buffer: (Frame | null)[];
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  // Stats
  private droppedTotal: number = 0;
  private droppedSinceLastReport: number = 0;
  private enqueuedTotal: number = 0;
  private dequeuedTotal: number = 0;
  private latencyHistory: number[] = [];
  private maxLatencyHistorySize: number = 100;

  // Metrics reporting
  private metricsInterval: NodeJS.Timeout | null = null;
  private metricsReportIntervalMs: number = 30000; // 30 seconds

  constructor(private config: BackpressureConfig) {
    if (!config.enabled) {
      // Create minimal queue if disabled
      this.buffer = new Array(config.maxQueueSize).fill(null);
      return;
    }

    this.buffer = new Array(config.maxQueueSize).fill(null);

    logger.info(
      {
        maxQueueSize: config.maxQueueSize,
        dropPolicy: config.dropPolicy,
        maxLatencyMs: config.maxQueueLatencyMs,
      },
      "Frame queue initialized"
    );

    // Start metrics reporting
    this.startMetricsReporting();
  }

  /**
   * Enqueue a frame
   * Returns true if enqueued, false if dropped
   */
  enqueue(frame: Frame): boolean {
    if (!this.config.enabled) {
      // Bypass queue if backpressure disabled
      return true;
    }

    this.enqueuedTotal++;

    // Check if queue is full or latency exceeded
    const shouldDrop =
      this.count >= this.config.maxQueueSize ||
      (this.count > 0 && this.latency() > this.config.maxQueueLatencyMs);

    if (shouldDrop) {
      if (this.config.dropPolicy === "drop_oldest") {
        // Drop oldest (head) and add new frame
        if (this.count > 0) {
          this.dequeue(); // Drop oldest
        }
        this.droppedTotal++;
        this.droppedSinceLastReport++;
      } else {
        // drop_newest: reject the incoming frame
        this.droppedTotal++;
        this.droppedSinceLastReport++;
        return false;
      }
    }

    // Add frame to tail
    this.buffer[this.tail] = frame;
    this.tail = (this.tail + 1) % this.config.maxQueueSize;
    this.count++;

    return true;
  }

  /**
   * Dequeue a frame
   * Returns null if queue is empty
   */
  dequeue(): Frame | null {
    if (!this.config.enabled) {
      // No queuing if disabled
      return null;
    }

    if (this.count === 0) {
      return null;
    }

    const frame = this.buffer[this.head];
    this.buffer[this.head] = null; // Allow GC
    this.head = (this.head + 1) % this.config.maxQueueSize;
    this.count--;
    this.dequeuedTotal++;

    // Track latency
    if (frame) {
      const latency = Date.now() - frame.timestamp;
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > this.maxLatencyHistorySize) {
        this.latencyHistory.shift();
      }
    }

    return frame;
  }

  /**
   * Get current queue size
   */
  size(): number {
    return this.count;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this.count >= this.config.maxQueueSize;
  }

  /**
   * Get current latency (age of oldest frame in ms)
   */
  latency(): number {
    if (this.count === 0) return 0;

    const oldest = this.buffer[this.head];
    if (!oldest) return 0;

    return Date.now() - oldest.timestamp;
  }

  /**
   * Calculate latency percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      size: this.count,
      maxSize: this.config.maxQueueSize,
      droppedTotal: this.droppedTotal,
      droppedSinceLastReport: this.droppedSinceLastReport,
      latencyMs: this.latency(),
      latencyP50Ms: this.calculatePercentile(this.latencyHistory, 50),
      latencyP95Ms: this.calculatePercentile(this.latencyHistory, 95),
      enqueuedTotal: this.enqueuedTotal,
      dequeuedTotal: this.dequeuedTotal,
    };
  }

  /**
   * Reset statistics (for reporting windows)
   */
  private resetWindowStats(): void {
    this.droppedSinceLastReport = 0;
  }

  /**
   * Start periodic metrics reporting
   */
  private startMetricsReporting(): void {
    this.metricsInterval = setInterval(() => {
      const stats = this.getStats();

      // Calculate effective FPS
      const effectiveFps =
        stats.dequeuedTotal > 0
          ? (stats.dequeuedTotal / this.metricsReportIntervalMs) * 1000
          : 0;

      // Calculate drop rate
      const dropRate =
        stats.enqueuedTotal > 0
          ? (stats.droppedSinceLastReport / stats.enqueuedTotal) * 100
          : 0;

      logger.info(
        {
          queueSize: stats.size,
          maxSize: stats.maxSize,
          droppedFrames: stats.droppedSinceLastReport,
          droppedTotal: stats.droppedTotal,
          dropRatePct: dropRate.toFixed(2),
          latencyMs: stats.latencyMs,
          latencyP50: stats.latencyP50Ms,
          latencyP95: stats.latencyP95Ms,
          effectiveFps: effectiveFps.toFixed(1),
        },
        "Frame queue metrics"
      );

      this.resetWindowStats();
    }, this.metricsReportIntervalMs);
  }

  /**
   * Stop metrics reporting and cleanup
   */
  destroy(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    // Clear buffer
    this.buffer.fill(null);
    this.count = 0;
    this.head = 0;
    this.tail = 0;

    logger.info("Frame queue destroyed");
  }

  /**
   * Get suggested FPS adjustment based on queue state
   * Returns multiplier: <1 to reduce FPS, >1 to increase FPS, 1 for no change
   */
  getSuggestedFpsAdjustment(): number {
    if (!this.config.adaptCaptureFps) {
      return 1.0;
    }

    const fillRatio = this.count / this.config.maxQueueSize;

    // High pressure: reduce FPS
    if (fillRatio > 0.8) {
      return 0.8; // Reduce by 20%
    }

    // Low pressure: increase FPS
    if (fillRatio < 0.2 && this.count > 0) {
      return 1.1; // Increase by 10%
    }

    return 1.0; // No change
  }
}

/**
 * Adaptive FPS controller
 * Adjusts capture FPS based on queue pressure
 */
export class AdaptiveFpsController {
  private currentFps: number;
  private sustainedHighPressureCount: number = 0;
  private sustainedLowPressureCount: number = 0;
  private readonly highPressureThreshold = 5; // 5 consecutive checks
  private readonly lowPressureThreshold = 10; // 10 consecutive checks

  constructor(private config: BackpressureConfig, initialFps: number) {
    this.currentFps = initialFps;
  }

  /**
   * Update FPS based on queue stats
   * Returns new FPS if adjustment needed, null otherwise
   */
  update(queueStats: QueueStats): number | null {
    if (!this.config.adaptCaptureFps) {
      return null;
    }

    const fillRatio = queueStats.size / queueStats.maxSize;

    // Track sustained pressure
    if (fillRatio > 0.8) {
      this.sustainedHighPressureCount++;
      this.sustainedLowPressureCount = 0;
    } else if (fillRatio < 0.2) {
      this.sustainedLowPressureCount++;
      this.sustainedHighPressureCount = 0;
    } else {
      this.sustainedHighPressureCount = 0;
      this.sustainedLowPressureCount = 0;
    }

    // Adjust FPS if sustained pressure detected
    let newFps: number | null = null;

    if (this.sustainedHighPressureCount >= this.highPressureThreshold) {
      // Reduce FPS
      newFps = Math.max(this.config.minFps, Math.floor(this.currentFps * 0.8));
      this.sustainedHighPressureCount = 0;

      logger.warn(
        {
          oldFps: this.currentFps,
          newFps,
          reason: "sustained high queue pressure",
        },
        "Reducing capture FPS"
      );
    } else if (this.sustainedLowPressureCount >= this.lowPressureThreshold) {
      // Increase FPS
      newFps = Math.min(this.config.maxFps, Math.ceil(this.currentFps * 1.2));
      this.sustainedLowPressureCount = 0;

      logger.info(
        {
          oldFps: this.currentFps,
          newFps,
          reason: "sustained low queue pressure",
        },
        "Increasing capture FPS"
      );
    }

    if (newFps !== null) {
      this.currentFps = newFps;
      return newFps;
    }

    return null;
  }

  getCurrentFps(): number {
    return this.currentFps;
  }
}
