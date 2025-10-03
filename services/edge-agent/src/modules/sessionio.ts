import { CONFIG } from "../infra/config.js";
import crypto from "crypto";

export class SessionIO {
  private batch: any[] = [];
  private timer?: NodeJS.Timeout;
  private sessionCounter = 0;

  async openSession(): Promise<string> {
    const sessionId = `sess_${Date.now()}_${++this.sessionCounter}`;
    await fetch(`${CONFIG.store.url}/sessions/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        devId: CONFIG.deviceId,
        streamPath: CONFIG.mediamtx.path,
        startTs: new Date().toISOString(),
        reason: "relevance",
      }),
    }).catch(() => {});
    return sessionId;
  }

  async closeSession(sessionId?: string, postRollSec = 5) {
    if (!sessionId) return;
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
        () => this.flush(sessionId),
        CONFIG.store.batchMs
      );
    if (this.batch.length >= CONFIG.store.maxItems) this.flush(sessionId);
  }

  private async flush(sessionId: string) {
    clearTimeout(this.timer);
    this.timer = undefined;
    const items = this.batch.splice(0, this.batch.length);
    if (!items.length) return;
    await fetch(`${CONFIG.store.url}/detections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        batchId: crypto.randomUUID(),
        sessionId,
        sourceTs: new Date().toISOString(),
        items,
      }),
    }).catch(() => {});
  }
}
