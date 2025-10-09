/**
 * AI Engine TCP - Motor de IA remoto vía TCP + Protobuf
 *
 * Implementación del motor de IA que se comunica con un worker Python vía TCP.
 * Actúa como adaptador entre el orquestador y el cliente TCP, aplicando filtrado
 * de relevancia y publicando eventos al bus.
 *
 * Responsabilidades principales:
 * - Implementa `AIEngine` (métodos `setModel` y `run`)
 * - Delega la inferencia al worker vía `AIClient` (TCP + Protobuf + backpressure)
 * - Traduce respuestas del worker en eventos del bus: `ai.detection`/`ai.keepalive`
 * - Aplica filtrado de relevancia en Node (umbral/clases) antes de publicar
 *
 * Flujo resumido:
 *   1) main.ts llama `setModel` → enviamos `Init` al worker
 *   2) Al llamar `run(frame, meta)` y si hay crédito, mandamos `Frame`
 *   3) El worker responde `Ready`/`Result` → convertimos a detecciones y emitimos al bus
 *   4) Si no hay actividad reciente, emitimos `ai.keepalive` periódicamente
 */

import { Bus } from "../../../core/bus/bus.js";
import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import { FrameMeta, Detection } from "../../../types/detections.js";
import type { AIEngine } from "../ports/ai-engine.js";
import type { AIClient, Result } from "../ports/ai-client.js";
import {
  filterDetections,
  calculateScore,
  isRelevant,
  type FilterConfig,
} from "../filters/detection-filter.js";

export class AIEngineTcp implements AIEngine {
  /** Bus de eventos del sistema (publica ai.* para el orquestador). */
  private bus: Bus;

  /** Cliente TCP (Protobuf) que se comunica con el worker Python. */
  private client: AIClient;

  /** Última configuración enviada/aprobada por el worker. */
  private setup?: {
    modelName: string;
    umbral: number;
    width: number;
    height: number;
  };

  /** Contador monotónico local para correlacionar resultados. */
  private frameSeq = 0;

  /** Configuración de filtrado de detecciones. */
  private filterConfig: FilterConfig = {
    umbral: 0,
    classesFilter: new Set(),
  };

  // Métricas
  /** Marca temporal (ms) de la última detección relevante. */
  private lastDetectionTime = 0;
  /** Intervalo entre keepalives cuando no hay actividad. */
  private keepaliveInterval = 2000; // 2s
  private keepaliveTimer?: NodeJS.Timeout;
  /** Promesa para esperar la conexión inicial antes de `init`. */
  private connectPromise: Promise<void>;

  /** Crea el motor de IA TCP con el bus y la configuración del worker. */
  constructor(bus: Bus, client: AIClient) {
    this.bus = bus;
    this.client = client;

    // Iniciar conexión (se completa en background)
    this.connectPromise = this.client.connect();

    // Resultado de inferencia desde el worker
    this.client.onResult((result) => {
      void this.handleResult(result);
    });

    this.client.onError((err) => {
      logger.error("AI Client error", {
        module: "ai-engine-tcp",
        error: err.message,
      });
    });

    this.startKeepalive();
  }

  async setModel(opts: {
    modelName: string;
    umbral: number;
    width: number;
    height: number;
    classesFilter?: string[];
  }): Promise<void> {
    this.setup = opts;

    // Configurar filtro de clases (si se especifica)
    if (opts.classesFilter && opts.classesFilter.length > 0) {
      this.filterConfig.classesFilter = new Set(opts.classesFilter);
      logger.info("AI classes filter configured", {
        module: "ai-engine-tcp",
        filter: Array.from(this.filterConfig.classesFilter),
      });
    } else {
      this.filterConfig.classesFilter = new Set(); // Sin filtro = todas las clases
    }

    // Configurar umbral
    this.filterConfig.umbral = opts.umbral;

    // Esperar conexión inicial si aún no completó
    await this.connectPromise;

    // Inicializar worker con modelo
    await this.client.init({
      modelPath: opts.modelName, // Path al modelo ONNX
      width: opts.width,
      height: opts.height,
      conf: opts.umbral,
      classes: [], // Sin filtro en worker, filtramos en Node
    });

    logger.info("AI model configured", {
      module: "ai-engine-tcp",
      model: opts.modelName,
      resolution: `${opts.width}x${opts.height}`,
      umbral: opts.umbral,
    });
  }

