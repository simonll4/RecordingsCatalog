/**
 * MediaMTX On-Demand Publisher - RTSP Streaming to MediaMTX Server
 *
 * This module implements on-demand RTSP streaming from the camera hub
 * to a MediaMTX server for remote viewing.
 *
 * Purpose:
 * ========
 *
 * Streams live video to external viewers via RTSP protocol.
 * "On-demand" means streaming only starts when orchestrator activates it
 * (typically during ACTIVE recording state).
 *
 * Architecture:
 * =============
 *
 * Input:
 *   - Shared Memory (SHM): Reads I420 frames from camera hub socket
 *   - Same SHM source as NV12Capture (multiple readers supported)
 *
 * Processing:
 *   - Adaptive H.264 encoding (hardware-accelerated if available)
 *   - Fallback to software encoder if HW not available
 *   - RTP packetization for RTSP transport
 *
 * Output:
 *   - RTSP stream to MediaMTX server
 *   - URL: rtsp://<mediamtx_host>:<port>/<path>
 *   - Can be viewed with VLC, FFplay, or web browsers (via WebRTC)
 *
 * GStreamer Pipeline:
 * ===================
 *
 * shmsrc → videoconvert → encoder → h264parse → rtph264pay → rtspclientsink
 *
 * Where encoder is one of:
 *   - nvh264enc (NVIDIA GPU - best performance)
 *   - vaapih264enc (Intel/AMD GPU - good performance)
 *   - x264enc (Software - always available, CPU-intensive)
 *
 * Features:
 * =========
 *
 * Adaptive Encoding
 *   - Auto-detects best available H.264 encoder via detectEncoder()
 *   - Prioritizes hardware acceleration for lower CPU usage
 *   - Graceful fallback to software encoding
 *
 * State Management
 *   - States: idle → starting → running → stopping
 *   - Prevents double-start and ensures clean shutdown
 *   - Tracks process lifecycle
 *
 * Graceful Shutdown
 *   - Sends SIGINT for clean pipeline teardown
 *   - Grace period: 1.5s for pipeline to flush buffers
 *   - Force kill (SIGKILL) if grace period expires
 *   - Prevents zombie processes
 *
 * Error Handling
 *   - Detects unexpected process exits (crashes)
 *   - Logs errors but doesn't auto-restart (controlled by orchestrator)
 *   - Returns to idle state on unexpected exit
 *
 * Integration:
 * ============
 *
 * - Orchestrator: Calls start() on ACTIVE, stop() on IDLE
 * - MediaMTX: Receives RTSP stream and handles client connections
 * - CameraHub: Provides video data via shared memory
 *
 * MediaMTX Configuration:
 * =======================
 *
 * The MediaMTX server must be configured to accept RTSP push:
 *
 * ```yaml
 * paths:
 *   live:
 *     runOnInit: ...
 *     runOnDemand: ...
 * ```
 *
 * Performance:
 * ============
 *
 * - Hardware encoding: <5% CPU usage (NVIDIA GPU)
 * - Software encoding: 30-50% CPU usage (depends on resolution/bitrate)
 * - Latency: Typically <500ms end-to-end
 * - Bitrate: Configurable via CONFIG.mediamtx settings
 */

import { ChildProcess } from "child_process";
import { CONFIG } from "../../../../config/index.js";
import { buildPublish } from "../../../../media/gstreamer.js";
import { detectEncoder } from "../../../../media/encoder.js";
import { spawnProcess, killProcess } from "../../../../shared/childproc.js";
import { logger } from "../../../../shared/logging.js";
import { metrics } from "../../../../shared/metrics.js";
import { Publisher } from "../../ports/publisher.js";

type PublisherState = "idle" | "starting" | "running" | "stopping";

export class MediaMtxOnDemandPublisherGst implements Publisher {
  private proc?: ChildProcess;
  private state: PublisherState = "idle";
  private shouldBeRunning: boolean = false; // Track if publisher should be active
  private restartAttempt: number = 0;
  private readonly streamPath: string;
  private readonly label: string;

  constructor(options?: { streamPath?: string; label?: string }) {
    this.streamPath = options?.streamPath ?? CONFIG.mediamtx.recordPath;
    this.label = options?.label ?? "record";
  }

