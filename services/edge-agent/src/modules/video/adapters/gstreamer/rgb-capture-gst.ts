/**
 * RGB Capture GStreamer - Implementación GStreamer de captura RGB
 *
 * Wrapper sobre GStreamer que extrae frames RGB a una resolución fija para
 * el motor de IA. Entrega cada frame por callback junto a metadatos.
 *
 * Características:
 * - Usa `buildCapture()` de /media/gstreamer para construir el pipeline
 * - Callback `onFrame` para entregar frames RGB (pixFmt=RGB) + `FrameMeta`
 * - Dual-rate (idle/active) cambiando el FPS y reiniciando el pipeline
 * - Buffering acotado (máx. 3 frames) para evitar crecimiento sin control
 * - Auto-recovery con backoff exponencial ante caídas del proceso hijo
 */

import { ChildProcess } from "child_process";
import { CONFIG } from "../../../../config/index.js";
import { buildCapture } from "../../../../media/gstreamer.js";
import { spawnProcess } from "../../../../shared/childproc.js";
import { logger } from "../../../../shared/logging.js";
import { FrameMeta } from "../../../../types/detections.js";
import { RGBCapture, OnFrameFn } from "../../ports/rgb-capture.js";

export class RGBCaptureGst implements RGBCapture {
  /** Proceso hijo (gst-launch) en ejecución. */
  private proc?: ChildProcess;
  /** Callback de entrega de frames RGB. */
  private onFrame?: OnFrameFn;
  /** Acumulador de bytes de stdout para rearmar frames completos. */
  private acc: Buffer = Buffer.alloc(0);
  /** Identificador simple de instancia lanzada (para debugging). */
  private childId = 0;
  /** Contador de caídas consecutivas para calcular backoff. */
  private consecutiveFailures = 0;
  /** Límite superior de reintentos automáticos. */
  private maxConsecutiveFailures = 5;
  /** Modo actual de captura (controla FPS usados). */
  private currentMode: "idle" | "active" = "idle";
  /** Flag que evita auto-restart si el stop fue intencional. */
  private stoppedManually = false;

  /** Lanza el pipeline con el FPS adecuado y conecta stdout para frames. */
  async start(onFrame: OnFrameFn): Promise<void> {
    this.onFrame = onFrame;
    this.stoppedManually = false;
    this.consecutiveFailures = 0;

    const fps = this.getFps();
    await this.launch(fps);

    logger.info("RGB capture started", {
      module: "rgb-capture-gst",
      fps,
      mode: this.currentMode,
      resolution: `${CONFIG.ai.width}x${CONFIG.ai.height}`,
    });
  }

  /**
   * Intenta terminar el proceso hijo de forma ordenada (SIGINT) y luego
   * lo asegura con SIGKILL. Limpia listeners y buffers.
   */
  async stop(): Promise<void> {
    if (!this.proc) return;

    logger.info("Stopping RGB capture", { module: "rgb-capture-gst" });
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

  /** Cambia modo de FPS y reinicia el pipeline si estaba en ejecución. */
  setMode(mode: "idle" | "active"): void {
    if (mode === this.currentMode) {
      logger.debug("Mode already set", { module: "rgb-capture-gst", mode });
      return;
    }

    logger.info("Changing capture mode", {
      module: "rgb-capture-gst",
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

  /** FPS deseado según modo actual (idle/active) de CONFIG. */
  private getFps(): number {
    return this.currentMode === "idle"
      ? CONFIG.ai.fps.idle
      : CONFIG.ai.fps.active;
  }

  /** Construye y lanza el pipeline de GStreamer con el FPS indicado. */
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
      module: "rgb-capture-gst",
      command: "gst-launch-1.0",
      args,
      env: {
        GST_DEBUG: process.env.GST_DEBUG ?? "2",
        GST_DEBUG_NO_COLOR: "1",
      },
      silentStdout: true, // No loguear stdout (contiene frames binarios)
      onExit: (code: number | null, signal: string | null) =>
        this.handleExit(code, signal),
    });

    // Conectar stdout para recibir frames RGB
    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) =>
        this.handleData(chunk, frameBytes)
      );
      logger.info("stdout connected for frame data", {
        module: "rgb-capture-gst",
      });
    }

    this.proc = child;
    this.childId++;
    this.acc = Buffer.alloc(0);
  }

  /**
   * Ensambla frames completos a partir de stdout. Limita el acumulador a
   * 3× `frameBytes` para evitar desbordes si el consumidor se atrasa.
   */
  private handleData(chunk: Buffer, frameBytes: number) {
    this.consecutiveFailures = 0;
    this.acc = Buffer.concat([this.acc, chunk]);

    // Log para debugging
    if (this.acc.length >= frameBytes) {
      logger.debug("Frame data received", {
        module: "rgb-capture-gst",
        chunkSize: chunk.length,
        accSize: this.acc.length,
        frameBytes,
      });
    }

    // Limitar acumulador a 3 frames max
    const maxAccSize = frameBytes * 3;
    if (this.acc.length > maxAccSize) {
      logger.warn("Buffer overflow, discarding old data", {
        module: "rgb-capture-gst",
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
          module: "rgb-capture-gst",
          error: (e as Error).message,
        });
      }
    }
  }

  /**
   * Gestiona la salida/crash del proceso hijo. Si no fue un stop manual,
   * programa relanzar con backoff exponencial (hasta 5 intentos).
   */
  private handleExit(code: number | null, signal: string | null) {
    if (this.stoppedManually) return;

    this.proc = undefined;
    this.acc = Buffer.alloc(0);
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      logger.error("Max consecutive failures reached, stopping auto-restart", {
        module: "rgb-capture-gst",
        failures: this.consecutiveFailures,
      });
      return;
    }

    const delay = Math.min(250 * this.consecutiveFailures, 2000);
    logger.warn("RGB capture crashed, restarting", {
      module: "rgb-capture-gst",
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