  /**
   * Envía un frame al worker si hay crédito disponible.
   * Incluye un timestamp pseudo-monotónico (`tsMonoNs`) para trazabilidad.
   */
  async run(frame: Buffer, meta: FrameMeta): Promise<void> {
    if (!this.setup) {
      logger.warn("AI model not configured", { module: "ai-engine-tcp" });
      return;
    }

    // Verificar backpressure
    if (!this.client.canSend()) {
      logger.debug("Cannot send frame, no credit", {
        module: "ai-engine-tcp",
        seq: this.frameSeq,
      });
      return;
    }

    // Timestamp pseudo-monotónico (ns) derivado de Date.now().
    // El protocolo espera uint64 (protobuf Long). Solo para trazabilidad.
    const tsMonoNs = BigInt(Date.now()) * BigInt(1_000_000);

    this.frameSeq++;

    this.client.sendFrame(
      this.frameSeq,
      meta.ts,
      tsMonoNs,
      meta.width,
      meta.height,
      frame
    );

    logger.debug("Frame sent to AI worker", {
      module: "ai-engine-tcp",
      seq: this.frameSeq,
      size: frame.length,
    });
  }

  /** Procesa un resultado del worker: aplica filtrado y emite eventos al bus. */
  private async handleResult(result: Result): Promise<void> {
    if (!this.setup) return;

    logger.debug("Received AI result (raw)", {
      module: "ai-engine-tcp",
      seq: result.seq,
      detectionsRaw: result.detections.length,
      detections: result.detections.map((d) => ({
        cls: d.cls,
        conf: d.conf.toFixed(3),
      })),
      filterConfig: {
        umbral: this.filterConfig.umbral,
        classes: Array.from(this.filterConfig.classesFilter),
      },
    });

    // Aplicar filtrado puro (umbral + clases)
    const filtered = filterDetections(result, this.filterConfig);

    logger.debug("After filtering", {
      module: "ai-engine-tcp",
      seq: result.seq,
      detectionsFiltered: filtered.length,
      filtered: filtered.map((d) => ({
        cls: d.cls,
        conf: d.conf.toFixed(3),
      })),
    });

    if (isRelevant(filtered)) {
      // Detección relevante → publicar al bus
      this.lastDetectionTime = Date.now();

      const dets: Detection[] = filtered.map((d) => ({
        cls: d.cls,
        conf: d.conf,
        bbox: d.bbox,
        trackId: d.trackId,
      }));

      // Calcular score global usando función pura
      const score = calculateScore(filtered);

      this.bus.emit("ai.detection", {
        type: "ai.detection",
        relevant: true,
        score,
        detections: dets,
        meta: {
          ts: result.tsIso,
          seqNo: result.seq,
        },
      });

      metrics.inc("ai_detections_relevant_total", filtered.length);

      logger.debug("AI detection (relevant)", {
        module: "ai-engine-tcp",
        seq: result.seq,
        detections: filtered.length,
        classes: filtered.map((d) => d.cls),
      });
    } else {
      // Sin detecciones relevantes → publicar con relevant=false
      this.bus.emit("ai.detection", {
        type: "ai.detection",
        relevant: false,
        score: 0,
        detections: [],
        meta: {
          ts: result.tsIso,
          seqNo: result.seq,
        },
      });

      logger.debug("AI detection (not relevant)", {
        module: "ai-engine-tcp",
        seq: result.seq,
      });
    }
  }

  /**
   * Emite `ai.keepalive` periódicamente si no hubo detecciones recientes.
   * El orquestador usa estos eventos para mantener/actualizar timers.
   */
  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastDetectionTime;

      // Si no hay detecciones recientes, emitir keepalive
      if (elapsed > this.keepaliveInterval) {
        this.bus.emit("ai.keepalive", {
          type: "ai.keepalive",
          score: 0,
          detections: [],
          meta: {
            ts: new Date().toISOString(),
            seqNo: 0,
          },
        });

        logger.debug("AI keepalive", {
          module: "ai-engine-tcp",
          elapsedSinceLastDetection: elapsed,
        });
      }
    }, this.keepaliveInterval);
  }

  /** Detiene timers y cierra el cliente TCP de forma ordenada. */
  async shutdown(): Promise<void> {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }

    await this.client.shutdown();

    logger.info("AI Engine TCP shutdown", { module: "ai-engine-tcp" });
  }
}