  async start(): Promise<void> {
    if (this.state !== "idle") {
      logger.debug("Publisher not idle, skipping start", {
        module: "media-mtx-on-demand-publisher-gst",
        state: this.state,
        streamPath: this.streamPath,
        label: this.label,
      });
      return;
    }

    this.shouldBeRunning = true; // Mark that publisher should be running
    this.restartAttempt = 0; // Reset restart counter on explicit start
    await this.doStart();
  }

  private async doStart(): Promise<void> {
    this.state = "starting";

    const encoder = await detectEncoder();
    const { socketPath, width, height, fpsHub } = CONFIG.source;
    const args = buildPublish(
      socketPath,
      width,
      height,
      fpsHub,
      CONFIG.mediamtx,
      this.streamPath,
      encoder
    );

    logger.info("Starting publisher", {
      module: "media-mtx-on-demand-publisher-gst",
      encoder: encoder.element,
      attempt: this.restartAttempt,
      streamPath: this.streamPath,
      label: this.label,
    });

    this.proc = spawnProcess({
      module: "media-mtx-on-demand-publisher-gst",
      command: "gst-launch-1.0",
      args,
      env: { GST_DEBUG: "2", GST_DEBUG_NO_COLOR: "1" },
      silentStdout: true, // No loguear stdout (video stream)
      onExit: (code, signal) => {
        this.proc = undefined;
        
        if (this.state === "stopping") {
          // Expected shutdown
          this.state = "idle";
          return;
        }

        // Unexpected crash
        logger.warn("Publisher crashed unexpectedly", {
          module: "media-mtx-on-demand-publisher-gst",
          code,
          signal,
          shouldBeRunning: this.shouldBeRunning,
          streamPath: this.streamPath,
          label: this.label,
        });

        this.state = "idle";

        // Auto-restart if publisher should be running
        if (this.shouldBeRunning) {
          this.restartAttempt++;
          const delay = Math.min(Math.pow(2, this.restartAttempt) * 500, 5000); // Max 5s delay
          
          logger.info("Auto-restarting publisher", {
            module: "media-mtx-on-demand-publisher-gst",
            delay,
            attempt: this.restartAttempt,
            streamPath: this.streamPath,
            label: this.label,
          });

          setTimeout(() => {
            if (this.shouldBeRunning && this.state === "idle") {
              void this.doStart();
            }
          }, delay);
        }
      },
    });

    this.state = "running";
    metrics.inc("publisher_starts_total");
  }

  async stop(graceMs: number = 2000): Promise<void> {
    // Mark that publisher should NOT be running (prevents auto-restart)
    this.shouldBeRunning = false;

    if (this.state === "idle") {
      logger.debug("Publisher already idle", {
        module: "media-mtx-on-demand-publisher-gst",
        streamPath: this.streamPath,
        label: this.label,
      });
      return;
    }

    if (this.state === "stopping") {
      logger.debug("Publisher already stopping", {
        module: "media-mtx-on-demand-publisher-gst",
        streamPath: this.streamPath,
        label: this.label,
      });
      return;
    }

    this.state = "stopping";
    logger.info("Stopping publisher", {
      module: "media-mtx-on-demand-publisher-gst",
      streamPath: this.streamPath,
      label: this.label,
    });

    const proc = this.proc;
    this.proc = undefined;

    if (!proc) {
      // Ya murió entre medio
      this.state = "idle";
      return;
    }

    killProcess(proc, "SIGINT");

    // Wait for graceful shutdown, then force kill if needed
    // Increased grace period to 2000ms to allow SHM buffer to flush properly
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn("Publisher didn't stop gracefully, forcing kill", {
          module: "media-mtx-on-demand-publisher-gst",
          streamPath: this.streamPath,
          label: this.label,
        });
        killProcess(proc, "SIGKILL");
        resolve();
      }, graceMs);

      proc.once("exit", () => {
        clearTimeout(timeout);
        this.state = "idle";
        logger.info("Publisher stopped", {
          module: "media-mtx-on-demand-publisher-gst",
          streamPath: this.streamPath,
          label: this.label,
        });
        resolve();
      });
    });
  }
}
