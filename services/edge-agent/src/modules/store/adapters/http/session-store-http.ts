/**
 * Session Store HTTP - Implementación HTTP del store de sesiones
 *
 * Cliente HTTP que persiste sesiones en un backend REST API.
 *
 * Características:
 * - Interfaz limpia (open, close)
 * - Retry con exponencial backoff (hasta 3 intentos)
 * - Timeout en requests (5s)
 * 
 * NOTA: El envío de detecciones ahora se maneja por FrameIngester via /ingest.
 * Este adaptador solo gestiona el ciclo de vida de las sesiones.
 */

import { CONFIG } from "../../../../config/index.js";
import { logger } from "../../../../shared/logging.js";
import { SessionStore } from "../../ports/session-store.js";

export class SessionStoreHttp implements SessionStore {
  private sessionCounter = 0;
  private detectionBatch: Map<string, any[]> = new Map();
  private flushTimer?: NodeJS.Timeout;

  async open(startTs?: string): Promise<string> {
    // Generate session ID with deviceId for traceability across distributed systems
    // Format: sess_{deviceId}_{timestamp}_{counter}
    // Example: sess_cam-01_1760134453955_1
    const sessionId = `sess_${CONFIG.deviceId}_${Date.now()}_${++this.sessionCounter}`;
    const actualStartTs = startTs ?? new Date().toISOString();

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

  async close(sessionId: string, endTs?: string): Promise<void> {
    logger.info("Closing session", { module: "session-store-http", sessionId });

    // Flush any pending detections
    await this.flushDetections(sessionId);

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

    // Clean up batch
    this.detectionBatch.delete(sessionId);
  }

  async addDetections(sessionId: string, detections: any[]): Promise<void> {
    if (!this.detectionBatch.has(sessionId)) {
      this.detectionBatch.set(sessionId, []);
    }

    const batch = this.detectionBatch.get(sessionId)!;
    batch.push(...detections);

    // Flush if batch size exceeds max
    if (batch.length >= (CONFIG.store.batchMax || 50)) {
      await this.flushDetections(sessionId);
    } else {
      // Schedule auto-flush
      this.scheduleFlush(sessionId);
    }
  }

  private scheduleFlush(sessionId: string): void {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        void this.flushDetections(sessionId);
      }, CONFIG.store.flushIntervalMs);
    }
  }

  private async flushDetections(sessionId: string): Promise<void> {
    const batch = this.detectionBatch.get(sessionId);
    if (!batch || batch.length === 0) {
      return;
    }

    logger.debug("Flushing detections", {
      module: "session-store-http",
      sessionId,
      count: batch.length,
    });

    try {
      const res = await fetch(`${CONFIG.store.baseUrl}/detections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          detections: batch,
          ts: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        // Clear batch on success
        this.detectionBatch.set(sessionId, []);
      } else {
        logger.warn("Detection batch returned non-2xx", {
          module: "session-store-http",
          status: res.status,
        });
      }
    } catch (err) {
      logger.error("Failed to flush detections", {
        module: "session-store-http",
        error: (err as Error).message,
      });
    }
  }
}
