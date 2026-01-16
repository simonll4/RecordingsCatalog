/**
 * Camera Hub GStreamer - Always-On Video Capture Pipeline
 *
 * The Camera Hub is the foundation of the video pipeline. It captures video
 * continuously from a camera source and exposes frames via shared memory (SHM)
 * for consumption by other modules.
 *
 * Architecture:
 * =============
 *
 * Input Source:
 *   - RTSP: Network cameras (e.g., rtsp://192.168.1.100:8554/cam)
 *
 * Output:
 *   - Shared Memory (SHM): Unix domain socket with I420 frames
 *   - Format: I420 (planar YUV 4:2:0)
 *   - Consumers: NV12Capture, Publisher
 *
 * GStreamer Pipeline:
 * ===================
 *
 * RTSP Source (H.264):
 *   rtspsrc (TCP) → rtph264depay → h264parse → avdec_h264 → videoconvert → shmsink
 *
 * Features:
 * =========
 *
 * Pipeline Construction
 *   - Delegates to buildIngest() in media layer
 *   - Automatic format negotiation (MJPEG/RAW/H264)
 *   - Configurable resolution and framerate
 *
 * Process Management
 *   - Uses spawnProcess() for clean subprocess handling
 *   - Structured logging of GStreamer output
 *   - Graceful shutdown with timeout
 *
 * Reliability
 *   - Auto-restart on crash with exponential backoff
 *   - Ready detection via dual criteria (PLAYING state + socket exists)
 *
 * State Tracking
 *   - Monitors GStreamer state transitions (NULL → READY → PAUSED → PLAYING)
 *   - Polls for SHM socket creation (filesystem check)
 *   - AND-based ready condition (both criteria must be met)
 *
 * Ready Criteria:
 * ===============
 *
 * The hub is considered "ready" when BOTH conditions are true:
 *
 * 1. sawPlaying = true
 *    - GStreamer pipeline reached PLAYING state
 *    - Detected via log parsing ("state change: PAUSED -> PLAYING")
 *
 * 2. sawSocket = true
 *    - SHM socket file exists on filesystem
 *    - Detected via periodic polling (100ms interval)
 *
 * This dual-check prevents race conditions where pipeline is PLAYING
 * but socket isn't created yet (or vice versa).
 *
 * Auto-Restart Behavior:
 * =======================
 *
 * - Infinite retries (always-on design)
 * - Resets attempt counter on successful start
 */

import fs from "node:fs";
import { ChildProcess } from "child_process";
import { CONFIG } from "../../../../config/index.js";
import { buildIngest } from "../../../../media/gstreamer.js";
import { spawnProcess, killProcess } from "../../../../shared/childproc.js";
import { logger } from "../../../../shared/logging.js";
import { CameraHub } from "../../ports/camera-hub.js";

export class CameraHubGst implements CameraHub {
  // GStreamer child process
  private proc?: ChildProcess;

  // Ready promise resolution callbacks (support multiple waiters)
  private readyWaiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  // Ready state flags
  private isReady = false; // Final ready state (sawPlaying AND sawSocket)
  private sawPlaying = false; // GStreamer reached PLAYING state
  private sawSocket = false; // SHM socket file exists

  // Timers
  private readyTimeout?: NodeJS.Timeout; // 3s timeout for ready detection
  private socketPoll?: NodeJS.Timeout; // 100ms polling for socket existence

  // Restart logic
  private stoppedManually = false; // Prevents auto-restart during intentional shutdown
  private restartAttempts = 0; // Counter for exponential backoff calculation

  /**
   * Wait for Camera Hub to be Ready
   *
   * Returns a promise that resolves when BOTH ready criteria are met:
   * 1. GStreamer pipeline is in PLAYING state (sawPlaying = true)
   * 2. SHM socket file exists on filesystem (sawSocket = true)
   *
   * If already ready, returns immediately.
   * If not ready within timeout, rejects with error.
   *
   * @param timeoutMs - Max wait time in milliseconds (default: 5000ms)
   * @returns Promise that resolves when ready, rejects on timeout
   */
  async ready(timeoutMs: number = 5000): Promise<void> {
    if (this.isReady) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const onTimeout = () => {
        this.removeReadyWaiter(waiter);
        reject(new Error("Camera ready timeout"));
      };

      const timeout = setTimeout(onTimeout, timeoutMs);

      const waiter = {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        },
      };

