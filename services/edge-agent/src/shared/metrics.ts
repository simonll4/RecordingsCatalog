/**
 * Métricas simples - Contadores Prometheus-style
 * 
 * Uso:
 *   metrics.inc("ai_detections_total", { class: "person" })
 *   metrics.get("ai_detections_total", { class: "person" }) // => 5
 */

class Metrics {
  private counters = new Map<string, number>();

  /**
   * Incrementa un contador
   */
  inc(name: string, labels?: Record<string, string>, delta: number = 1): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) || 0) + delta);
  }

  /**
   * Obtiene el valor actual de un contador
   */
  get(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.key(name, labels)) || 0;
  }

  /**
   * Resetea todos los contadores
   */
  reset(): void {
    this.counters.clear();
  }

  /**
   * Exporta métricas en formato JSON
   */
  export(): Record<string, number> {
    return Object.fromEntries(this.counters);
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
