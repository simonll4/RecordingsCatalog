/**
 * AI Client - Cliente TCP con Protobuf + Backpressure (Ventana 1 + Latest-Wins)
 *
 * Qué es: Un cliente binario sobre TCP que envía/recibe mensajes Protobuf
 * con framing length‑prefixed (uint32LE). Implementa control de flujo de
 * ventana 1 (crédito) y política latest‑wins para evitar backlog.
 *
 * Responsabilidades:
 * - Conexión TCP al worker de IA con reconexión automática y heartbeat.
 * - Framing length‑prefixed (uint32LE) y serialización con protobufjs.
 * - Backpressure (Ready/Result → concede crédito) + latest‑wins.
 * - Re‑init automático al reconectar con los últimos `InitArgs`.
 *
 * Estados del cliente:
 * - DISCONNECTED: Sin conexión
 * - CONNECTING: Intentando conectar
 * - CONNECTED: Socket abierto, esperando InitOk
 * - READY: Modelo inicializado, listo para frames
 * - SHUTDOWN: Cerrando conexión
 *
 * Protocolo (alto nivel):
 * - Envelope { req | res | hb }
 * - Request: { init | frame | shutdown }
 * - Response: { initOk | ready | result | error }
 * - Heartbeat: { tsMonoNs }
 */

import net from "node:net";
import { EventEmitter } from "node:events";
import Long from "long";
import pb from "../proto/ai_pb_wrapper.js";
import { logger } from "../shared/logging.js";
import { metrics } from "../shared/metrics.js";

/** Parámetros de inicialización que se envían al worker. */
export type InitArgs = {
  modelPath: string;
  width: number;
  height: number;
  conf: number;
  classes?: number[];
};

/** Resultado de inferencia normalizado para consumidores en Node. */
export type Result = {
  seq: number;
  tsIso: string;
  tsMonoNs: bigint;
  detections: Array<{
    cls: string;
    conf: number;
    bbox: [number, number, number, number];
    trackId?: string;
  }>;
};

type ClientState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "READY"
  | "SHUTDOWN";

/** API que expone el cliente TCP para el motor de IA. */
export interface AIClient {
  /** Abre el socket TCP y deja el cliente listo para `init`. */
  connect(): Promise<void>;
  /** Envía configuración del modelo. Válido en CONNECTED o READY. */
  init(args: InitArgs): Promise<void>;
  /** Indica si hay crédito para enviar un frame (ventana 1). */
  canSend(): boolean;
  /**
   * Encola/envía un frame RGB (pixFmt=RGB). Si no hay crédito,
   * aplica latest‑wins y reemplaza el frame pendiente.
   */
  sendFrame(
    seq: number,
    tsIso: string,
    tsMonoNs: bigint,
    w: number,
    h: number,
    rgb: Buffer
  ): void;
  /** Suscribe callback para resultados de inferencia. */
  onResult(cb: (r: Result) => void): void;
  /** Suscribe callback para errores provenientes del worker/cliente. */
  onError(cb: (err: Error) => void): void;
  /** Cierra la conexión notificando `shutdown` al worker. */
  shutdown(): Promise<void>;
}

export class AIClientTcp implements AIClient {
  /** Dirección del worker TCP. */
  private host: string;
  /** Puerto del worker TCP. */
  private port: number;
  private socket?: net.Socket;
  private state: ClientState = "DISCONNECTED";

  // Backpressure (ventana 1)
  /** Crédito disponible (true cuando el worker envía Ready/Result). */
  private hasCredit = false;
  /** Secuencia actualmente en vuelo (sin confirmar). */
  private inflightSeq?: number;

  // Latest-wins
  /** Frame pendiente (se reemplaza si llega uno nuevo sin crédito). */
  private pendingFrame?: {
    seq: number;
    tsIso: string;
    tsMonoNs: bigint;
    w: number;
    h: number;
    rgb: Buffer;
  };

  // Callbacks
  private resultCb?: (r: Result) => void;
  private errorCb?: (err: Error) => void;

  // Init guardado para re-init
  /** Últimos `InitArgs` utilizados (para re‑enviar tras reconectar). */
  private lastInit?: InitArgs;

  // Reconexión
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private readonly maxReconnectDelay = 30000; // 30s

  // Buffer de recepción
  /** Acumulador de bytes recibidos para rearmar mensajes length‑prefixed. */
  private rxBuffer = Buffer.alloc(0);

