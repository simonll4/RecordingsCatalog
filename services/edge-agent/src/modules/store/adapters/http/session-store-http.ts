/**
 * Session Store HTTP - Implementación HTTP del store de sesiones
 *
 * Cliente HTTP que persiste sesiones y detecciones en un backend REST API.
 *
 * Características:
 * - Interfaz limpia (open, append, close, flush)
 * - Batching con timer y límite de tamaño
 * - Retry con exponencial backoff (hasta 3 intentos)
 * - Timeout en requests (5s)
 * - FlushAll para shutdown ordenado
 */

import crypto from "crypto";
import { CONFIG } from "../../../../config/index.js";
import { logger } from "../../../../shared/logging.js";
import { metrics } from "../../../../shared/metrics.js";
import { Detection } from "../../../../types/detections.js";
import { SessionStore } from "../../ports/session-store.js";

// Tipo para items del batch
type DetectionItem = {
  eventId: string;
  ts: string;
  detections: Detection[];
};

export class SessionStoreHttp implements SessionStore {
  private batch: DetectionItem[] = [];
  private timer?: NodeJS.Timeout;
  private sessionCounter = 0;
  private currentSessionId?: string; // Track active session

  async open(startTs?: string): Promise<string> {
    const sessionId = `sess_${Date.now()}_${++this.sessionCounter}`;
    const actualStartTs = startTs ?? new Date().toISOString();

    this.currentSessionId = sessionId;
    logger.info("Opening session", { module: "session-store-http", sessionId });

    try {
      const res = await fetch(`${CONFIG.store.baseUrl}/sessions/open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          devId: CONFIG.deviceId,
          streamPath: CONFIG.mediamtx.path,
          startTs: actualStartTs,
          reason: "relevance",
        }),
      });

      if (!res.ok) {
        logger.warn("Session open returned non-2xx", {
          module: "session-store-http",
          status: res.status,
          statusText: res.statusText,
        });
      }
    } catch (err) {
      logger.error("Failed to open session", {
        module: "session-store-http",
        error: (err as Error).message,
      });
    }

    return sessionId;
  }

  async append(
    sessionId: string,
    payload: { devId: string; ts: string; detects: Detection[] }
  ): Promise<void> {
    const row = {
      eventId: crypto.randomUUID(),
      ts: payload.ts,
      detections: payload.detects,
    };

    this.batch.push(row);

    metrics.inc("store_append_total"); // Métrica

    // Auto-flush por timer o tamaño
    const batchMax = CONFIG.store.batchMax ?? 50;
    const flushInterval = CONFIG.store.flushIntervalMs ?? 2000;

    if (!this.timer) {
      this.timer = setTimeout(() => void this.flush(sessionId), flushInterval);
    }

    if (this.batch.length >= batchMax) {
      void this.flush(sessionId);
    }
  }

  async close(sessionId: string, endTs?: string): Promise<void> {
    logger.info("Closing session", { module: "session-store-http", sessionId });

    // Flush antes de cerrar
    await this.flush(sessionId);

    const actualEndTs = endTs ?? new Date().toISOString();
    const postRollSec = Math.round(CONFIG.fsm.postRollMs / 1000);

    try {
      const res = await fetch(`${CONFIG.store.baseUrl}/sessions/close`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          endTs: actualEndTs,
          postRollSec,
        }),
      });

      if (!res.ok) {
        logger.warn("Session close returned non-2xx", {
          module: "session-store-http",
          status: res.status,
          statusText: res.statusText,
        });
      }
    } catch (err) {
      logger.error("Failed to close session", {
        module: "session-store-http",
        error: (err as Error).message,
      });
    }
  }

  async flush(sessionId: string): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;

    const items = this.batch.splice(0, this.batch.length);
    if (!items.length) return;

    logger.debug("Flushing batch", {
      module: "session-store-http",
      count: items.length,
    });

    // Retry con backoff (3 intentos)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${CONFIG.store.baseUrl}/detections`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            batchId: crypto.randomUUID(),
            sessionId,
            sourceTs: new Date().toISOString(),
            items,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        logger.debug("Flush successful", { module: "session-store-http" });
        metrics.inc("store_flush_ok_total");
        return;
      } catch (err) {
        logger.error("Flush attempt failed", {
          module: "session-store-http",
          attempt,
          error: (err as Error).message,
        });

        metrics.inc("store_flush_error_total");

        if (attempt < 3) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
        }
      }
    }

    logger.error("Flush failed after all attempts", {
      module: "session-store-http",
    });
  }

  /**
   * Flush all pending data (para shutdown)
   */
  async flushAll(): Promise<void> {
    if (this.batch.length > 0 && this.currentSessionId) {
      logger.info("Flushing all pending data on shutdown", {
        module: "session-store-http",
        count: this.batch.length,
      });
      await this.flush(this.currentSessionId);
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
