/**
 * Metrics - Simple Prometheus-Style Metrics Collection
 *
 * Lightweight metrics system for monitoring Edge Agent performance.
 * Provides counters, gauges, and histograms without external dependencies.
 *
 * Features:
 * =========
 *
 * Counters
 *   - Monotonically increasing values
 *   - Example: total detections, total frames processed
 *   - Use: metrics.inc("ai_detections_total", { class: "person" })
 *
 * Gauges
 *   - Current snapshot values (can go up/down)
 *   - Example: active connections, queue size
 *   - Use: metrics.gauge("connections_active", 5)
 *
 * Histograms
 *   - Distribution of values over time
 *   - Example: latency measurements, frame processing times
 *   - Use: metrics.observe("latency_ms", 123)
 *   - Query: metrics.percentile("latency_ms", 95) → P95 latency
 *
 * Labels
 *   - Optional key-value tags for dimensional metrics
 *   - Example: { class: "person" }, { state: "ACTIVE" }
 *   - Enables filtering and aggregation
 *
 * Usage Example:
 * ==============
 *
 * ```typescript
 * import { metrics } from "./shared/metrics.js";
 *
 * // Counter: increment by 1
 * metrics.inc("ai_detections_total", { class: "person" });
 *
 * // Counter: increment by N
 * metrics.inc("frames_processed_total", 10);
 *
 * // Gauge: set current value
 * metrics.gauge("connections_active", 5);
 *
 * // Histogram: record observation
 * metrics.observe("latency_ms", 123, { endpoint: "/detections" });
 *
 * // Query counter
 * const count = metrics.get("ai_detections_total", { class: "person" });
 *
 * // Query histogram percentile
 * const p95 = metrics.percentile("latency_ms", 95, { endpoint: "/detections" });
 *
 * // Export all metrics (for /metrics endpoint)
 * const allMetrics = metrics.export();
 * ```
 *
 * Why Metrics?
 * ============
 *
 * Observability
 *   - Understand system behavior in production
 *   - Identify bottlenecks and performance issues
 *
 * Alerting
 *   - Detect anomalies (e.g., detection rate drops)
 *   - Monitor resource usage (e.g., queue sizes)
 *
 * Debugging
 *   - Correlate events with metrics
 *   - Understand temporal patterns
 *
 * Prometheus Compatibility
 *   - Naming follows Prometheus conventions
 *   - Suffix: _total (counters), _count (histograms), etc.
 *   - Can export to Prometheus format if needed
 */

class Metrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  /**
   * Increment Counter
   *
   * Increases a counter by a specified delta (default: 1).
   * Supports two signatures:
   *   - inc(name, delta) - no labels
   *   - inc(name, labels, delta) - with labels
   *
   * Example:
   *   metrics.inc("requests_total") → increment by 1
   *   metrics.inc("requests_total", 5) → increment by 5
   *   metrics.inc("requests_total", { endpoint: "/api" }, 1) → labeled counter
   *
   * @param name - Metric name (e.g., "ai_detections_total")
   * @param labels - Optional labels or delta if number
   * @param delta - Increment amount (default: 1)
   */
  inc(
    name: string,
    labels?: Record<string, string> | number,
    delta?: number
  ): void {
    // Overload handling: inc(name, delta) or inc(name, labels, delta)
    if (typeof labels === "number") {
      delta = labels;
      labels = undefined;
    }
    const key = this.key(name, labels as Record<string, string> | undefined);
    this.counters.set(key, (this.counters.get(key) || 0) + (delta || 1));
  }

  /**
   * Set Gauge Value
   *
   * Sets a gauge to a specific value. Gauges represent instantaneous measurements
   * that can increase or decrease (unlike counters which only increase).
   *
   * Example:
   *   metrics.gauge("connections_active", 5) → 5 active connections
   *   metrics.gauge("queue_size", 123, { queue: "detections" }) → labeled gauge
   *
   * @param name - Metric name (e.g., "connections_active")
   * @param value - Current value
   * @param labels - Optional labels
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Record Histogram Observation
   *
   * Adds a value to a histogram. Histograms track distributions of values
   * over time, useful for latency, sizes, durations, etc.
   *
   * Example:
   *   metrics.observe("latency_ms", 123) → record 123ms latency
   *   metrics.observe("frame_size_bytes", 65536, { format: "JPEG" }) → labeled histogram
   *
   * Query with percentile():
   *   metrics.percentile("latency_ms", 95) → P95 latency
   *
   * @param name - Metric name (e.g., "latency_ms")
   * @param value - Observed value
   * @param labels - Optional labels
   */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  /**
   * Get Counter Value
   *
   * Retrieves the current value of a counter.
   *
   * @param name - Metric name
   * @param labels - Optional labels
   * @returns Current counter value (0 if not set)
   */
  get(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.key(name, labels)) || 0;
  }

  /**
   * Get Gauge Value
   *
   * Retrieves the current value of a gauge.
   *
   * @param name - Metric name
   * @param labels - Optional labels
   * @returns Current gauge value (0 if not set)
   */
  getGauge(name: string, labels?: Record<string, string>): number {
    return this.gauges.get(this.key(name, labels)) || 0;
  }

  /**
   * Calculate Histogram Percentile
   *
   * Computes the value at a given percentile for a histogram.
   *
   * Example:
   *   metrics.percentile("latency_ms", 50) → median latency (P50)
   *   metrics.percentile("latency_ms", 95) → P95 latency
   *   metrics.percentile("latency_ms", 99) → P99 latency
   *
   * @param name - Metric name
   * @param p - Percentile (0-100)
   * @param labels - Optional labels
   * @returns Value at percentile (0 if no data)
   */
  percentile(name: string, p: number, labels?: Record<string, string>): number {
    const values = this.histograms.get(this.key(name, labels));
    if (!values || values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Reset All Metrics
   *
   * Clears all counters, gauges, and histograms.
   * Useful for testing or periodic resets.
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Export Metrics as JSON
   *
   * Returns all metrics in a structured format suitable for:
   * - HTTP /metrics endpoint
   * - Logging/debugging
   * - Export to monitoring systems
   *
   * Format:
   * ```json
   * {
   *   "counters": { "requests_total": 100, "errors_total": 5 },
   *   "gauges": { "connections_active": 3 },
   *   "histograms": {
   *     "latency_ms": {
   *       "count": 100,
   *       "sum": 12300,
   *       "p50": 120,
   *       "p95": 200,
   *       "p99": 350
   *     }
   *   }
   * }
   * ```
   *
   * @returns Metrics snapshot as JSON object
   */
  export(): Record<string, any> {
    const result: Record<string, any> = {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: {},
    };

    for (const [key, values] of this.histograms) {
      result.histograms[key] = {
        count: values.length,
        sum: values.reduce((a, b) => a + b, 0),
        p50: this.percentile(key, 50),
        p95: this.percentile(key, 95),
        p99: this.percentile(key, 99),
      };
    }

    return result;
  }

  /**
   * Build Metric Key
   *
   * Constructs a unique key for a metric with labels.
   * Labels are sorted alphabetically for consistency.
   *
   * Format:
   *   - No labels: "metric_name"
   *   - With labels: "metric_name{label1="value1",label2="value2"}"
   *
   * Example:
   *   key("requests_total", { endpoint: "/api", method: "POST" })
   *   → "requests_total{endpoint="/api",method="POST"}"
   *
   * @param name - Metric name
   * @param labels - Optional labels
   * @returns Unique key string
   */
  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${pairs}}`;
  }
}

/**
 * Metrics Singleton Instance
 *
 * Global metrics collector shared across all modules.
 */
export const metrics = new Metrics();

/**
 * Create Metrics Helper with Preloaded Tags
 *
 * Useful for avoiding repetition of common tags (e.g., module, component).
 * Returns an object with inc/gauge/observe methods that automatically include base tags.
 *
 * Example:
 * ```typescript
 * const m = withTags({ module: "ai-feeder" });
 * m.inc("frames_sent_total"); // Automatically includes module="ai-feeder"
 * m.gauge("window_size", 4, { state: "active" }); // Merges base tags with provided tags
 * ```
 *
 * Use Case:
 *   - Module-level metrics: Each module creates a helper with its name
 *   - Component-level metrics: Include component type/instance
 *   - Avoid manual tag repetition across many metric calls
 *
 * @param baseTags - Base tags to include in all metrics
 * @returns Object with inc/gauge/observe methods pre-configured with base tags
 */
export function withTags(baseTags: Record<string, string>) {
  return {
    /**
     * Increment Counter (with base tags)
     *
     * @param name - Metric name
     * @param labels - Additional labels or delta if number
     * @param delta - Increment amount (default: 1)
     */
    inc: (
      name: string,
      labels?: Record<string, string> | number,
      delta?: number
    ) => {
      // Handle overload: inc(name, delta) or inc(name, labels, delta)
      if (typeof labels === "number") {
        delta = labels;
        labels = undefined;
      }
      const mergedLabels = {
        ...baseTags,
        ...(labels as Record<string, string> | undefined),
      };
      metrics.inc(name, mergedLabels, delta);
    },

    /**
     * Set Gauge (with base tags)
     *
     * @param name - Metric name
     * @param value - Current value
     * @param labels - Additional labels
     */
    gauge: (name: string, value: number, labels?: Record<string, string>) => {
      const mergedLabels = { ...baseTags, ...labels };
      metrics.gauge(name, value, mergedLabels);
    },

    /**
     * Record Histogram Observation (with base tags)
     *
     * @param name - Metric name
     * @param value - Observed value
     * @param labels - Additional labels
     */
    observe: (name: string, value: number, labels?: Record<string, string>) => {
      const mergedLabels = { ...baseTags, ...labels };
      metrics.observe(name, value, mergedLabels);
    },
  };
}