  // Heartbeat
  private heartbeatTimer?: NodeJS.Timeout;
  private lastHeartbeat = 0;
  private readonly heartbeatTimeout = 10000; // 10s sin mensajes → reconectar

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  /**
   * Abre el socket, configura opciones (no‑delay/keepalive) y registra handlers.
   * Resuelve al conectarse; en caso de error inicial, rechaza.
   */
  async connect(): Promise<void> {
    if (this.state !== "DISCONNECTED") {
      logger.warn("Already connected or connecting", {
        module: "ai-client",
        state: this.state,
      });
      return;
    }

    this.state = "CONNECTING";
    this.hasCredit = false;
    this.inflightSeq = undefined;
    this.pendingFrame = undefined;

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;

      socket.setNoDelay(true);
      socket.setKeepAlive(true, 1000);

      socket.on("connect", () => {
        logger.info("Connected to AI worker", {
          module: "ai-client",
          host: this.host,
          port: this.port,
        });

        this.state = "CONNECTED";
        this.reconnectAttempts = 0;
        this.startHeartbeat();

        metrics.inc("ai_reconnects_total");

        // Auto re-init si teníamos config previa
        if (this.lastInit) {
          void this.init(this.lastInit);
        }

        resolve();
      });

      socket.on("data", (chunk) => {
        this.lastHeartbeat = Date.now();
        this.handleData(chunk);
      });

      socket.on("error", (err) => {
        logger.error("Socket error", {
          module: "ai-client",
          error: err.message,
        });
        if (this.errorCb) {
          this.errorCb(err);
        }
        reject(err);
      });

      socket.on("close", () => {
        logger.warn("Socket closed", {
          module: "ai-client",
          state: this.state,
          hadCredit: this.hasCredit,
        });
        this.handleDisconnect();
      });

      socket.connect(this.port, this.host);
    });
  }

  /** Envía el mensaje `Init` con la configuración del modelo. */
  async init(args: InitArgs): Promise<void> {
    if (this.state !== "CONNECTED" && this.state !== "READY") {
      throw new Error(`Cannot init in state ${this.state}`);
    }

    this.lastInit = args;

    const msg = pb.ai.Envelope.create({
      req: {
        init: {
          modelPath: args.modelPath,
          width: args.width,
          height: args.height,
          confThreshold: args.conf,
          classesFilter: args.classes || [],
        },
      },
    });

    this.sendMessage(msg);

    logger.info("Sent Init request", {
      module: "ai-client",
      model: args.modelPath,
      resolution: `${args.width}x${args.height}`,
    });
  }

  /** Retorna true si el cliente está READY y con crédito disponible. */
  canSend(): boolean {
    return this.state === "READY" && this.hasCredit && !this.inflightSeq;
  }

  /**
   * Encola o envía inmediatamente un frame.
   * Si no hay crédito o hay un frame en vuelo, se guarda en `pendingFrame`
   * (latest‑wins) y reemplaza cualquier pendiente anterior.
   */
  sendFrame(
    seq: number,
    tsIso: string,
    tsMonoNs: bigint,
    w: number,
    h: number,
    rgb: Buffer
  ): void {
    if (this.state !== "READY") {
      logger.debug("Cannot send frame, not ready", {
        module: "ai-client",
        state: this.state,
      });
      return;
    }

    // Latest-wins: si no hay crédito, reemplazar pending
    if (!this.hasCredit || this.inflightSeq !== undefined) {
      this.pendingFrame = { seq, tsIso, tsMonoNs, w, h, rgb };
      metrics.inc("ai_drops_latestwins_total");
      logger.debug("Frame queued (latest-wins)", { module: "ai-client", seq });
      return;
    }

    this.doSendFrame(seq, tsIso, tsMonoNs, w, h, rgb);
  }

  /** Serializa y envía un frame al worker (marca crédito en uso). */
  private doSendFrame(
    seq: number,
    tsIso: string,
    tsMonoNs: bigint,
    w: number,
    h: number,
    rgb: Buffer
  ): void {
    const msg = pb.ai.Envelope.create({
      req: {
        frame: {
          seq,
          tsIso,
          // Protobufjs usa Long para uint64; convertimos desde bigint
          tsMonoNs: Long.fromString(tsMonoNs.toString()),
          width: w,
          height: h,
          pixFmt: "RGB",
          data: rgb,
        },
      },
    });

    this.sendMessage(msg);
    this.hasCredit = false;
    this.inflightSeq = seq;

    metrics.inc("ai_frames_sent_total");
    metrics.gauge("ai_frame_inflight", 1);

    logger.debug("Frame sent", { module: "ai-client", seq });
  }

  /** Registra callback para resultados de inferencia. */
  onResult(cb: (r: Result) => void): void {
    this.resultCb = cb;
  }

  /** Registra callback para errores. */
  onError(cb: (err: Error) => void): void {
    this.errorCb = cb;
  }

  /** Envía `shutdown`, cierra el socket y limpia timers/reintentos. */
  async shutdown(): Promise<void> {
    if (this.state === "SHUTDOWN") return;

    this.state = "SHUTDOWN";
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.socket) {
      const msg = pb.ai.Envelope.create({
        req: { shutdown: {} },
      });
      this.sendMessage(msg);

      await new Promise((res) => setTimeout(res, 100));

      this.socket.destroy();
      this.socket = undefined;
    }

    logger.info("AI client shutdown", { module: "ai-client" });
  }

  // ========================================================================
  // Internos
  // ========================================================================

  /**
   * Serializa un `Envelope` y lo escribe con prefijo de longitud (uint32LE).
   * Un mensaje puede dividirse en dos writes: [len][payload].
   */
  private sendMessage(msg: pb.ai.IEnvelope): void {
    if (!this.socket || this.socket.destroyed) {
      logger.warn("Cannot send, socket not available", { module: "ai-client" });
      return;
    }

    const buf = pb.ai.Envelope.encode(msg).finish();
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32LE(buf.length, 0);

    this.socket.write(len);
    this.socket.write(buf);
  }

  /**
   * Acumula bytes recibidos, rearma mensajes length‑prefixed y los decodifica.
   * Puede procesar varios mensajes por tick si el buffer alcanza.
   */
  private handleData(chunk: Buffer): void {
    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);

    while (this.rxBuffer.length >= 4) {
      const len = this.rxBuffer.readUInt32LE(0);

      if (this.rxBuffer.length < 4 + len) {
        // Mensaje incompleto
        break;
      }

      const msgBuf = this.rxBuffer.subarray(4, 4 + len);
      this.rxBuffer = this.rxBuffer.subarray(4 + len);

      try {
        const envelope = pb.ai.Envelope.decode(msgBuf);
        this.handleMessage(envelope);
      } catch (err) {
        logger.error("Failed to decode message", {
          module: "ai-client",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /** Demultiplexa el `Envelope` entrante en res (responses) o hb (heartbeat). */
  private handleMessage(envelope: pb.ai.IEnvelope): void {
    if (envelope.res) {
      this.handleResponse(envelope.res);
    } else if (envelope.hb) {
      this.handleHeartbeat(envelope.hb);
    }
  }

  /** Rutea la respuesta a su handler específico (InitOk/Ready/Result/Error). */
  private handleResponse(res: pb.ai.IResponse): void {
    if (res.initOk) {
      this.handleInitOk(res.initOk);
    } else if (res.ready) {
      this.handleReady(res.ready);
    } else if (res.result) {
      this.handleResult(res.result);
    } else if (res.error) {
      this.handleError(res.error);
    }
  }

  /** Transición a READY tras recibir InitOk del worker. */
  private handleInitOk(initOk: pb.ai.IInitOk): void {
    logger.info("Received InitOk", {
      module: "ai-client",
      runtime: initOk.runtime,
      modelVersion: initOk.modelVersion,
      modelId: initOk.modelId,
      providers: initOk.providers,
      maxFrameBytes: initOk.maxFrameBytes,
    });

    this.state = "READY";
    metrics.inc("ai_init_ok_total");
  }

  /** Concede crédito (ventana 1) y limpia frame en vuelo si aplica. */
  private handleReady(ready: pb.ai.IReady): void {
    const seq = Number(ready.seq || 0);

    logger.debug("Received Ready", { module: "ai-client", seq });

    this.hasCredit = true;
    this.inflightSeq = undefined;
    metrics.gauge("ai_frame_inflight", 0);

    // Si hay frame pending, enviarlo ahora
    if (this.pendingFrame) {
      const { seq, tsIso, tsMonoNs, w, h, rgb } = this.pendingFrame;
      this.pendingFrame = undefined;
      this.doSendFrame(seq, tsIso, tsMonoNs, w, h, rgb);
    }
  }

  /** Traduce `Result` del worker a `Result` interno y concede crédito. */
  private handleResult(result: pb.ai.IResult): void {
    const seq = Number(result.seq || 0);
    const startTs = Date.now();

    const detections =
      result.detections?.map((d: any) => ({
        cls: d.cls || "",
        conf: d.conf || 0,
        bbox: [
          d.bbox?.x || 0,
          d.bbox?.y || 0,
          d.bbox?.w || 0,
          d.bbox?.h || 0,
        ] as [number, number, number, number],
        trackId: d.trackId || undefined,
      })) || [];

    // Convertir tsMonoNs (number | Long) a bigint de forma segura
    let tsMonoNsBig: bigint = BigInt(0);
    if (typeof result.tsMonoNs === "number") {
      tsMonoNsBig = BigInt(result.tsMonoNs);
    } else if (
      result.tsMonoNs &&
      typeof (result.tsMonoNs as Long).toString === "function"
    ) {
      tsMonoNsBig = BigInt((result.tsMonoNs as Long).toString());
    }

    const res: Result = {
      seq,
      tsIso: result.tsIso || "",
      tsMonoNs: tsMonoNsBig,
      detections,
    };

    logger.debug("Received Result", {
      module: "ai-client",
      seq,
      detections: detections.length,
    });

    metrics.inc("ai_detections_total", detections.length);

    if (this.resultCb) {
      this.resultCb(res);
    }

    // Dar crédito (Result implica Ready)
    this.hasCredit = true;
    this.inflightSeq = undefined;
    metrics.gauge("ai_frame_inflight", 0);

    const latency = Date.now() - startTs;
    metrics.observe("ai_result_latency_ms", latency);

    // Si hay frame pending, enviarlo ahora
    if (this.pendingFrame) {
      const { seq, tsIso, tsMonoNs, w, h, rgb } = this.pendingFrame;
      this.pendingFrame = undefined;
      this.doSendFrame(seq, tsIso, tsMonoNs, w, h, rgb);
    }
  }

  /** Propaga error del worker al callback del cliente. */
  private handleError(error: pb.ai.IError): void {
    logger.error("Received Error from worker", {
      module: "ai-client",
      code: error.code,
      message: error.message,
    });

    if (this.errorCb) {
      this.errorCb(
        new Error(`AI Worker Error ${error.code}: ${error.message}`)
      );
    }
  }

  /** Marca actividad del socket a partir de heartbeats recibidos. */
  private handleHeartbeat(hb: pb.ai.IHeartbeat): void {
    logger.debug("Received Heartbeat", {
      module: "ai-client",
      tsMonoNs: hb.tsMonoNs,
    });
  }

  /** Limpia estado y programa reconexión si no fue un `shutdown` explícito. */
  private handleDisconnect(): void {
    const wasShutdown = this.state === "SHUTDOWN";
    this.state = "DISCONNECTED";
    this.hasCredit = false;
    this.inflightSeq = undefined;
    this.pendingFrame = undefined;
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.destroy();
      this.socket = undefined;
    }

    if (!wasShutdown) {
      this.scheduleReconnect();
    }
  }

  /** Programa reconexión con backoff exponencial (0.5s → 30s). */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    // Backoff exponencial: 0.5s → 2s → 5s → 10s → 30s
    const delays = [500, 2000, 5000, 10000, 30000];
    const delay = delays[Math.min(this.reconnectAttempts, delays.length - 1)];

    logger.info("Scheduling reconnect", {
      module: "ai-client",
      attempt: this.reconnectAttempts + 1,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts++;
      void this.connect().catch((err) => {
        logger.error("Reconnect failed", {
          module: "ai-client",
          error: err.message,
        });
      });
    }, delay);
  }

  /**
   * Inicia watchdog de heartbeat. Si no llega tráfico por >10s,
   * se fuerza una desconexión para intentar reconectar.
   */
  private startHeartbeat(): void {
    this.lastHeartbeat = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeat;
      if (elapsed > this.heartbeatTimeout) {
        logger.warn("Heartbeat timeout, reconnecting", {
          module: "ai-client",
          elapsedMs: elapsed,
        });
        this.handleDisconnect();
      }
    }, 2000);
  }

  /** Detiene el watchdog de heartbeat. */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}
