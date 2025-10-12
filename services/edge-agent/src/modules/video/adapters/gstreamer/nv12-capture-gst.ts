/**
 * NV12 Capture GStreamer - Raw Frame Capture for AI Protocol v1
 *
 * Captures frames in native NV12/I420 format from shared memory without RGB conversion.
 * Delivers raw frames with plane metadata for efficient AI processing.
 *
 * Purpose:
 * ========
 *
 * AI worker expects raw YUV frames (NV12 format) for inference.
 * This module reads frames from CameraHub's shared memory and extracts them
 * as binary buffers with plane layout information.
 *
 * Features:
 * =========
 *
 * Native Format Capture
 *   - Uses fdsink to stream raw frames directly to stdout
 *   - No RGB conversion (more efficient than JPEG encoding)
 *   - Preserves native YUV format from camera
 *
 * Plane Metadata Extraction
 *   - Extracts stride, offset, and size for each plane
 *   - Enables AI worker to parse YUV data correctly
 *   - Protocol v1 compatibility
 *
 * Dual-Rate Support (Deprecated in v1)
 *   - Supports idle/active FPS modes
 *   - v1 protocol handles backpressure via window size
 *   - FPS changes not needed in v1 (worker controls flow)
 *
 * Auto-Recovery
 *   - Detects pipeline crashes
 *   - Restarts with exponential backoff
 *   - Gives up after max consecutive failures
 *
 * Architecture:
 * =============
 *
 * GStreamer Pipeline:
 *   shmsrc socket-path=/tmp/camera_shm
 *   ! video/x-raw,format=I420
 *   ! videoscale
 *   ! video/x-raw,width=640,height=480
 *   ! videoconvert
 *   ! video/x-raw,format=NV12
 *   ! fdsink fd=1 sync=false   (writes raw frames to stdout)
 *
 * Data Flow:
 *   1. shmsrc reads I420 frames from CameraHub
 *   2. videoscale resizes to AI resolution (640×480)
 *   3. videoconvert converts I420 → NV12 (more efficient for YOLO)
 *   4. fdsink writes frames to stdout as a binary stream
 *   5. handleData() accumulates bytes, extracts complete frames
 *   6. onFrame() callback delivers frame + metadata to AIFeeder
 *
 * NV12 Format:
 * ============
 *
 * NV12 is a YUV 4:2:0 format with 2 planes:
 *
 * Plane 0 (Y - Luma):
 *   - Size: width × height bytes
 *   - Stride: width (no padding)
 *   - Contains brightness information
 *
 * Plane 1 (UV - Chroma):
 *   - Size: width × height / 2 bytes
 *   - Stride: width (U and V interleaved)
 *   - Contains color information
 *   - Layout: UVUVUVUV... (2×2 subsampling)
 *
 * Total Frame Size: width × height × 1.5 bytes
 *
 * Why NV12?
 *   - More cache-friendly than I420 (2 planes vs 3)
 *   - Better GPU performance (interleaved UV)
 *   - Widely supported by AI inference engines
 *
 * Usage Example:
 * ==============
 *
 * ```typescript
 * const capture = new NV12CaptureGst();
 *
 * await capture.start((frameData, meta) => {
 *   console.log(`Received ${meta.format} frame: ${meta.width}×${meta.height}`);
 *   console.log(`Y plane: ${meta.planes[0].size} bytes`);
 *   console.log(`UV plane: ${meta.planes[1].size} bytes`);
 *
 *   // Send to AI worker via protocol v1
 *   aiClient.submitFrame(frameData, meta);
 * });
 *
 * // Later: stop capture
 * await capture.stop();
 * ```
 *
 * Protocol v1 Integration:
 * =========================
 *
 * AIFeeder calls start() with onFrame callback that:
 * 1. Receives raw NV12 frame buffer
 * 2. Gets plane metadata (stride, offset, size)
 * 3. Builds protobuf FrameData message
 * 4. Sends binary frame + metadata to AI worker over TCP
 *
 * Why Not RGB?
 * ============
 *
 * Efficiency
 *   - NV12 is 1.5 bytes/pixel vs RGB 3 bytes/pixel (50% smaller)
 *   - No conversion overhead (camera → AI direct)
 *
 * Compatibility
 *   - YOLO models expect YUV input
 *   - Most cameras output YUV natively
 *   - AI inference engines optimized for YUV
 *
 * Performance
 *   - Faster than JPEG encoding/decoding
 *   - Lower CPU usage
 *   - Lower latency
 */

