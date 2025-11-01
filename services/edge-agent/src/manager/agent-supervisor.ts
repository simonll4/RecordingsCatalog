import { ChildProcess, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { AgentStatusSnapshot } from "../app/status.js";
import { CONFIG } from "../config/index.js";
import { logger } from "../shared/logging.js";
import { OverridesStore } from "./overrides-store.js";
import { CLASS_SET } from "./classes.js";
import {
  ManagerSnapshot,
  Overrides,
  SupervisorLastExit,
  SupervisorState,
} from "./types.js";

type ConstructorOptions = {
  command: string;
  args: string[];
  statusPort: number;
  overridesStore: OverridesStore;
};

const POLL_INTERVAL_MS = 1000;
const STOP_TIMEOUT_MS = 4000;

export class AgentSupervisor {
  private child: ChildProcess | null = null;
  private readonly log = logger.child({ module: "agent-supervisor" });
  private state: SupervisorState = "idle";
  private readonly statusUrl: string;

  private agentStatus: AgentStatusSnapshot | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  private lastStartTs: number | null = null;
  private lastStopTs: number | null = null;
  private lastExit: SupervisorLastExit | null = null;

  private readonly overridesStore: OverridesStore;
  private activeOverrides: Overrides = { classesFilter: [] };
  private readonly command: string;
  private readonly args: string[];
  private readonly statusPort: number;
  private readonly defaultClasses: string[];

  constructor(options: ConstructorOptions) {
    this.command = options.command;
    this.args = options.args;
    this.statusPort = options.statusPort;
    this.overridesStore = options.overridesStore;
    this.activeOverrides = this.overridesStore.get();
    this.statusUrl = `http://127.0.0.1:${this.statusPort}/status`;
    this.defaultClasses = CONFIG.ai.classesFilter;
  }

  getState(): SupervisorState {
    return this.state;
  }

  getSnapshot(): ManagerSnapshot {
    return {
      state: this.state,
      lastStartTs: this.lastStartTs ? new Date(this.lastStartTs).toISOString() : null,
      lastStopTs: this.lastStopTs ? new Date(this.lastStopTs).toISOString() : null,
      lastExit: this.lastExit,
      childPid: this.child?.pid ?? null,
      childUptimeMs:
        this.child && this.lastStartTs ? Date.now() - this.lastStartTs : null,
      statusPort: this.statusPort,
      overrides: this.overridesStore.get(),
    };
  }

  getAgentStatus(): AgentStatusSnapshot | null {
    return this.agentStatus ? { ...this.agentStatus } : null;
  }

  getOverrides(): Overrides {
    return this.overridesStore.get();
  }

  getDefaultClasses(): string[] {
    return [...this.defaultClasses];
  }

  getEffectiveClasses(): string[] {
    if (this.activeOverrides.classesFilter.length > 0) {
      return [...this.activeOverrides.classesFilter];
    }
    return [...this.defaultClasses];
  }

  updateOverrides(next: Overrides): void {
    this.validateClasses(next.classesFilter);
    this.overridesStore.set(next);

    // Only update active overrides; running agent keeps previous configuration
    // until restart. We keep the new value so the next start reflects the change.
    this.activeOverrides = this.overridesStore.get();
  }

  async start(): Promise<void> {
    if (this.child) {
      this.log.warn("Start requested but agent already running", {
        state: this.state,
        pid: this.child.pid,
      });
      return;
    }

    this.state = "starting";
    this.lastStartTs = Date.now();
    this.activeOverrides = this.overridesStore.get();

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      EDGE_AGENT_STATUS_PORT: String(this.statusPort),
    };

    if (this.activeOverrides.classesFilter.length > 0) {
      env.EDGE_AGENT_CLASSES_FILTER = this.activeOverrides.classesFilter.join(",");
    } else {
      delete env.EDGE_AGENT_CLASSES_FILTER;
    }

    this.log.info("Starting edge agent child", {
      statusPort: this.statusPort,
      overrides: this.activeOverrides,
      command: this.command,
      args: this.args,
    });

    this.child = spawn(this.command, this.args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child.stdout?.setEncoding("utf-8");
    this.child.stdout?.on("data", (chunk: string) => {
      chunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .forEach((line) =>
          this.log.info(line, { stream: "stdout", pid: this.child?.pid ?? undefined })
        );
    });

    this.child.stderr?.setEncoding("utf-8");
    this.child.stderr?.on("data", (chunk: string) => {
      chunk
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .forEach((line) =>
          this.log.error(line, { stream: "stderr", pid: this.child?.pid ?? undefined })
        );
    });

    this.child.once("exit", (code, signal) => {
      this.handleExit(code, signal);
    });

    this.child.once("error", (err) => {
      this.log.error("Failed to spawn edge agent", { error: err.message });
      this.handleExit(null, null, err);
    });

    this.startPollingStatus();
  }

  async stop(): Promise<void> {
    if (!this.child) {
      this.log.info("Stop requested but agent not running");
      return;
    }

    if (this.state === "stopping") {
      this.log.info("Stop already in progress");
      return;
    }

    this.state = "stopping";
    this.lastStopTs = Date.now();

    this.log.info("Stopping edge agent child", { pid: this.child.pid });

    const child = this.child;

    child.kill("SIGTERM");

    const stopDeadline = Date.now() + STOP_TIMEOUT_MS;
    while (this.child && Date.now() < stopDeadline) {
      await delay(100);
    }

    if (this.child) {
      this.log.warn("Child did not exit after SIGTERM, using SIGKILL", {
        pid: this.child.pid,
      });
      this.child.kill("SIGKILL");
    }
  }

  private startPollingStatus() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    const poll = async () => {
      if (!this.child) {
        this.agentStatus = null;
        return;
      }

      try {
        const response = await fetch(this.statusUrl, {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error(`Status HTTP ${response.status}`);
        }

        const payload = (await response.json()) as AgentStatusSnapshot;
        this.agentStatus = payload;

        if (this.state === "starting") {
          this.state = "running";
        }
      } catch (err) {
        if (this.state === "running") {
          this.state = "starting";
        }
        this.agentStatus = null;
      }
    };

    void poll();
    this.pollTimer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }

  private stopPollingStatus() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.agentStatus = null;
  }

  private handleExit(
    code: number | null,
    signal: NodeJS.Signals | null,
    error?: Error
  ) {
    this.log.info("Edge agent child exited", {
      code,
      signal,
      error: error?.message,
    });

    this.lastExit = {
      code,
      signal,
      at: new Date().toISOString(),
      reason: error?.message,
    };

    this.stopPollingStatus();

    this.child?.removeAllListeners();
    this.child = null;

    if (error || (code !== 0 && code !== null)) {
      this.state = "error";
    } else {
      this.state = "idle";
    }

    if (!this.lastStopTs) {
      this.lastStopTs = Date.now();
    }
  }

  private validateClasses(classes: string[]) {
    const invalid = classes
      .map((cls) => cls.trim().toLowerCase())
      .filter((cls) => !CLASS_SET.has(cls));

    if (invalid.length > 0) {
      const formatted = invalid.join(", ");
      throw new Error(`Invalid classes: ${formatted}`);
    }
  }
}
