/**
 * Event Bus - Canal Central de Comunicación
 * 
 * Implementa patrón Publisher-Subscriber con backpressure para evitar
 * memory leaks cuando los consumidores son más lentos que los productores.
 * 
 * Características:
 * - Type-safe: Eventos tipados con topics conocidos
 * - Backpressure: Límite de 1024 eventos en vuelo por topic
 * - Metrics: Contadores de publicaciones y drops
 * - Async-safe: Usa setImmediate para decrementar contadores
 * 
 * Ejemplo:
 * ```typescript
 * // Publicar
 * bus.publish("ai.detection", { 
 *   type: "ai.detection", 
 *   relevant: true,
 *   detections: [...] 
 * });
 * 
 * // Suscribir
 * const unsub = bus.subscribe("ai.detection", (event) => {
 *   console.log("Detección recibida:", event.detections);
 * });
 * 
 * // Desuscribir cuando ya no se necesite
 * unsub();
 * ```
 * 
 * Backpressure:
 * - Si hay > 1024 eventos en vuelo en un topic, se droppean nuevos
 * - Se loggea warning cada 100 eventos droppeados
 * - Métrica bus_drops_total se incrementa por cada drop
 * 
 * ¿Por qué backpressure?
 * Sin límite, un consumer lento puede acumular eventos infinitamente
 * causando OOM (Out Of Memory). Preferimos droppear que crashear.
 */

import { EventEmitter } from "events";
import { KnownTopic, EventOf } from "./events.js";
import { metrics } from "../../shared/metrics.js";

// Límite de eventos en vuelo por topic (previene OOM)
const MAX_QUEUE_PER_TOPIC = 1024;

type Unsubscribe = () => void;

export class Bus extends EventEmitter {
  // Contadores de eventos "en vuelo" por topic
  private bufferCounts = new Map<string, number>();
  
  // Contadores de eventos droppeados por backpressure
  private droppedCounts = new Map<string, number>();

  constructor() {
    super();
    // Prevenir warnings de EventEmitter (múltiples listeners es normal aquí)
    this.setMaxListeners(50);
  }

  /**
   * Publica un evento en un topic
   * 
   * Si el buffer del topic está lleno (> MAX_QUEUE_PER_TOPIC),
   * el evento se droppea y retorna false.
   * 
   * @param topic - Topic del evento (ai.detection, ai.keepalive, etc.)
   * @param event - Payload del evento (debe matchear tipo del topic)
   * @returns true si se publicó, false si se droppeó por backpressure
   */
  publish<T extends KnownTopic>(topic: T, event: EventOf<T>): boolean {
    const count = this.bufferCounts.get(topic) ?? 0;
    
    // Backpressure: si cola llena, droppear
    if (count >= MAX_QUEUE_PER_TOPIC) {
      const dropped = this.droppedCounts.get(topic) ?? 0;
      this.droppedCounts.set(topic, dropped + 1);
      
      metrics.inc("bus_drops_total", { topic });
      
      // Warning cada 100 drops para no spam logs
      if (dropped % 100 === 0) {
        console.warn(`[Bus] Backpressure on topic ${topic}: ${dropped} events dropped`);
      }
      
      return false;
    }

    // Incrementar contador de eventos "en vuelo"
    this.bufferCounts.set(topic, count + 1);
    metrics.inc("bus_publish_total", { topic });
    
    // Emitir evento a todos los subscribers
    this.emit(topic, event);
    
    // Decrementar contador en próximo tick (async-safe)
    // Asume que handler consume el evento en este tick
    setImmediate(() => {
      const current = this.bufferCounts.get(topic) ?? 0;
      this.bufferCounts.set(topic, Math.max(0, current - 1));
    });

    return true;
  }

  /**
   * Suscribe un handler a un topic
   * 
   * El handler se ejecutará por cada evento publicado en ese topic.
   * Handlers deben ser síncronos o async fire-and-forget.
   * 
   * @param topic - Topic a escuchar
   * @param handler - Función callback (event) => void
   * @returns Función para desuscribirse
   */
  subscribe<T extends KnownTopic>(
    topic: T,
    handler: (event: EventOf<T>) => void
  ): Unsubscribe {
    this.on(topic, handler);
    return () => this.off(topic, handler);
  }

  /**
   * Obtiene estadísticas del bus
   * 
   * Útil para debugging y monitoreo.
   * 
   * @returns Objeto con buffers (eventos en cola) y dropped (total droppeados)
   */
  getStats() {
    return {
      buffers: Object.fromEntries(this.bufferCounts),
      dropped: Object.fromEntries(this.droppedCounts),
    };
  }

  /**
   * Resetea contadores de eventos droppeados
   * 
   * Útil para tests o para limpiar stats después de troubleshooting.
   */
  resetDroppedCounters() {
    this.droppedCounts.clear();
  }
}