import { ChildProcess } from "child_process";
import { spawn } from "child_process";
import { CONFIG } from "../../../../config/index.js";
import { logger } from "../../../../shared/logging.js";
import { buildNV12Capture } from "../../../../media/gstreamer.js";
import { normalizeNV12SplitFrame } from "../../utils/nv12-normalizer.js";

/**
 * NV12 Frame Metadata
 *
 * Describes the layout of a raw NV12 frame for protocol v1.
 */
export interface NV12FrameMeta {
  width: number; // Frame width in pixels
  height: number; // Frame height in pixels
  format: "NV12" | "I420"; // Pixel format (typically NV12)
  tsMonoNs: bigint; // Monotonic timestamp in nanoseconds (for latency tracking)
  planes: Array<{
    // Plane layout information
    stride: number; // Bytes per row (usually equal to width)
    offset: number; // Offset from buffer start (Y=0, UV=width×height)
    size: number; // Total plane size in bytes
  }>;
}

/**
 * Frame Callback
 *
 * Called for each captured frame with raw buffer and metadata.
 *
 * @param data - Raw NV12 frame buffer (width×height×1.5 bytes)
 * @param meta - Frame metadata (resolution, format, plane layout)
 */
export type OnNV12FrameFn = (data: Buffer, meta: NV12FrameMeta) => void;

/**
 * NV12 Capture GStreamer - Raw Frame Capture Pipeline
 *
 * Manages a GStreamer pipeline that reads frames from shared memory
 * and delivers them as raw NV12 buffers.
 */
export class NV12CaptureGst {
  private proc?: ChildProcess; // GStreamer process
  private onFrame?: OnNV12FrameFn; // Frame callback
  private acc: Buffer = Buffer.alloc(0); // Binary accumulator for stdout
  private consecutiveFailures = 0; // Crash counter for backoff
  private maxConsecutiveFailures = 5; // Max failures before giving up
  private currentMode: "idle" | "active" = "idle"; // FPS mode (deprecated in v1)
  private stoppedManually = false; // Manual stop flag (prevents auto-restart)
  private lastLoggedSeam: number | null = null; // Tracks last seam logged to avoid spam

  /**
   * Start NV12 Capture
   *
   * Launches GStreamer pipeline and starts delivering frames to callback.
   *
   * Pipeline:
   *   shmsrc → videoscale → videoconvert → NV12 → fdsink(stdout)
   *
   * @param onFrame - Callback for each captured frame
   */
  async start(onFrame: OnNV12FrameFn): Promise<void> {
    this.onFrame = onFrame;
    this.stoppedManually = false;
    this.consecutiveFailures = 0;

    const fps = this.getFps();
    await this.launch(fps);

    logger.info("NV12 capture started", {
      module: "nv12-capture-gst",
      fps,
      mode: this.currentMode,
      resolution: `${CONFIG.ai.width}x${CONFIG.ai.height}`,
    });
  }

  /**
   * Stop NV12 Capture
   *
   * Gracefully stops the GStreamer pipeline.
   *
   * Shutdown Sequence:
   *   1. Set stoppedManually flag (prevents auto-restart)
   *   2. Remove all event listeners
   *   3. Send SIGINT (graceful shutdown)
   *   4. Wait 200ms for cleanup
   *   5. Send SIGKILL if still running
   */
  async stop(): Promise<void> {
    if (!this.proc) return;

    logger.info("Stopping NV12 capture", { module: "nv12-capture-gst" });
    this.stoppedManually = true;

    this.proc.stdout?.removeAllListeners();
    this.proc.stderr?.removeAllListeners();
    this.proc.removeAllListeners();

    try {
      this.proc.kill("SIGINT");
    } catch {}

    await new Promise((res) => setTimeout(res, 200));

    try {
      this.proc?.kill("SIGKILL");
    } catch {}

    this.acc = Buffer.alloc(0);
  }