      this.readyWaiters.push(waiter);
    });
  }

  /**
   * Start Camera Hub
   *
   * Lifecycle:
   * 1. Validate configuration (source type, paths, dimensions)
   * 2. Clean up previous SHM socket file (if exists)
   * 3. Build GStreamer pipeline arguments via buildIngest()
   * 4. Spawn gst-launch-1.0 subprocess
   * 5. Start socket polling (100ms interval)
   * 6. Set ready timeout (3s max wait)
   * 7. Wait for ready criteria via log parsing + socket detection
   *
   * Auto-Restart:
   * If process exits unexpectedly, auto-restart with exponential backoff.
   */
  async start(): Promise<void> {
    if (this.proc) {
      logger.warn("Camera hub already running", { module: "camera-hub-gst" });
      return;
    }

    this.validateConfig();

    const { socketPath } = CONFIG.source;

    // Clean up stale socket file from previous run
    try {
      fs.unlinkSync(socketPath);
    } catch {}

    // Build GStreamer pipeline arguments via media layer
    const args = buildIngest(CONFIG.source);

    logger.info("Starting camera hub", {
      module: "camera-hub-gst",
      source: CONFIG.source.kind,
    });

    // Spawn GStreamer process with structured logging
    this.proc = spawnProcess({
      module: "camera-hub-gst",
      command: "gst-launch-1.0",
      args,
      env: {
        GST_DEBUG: process.env.GST_DEBUG ?? "3,shmsink:4,videorate:4", // INFO + important elements
        GST_DEBUG_NO_COLOR: "1",
      },
      onStdout: (line) => this.handleLog(line),
      onStderr: (line) => this.handleLog(line),
      onExit: (code, signal) => this.handleExit(code, signal),
    });

    // Poll for SHM socket file creation (100ms interval)
    // This is needed because GStreamer may reach PLAYING before socket is created
    this.socketPoll = setInterval(() => {
      try {
        if (!this.sawSocket && fs.existsSync(socketPath)) {
          this.sawSocket = true;
          this.tryMarkReady();
        }
      } catch {}
    }, 100);

    // Ready timeout: must become ready within 3s or fail
    // This matches the specification timeout requirement
    this.readyTimeout = setTimeout(() => {
      if (!this.isReady) {
        logger.error("Camera hub ready timeout (3s)", {
          module: "camera-hub-gst",
          sawPlaying: this.sawPlaying,
          sawSocket: this.sawSocket,
        });
        this.rejectAllReadyWaiters(new Error("Camera hub ready timeout (3s)"));
      }
    }, 3000);
  }

  /**
   * Detiene el hub de forma ordenada
   */
  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc) return;

    logger.info("Stopping camera hub", { module: "camera-hub-gst" });
    this.stoppedManually = true;

    // Detener timers de ready para evitar que sigan marcando eventos durante el shutdown
    this.cleanupReadyWait();

    await new Promise<void>((resolve) => {
      // Si el proceso ya terminó, resolver inmediatamente
      if (proc.exitCode !== null || proc.signalCode !== null) {
        resolve();
        return;
      }

      const cleanupTimers = () => {
        if (killTimer) clearTimeout(killTimer);
        if (failSafe) clearTimeout(failSafe);
      };

      const onExit = () => {
        cleanupTimers();
        resolve();
      };

      proc.once("exit", onExit);

      // Enviar SIGINT para un shutdown ordenado
      killProcess(proc, "SIGINT");

      // Escalamiento a SIGKILL si en 1.5s no respondió
      const killTimer = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          logger.warn("Process didn't respond to SIGINT, using SIGKILL", {
            module: "camera-hub-gst",
          });
          killProcess(proc, "SIGKILL");
        }
      }, 1500);

      // Failsafe para no quedar colgados si ni SIGKILL resulta
      const failSafe = setTimeout(() => {
        logger.error("Timeout waiting for camera hub process to exit", {
          module: "camera-hub-gst",
        });
        proc.removeListener("exit", onExit);
        cleanupTimers();
        resolve();
      }, 5000);
    });

    // Limpiar estado y socket después de que el proceso terminó
    this.cleanup();
    this.cleanupSocket();
  }

  // ==================== PRIVATE ====================

  private handleLog(line: string) {
    const l = line.trim();
    if (!l) return;

    // DEBUG: Detectar problemas críticos
    if (
      l.includes("not-linked") ||
      l.includes("not linked") ||
      l.includes("not-negotiated")
    ) {
      logger.error("[DEBUG] GStreamer pipeline problem", {
        module: "camera-hub-gst",
        error: l,
      });
    }

    // DEBUG: Problemas de caps/formatos
    if (l.includes("WARN") && (l.includes("caps") || l.includes("negotiat"))) {
      logger.warn("[DEBUG] Caps negotiation issue", {
        module: "camera-hub-gst",
        message: l,
      });
    }

    // DEBUG: Problemas de buffering/sync
    if (
      l.includes("WARN") &&
      (l.includes("buffer") ||
        l.includes("sync") ||
        l.includes("late") ||
        l.includes("drop"))
    ) {
      logger.warn("[DEBUG] Buffer/sync issue", {
        module: "camera-hub-gst",
        message: l,
      });
    }

    // DEBUG: Errores REALES de RTSP
    if (
      l.includes("ERROR") &&
      (l.includes("Could not connect") ||
        l.includes("Unauthorized") ||
        l.includes("404"))
    ) {
      logger.error("[DEBUG] RTSP connection error", {
        module: "camera-hub-gst",
        error: l,
      });
    }

    // Detectar PLAYING
    if (
      !this.sawPlaying &&
      (l.includes("Setting pipeline to PLAYING") ||
        l.includes("FROM PAUSED to PLAYING") ||
        l.includes("Pipeline is PREROLLING"))
    ) {
      this.sawPlaying = true;
      logger.info("[DEBUG] Camera Hub pipeline is PLAYING", {
        module: "camera-hub-gst",
      });
      this.tryMarkReady();
    }
  }

  private handleExit(code: number | null, signal: string | null) {
    const wasManual = this.stoppedManually;
    this.stoppedManually = false;

    this.cleanup();

    if (wasManual) {
      logger.info("Camera hub exited", {
        module: "camera-hub-gst",
        code,
        signal,
      });
      return;
    }

    // Auto-restart con backoff cuando el proceso cae inesperadamente
    this.cleanupSocket();

    const delay = Math.min(2000 * Math.pow(1.5, this.restartAttempts++), 15000);
    logger.warn("Camera hub crashed, restarting", {
      module: "camera-hub-gst",
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
      logger.info("Camera hub ready", { module: "camera-hub-gst" });
      this.resolveAllReadyWaiters();
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
        module: "camera-hub-gst",
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
    // Reject any pending waiters to avoid hangs during restart
    if (this.readyWaiters.length > 0) {
      this.rejectAllReadyWaiters(new Error("Camera hub restarted"));
    }
  }

  private cleanupSocket() {
    try {
      fs.unlinkSync(CONFIG.source.socketPath);
      logger.debug("Cleaned up SHM socket", { module: "camera-hub-gst" });
    } catch {}
  }

  private resolveAllReadyWaiters() {
    const waiters = [...this.readyWaiters];
    this.readyWaiters = [];
    for (const waiter of waiters) {
      try {
        waiter.resolve();
      } catch {}
    }
  }

  private rejectAllReadyWaiters(err: Error) {
    const waiters = [...this.readyWaiters];
    this.readyWaiters = [];
    for (const waiter of waiters) {
      try {
        waiter.reject(err);
      } catch {}
    }
  }

  private removeReadyWaiter(waiter: {
    resolve: () => void;
    reject: (err: Error) => void;
  }) {
    this.readyWaiters = this.readyWaiters.filter((w) => w !== waiter);
  }
}
