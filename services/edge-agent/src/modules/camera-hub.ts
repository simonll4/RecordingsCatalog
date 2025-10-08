/**
 * Camera Hub - Hub de captura de video siempre-encendido
 *
 * Arquitectura refactorizada:
 * - Usa buildIngest() de /media/gstreamer para construir pipeline
 * - Usa spawnProcess() de /shared/childproc para manejo limpio de procesos
 * - Política de restart con backoff exponencial
 * - AND-based ready criteria (PLAYING + socket exists)
 * - Auto-fallback MJPEG → RAW para V4L2
 */

import fs from "node:fs";
import { ChildProcess } from "child_process";
import { CONFIG } from "../config/index.js";
import { buildIngest } from "../media/gstreamer.js";
import { spawnProcess, killProcess } from "../shared/childproc.js";
import { logger } from "../shared/logging.js";

export interface CameraHub {
  start(): Promise<void>;
  stop(): Promise<void>;
  ready(timeoutMs?: number): Promise<void>;
}

export class CameraHubImpl implements CameraHub {
  private proc?: ChildProcess;
  private readyResolve?: () => void;
  private readyReject?: (err: Error) => void;
  private isReady = false;
  private sawPlaying = false;
  private sawSocket = false;
  private readyTimeout?: NodeJS.Timeout;
  private socketPoll?: NodeJS.Timeout;
  private tryRawFallback = false;
  private stoppedManually = false;
  private restartAttempts = 0;