  /**
   * Set FPS Mode (Deprecated in Protocol v1)
   *
   * Changes between idle and active FPS rates.
   * In protocol v1, this is deprecated - AI worker handles backpressure
   * via window size, so dynamic FPS is not needed.
   *
   * @param mode - "idle" (low FPS) or "active" (high FPS)
   */
  setMode(mode: "idle" | "active"): void {
    if (this.currentMode === mode) {
      return;
    }

    logger.info("Mode change requested (NV12 v1 ignores FPS changes)", {
      module: "nv12-capture-gst",
      from: this.currentMode,
      to: mode,
    });

    // Update mode for logging purposes, but don't restart pipeline
    // In v1 protocol, AI worker handles backpressure via window size
    // so we don't need dynamic FPS changes
    this.currentMode = mode;
  }

  // ==================== PRIVATE ====================

  /**
   * Get Current FPS Based on Mode
   *
   * Returns configured FPS for current mode (idle/active).
   *
   * @returns FPS value from CONFIG
   */
  private getFps(): number {
    return this.currentMode === "idle"
      ? CONFIG.ai.fps.idle
      : CONFIG.ai.fps.active;
  }

  /**
   * Launch GStreamer Pipeline
   *
   * Spawns gst-launch-1.0 with NV12 capture pipeline.
   *
   * Pipeline Construction:
   *   - buildNV12Capture() generates args array
   *   - Reads from CONFIG.source.socketPath (shared memory)
   *   - Scales to AI resolution (CONFIG.ai.width × CONFIG.ai.height)
   *   - Converts to NV12 format
   *   - Outputs binary frames to stdout
   *
   * @param fps - Target framerate
   */
  private async launch(fps: number): Promise<void> {
    const {
      socketPath,
      width: srcWidth,
      height: srcHeight,
      fpsHub,
    } = CONFIG.source;
    const { width: aiWidth, height: aiHeight } = CONFIG.ai;

    // Calculate NV12 frame size
    // NV12: Y plane (width×height) + UV plane (width×height/2)
    const frameBytes = Math.floor(aiWidth * aiHeight * 1.5);

    const args = buildNV12Capture(
      socketPath,
      srcWidth,
      srcHeight,
      fpsHub,
      aiWidth,
      aiHeight,
      fps
    );

    const child = spawn("gst-launch-1.0", args, {
      env: {
        ...process.env,
        GST_DEBUG: process.env.GST_DEBUG ?? "2",
        GST_DEBUG_NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Log GStreamer debug output
    child.stderr?.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          logger.debug(line.trim(), { module: "nv12-capture-gst" });
        }
      }
    });

    // Process binary frame data from stdout
    child.stdout?.on("data", (chunk: Buffer) =>
      this.handleData(chunk, frameBytes, aiWidth, aiHeight)
    );

    // Handle pipeline exit (crash or manual stop)
    child.on("exit", (code, signal) => this.handleExit(code, signal));

    this.proc = child;
    this.acc = Buffer.alloc(0);

