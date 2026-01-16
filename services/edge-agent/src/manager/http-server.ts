/**
 * Manager HTTP Server (API Only)
 *
 * Exposes a minimal REST API to control and monitor the Edge Agent runtime.
 * No static assets are served here; the external Vue UI consumes this API.
 *
 * Endpoints:
 * - GET  /               → Info + manager snapshot
 * - GET  /status         → { manager, agent } envelope
 * - POST /control/start  → Start child runtime (idempotent, optional wait for readiness)
 * - POST /control/stop   → Stop child runtime (idempotent)
 * - GET  /config/classes → { overrides, effective, defaults }
 * - PUT  /config/classes → Update class overrides (persists)
 * - GET  /config/classes/catalog → Catálogo de clases disponible
 */
import http, { IncomingMessage, ServerResponse } from "node:http";
import { AgentSupervisor } from "./agent-supervisor.js";
import { logger } from "../shared/logging.js";
import { CLASS_CATALOG } from "./classes.js";
import { Overrides } from "./types.js";

type ServerOptions = {
  supervisor: AgentSupervisor;
  port: number;
};

const log = logger.child({ module: "manager-http" });

/**
 * Wait Condition for Readiness
 *
 * - child: Child process started and responded on /status (state: running)
 * - heartbeat: Agent shows AI activity (heartbeat after start)
 * - detection: At least one detection registered (detections.total > 0)
 * - session: FSM opened a recording session
 */
type WaitCondition = "child" | "heartbeat" | "detection" | "session";

type WaitOptions = {
  condition: WaitCondition;
  timeoutMs: number;
};

/**
 * Wait for Readiness
 *
 * Polls supervisor.getSnapshot() and supervisor.getAgentStatus() until
 * the specified condition is met or timeout expires.
 *
 * @param supervisor - Agent supervisor instance
 * @param opts - Wait condition and timeout
 * @returns true if ready, false if timeout
 */
