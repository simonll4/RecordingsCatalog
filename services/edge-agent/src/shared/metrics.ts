/**
 * Métricas simples - Contadores Prometheus-style
 *
 * Uso:
 *   metrics.inc("ai_detections_total", { class: "person" })
 *   metrics.gauge("connections_active", 5)
 *   metrics.observe("latency_ms", 123)
 *   metrics.get("ai_detections_total", { class: "person" }) // => 5
 */

class Metrics {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  /**
   * Incrementa un contador
   */
  inc(name: string, labels?: Record<string, string> | number, delta?: number): void {
    // Sobrecarga: inc(name, delta) o inc(name, labels, delta)
    if (typeof labels === "number") {
      delta = labels;
      labels = undefined;
    }
    const key = this.key(name, labels as Record<string, string> | undefined);
    this.counters.set(key, (this.counters.get(key) || 0) + (delta || 1));
  }

  /**
   * Establece un gauge (valor instantáneo)
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    this.gauges.set(key, value);
  }

  /**
   * Registra una observación (para histogramas/resúmenes)
   */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    this.histograms.set(key, values);
  }

  /**
   * Obtiene el valor actual de un contador
   */
  get(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.key(name, labels)) || 0;
  }

  /**
   * Obtiene el valor actual de un gauge
   */
  getGauge(name: string, labels?: Record<string, string>): number {
    return this.gauges.get(this.key(name, labels)) || 0;
  }

  /**
   * Calcula percentil de un histograma
   */
  percentile(name: string, p: number, labels?: Record<string, string>): number {
    const values = this.histograms.get(this.key(name, labels));
    if (!values || values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Resetea todos los contadores
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /**
   * Exporta métricas en formato JSON
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

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${pairs}}`;
  }
}

export const metrics = new Metrics();
