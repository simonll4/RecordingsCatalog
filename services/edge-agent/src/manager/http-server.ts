/**
 * Manager HTTP Server (API Only)
 *
 * Exposes a minimal REST API to control and monitor the Edge Agent runtime.
 * No static assets are served here; the external Vue UI consumes this API.
 *
 * Endpoints:
 * - GET  /               → Info + manager snapshot
 * - GET  /status         → { manager, agent } envelope
 * - POST /control/start  → Start child runtime (idempotent)
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

      if (req.method === "POST" && req.url === "/control/start") {
        await supervisor.start();
        sendJson(res, 202, { manager: supervisor.getSnapshot() });
        return;
      }

      if (req.method === "POST" && req.url === "/control/stop") {
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
