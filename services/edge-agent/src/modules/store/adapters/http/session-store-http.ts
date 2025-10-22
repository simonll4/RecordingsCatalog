/**
 * Session Store HTTP - HTTP Implementation of Session Store
 *
 * HTTP client that persists sessions to a REST API backend.
 *
 * Purpose:
 * ========
 *
 * Session Lifecycle Management:
 *   - Opens recording sessions (POST /sessions/open)
 *   - Closes recording sessions (POST /sessions/close)
 *   - Manages session metadata (start/end timestamps)
 *
 * Integration:
 *   - Called by Orchestrator via OpenSession/CloseSession commands
 *   - Emits session.open/session.close events to bus
 *   - Coordinates with FrameIngester for frame storage
 *
 * Features:
 * =========
 *
 * Clean Interface:
 *   - open(startTs): Create new session, returns sessionId
 *   - close(sessionId, endTs): Close existing session
 *
 * Retry Logic:
 *   - Exponential backoff (up to 3 attempts)
 *   - Timeout on requests (5 seconds)
 *   - Graceful degradation (logs errors, continues)
 *
 * NOTE: Detections/frames se envían con FrameIngester (/ingest). Este adaptador
 * solo gestiona el ciclo de vida de la sesión (open/close).
 *
 * Architecture:
 * =============
 *
 * Session Flow:
 *
 * 1. FSM → ACTIVE State
 *    - Orchestrator executes OpenSession command
 *    - session-store-http.open() called
 *
 * 2. Generate Session ID
 *    ```typescript
 *    sessionId = `sess_${deviceId}_${timestamp}_${counter}`
 *    // Example: sess_cam-01_1760134453955_1
 *    ```
 *
 * 3. POST /sessions/open
 *    ```json
 *    {
 *      "sessionId": "sess_cam-01_1760134453955_1",
 *      "devId": "cam-01",
 *      "streamPath": "live",
 *      "startTs": "2025-10-11T12:00:00.000Z",
 *      "reason": "relevance"
 *    }
 *    ```
 *
 * 4. Store Creates Session Record
 *    - Inserts into database
 *    - Creates frames directory
 *    - Returns 200 OK
 *
 * 5. Emit session.open Event
 *    ```typescript
 *    bus.publish("session.open", { sessionId, startTs });
 *    ```
 *
 * 6. FSM → IDLE State
 *    - Orchestrator executes CloseSession command
 *    - session-store-http.close() called
 *
 * 7. POST /sessions/close
 *    ```json
 *    {
 *      "sessionId": "sess_cam-01_1760134453955_1",
 *      "endTs": "2025-10-11T12:05:00.000Z",
 *      "postRollSec": 1
 *    }
 *    ```
 *
 * 8. Store Updates Session Record
 *    - Sets endTs, postRollSec
 *    - Marks session as closed
 *    - Finalizes recording
 *
 * Session ID Format:
 * ==================
 *
 * Pattern: `sess_{deviceId}_{timestamp}_{counter}`
 *
 * Components:
 *   - deviceId: Identifies edge device (e.g., "cam-01")
 *   - timestamp: Unix timestamp in milliseconds
 *   - counter: Auto-incrementing counter (resets on restart)
 *
 * Benefits:
 *   - Globally unique (timestamp + counter)
 *   - Traceable across distributed systems (deviceId)
 *   - Sortable by creation time (timestamp)
 *   - Human-readable (no UUIDs)
 *
 * Example: `sess_cam-01_1760134453955_1`
 *   - Device: cam-01
 *   - Created: 2025-10-11T12:00:53.955Z
 *   - Counter: 1 (first session since restart)
 *
 * Ingest recomendado:
 *   1. AI detections arrive
 *   2. FrameIngester.ingestNV12() called
 *   3. POST /ingest with multipart (frame JPEG + metadata)
 *   4. Store saves frame + detections atomically
 *
 * Error Handling:
 * ===============
 *
 * Network Errors:
 *   - Logs error, continues execution
 *   - Session may be orphaned in store
 *   - Manual cleanup required
 *
 * HTTP Errors (non-2xx):
 *   - Logs warning with status code
 *   - Continues execution (best-effort)
 *   - Check store logs for root cause
 *
 * Ingest Failures:
 *   - Usar logs para diagnóstico
 *   - FrameIngester implementa reintentos/backoff en /ingest
 */

import { CONFIG } from "../../../../config/index.js";
import { logger } from "../../../../shared/logging.js";
import { SessionStore } from "../../ports/session-store.js";

export class SessionStoreHttp implements SessionStore {
  private sessionCounter = 0;

  /**
   * Open New Recording Session
   *
   * Creates new session in store and returns unique sessionId.
   * Called by Orchestrator when FSM enters ACTIVE state.
   *
   * Session ID Format: `sess_{deviceId}_{timestamp}_{counter}`
   * Example: `sess_cam-01_1760134453955_1`
   *
   * @param startTs - Optional start timestamp (default: current time)
   * @returns Promise<sessionId> - Unique session identifier
   *
   * @example
   * ```typescript
   * const sessionId = await sessionStore.open();
   * console.log(sessionId); // "sess_cam-01_1760134453955_1"
   * bus.publish("session.open", { sessionId, startTs });
   * ```
   */
  async open(startTs?: string): Promise<string> {
    // Generate session ID with deviceId for traceability across distributed systems
    // Format: sess_{deviceId}_{timestamp}_{counter}
    // Example: sess_cam-01_1760134453955_1
    const sessionId = `sess_${CONFIG.deviceId}_${Date.now()}_${++this
      .sessionCounter}`;
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

  /**
   * Close Recording Session
   *
   * Updates session in store with end timestamp and post-roll duration.
   * Called by Orchestrator when FSM returns to IDLE state.
   *
   * Flushes any pending detections before closing.
   * Removes batcher for this session.
   *
   * @param sessionId - Session to close
   * @param endTs - Optional end timestamp (default: current time)
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * await sessionStore.close("sess_cam-01_1760134453955_1");
   * bus.publish("session.close", { sessionId, endTs });
   * ```
   */
  async close(sessionId: string, endTs?: string): Promise<void> {
    logger.info("Closing session", { module: "session-store-http", sessionId });

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
}
