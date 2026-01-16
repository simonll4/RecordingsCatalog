/**
 * AI Client TCP - Binary Protocol v1 Implementation
 *
 * This module implements the canonical Protocol v1 for communication
 * with the AI worker process over TCP.
 *
 * Protocol Overview:
 * ==================
 *
 * Transport: TCP with length-prefixed framing
 * Encoding: Protocol Buffers (protobuf)
 * Framing: Each message prefixed with uint32LE length header
 *
 * Message Flow:
 * =============
 *
 * 1. Connection Phase
 *    - TCP connect to worker
 *    - Generate unique stream_id
 *    - Start heartbeat timer
 *
 * 2. Handshake Phase
 *    - Edge → Worker: Init (capabilities, model, dimensions)
 *    - Worker → Edge: InitOk (limits, window size, max frame bytes)
 *    - Transition to READY state
 *
 * 3. Operation Phase (READY state)
 *    - Edge → Worker: Request.Frame (image data, metadata)
 *    - Worker → Edge: Result (detections, tracking IDs)
 *    - Bidirectional: Heartbeat (keepalive mechanism)
 *
 * 4. Shutdown Phase
 *    - Graceful: Close socket, clear timers
 *    - Ungraceful: Auto-reconnect with exponential backoff
 *
 * State Machine:
 * ==============
 *
 * DISCONNECTED → CONNECTING → CONNECTED → READY → SHUTDOWN
 *      ↑                                    ↓
 *      └────────── (reconnect) ────────────┘
 *
 * Features:
 * =========
 *
 * Connection Management
 *   - Automatic reconnection with exponential backoff
 *   - Max delay: 30 seconds between reconnect attempts
 *   - Connection state tracking (DISCONNECTED → READY)
 *
 * Flow Control
 *   - Sliding window protocol (managed by AIFeeder)
 *   - Backpressure handling via window limits
 *   - Frame validation before transmission
 *
 * Heartbeat Mechanism
 *   - Periodic keepalive messages (2s interval)
 *   - Timeout detection (10s without response)
 *   - Automatic reconnection on timeout
 *
 * Error Handling
 *   - Protocol version validation
 *   - Length prefix validation
 *   - Malformed message detection
 *   - TCP error recovery
 *
 * Message Framing:
 * ================
 *
 * Each message is sent as:
 * [4 bytes: uint32LE length] [N bytes: protobuf payload]
 *
 * This allows receiver to know exact message boundaries in the TCP stream.
 *
 * Integration:
 * ============
 *
 * - AIFeeder: Provides frames, receives results
 * - Orchestrator: Controls connection lifecycle
 * - Metrics: Tracks reconnections, message counts, errors
 *
 * Thread Safety:
 * ==============
 *
 * This class is single-threaded (Node.js event loop).
 * All socket operations happen on the same thread.
 * No external synchronization needed.
 */

import net from "node:net";
import Long from "long";
import pb from "../../../proto/ai_pb_wrapper.js";
import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import type { AIFeeder } from "../feeder/index.js";
import { encodeFrame, decodeFrame } from "./framing.js";

type ClientState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "READY"
  | "SHUTDOWN";

export class AIClientTcp {
  private host: string;
  private port: number;
  private socket?: net.Socket;
  private state: ClientState = "DISCONNECTED";
  private feeder?: AIFeeder;
  private streamId?: string; // Constant stream_id per connection
  private initOkTimer?: NodeJS.Timeout;
  private readonly initOkTimeoutMs = 5000;

  // Reconnection
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private readonly maxReconnectDelay = 30000; // 30s

  // Buffer
  private rxBuffer: Buffer = Buffer.alloc(0);

  // Heartbeat
  private heartbeatTimer?: NodeJS.Timeout;
  private lastHeartbeat = 0;
  private readonly heartbeatInterval = 2000; // 2s
  private readonly heartbeatTimeout = 10000; // 10s

  // Message counters
  private txCount = 0n;
  private rxCount = 0n;
  private lastFrameId = 0n;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  setFeeder(feeder: AIFeeder): void {
    this.feeder = feeder;
    feeder.setSendFunction((envelope) => {
      this.sendMessage(envelope);
    });
  }