  /**
   * Promesa que se resuelve cuando el hub está listo
   * READY = sawPlaying AND sawSocket
   */
  async ready(timeoutMs: number = 5000): Promise<void> {
    if (this.isReady) return Promise.resolve();

    return Promise.race([
      new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Camera ready timeout")), timeoutMs)
      ),
    ]);
  }

  /**
   * Inicia el hub de captura
   */
  async start(): Promise<void> {
    if (this.proc) {
      logger.warn("Camera hub already running", { module: "camera-hub" });
      return;
    }

    this.validateConfig();

    const { socketPath } = CONFIG.source;

    // Limpiar socket previo
    try {
      fs.unlinkSync(socketPath);
    } catch {}

    // Construir pipeline usando media layer
    const args = buildIngest(CONFIG.source, this.tryRawFallback);

    logger.info("Starting camera hub", {
      module: "camera-hub",
      source: CONFIG.source.kind,
      tryRawFallback: this.tryRawFallback,
    });

    // Spawn proceso con logging estructurado
    this.proc = spawnProcess({
      module: "camera-hub",
      command: "gst-launch-1.0",
      args,
      env: {
        GST_DEBUG: process.env.GST_DEBUG ?? "2",
        GST_DEBUG_NO_COLOR: "1",
      },
      onStdout: (line) => this.handleLog(line),
      onStderr: (line) => this.handleLog(line),
      onExit: (code, signal) => this.handleExit(code, signal),
    });

    // Polling del socket file
    this.socketPoll = setInterval(() => {
      try {
        if (!this.sawSocket && fs.existsSync(socketPath)) {
          this.sawSocket = true;
          this.tryMarkReady();
        }
      } catch {}
    }, 100);

    // Timeout de 3s según spec - debe fallar
    this.readyTimeout = setTimeout(() => {
      if (!this.isReady && this.readyReject) {
        logger.error("Camera hub ready timeout (3s)", {
          module: "camera-hub",
          sawPlaying: this.sawPlaying,
          sawSocket: this.sawSocket,
        });
        this.readyReject(new Error("Camera hub ready timeout (3s)"));
        this.readyReject = undefined;
        this.readyResolve = undefined;
      }
    }, 3000);
  }

  /**
   * Detiene el hub de forma ordenada
   */
  async stop(): Promise<void> {
    if (!this.proc) return;

    logger.info("Stopping camera hub", { module: "camera-hub" });
    this.stoppedManually = true;

    killProcess(this.proc, "SIGINT");

    // Timeout de seguridad
    setTimeout(() => {
      if (this.proc) {
        logger.warn("Process didn't respond to SIGINT, using SIGKILL", {
          module: "camera-hub",
        });
        killProcess(this.proc, "SIGKILL");
      }
      this.cleanupSocket();
    }, 1500);

    this.cleanup();
  }

  // ==================== PRIVATE ====================

  private handleLog(line: string) {
    const l = line.trim();
    if (!l) return;

    // Detectar PLAYING
    if (
      !this.sawPlaying &&
      (l.includes("Setting pipeline to PLAYING") ||
        l.includes("FROM PAUSED to PLAYING") ||
        l.includes("Pipeline is PREROLLING"))
    ) {
      this.sawPlaying = true;
      this.tryMarkReady();
    }

    // Auto-fallback MJPEG → RAW
    if (CONFIG.source.kind === "v4l2" && !this.tryRawFallback) {
      if (
        /not negotiated|not-negotiated|could not link|No supported formats/i.test(
          l
        )
      ) {
        logger.warn("Caps negotiation failed, retrying RAW fallback", {
          module: "camera-hub",
        });
        this.restartWithRawFallback();
      }
    }
  }

  private handleExit(code: number | null, signal: string | null) {
    if (this.stoppedManually) {
      this.stoppedManually = false;
      this.cleanupSocket();
      return;
    }

    // Si proc fue limpiado, fallback está manejando el restart
    if (!this.proc) {
      logger.info("Exit handled by fallback", { module: "camera-hub" });
      return;
    }

    // Auto-restart con backoff
    this.cleanup();
    this.cleanupSocket();

    const delay = Math.min(2000 * Math.pow(1.5, this.restartAttempts++), 15000);
    logger.warn("Camera hub crashed, restarting", {
      module: "camera-hub",
      delay,
      attempt: this.restartAttempts,
    });

    setTimeout(() => {
      if (!this.stoppedManually) {
        void this.start();
      }
    }, delay);
  }

  private tryMarkReady() {
    if (!this.isReady && this.sawPlaying && this.sawSocket) {
      this.isReady = true;
      this.restartAttempts = 0;
      logger.info("Camera hub ready", { module: "camera-hub" });
      this.readyResolve?.();
      this.readyReject = undefined; // Limpiar reject
      this.cleanupReadyWait();
    }
  }

  private validateConfig() {
    const { width, height, fpsHub, shmSizeMB } = CONFIG.source;

    if (width % 2 !== 0 || height % 2 !== 0) {
      throw new Error(
        `width and height must be even for I420 (got ${width}x${height})`
      );
    }

    if (fpsHub < 1) {
      throw new Error(`fpsHub must be >= 1 (got ${fpsHub})`);
    }

    const frameBytes = width * height * 1.5;
    const minMB = Math.ceil((frameBytes * 50) / (1024 * 1024));
    if (shmSizeMB < minMB) {
      logger.warn("shmSizeMB may be too small", {
        module: "camera-hub",
        minMB,
        shmSizeMB,
      });
    }
  }

  private cleanupReadyWait() {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }
    if (this.socketPoll) {
      clearInterval(this.socketPoll);
      this.socketPoll = undefined;
    }
  }

  private cleanup() {
    this.cleanupReadyWait();
    this.proc = undefined;
    this.isReady = false;
    this.sawPlaying = false;
    this.sawSocket = false;
  }

  private cleanupSocket() {
    try {
      fs.unlinkSync(CONFIG.source.socketPath);
      logger.debug("Cleaned up SHM socket", { module: "camera-hub" });
    } catch {}
  }

  private restartWithRawFallback() {
    this.tryRawFallback = true;
    this.restartAttempts = 0;
    this.cleanupReadyWait();
    this.isReady = false;
    this.sawPlaying = false;
    this.sawSocket = false;

    const proc = this.proc;
    this.proc = undefined;

    try {
      proc?.kill("SIGINT");
    } catch {}

    setTimeout(() => void this.start(), 500);
  }
}
