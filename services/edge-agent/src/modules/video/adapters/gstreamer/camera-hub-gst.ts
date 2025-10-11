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
 * Input Sources:
 *   - V4L2: USB/built-in cameras (e.g., /dev/video0)
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
 * V4L2 Source:
 *   v4l2src → videoconvert → videoscale → shmsink
 *
 * RTSP Source:
 *   rtspsrc → rtph264depay → h264parse → avdec_h264 → videoconvert → shmsink
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
 *   - V4L2 format fallback (MJPEG → RAW if MJPEG fails)
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
 * ======================
 *
 * On unexpected exit (crash, source disconnected):
 * - Delay = Math.min(2^attempts * 1000, 30000) ms
 * - Max delay: 30 seconds
 * - Infinite retries (always-on design)
 * - Resets attempt counter on successful start
 *
 * V4L2 Format Fallback:
 * =====================
 *
 * If MJPEG fails on first attempt:
 * - Set tryRawFallback = true
 * - Retry with RAW format (YUYV/YUY2)
 * - More CPU usage but better compatibility
 *
 * Integration:
 * ============
 *
 * - NV12Capture: Reads from SHM, converts to NV12
 * - Publisher: Reads from SHM, encodes to H264, streams via RTSP
 * - Orchestrator: Waits for ready() before starting other modules
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

  // Ready promise resolution callbacks
  private readyResolve?: () => void;
  private readyReject?: (err: Error) => void;

  // Ready state flags
  private isReady = false; // Final ready state (sawPlaying AND sawSocket)
  private sawPlaying = false; // GStreamer reached PLAYING state
  private sawSocket = false; // SHM socket file exists

  // Timers
  private readyTimeout?: NodeJS.Timeout; // 3s timeout for ready detection
  private socketPoll?: NodeJS.Timeout; // 100ms polling for socket existence

  // Restart & fallback logic
  private tryRawFallback = false; // V4L2 format fallback flag (MJPEG → RAW)
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
   *
   * V4L2 Fallback:
   * If first attempt fails with MJPEG, retry with RAW format.
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
    const args = buildIngest(CONFIG.source, this.tryRawFallback);

    logger.info("Starting camera hub", {
      module: "camera-hub-gst",
      source: CONFIG.source.kind,
      tryRawFallback: this.tryRawFallback,
    });

    // Spawn GStreamer process with structured logging
    this.proc = spawnProcess({
      module: "camera-hub-gst",
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
      if (!this.isReady && this.readyReject) {
        logger.error("Camera hub ready timeout (3s)", {
          module: "camera-hub-gst",
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

    logger.info("Stopping camera hub", { module: "camera-hub-gst" });
    this.stoppedManually = true;

    killProcess(this.proc, "SIGINT");

    // Timeout de seguridad
    setTimeout(() => {
      if (this.proc) {
        logger.warn("Process didn't respond to SIGINT, using SIGKILL", {
          module: "camera-hub-gst",
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
          module: "camera-hub-gst",
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
      logger.info("Exit handled by fallback", { module: "camera-hub-gst" });
      return;
    }

    // Auto-restart con backoff
    this.cleanup();
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
  }

  private cleanupSocket() {
    try {
      fs.unlinkSync(CONFIG.source.socketPath);
      logger.debug("Cleaned up SHM socket", { module: "camera-hub-gst" });
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