    logger.info("NV12 capture pipeline launched", {
      module: "nv12-capture-gst",
      fps,
      frameBytes,
    });
  }

  /**
   * Handle Binary Data from stdout
   *
   * Accumulates binary chunks and extracts complete frames.
   *
   * Algorithm:
   * ==========
   *
   * 1. Reset failure counter (pipeline is alive)
   * 2. Append chunk to accumulator
   * 3. If accumulator > 3 frames, discard old data (prevent memory leak)
   * 4. While accumulator has complete frame:
   *    a. Extract frameBytes from front
   *    b. Build plane metadata (Y + UV offsets)
   *    c. Call onFrame callback
   *    d. Remove extracted bytes from accumulator
   *
   * NV12 Plane Layout:
   *   Plane 0 (Y):  offset=0,           size=width×height,   stride=width
   *   Plane 1 (UV): offset=width×height, size=width×height/2, stride=width
   *
   * @param chunk - Binary data from stdout
   * @param frameBytes - Expected frame size (width×height×1.5)
   * @param width - Frame width
   * @param height - Frame height
   */
  private handleData(
    chunk: Buffer,
    frameBytes: number,
    width: number,
    height: number
  ) {
    this.consecutiveFailures = 0;
    this.acc = Buffer.concat([this.acc, chunk]);

    // Limit accumulator to 3 frames max (prevent memory exhaustion)
    const maxAccSize = frameBytes * 3;
    if (this.acc.length > maxAccSize) {
      logger.warn("Buffer overflow, discarding old data", {
        module: "nv12-capture-gst",
        size: this.acc.length,
        max: maxAccSize,
      });
      this.acc = this.acc.subarray(this.acc.length - maxAccSize);
    }

    // Extract complete frames
    while (this.acc.length >= frameBytes) {
      const frameData = this.acc.subarray(0, frameBytes);
      this.acc = this.acc.subarray(frameBytes);

      // NV12 has 2 planes:
      // - Y plane: width × height (luma)
      // - UV plane: width × height / 2 (chroma, interleaved)
      const ySize = width * height;
      const uvSize = Math.floor((width * height) / 2);

      const meta: NV12FrameMeta = {
        width,
        height,
        format: "NV12",
        tsMonoNs: process.hrtime.bigint(), // Monotonic timestamp in nanoseconds
        planes: [
          {
            stride: width,
            offset: 0,
            size: ySize,
          },
          {
            stride: width, // UV interleaved, same stride as Y
            offset: ySize,
            size: uvSize,
          },
        ],
      };

      try {
        const { buffer: normalizedData, seam } = normalizeNV12SplitFrame(
          frameData,
          width,
          height
        );

        if (seam !== this.lastLoggedSeam) {
          this.lastLoggedSeam = seam;
          if (seam !== null) {
            logger.debug("Corrected split NV12 frame", {
              module: "nv12-capture-gst",
              seam,
              width,
              height,
            });
          }
        }

        this.onFrame?.(normalizedData, meta);
      } catch (e) {
        logger.error("onFrame callback error", {
          module: "nv12-capture-gst",
          error: (e as Error).message,
        });
      }
    }
  }

  /**
   * Handle Pipeline Exit
   *
   * Handles GStreamer process exit (crash or manual stop).
   *
   * Auto-Restart Logic:
   * ===================
   *
   * 1. If stopped manually → do nothing (expected exit)
   * 2. Increment failure counter
   * 3. If max failures reached → log error, give up
   * 4. Otherwise:
   *    - Calculate exponential backoff delay (250ms, 500ms, 750ms, ...)
   *    - Wait delay
   *    - Restart pipeline if still needed
   *
   * Backoff Formula:
   *   delay = min(250 × consecutiveFailures, 2000)
   *   - Attempt 1: 250ms
   *   - Attempt 2: 500ms
   *   - Attempt 3: 750ms
   *   - Attempt 4+: 1000ms, 1250ms, ..., max 2000ms
   *
   * @param code - Exit code (null if killed by signal)
   * @param signal - Signal that killed process (null if exited normally)
   */
  private handleExit(code: number | null, signal: string | null) {
    if (this.stoppedManually) return;

    this.proc = undefined;
    this.acc = Buffer.alloc(0);
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      logger.error("Max consecutive failures reached, stopping auto-restart", {
        module: "nv12-capture-gst",
        failures: this.consecutiveFailures,
      });
      return;
    }

    const delay = Math.min(250 * this.consecutiveFailures, 2000);
    logger.warn("NV12 capture crashed, restarting", {
      module: "nv12-capture-gst",
      delay,
      attempt: this.consecutiveFailures,
    });

    setTimeout(() => {
      if (!this.proc && !this.stoppedManually && this.onFrame) {
        void this.launch(this.getFps());
      }
    }, delay);
  }
}
