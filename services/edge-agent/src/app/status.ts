import http from "node:http";
import { logger } from "../shared/logging.js";

type NullableString = string | null;

export type AgentStatusSnapshot = {
  online: true;
  timestamp: string;
  startedAt: string;
  uptimeMs: number;
  heartbeatTs: NullableString;
  detections: {
    total: number;
    lastDetectionTs: NullableString;
  };
  session: {
    active: boolean;
    currentSessionId: NullableString;
    lastSessionId: NullableString;
    lastChangeTs: NullableString;
  };
  streams: {
    live: {
      running: boolean;
      startedAt: NullableString;
    };
    record: {
      running: boolean;
      startedAt: NullableString;
      lastStoppedAt: NullableString;
    };
  };
};

export class AgentStatusService {
  private readonly startedAt = Date.now();
  private snapshot: AgentStatusSnapshot = {
    online: true,
    timestamp: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    uptimeMs: 0,
    heartbeatTs: null,
    detections: {
      total: 0,
      lastDetectionTs: null,
    },
    session: {
      active: false,
      currentSessionId: null,
      lastSessionId: null,
      lastChangeTs: null,
    },
    streams: {
      live: {
        running: false,
        startedAt: null,
      },
      record: {
        running: false,
        startedAt: null,
        lastStoppedAt: null,
      },
    },
  };

  getSnapshot(): AgentStatusSnapshot {
    const now = Date.now();
    this.snapshot.timestamp = new Date(now).toISOString();
    this.snapshot.uptimeMs = now - this.startedAt;
    return { ...this.snapshot };
  }

  setHeartbeat(date: Date): void {
    this.snapshot.heartbeatTs = date.toISOString();
  }

  setDetection(date: Date): void {
    this.snapshot.detections.total += 1;
    this.snapshot.detections.lastDetectionTs = date.toISOString();
    this.setHeartbeat(date);
  }

  setSessionActive(active: boolean, sessionId: NullableString): void {
    this.snapshot.session.active = active;
    this.snapshot.session.lastChangeTs = new Date().toISOString();

    if (active && sessionId) {
      this.snapshot.session.currentSessionId = sessionId;
      this.snapshot.session.lastSessionId = sessionId;
    } else {
      this.snapshot.session.currentSessionId = null;
    }
  }

  setLiveStreamRunning(running: boolean): void {
    this.snapshot.streams.live.running = running;
    this.snapshot.streams.live.startedAt = running
      ? new Date().toISOString()
      : this.snapshot.streams.live.startedAt;
  }

  setRecordStreamRunning(running: boolean): void {
    const record = this.snapshot.streams.record;
    record.running = running;

    if (running) {
      record.startedAt = new Date().toISOString();
    } else {
      record.lastStoppedAt = new Date().toISOString();
    }
  }
}

export async function startStatusServer(
  statusService: AgentStatusService,
  port: number
): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }

    // Basic CORS support for browser clients
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/status")) {
      const payload = statusService.getSnapshot();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  logger.info("Status server listening", {
    module: "status-server",
    port,
  });

  return server;
}
