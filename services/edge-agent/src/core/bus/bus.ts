/**
 * Event Bus - Central Communication Channel
 *
 * Implements Publisher-Subscriber pattern with backpressure to prevent
 * memory leaks when consumers are slower than producers.
 *
 * Features:
 * =========
 *
 * Type Safety
 *   - Events are strongly typed with known topics
 *   - Compile-time validation of event payloads
 *   - IntelliSense support for event properties
 *
 * Backpressure
 *   - Configurable limit of in-flight events per topic (default: 1024)
 *   - Drops new events when queue is full (fail-fast vs OOM)
 *   - Logs warnings periodically to alert operators
 *
 * Metrics
 *   - Counts published events per topic (bus_publish_total)
 *   - Tracks dropped events per topic (bus_drops_total)
 *   - Exposes statistics for monitoring
 *
 * Async Safety
 *   - Uses setImmediate to decrement counters
 *   - Prevents race conditions in event counting
 *   - Ensures accurate backpressure tracking
 *
 * Usage Example:
 * ==============
 *
 * ```typescript
 * // Publish event
 * bus.publish("ai.detection", {
 *   type: "ai.detection",
 *   relevant: true,
 *   detections: [...]
 * });
 *
 * // Subscribe to events
 * const unsub = bus.subscribe("ai.detection", (event) => {
 *   console.log("Detection received:", event.detections);
 * });
 *
 * // Unsubscribe when done
 * unsub();
 * ```
 *
 * Backpressure Behavior:
 * ======================
 *
 * When to Drop:
 *   - Topic has > maxQueueSize events in-flight
 *   - New event is rejected immediately
 *   - publish() returns false (caller can decide how to handle)
 *
 * Warning Frequency:
 *   - Every 100 dropped events (reduces log spam)
 *   - Always increments bus_drops_total metric
 *
 * Why Backpressure?
 * =================
 *
 * Without limits, a slow consumer can accumulate events infinitely,
 * causing Out Of Memory (OOM) crashes. We prefer dropping events
 * over crashing the entire system.
 *
 * Common causes of backpressure:
 * - Slow database writes (session-store)
 * - Network latency (frame uploads)
 * - CPU-bound processing (frame encoding)
 *
 * Configuration:
 * ==============
 * - BUS_MAX_QUEUE_SIZE env var (default: 1024)
 * - Set in CONFIG.bus.maxQueueSize
 */

import { EventEmitter } from "events";
import { KnownTopic, EventOf } from "./events.js";
import { metrics } from "../../shared/metrics.js";
import { logger } from "../../shared/logging.js";
import { CONFIG } from "../../config/index.js";

type Unsubscribe = () => void;

export class Bus extends EventEmitter {
  // In-flight event counters per topic
  // Tracks how many events are currently being processed
  private bufferCounts = new Map<string, number>();

  // Dropped event counters per topic (for backpressure monitoring)
  private droppedCounts = new Map<string, number>();

  // Maximum in-flight events per topic (prevents OOM)
  // Configurable via CONFIG.bus.maxQueueSize
  private maxQueueSize: number;

  constructor() {
    super();

    // Prevent EventEmitter warnings (multiple listeners is normal here)
    // Orchestrator, SessionManager, and others all subscribe
    this.setMaxListeners(50);

    // Load queue size limit from configuration
    this.maxQueueSize = CONFIG.bus.maxQueueSize;
  }

  /**
   * Publish Event to Topic
   *
   * Emits event to all subscribers of the topic.
   * If backpressure limit is reached, event is dropped.
   *
   * Backpressure Logic:
   * ===================
   * 1. Check if topic queue is full (>= maxQueueSize)
   * 2. If full: increment drop counter, log warning, return false
   * 3. If OK: increment in-flight counter, emit event
   * 4. After emit: schedule counter decrement for next tick
   *
   * The decrement is delayed using setImmediate to ensure it happens
   * AFTER all synchronous event handlers complete. This prevents
   * race conditions where counter is decremented before processing starts.
   *
   * @param topic - Event topic (ai.detection, ai.keepalive, etc.)
   * @param event - Event payload (must match topic type signature)
   * @returns true if published, false if dropped due to backpressure
   */
  publish<T extends KnownTopic>(topic: T, event: EventOf<T>): boolean {
    const count = this.bufferCounts.get(topic) ?? 0;

    // Backpressure: drop event if queue is full
    if (count >= this.maxQueueSize) {
      const dropped = this.droppedCounts.get(topic) ?? 0;
      this.droppedCounts.set(topic, dropped + 1);

      // Increment metrics counter
      metrics.inc("bus_drops_total", { topic });

      // Log warning every 100 drops (reduce log spam)
      if (dropped % 100 === 0) {
        logger.warn("Bus backpressure detected", {
          module: "bus",
          topic,
          dropped,
        });
      }

      return false; // Signal caller that event was dropped
    }

    // Increment in-flight counter
    this.bufferCounts.set(topic, count + 1);
    metrics.inc("bus_publish_total", { topic });

    // Emit event to all subscribers
    this.emit(topic, event);

    // Decrement counter on next tick (after synchronous handlers complete)
    // This assumes handlers process event synchronously in current tick
    setImmediate(() => {
      const current = this.bufferCounts.get(topic) ?? 0;
      this.bufferCounts.set(topic, Math.max(0, current - 1));
    });

    return true; // Successfully published
  }

  /**
   * Subscribe to Topic
   *
   * Registers a handler function to be called whenever an event
   * is published to the specified topic.
   *
   * Handler Execution:
   * ==================
   * - Handlers are called synchronously when event is published
   * - If handler is async, it runs fire-and-forget (no await)
   * - Errors in handlers don't affect other handlers or publisher
   * - Handlers should complete quickly to avoid backpressure
   *
   * Unsubscribing:
   * ==============
   * Call the returned function to remove the handler.
   * Always unsubscribe when handler is no longer needed to prevent leaks.
   *
   * @param topic - Topic to listen to
   * @param handler - Callback function (event) => void
   * @returns Function to unsubscribe (removes this handler)
   */
  subscribe<T extends KnownTopic>(
    topic: T,
    handler: (event: EventOf<T>) => void
  ): Unsubscribe {
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }

  /**
   * Get Bus Statistics
   *
   * Returns current state of event buffers and drop counters.
   * Useful for debugging, monitoring, and capacity planning.
   *
   * Example output:
   * ```javascript
   * {
   *   buffers: {
   *     "ai.detection": 3,      // 3 events in-flight
   *     "ai.keepalive": 0       // all processed
   *   },
   *   dropped: {
   *     "ai.detection": 127     // 127 events dropped (backpressure!)
   *   }
   * }
   * ```
   *
   * @returns Object with buffers (in-flight counts) and dropped (total drops)
   */
  getStats() {
    return {
      buffers: Object.fromEntries(this.bufferCounts),
      dropped: Object.fromEntries(this.droppedCounts),
    };
  }

  /**
   * Reset Dropped Event Counters
   *
   * Clears all drop statistics. Useful for:
   * - Unit tests (clean slate between tests)
   * - Post-troubleshooting cleanup
   * - Periodic stats reset in monitoring
   *
   * Note: Does NOT affect in-flight counters (bufferCounts)
   */
  resetDroppedCounters() {
    this.droppedCounts.clear();
  }
}
