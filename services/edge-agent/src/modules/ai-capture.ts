/**
 * AI Capture - Captura y procesamiento de frames para análisis de IA
 * 
 * Arquitectura refactorizada:
 * - Usa buildCapture() de /media/gstreamer para construir pipeline
 * - Callback onFrame para entregar frames RGB
 * - Dual-rate FPS con setMode(idle|active)
 * - Buffering inteligente con cota de seguridad (max 3 frames)
 * - Auto-recovery con backoff exponencial
 */

import { ChildProcess } from "child_process";
import { CONFIG } from "../config/index.js";
import { buildCapture } from "../media/gstreamer.js";
import { spawnProcess } from "../shared/childproc.js";
import { logger } from "../shared/logging.js";
import { FrameMeta } from "../types/detections.js";

type OnFrameFn = (rgb: Buffer, meta: FrameMeta) => void;

export interface AICapture {
  start(onFrame: OnFrameFn): Promise<void>;
  stop(): Promise<void>;
  setMode(mode: "idle" | "active"): void;
}

export class AICaptureImpl implements AICapture {
  private proc?: ChildProcess;
  private onFrame?: OnFrameFn;
  private acc: Buffer = Buffer.alloc(0);
  private childId = 0;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 5;
  private currentMode: "idle" | "active" = "idle";
  private stoppedManually = false;

  async start(onFrame: OnFrameFn): Promise<void> {
    this.onFrame = onFrame;
    this.stoppedManually = false;
    this.consecutiveFailures = 0;
    
    const fps = this.getFps();
    await this.launch(fps);
    
    logger.info("AI capture started", {
      module: "ai-capture",
      fps,
      mode: this.currentMode,
      resolution: `${CONFIG.ai.width}x${CONFIG.ai.height}`,
    });
  }

  async stop(): Promise<void> {
    if (!this.proc) return;

    logger.info("Stopping AI capture", { module: "ai-capture" });
    this.stoppedManually = true;

    // Desconectar handlers
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

    this.proc = undefined;
    this.acc = Buffer.alloc(0);
  }

  setMode(mode: "idle" | "active"): void {
    if (mode === this.currentMode) {
      logger.debug("Mode already set", { module: "ai-capture", mode });
      return;
    }

    logger.info("Changing capture mode", {
      module: "ai-capture",
      from: this.currentMode,
      to: mode,
    });

    this.currentMode = mode;

    // Reiniciar con nuevo FPS
    if (this.proc && this.onFrame) {
      const wasManual = this.stoppedManually;
      void this.stop().then(() => {
        this.stoppedManually = wasManual;
        if (!this.stoppedManually && this.onFrame) {
          void this.start(this.onFrame);
        }
      });
    }
  }

  // ==================== PRIVATE ====================

  private getFps(): number {
    return this.currentMode === "idle" ? CONFIG.ai.fps.idle : CONFIG.ai.fps.active;
  }

  private async launch(fps: number): Promise<void> {
    const { socketPath } = CONFIG.source;
    const { width: aiWidth, height: aiHeight } = CONFIG.ai;
    const frameBytes = aiWidth * aiHeight * 3; // RGB

    // Construir pipeline usando media layer (usa fdsink a stdout)
    const args = buildCapture(
      socketPath,
      CONFIG.source.width,
      CONFIG.source.height,
      CONFIG.source.fpsHub,
      CONFIG.ai,
      fps
    );

    const child = spawnProcess({
      module: "ai-capture",
      command: "gst-launch-1.0",
      args,
      env: {
        GST_DEBUG: process.env.GST_DEBUG ?? "2",
        GST_DEBUG_NO_COLOR: "1",
      },
      onExit: (code, signal) => this.handleExit(code, signal),
    });

    // Conectar stdout para recibir frames RGB
    if (child.stdout) {
      child.stdout.on("data", (chunk) => this.handleData(chunk, frameBytes));
      logger.info("stdout connected for frame data", { module: "ai-capture" });
    }

    this.proc = child;
    this.childId++;
    this.acc = Buffer.alloc(0);
  }

  private handleData(chunk: Buffer, frameBytes: number) {
    this.consecutiveFailures = 0;
    this.acc = Buffer.concat([this.acc, chunk]);

    // Log para debugging
    if (this.acc.length >= frameBytes) {
      logger.debug("Frame data received", {
        module: "ai-capture",
        chunkSize: chunk.length,
        accSize: this.acc.length,
        frameBytes,
      });
    }

    // Limitar acumulador a 3 frames max
    const maxAccSize = frameBytes * 3;
    if (this.acc.length > maxAccSize) {
      logger.warn("Buffer overflow, discarding old data", {
        module: "ai-capture",
        size: this.acc.length,
        max: maxAccSize,
      });
      this.acc = this.acc.subarray(this.acc.length - maxAccSize);
    }

    // Extraer frames completos
    while (this.acc.length >= frameBytes) {
      const frame = this.acc.subarray(0, frameBytes);
      this.acc = this.acc.subarray(frameBytes);

      const meta: FrameMeta = {
        ts: new Date().toISOString(),
        width: CONFIG.ai.width,
        height: CONFIG.ai.height,
        pixFmt: "RGB",
      };

      try {
        this.onFrame?.(frame, meta);
      } catch (e) {
        logger.error("onFrame callback error", {
          module: "ai-capture",
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
        module: "ai-capture",
        failures: this.consecutiveFailures,
      });
      return;
    }

    const delay = Math.min(250 * this.consecutiveFailures, 2000);
    logger.warn("AI capture crashed, restarting", {
      module: "ai-capture",
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
