/**
 * Publisher - Pipeline RTSP con encoder adaptativo
 */

import { ChildProcess } from "child_process";
import { CONFIG } from "../config/index.js";
import { buildPublish } from "../media/gstreamer.js";
import { detectEncoder } from "../media/encoder.js";
import { spawnProcess, killProcess } from "../shared/childproc.js";
import { logger } from "../shared/logging.js";
import { metrics } from "../shared/metrics.js";

export interface Publisher {
  start(): Promise<void>;
  stop(graceMs?: number): Promise<void>;
}

type PublisherState = "idle" | "starting" | "running" | "stopping";

export class PublisherImpl implements Publisher {
  private proc?: ChildProcess;
  private state: PublisherState = "idle";

  async start(): Promise<void> {
    if (this.state !== "idle") {
      logger.debug("Publisher not idle, skipping start", {
        module: "publisher",
        state: this.state,
      });
      return;
    }

    this.state = "starting";

    const encoder = await detectEncoder();
    const { socketPath, width, height, fpsHub } = CONFIG.source;
    const args = buildPublish(
      socketPath,
      width,
      height,
      fpsHub, // Agregar FPS hub
      CONFIG.mediamtx,
      encoder
    );

    logger.info("Starting publisher", {
      module: "publisher",
      encoder: encoder.element,
    });

    this.proc = spawnProcess({
      module: "publisher",
      command: "gst-launch-1.0",
      args,
      env: { GST_DEBUG: "2", GST_DEBUG_NO_COLOR: "1" },
      silentStdout: true, // No loguear stdout (video stream)
      onExit: () => {
        this.proc = undefined;
        if (this.state !== "stopping") {
          this.state = "idle"; // Crash inesperado
        }
      },
    });

    this.state = "running";
    metrics.inc("publisher_starts_total");
  }

  async stop(graceMs: number = 1500): Promise<void> {
    if (this.state === "idle") {
      logger.debug("Publisher already idle", { module: "publisher" });
      return;
    }

    if (this.state === "stopping") {
      logger.debug("Publisher already stopping", { module: "publisher" });
      return;
    }

    this.state = "stopping";
    logger.info("Stopping publisher", { module: "publisher" });

    const proc = this.proc;
    this.proc = undefined;

    if (!proc) {
      // Ya murió entre medio
      this.state = "idle";
      return;
    }

    killProcess(proc, "SIGINT");

    // Wait for graceful shutdown, then force kill if needed
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn("Publisher didn't stop gracefully, forcing kill", {
          module: "publisher",
        });
        killProcess(proc, "SIGKILL");
        resolve();
      }, graceMs);

      proc.once("exit", () => {
        clearTimeout(timeout);
        this.state = "idle";
        logger.info("Publisher stopped", { module: "publisher" });
        resolve();
      });
    });
  }
}