async function waitForReady(
  supervisor: AgentSupervisor,
  opts: WaitOptions
): Promise<boolean> {
  const { condition, timeoutMs } = opts;
  const deadline = Date.now() + timeoutMs;
  const checkIntervalMs = 250;
  const startTs = supervisor.getLastStartTs();

  log.info("Waiting for readiness", {
    condition,
    timeoutMs,
    startTs: startTs ? new Date(startTs).toISOString() : null,
  });

  while (Date.now() < deadline) {
    const state = supervisor.getState();
    const agentStatus = supervisor.getAgentStatus();

    if (condition === "child") {
      if (state === "running") {
        log.info("Readiness met: child running", { condition });
        return true;
      }
    } else if (condition === "heartbeat") {
      if (
        agentStatus?.heartbeatTs &&
        startTs &&
        new Date(agentStatus.heartbeatTs).getTime() > startTs
      ) {
        log.info("Readiness met: heartbeat detected", {
          condition,
          heartbeatTs: agentStatus.heartbeatTs,
        });
        return true;
      }
    } else if (condition === "detection") {
      const total = agentStatus?.detections.total ?? 0;
      const lastDetectionTs = agentStatus?.detections.lastDetectionTs
        ? new Date(agentStatus.detections.lastDetectionTs).getTime()
        : 0;
      if (total > 0 && startTs && lastDetectionTs > startTs) {
        log.info("Readiness met: detection registered", {
          condition,
          total,
          lastDetectionTs: agentStatus?.detections.lastDetectionTs,
        });
        return true;
      }
    } else if (condition === "session") {
      if (agentStatus?.session.active === true) {
        log.info("Readiness met: session active", {
          condition,
          sessionId: agentStatus.session.currentSessionId ?? undefined,
        });
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  log.warn("Readiness timeout", { condition, timeoutMs });
  return false;
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

async function parseJson<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let data = "";

    req
      .on("data", (chunk) => {
        data += chunk;
        if (data.length > 1024 * 64) {
          reject(new Error("Payload too large"));
          req.destroy();
        }
      })
      .on("end", () => {
        if (!data) {
          resolve({} as T);
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      })
      .on("error", (err) => reject(err));
  });
}

export async function startManagerServer({
  supervisor,
  port,
}: ServerOptions): Promise<http.Server> {
  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      res.writeHead(400);
      res.end();
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      if (req.method === "GET" && req.url === "/") {
        const snapshot = supervisor.getSnapshot();
        sendJson(res, 200, {
          service: "edge-agent-manager",
          message: "Use /status, /control/start, /control/stop, /config/classes, /config/classes/catalog.",
          manager: snapshot,
        });
        return;
      }

      if (req.method === "GET" && req.url === "/status") {
        const snapshot = supervisor.getSnapshot();
        const agentStatus = supervisor.getAgentStatus();
        sendJson(res, 200, {
          manager: snapshot,
          agent: agentStatus,
        });
        return;
      }

      if (req.method === "POST" && req.url?.startsWith("/control/start")) {
        log.info("Start requested", {
          path: req.url,
          remote: req.socket.remoteAddress,
        });

        // Parse query params and body for optional wait behavior
        const url = new URL(req.url, `http://${req.headers.host}`);
        const waitParam = url.searchParams.get("wait") as WaitCondition | null;
        const timeoutParam = url.searchParams.get("timeoutMs");

        let body: { wait?: WaitCondition; timeoutMs?: number } = {};
        if (
          req.headers["content-type"]?.includes("application/json") &&
          req.headers["content-length"] &&
          parseInt(req.headers["content-length"], 10) > 0
        ) {
          try {
            body = await parseJson<{ wait?: WaitCondition; timeoutMs?: number }>(req);
          } catch (err) {
            const error = err as Error;
            sendJson(res, 400, { error: error.message || "Invalid JSON payload" });
            return;
          }
        }

        const waitCondition =
          body.wait ?? waitParam ?? (null as WaitCondition | null);
        const timeoutMs =
          body.timeoutMs ?? (timeoutParam ? parseInt(timeoutParam, 10) : null) ?? 7000;

        await supervisor.start();

        if (waitCondition) {
          const validConditions: WaitCondition[] = [
            "child",
            "heartbeat",
            "detection",
            "session",
          ];
          if (!validConditions.includes(waitCondition)) {
            sendJson(res, 400, {
              error: `Invalid wait condition: ${waitCondition}. Valid: ${validConditions.join(", ")}`,
            });
            return;
          }

          log.info("Waiting for readiness", {
            condition: waitCondition,
            timeoutMs,
          });

          const ready = await waitForReady(supervisor, {
            condition: waitCondition,
            timeoutMs,
          });

          const snapshot = supervisor.getSnapshot();
          const agentStatus = supervisor.getAgentStatus();

          if (ready) {
            log.info("Start completed with readiness confirmation", {
              condition: waitCondition,
            });
            sendJson(res, 200, {
              manager: snapshot,
              agent: agentStatus,
              ready: true,
              waitedFor: waitCondition,
            });
            return;
          } else {
            log.warn("Start completed but readiness timeout", {
              condition: waitCondition,
              timeoutMs,
            });
            sendJson(res, 202, {
              manager: snapshot,
              agent: agentStatus,
              ready: false,
              waitedFor: waitCondition,
              timeoutMs,
            });
            return;
          }
        }

        // No wait requested, respond immediately (backward compatible)
        sendJson(res, 202, { manager: supervisor.getSnapshot() });
        return;
      }

      if (req.method === "POST" && req.url === "/control/stop") {
        log.info("Stop requested", {
          path: req.url,
          remote: req.socket.remoteAddress,
        });
        await supervisor.stop();
        sendJson(res, 202, { manager: supervisor.getSnapshot() });
        return;
      }

      if (req.method === "GET" && req.url === "/config/classes") {
        const overrides = supervisor.getOverrides();
        sendJson(res, 200, {
          overrides,
          effective: supervisor.getEffectiveClasses(),
          defaults: supervisor.getDefaultClasses(),
        });
        return;
      }

      if (req.method === "PUT" && req.url === "/config/classes") {
        let body: { classes?: unknown };
        try {
          body = await parseJson<{ classes?: unknown }>(req);
        } catch (err) {
          const error = err as Error;
          sendJson(res, 400, { error: error.message || "Invalid JSON payload" });
          return;
        }
        const classes = Array.isArray(body.classes)
          ? body.classes.filter((value): value is string => typeof value === "string")
          : [];

        const normalized = classes.map((cls) => cls.trim().toLowerCase()).filter(Boolean);
        const payload: Overrides = { classesFilter: normalized };

        try {
          supervisor.updateOverrides(payload);
        } catch (err) {
          const error = err as Error;
          sendJson(res, 400, { error: error.message });
          return;
        }
        sendJson(res, 200, {
          overrides: supervisor.getOverrides(),
          effective: supervisor.getEffectiveClasses(),
          defaults: supervisor.getDefaultClasses(),
        });
        return;
      }

      if (req.method === "GET" && req.url === "/config/classes/catalog") {
        sendJson(res, 200, { classes: CLASS_CATALOG });
        return;
      }

      sendJson(res, 404, { error: "Not Found" });
    } catch (err) {
      const error = err as Error;
      log.error("HTTP handler error", { error: error.message, url: req.url, method: req.method });
      sendJson(res, 500, { error: error.message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  log.info("Manager API listening", { port });
  return server;
}
