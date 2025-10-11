/**
 * NV12 Capture GStreamer - Captura frames en formato NV12/I420 para AI v1
 *
 * Lee frames del SHM en formato nativo (NV12 o I420) sin conversión a RGB.
 * Entrega frames RAW con metadatos de planos para protocolo v1.
 *
 * Características:
 * - Usa appsink para capturar buffers GStreamer directamente
 * - Extrae información de planos (stride, offset, size)
 * - Dual-rate (idle/active) mediante videorate
 * - Auto-recovery con backoff
 */

import { ChildProcess } from "child_process";
import { spawn } from "child_process";
import { CONFIG } from "../../../../config/index.js";
import { logger } from "../../../../shared/logging.js";

export interface NV12FrameMeta {
  width: number;
  height: number;
  format: "NV12" | "I420";
  tsMonoNs: bigint;
  planes: Array<{
    stride: number;
    offset: number;
    size: number;
  }>;
}

export type OnNV12FrameFn = (data: Buffer, meta: NV12FrameMeta) => void;

export class NV12CaptureGst {
  private proc?: ChildProcess;
  private onFrame?: OnNV12FrameFn;
  private acc: Buffer = Buffer.alloc(0);
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 5;
  private currentMode: "idle" | "active" = "idle";
  private stoppedManually = false;

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

  private getFps(): number {
    return this.currentMode === "idle"
      ? CONFIG.ai.fps.idle
      : CONFIG.ai.fps.active;
  }

  private async launch(fps: number): Promise<void> {
    const { socketPath } = CONFIG.source;
    const { width: aiWidth, height: aiHeight } = CONFIG.ai;

    // Use NV12 format (more efficient, 2 planes: Y + UV interleaved)
    // NV12: Y plane (width*height) + UV plane (width*height/2)
    const frameBytes = Math.floor(aiWidth * aiHeight * 1.5);

    const args = [
      "--gst-debug-no-color",
      "--gst-debug=shmsrc:3,appsink:3",
      "shmsrc",
      `socket-path=${socketPath}`,
      "is-live=true",
      "do-timestamp=true",
      "!",
      `video/x-raw,format=I420,width=${CONFIG.source.width},height=${CONFIG.source.height},framerate=${CONFIG.source.fpsHub}/1`,
      "!",
      "queue",
      "max-size-buffers=1",
      "leaky=downstream",
      "!",
      "videorate",
      "!",
      `video/x-raw,framerate=${fps}/1`,
      "!",
      "videoscale",
      "!",
      `video/x-raw,format=I420,width=${aiWidth},height=${aiHeight}`,
      "!",
      "videoconvert",
      "!",
      `video/x-raw,format=NV12`,
      "!",
      "queue",
      "max-size-buffers=2",
      "leaky=downstream",
      "!",
      "fdsink",
      "fd=1",
      "sync=false",
    ];

    const child = spawn("gst-launch-1.0", args, {
      env: {
        ...process.env,
        GST_DEBUG: process.env.GST_DEBUG ?? "2",
        GST_DEBUG_NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stderr?.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          logger.debug(line.trim(), { module: "nv12-capture-gst" });
        }
      }
    });

    child.stdout?.on("data", (chunk: Buffer) =>
      this.handleData(chunk, frameBytes, aiWidth, aiHeight)
    );

    child.on("exit", (code, signal) => this.handleExit(code, signal));

    this.proc = child;
    this.acc = Buffer.alloc(0);

    logger.info("NV12 capture pipeline launched", {
      module: "nv12-capture-gst",
      fps,
      frameBytes,
    });
  }

  private handleData(
    chunk: Buffer,
    frameBytes: number,
    width: number,
    height: number
  ) {
    this.consecutiveFailures = 0;
    this.acc = Buffer.concat([this.acc, chunk]);

    // Limit accumulator to 3 frames max
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
      // - Y plane: width * height
      // - UV plane: width * height / 2 (interleaved)
      const ySize = width * height;
      const uvSize = Math.floor(width * height / 2);

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
        this.onFrame?.(frameData, meta);
      } catch (e) {
        logger.error("onFrame callback error", {
          module: "nv12-capture-gst",
          error: (e as Error).message,
        });
      }
    }
  }

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
