import { CONFIG } from "../infra/config.js";
import crypto from "crypto";

export class SessionIO {
  private batch: any[] = [];
  private timer?: NodeJS.Timeout;
  private sessionCounter = 0;

  async openSession(startTs?: string): Promise<string> {
    const sessionId = `sess_${Date.now()}_${++this.sessionCounter}`;
    const actualStartTs = startTs ?? new Date().toISOString();
    await fetch(`${CONFIG.store.url}/sessions/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        devId: CONFIG.deviceId,
        streamPath: CONFIG.mediamtx.path,
        startTs: actualStartTs,
        reason: "relevance",
      }),
    }).catch(() => {});
    return sessionId;
  }

  async closeSession(sessionId?: string, postRollSec = 5) {
    if (!sessionId) return;
    
    // Forzar flush antes de cerrar
    await this.flushBatch(sessionId);
    
    await fetch(`${CONFIG.store.url}/sessions/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        endTs: new Date().toISOString(),
        postRollSec,
      }),
    }).catch(() => {});
  }

  pushDetections(
    sessionId: string | undefined,
    e: { ts: string; items: any[] }
  ) {
    if (!sessionId) return;
    const rows = e.items.map((it) => ({
      eventId: crypto.randomUUID(),
      ts: e.ts,
      detections: it,
    }));
    this.batch.push(...rows);
    if (!this.timer)
      this.timer = setTimeout(
        () => this.flushBatch(sessionId),
        CONFIG.store.batchMs
      );
    if (this.batch.length >= CONFIG.store.maxItems) this.flushBatch(sessionId);
  }

  /**
   * Fuerza el envío inmediato del batch pendiente
   * Útil para garantizar entrega antes de cerrar sesión
   */
  async flushBatch(sessionId: string): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const items = this.batch.splice(0, this.batch.length);
    if (!items.length) return;

    console.log(`[SessionIO] Flushing ${items.length} detections for session ${sessionId}`);

    // Reintentar hasta 3 veces con timeout
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        await fetch(`${CONFIG.store.url}/detections`, {
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
        console.log(`[SessionIO] Flush successful (${items.length} items)`);
        return; // Éxito, salir
      } catch (err) {
        console.error(`[SessionIO] Flush attempt ${attempt}/3 failed:`, err);
        if (attempt < 3) {
          await new Promise((res) => setTimeout(res, 500 * attempt)); // Backoff
        }
      }
    }

    console.error(`[SessionIO] Failed to flush after 3 attempts, ${items.length} items lost`);
  }

  private async flush(sessionId: string) {
    await this.flushBatch(sessionId);
  }
}
