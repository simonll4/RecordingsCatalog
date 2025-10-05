/**
 * AI Engine - Simulador de modelo ONNX
 *
 * Arquitectura refactorizada:
 * - Interfaz limpia (setModel, run)
 * - Emite eventos AIEvents al bus
 * - Lógica de relevancia y keepalive
 * - Simulación temporal (2 sesiones de 20s)
 */

import { Bus } from "../core/bus/bus.js";
import { logger } from "../shared/logging.js";
import { metrics } from "../shared/metrics.js";
import { FrameMeta, Detection } from "../types/detections.js";

export interface AIEngine {
  setModel(opts: {
    modelName: string;
    umbral: number;
    width: number;
    height: number;
    classNames: string[];
  }): Promise<void>;
  run(frame: Buffer, meta: FrameMeta): Promise<void>;
}

export class AIEngineSim implements AIEngine {
  private bus: Bus;
  private setup?: {
    modelName: string;
    umbral: number;
    width: number;
    height: number;
    classNames: string[];
  };

  private sessionCount = 0;
  private maxSessions = 2;
  private sessionStartTime = 0;
  private sessionDuration = 20000; // 20s
  private inSession = false;
  private finished = false;
  private waiting = false;
  private waitUntil = 0;

  private frameCount = 0;
  private lastFrameTime = 0;

  constructor(bus: Bus) {
    this.bus = bus;
  }

  async setModel(opts: {
    modelName: string;
    umbral: number;
    width: number;
    height: number;
    classNames: string[];
  }): Promise<void> {
    this.setup = opts;
    logger.info("AI model configured", {
      module: "ai-engine-sim",
      model: opts.modelName,
      resolution: `${opts.width}x${opts.height}`,
    });
  }

  async run(frame: Buffer, meta: FrameMeta): Promise<void> {
    if (!this.setup) {
      logger.warn("AI model not configured", { module: "ai-engine-sim" });
      return;
    }

    const now = Date.now();
    this.frameCount++;
    this.lastFrameTime = now;

    if (this.finished) return;

    if (this.waiting) {
      if (now < this.waitUntil) return;
      this.waiting = false;
      logger.info("Wait complete, ready for next session", {
        module: "ai-engine-sim",
      });
    }

    // Iniciar sesión
    if (
      !this.inSession &&
      !this.waiting &&
      this.sessionCount < this.maxSessions
    ) {
      this.inSession = true;
      this.sessionCount++;
      this.sessionStartTime = now;
      logger.info("Starting AI session", {
        module: "ai-engine-sim",
        session: this.sessionCount,
      });

      // Emitir RELEVANT
      const detections: Detection[] = [
        { cls: "person", conf: 0.85, bbox: [100, 100, 50, 120] },
        { cls: "car", conf: 0.75, bbox: [200, 150, 80, 60] },
      ];

      this.bus.publish("ai.detection", {
        type: "ai.detection",
        relevant: true,
        score: 0.9,
        detections,
        meta,
      });

      metrics.inc("ai_detections_total");
    }

    // Durante sesión: emitir keepalive
    if (this.inSession) {
      const elapsed = now - this.sessionStartTime;

      if (elapsed < this.sessionDuration) {
        // Keepalive cada ~2 frames
        if (this.frameCount % 2 === 0) {
          const detections: Detection[] = [
            { cls: "person", conf: 0.82, bbox: [105, 102, 50, 120] },
          ];

          this.bus.publish("ai.keepalive", {
            type: "ai.keepalive",
            score: 0.85,
            detections,
            meta,
          });

          metrics.inc("ai_detections_total");
        }
      } else {
        // Terminar sesión
        this.inSession = false;
        logger.info("AI session ended", {
          module: "ai-engine-sim",
          session: this.sessionCount,
          duration: elapsed,
        });

        if (this.sessionCount < this.maxSessions) {
          this.waiting = true;
          this.waitUntil = now + 15000; // 15s entre sesiones para permitir cierre completo
          logger.info("Waiting before next session", {
            module: "ai-engine-sim",
            waitMs: 15000,
          });
        } else {
          this.finished = true;
          logger.info("All sessions complete", { module: "ai-engine-sim" });
        }
      }
    }
  }
}