  async connect(): Promise<void> {
    if (this.state !== "DISCONNECTED") {
      logger.warn("Already connected or connecting", {
        module: "ai-client-tcp",
        state: this.state,
      });
      return;
    }

    this.state = "CONNECTING";

    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;

      socket.setNoDelay(true);
      socket.setKeepAlive(true, 1000);

      socket.on("connect", () => {
        logger.info("Connected to AI worker", {
          module: "ai-client-tcp",
          host: this.host,
          port: this.port,
        });

        this.state = "CONNECTED";
        this.reconnectAttempts = 0;
        this.streamId = `edge-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;
        this.startHeartbeat();
        metrics.inc("ai_reconnects_total");

        if (this.feeder) {
          this.feeder.setStreamId(this.streamId);
          const initMsg = this.feeder.buildInitMessage();
          logger.info("[DEBUG] Sending Init message to worker", {
            module: "ai-client-tcp",
            streamId: this.streamId,
            model: (initMsg.req?.init as any)?.model,
          });
          this.sendMessage(initMsg);
          logger.info("[DEBUG] Init message sent", {
            module: "ai-client-tcp",
          });
          this.startInitOkWatchdog();
        }

        resolve();
      });

      socket.on("data", (chunk) => {
        this.lastHeartbeat = Date.now();
        this.handleData(chunk);
      });

      socket.on("error", (err) => {
        logger.error("Socket error", {
          module: "ai-client-tcp",
          error: err.message,
        });
        reject(err);
      });

      socket.on("close", () => {
        logger.warn("Socket closed", {
          module: "ai-client-tcp",
          state: this.state,
        });
        this.handleDisconnect();
      });

      socket.connect(this.port, this.host);
    });
  }

  async shutdown(): Promise<void> {
    if (this.state === "SHUTDOWN") return;
    this.state = "SHUTDOWN";
    this.stopHeartbeat();
    this.clearInitOkWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.socket) {
      this.sendEnd();
      await new Promise((res) => setTimeout(res, 100));
      this.socket.destroy();
      this.socket = undefined;
    }
    logger.info("AI client shutdown", { module: "ai-client-tcp" });
  }

  sendEnd(): void {
    if (!this.streamId) {
      logger.warn("Cannot send End: streamId not set", {
        module: "ai-client-tcp",
      });
      return;
    }

    const request = pb.ai.Request.create({
      end: pb.ai.End.create({}),
    });

    const endMsg = pb.ai.Envelope.create({
      protocolVersion: 1,
      streamId: this.streamId,
      msgType: pb.ai.MsgType.MT_END,
      req: request,
    });

    this.sendMessage(endMsg);
    logger.info("End message sent to worker", {
      module: "ai-client-tcp",
      streamId: this.streamId,
    });
  }

  private sendMessage(envelope: pb.ai.IEnvelope): void {
    if (!this.socket) {
      logger.warn("Cannot send message, socket is null", {
        module: "ai-client-tcp",
      });
      return;
    }

    // Allow sending in both CONNECTED and READY states
    // CONNECTED: Initial connection established
    // READY: After receiving InitOk from worker
    const isEndMessage = envelope.msgType === pb.ai.MsgType.MT_END;
    const canSendInShutdown = this.state === "SHUTDOWN" && isEndMessage;

    if (
      this.state !== "CONNECTED" &&
      this.state !== "READY" &&
      !canSendInShutdown
    ) {
      logger.warn("Cannot send message, invalid state", {
        module: "ai-client-tcp",
        state: this.state,
      });
      return;
    }

    try {
      const encodeStart = Date.now();
      const [header, payload] = encodeFrame(envelope);
      const encodeEnd = Date.now();

      // Track encoding time
      const encodeMs = encodeEnd - encodeStart;
      if (encodeMs > 0) {
        metrics.gauge("ai_encode_ms", encodeMs);
      }

      this.socket.write(header);
      this.socket.write(payload);

      this.txCount++;

      // Track lastFrameId for heartbeat
      if (envelope.req?.frame) {
        const fid = envelope.req.frame.frameId || 0;
        this.lastFrameId =
          typeof fid === "number" ? BigInt(fid) : BigInt(fid.toString());
      }
    } catch (err) {
      logger.error("Failed to send message", {
        module: "ai-client-tcp",
        error: (err as Error).message,
      });
    }
  }

  private handleData(chunk: Buffer): void {
    this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);

    // Extraer todos los mensajes disponibles
    while (this.rxBuffer.length >= 4) {
      try {
        const result = decodeFrame(this.rxBuffer);

        if (result.envelope === null) {
          // No hay mensaje completo, esperar más datos
          break;
        }

        // Procesar mensaje
        this.rxCount++;
        this.handleMessage(result.envelope);

        // Actualizar buffer con lo que queda
        this.rxBuffer = result.remaining as Buffer;
      } catch (err) {
        // Error fatal en framing (invalid length, decode error)
        logger.error("Framing error", {
          module: "ai-client-tcp",
          error: err instanceof Error ? err.message : String(err),
        });
        this.handleDisconnect();
        return;
      }
    }
  }

  private handleMessage(envelope: pb.ai.IEnvelope): void {
    if (envelope.protocolVersion !== 1) {
      logger.error("Unsupported protocol version - closing connection", {
        module: "ai-client-tcp",
        version: envelope.protocolVersion,
      });
      this.handleDisconnect();
      return;
    }
    if (
      envelope.res &&
      envelope.msgType !== this.getExpectedMsgType(envelope.res)
    ) {
      logger.error("msg_type mismatch - closing connection", {
        module: "ai-client-tcp",
        msgType: envelope.msgType,
        actual: this.getExpectedMsgType(envelope.res),
      });
      this.handleDisconnect();
      return;
    }
    if (envelope.res) {
      this.handleResponse(envelope.res);
    } else if (envelope.hb) {
      this.handleHeartbeat(envelope.hb);
    }
  }

  private getExpectedMsgType(res: pb.ai.IResponse): pb.ai.MsgType {
    if (res.initOk) return pb.ai.MsgType.MT_INIT_OK;
    if (res.windowUpdate) return pb.ai.MsgType.MT_WINDOW_UPDATE;
    if (res.result) return pb.ai.MsgType.MT_RESULT;
    if (res.error) return pb.ai.MsgType.MT_ERROR;
    return pb.ai.MsgType.MT_UNKNOWN;
  }

  private handleResponse(res: pb.ai.IResponse): void {
    if (res.initOk) {
      this.handleInitOk(res.initOk);
    } else if (res.windowUpdate) {
      this.handleWindowUpdate(res.windowUpdate);
    } else if (res.result) {
      this.handleResult(res.result);
    } else if (res.error) {
      this.handleError(res.error);
    }
  }

  private handleInitOk(initOk: pb.ai.IInitOk): void {
    logger.info("[DEBUG] Received InitOk from worker", {
      module: "ai-client-tcp",
      chosen: initOk.chosen,
      maxFrameBytes: initOk.maxFrameBytes,
    });
    this.clearInitOkWatchdog();
    this.state = "READY";
    metrics.inc("ai_init_ok_total");
    if (this.feeder) {
      logger.info("[DEBUG] Calling feeder.handleInitOk", {
        module: "ai-client-tcp",
      });
      this.feeder.handleInitOk(initOk);
    }
  }

  private handleWindowUpdate(update: pb.ai.IWindowUpdate): void {
    logger.debug("Received WindowUpdate", {
      module: "ai-client-tcp",
      newWindowSize: update.newWindowSize,
    });
    if (this.feeder) this.feeder.handleWindowUpdate(update);
  }

  private handleResult(result: pb.ai.IResult): void {
    logger.debug("Received Result", {
      module: "ai-client-tcp",
      frameId: result.frameId?.toString(),
    });
    metrics.inc("ai_results_total");

    // Track latencies
    if (result.lat) {
      if (result.lat.totalMs)
        metrics.gauge("ai_total_latency_ms", result.lat.totalMs);
      if (result.lat.inferMs)
        metrics.gauge("ai_infer_latency_ms", result.lat.inferMs);
      if (result.lat.preMs)
        metrics.gauge("ai_pre_latency_ms", result.lat.preMs);
      if (result.lat.postMs)
        metrics.gauge("ai_post_latency_ms", result.lat.postMs);
    }

    if (this.feeder) this.feeder.handleResult(result);
  }

  private handleError(error: pb.ai.IError): void {
    logger.error("Received Error from worker", {
      module: "ai-client-tcp",
      code: error.code,
      message: error.message,
    });
    if (this.feeder) this.feeder.handleError(error);
  }

  private handleHeartbeat(hb: pb.ai.IHeartbeat): void {
    logger.debug("Received Heartbeat", {
      module: "ai-client-tcp",
      lastFrameId: hb.lastFrameId?.toString(),
    });
  }

  private handleDisconnect(): void {
    const wasShutdown = this.state === "SHUTDOWN";
    
    logger.warn("Disconnecting from AI worker", {
      module: "ai-client-tcp",
      state: this.state,
      wasShutdown,
    });
    
    this.state = "DISCONNECTED";
    this.stopHeartbeat();
  this.clearInitOkWatchdog();
    this.streamId = undefined;
    
    // Reset feeder state on disconnect
    // This ensures feeder will reinitialize on reconnection
    if (this.feeder) {
      logger.info("Resetting feeder state due to disconnect", {
        module: "ai-client-tcp",
      });
      this.feeder.handleDisconnect();
    }
    
    if (this.socket) {
      this.socket.destroy();
      this.socket = undefined;
    }
    if (!wasShutdown) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delays = [500, 2000, 5000, 10000, 30000];
    const delay = delays[Math.min(this.reconnectAttempts, delays.length - 1)];
    logger.info("Scheduling reconnect", {
      module: "ai-client-tcp",
      attempt: this.reconnectAttempts + 1,
      delayMs: delay,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts++;
      void this.connect().catch((err) => {
        logger.error("Reconnect failed", {
          module: "ai-client-tcp",
          error: err.message,
        });
      });
    }, delay);
  }

  private startInitOkWatchdog(): void {
    this.clearInitOkWatchdog();
    this.initOkTimer = setTimeout(() => {
      this.initOkTimer = undefined;
      if (this.state === "READY" || this.state === "SHUTDOWN") {
        return;
      }

      logger.warn("InitOk timeout reached, forcing reconnect", {
        module: "ai-client-tcp",
        timeoutMs: this.initOkTimeoutMs,
        state: this.state,
      });
      metrics.inc("ai_init_ok_timeout_total");
      this.handleDisconnect();
    }, this.initOkTimeoutMs);
  }

  private clearInitOkWatchdog(): void {
    if (this.initOkTimer) {
      clearTimeout(this.initOkTimer);
      this.initOkTimer = undefined;
    }
  }

  private startHeartbeat(): void {
    this.lastHeartbeat = Date.now();
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeat;
      if (elapsed > this.heartbeatTimeout) {
        logger.warn("Heartbeat timeout, reconnecting", {
          module: "ai-client-tcp",
          elapsedMs: elapsed,
        });
        this.handleDisconnect();
        return;
      }

      // Only send heartbeat if stream_id is set (connection established)
      if (!this.streamId) {
        logger.debug("Skipping heartbeat, stream_id not set", {
          module: "ai-client-tcp",
        });
        return;
      }

      const hbMsg: pb.ai.IEnvelope = {
        protocolVersion: 1,
        streamId: this.streamId,
        msgType: pb.ai.MsgType.MT_HEARTBEAT,
        hb: {
          lastFrameId: this.lastFrameId
            ? Long.fromString(this.lastFrameId.toString())
            : Long.fromString("0"),
          tx: Long.fromString(this.txCount.toString()),
          rx: Long.fromString(this.rxCount.toString()),
        },
      };
      this.sendMessage(hbMsg);
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}
