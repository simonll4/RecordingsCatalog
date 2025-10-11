/**
 * Frame Cache - Cache temporal de frames NV12/I420 para correlación con detecciones
 *
 * Mantiene frames en memoria por un tiempo limitado (TTL) para que puedan
 * ser recuperados cuando lleguen las detecciones del worker AI.
 *
 * El flujo es:
 * 1. AI Feeder cachea frame NV12 antes de enviar al worker
 * 2. Worker responde con frame_id
 * 3. Main recupera frame NV12 del cache
 * 4. Convierte NV12 → JPEG y envía al session-store
 */

import { logger } from "../../../shared/logging.js";
import type { NV12FrameMeta } from "../../video/adapters/gstreamer/nv12-capture-gst.js";

export type CachedFrame = {
  seqNo: string;         // Changed to string to avoid uint64 overflow
  data: Buffer;          // NV12/I420 raw data
  meta: NV12FrameMeta;   // Metadata with planes info
  captureTs: string;
  insertedAt: number;    // timestamp ms
};

export class FrameCache {
  private cache = new Map<string, CachedFrame>();
  private ttlMs: number;

  constructor(ttlMs = 2000) {
    // TTL por defecto 2 segundos
    this.ttlMs = ttlMs;

    // Limpieza periódica cada 1 segundo
    setInterval(() => this.cleanup(), 1000);
  }

  /**
   * Inserta un frame en la cache
   */
  set(frame: Omit<CachedFrame, "insertedAt">): void {
    this.cache.set(frame.seqNo, {
      ...frame,
      insertedAt: Date.now(),
    });
  }

  /**
   * Recupera un frame de la cache
   * Retorna null si no existe o ya expiró
   */
  get(seqNo: string): CachedFrame | null {
    const frame = this.cache.get(seqNo);

    if (!frame) {
      return null;
    }

    // Verificar TTL
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
   * Limpia frames expirados de la cache
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
   * Retorna el tamaño actual de la cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Limpia toda la cache
   */
  clear(): void {
    this.cache.clear();
  }
}
