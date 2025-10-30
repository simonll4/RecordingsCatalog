/**
 * AI Feeder - Frame Coordinator with Flow Control & Protocol Support
 *
 * The AI Feeder is the bridge between video capture and AI worker.
 * It manages frame submission with backpressure control and protocol handling.
 *
 * Core Responsibilities:
 * =====================
 *
 * 1. Protocol Handshake
 *    - Builds Init message with capabilities (model, size, format)
 *    - Processes InitOk response with worker limits (max_frame_bytes, window)
 *    - Delegates to handshake.ts for protocol-specific logic
 *
 * 2. Frame Submission
 *    - Subscribes to NV12Capture for incoming frames
 *    - Constructs Request.Frame protobuf messages
 *    - Validates frame size against worker limits
 *    - Sends frames via TCP client connection
 *
 * 3. Flow Control (Sliding Window)
 *    - Tracks in-flight frames (max_inflight limit from config)
 *    - LATEST_WINS policy: drops pending frame when window is full
 *    - Manages window via WindowManager (window.ts)
 *    - Prevents overwhelming worker with too many frames
 *
 * 4. Frame Caching
 *    - Stores NV12 frames in memory cache with TTL
 *    - Enables frame retrieval for ingestion after detections arrive
 *    - Cache is shared with SessionManager via getFrameCache()
 *
 * 5. Result Processing
 *    - Receives Result messages from worker
 *    - Calls onResult callback with detection data
 *    - Tracks RTT (round-trip time) for performance monitoring
 *    - Updates sliding window state
 *
 * Flow Control Policy - LATEST_WINS:
 * ===================================
 *
 * When sliding window is full (maxInflight frames in-flight):
 * - New frame replaces any pending frame
 * - Ensures worker always gets latest data
 * - Prevents stale frames from queuing up
 * - Preferred for real-time detection (vs FIFO queue)
 *
 * Frame ID Generation:
 * ====================
 *
 * - Monotonic counter (BigInt) per connection
 * - Unique across worker lifetime
 * - Used for frame correlation (cache lookup, RTT tracking)
 *
 * Session Correlation:
 * ====================
 *
 * - sessionId is set by orchestrator when session opens
 * - Attached to every frame sent to worker
 * - Enables worker to group frames by recording session
 * - Reset to null when session closes
 *
 * Integration Points:
 * ===================
 *
 * - NV12Capture: Subscribes to onFrame event
 * - AIClientTcp: Provides send function, receives results
 * - SessionManager: Shares frame cache for ingestion
 * - Orchestrator: Sets sessionId for correlation
 *
 * Lifecycle:
 * ==========
 *
 * 1. init() - Configure with model parameters
 * 2. TCP client calls setSendFunction()
 * 3. TCP client calls setStreamId()
 * 4. Handshake: buildInitMessage() → send Init
 * 5. Worker responds: handleInitOk() → protocol ready
 * 6. start() - Begin frame capture subscription
 * 7. Frames flow: capture → validate → send → receive result
 * 8. stop() - Unsubscribe from capture
 */

import Long from "long";
import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import type {
  NV12CaptureGst,
  NV12FrameMeta,
  OnNV12FrameFn,
} from "../../video/adapters/gstreamer/nv12-capture-gst.js";
import pb from "../../../proto/ai_pb_wrapper.js";
import { FrameCache } from "../cache/frame-cache.js";
import { DegradationManager } from "./degradation.js";
import { buildInitMessage, handleInitOk } from "./handshake.js";
import { WindowManager } from "./window.js";
import { convertNV12ToJpeg } from "../../../media/convert.js";

/**
 * AI Feeder Configuration
 *
 * Defines model parameters and flow control settings.
 */
export interface AIFeederConfig {
  model: string; // Model name (e.g., "yolov8n", "yolov8s")
  width: number; // Frame width for inference (e.g., 640)
  height: number; // Frame height for inference (e.g., 480)
  maxInflight: number; // Max frames in-flight (sliding window size)
  classesFilter?: string[]; // Clases COCO a filtrar (opcional)
  confidenceThreshold?: number; // Detection confidence threshold (optional)

  /**
   * Frame Queuing Policy
   *
   * LATEST_WINS: When window is full, newest frame replaces pending frame.
   * This ensures worker always processes most recent data (real-time priority).
   *
   * Alternative (not implemented): FIFO would queue frames and process in order,
   * but could lead to stale detections during high load.
   */
  policy: "LATEST_WINS";

  /**
   * Preferred Pixel Format
   *
   * NV12: Semi-planar YUV (Y plane + interleaved UV plane)
   *   - Native format for many hardware decoders
   *   - More efficient for memory layout
   *
   * I420: Planar YUV (Y plane + U plane + V plane)
   *   - More common in software pipelines
   *   - Better compatibility with older systems
   */
  preferredFormat: "NV12" | "I420";
}

/**
 * Feeder Event Callbacks
 *
 * These callbacks are invoked by the feeder at key lifecycle points.
 */
export interface FeederCallbacks {
  /**
   * Called when handshake completes successfully (Init/InitOk exchange).
   * Signals that feeder is ready to start processing frames.
   */
  onReady?: () => void;

  /**
   * Called when AI worker returns a Result message.
   * Contains detection data for the processed frame.
   */
  onResult?: (result: pb.ai.IResult) => void;

  /**
   * Called on protocol errors, connection issues, or validation failures.
   */
  onError?: (error: Error) => void;
}

export class AIFeeder {
  // Video capture source (provides NV12 frames)
  private capture: NV12CaptureGst;

  // Feeder configuration (set via init())
  private config?: AIFeederConfig;

  // Event callbacks (set via setCallbacks())
  private callbacks: FeederCallbacks = {};

  // === Protocol State ===

  // Handshake completed flag
  private isInitialized = false;

  // Worker capability: maximum frame size in bytes
  // Received in InitOk message, enforced on every frame
  private maxFrameBytes = 0;

  // Worker chosen codec (CODEC_NONE for RAW, CODEC_JPEG for JPEG transport)
  // Received in InitOk, determines if we need to encode frames before sending
  private chosenCodec: pb.ai.Codec = pb.ai.Codec.CODEC_NONE;

  // Monotonic frame ID counter (unique per connection)
  private frameIdCounter = 0n;

  // Current recording session ID (set by orchestrator)
  // Null when no session is active
  private sessionId?: string;

  // Stream ID for this TCP connection (constant per connection)
  // Format: "edge-{timestamp}-{random}"
  private streamId?: string;

  // === Flow Control ===

  // Sliding window manager (tracks in-flight frames)
  private windowManager = new WindowManager();

  // Degradation manager (monitors and reports performance issues)
  private degradationManager = new DegradationManager();

  // Pending frame for LATEST_WINS policy
  // When window is full, new frame replaces this
  private pendingFrame?: {
    data: Buffer;
    meta: NV12FrameMeta;
  };

  // === Communication ===

  // Function to send protobuf messages to worker
  // Set by TCP client via setSendFunction()
  private sendFrameFn?: (envelope: pb.ai.IEnvelope) => void;

  // === Frame Cache & Tracking ===

  // Frame cache (for ingestion)
  private frameCache: FrameCache;

  // In-flight frames (for RTT tracking)
  private sentFrames = new Map<string, number>();

  // DEBUG: Frame counters
  private framesReceivedCount = 0;
  private framesSentCount = 0;
  private lastFrameLog = Date.now();
  private resultsReceivedCount = 0;

  // Liveness flag
  private _isStarted = false;

  // Offset para convertir timestamp monotónico (process.hrtime) a UTC
  private utcOffsetNs: bigint | null = null;

  constructor(capture: NV12CaptureGst, frameCacheTtlMs?: number) {
    this.capture = capture;
    this.frameCache = new FrameCache(frameCacheTtlMs || 2000);
  }

  /**
   * Get Frame Cache
   *
   * Exposes the internal frame cache to external modules.
   * Used by SessionManager to retrieve frames for ingestion.
   *
   * @returns Shared FrameCache instance
   */
  getFrameCache(): FrameCache {
    return this.frameCache;
  }

  /**
   * Initialize Feeder with Configuration
   *
   * Must be called before starting frame capture.
   * Sets model parameters and flow control policy.
   *
   * @param config - Feeder configuration object
   */
  init(config: AIFeederConfig): void {
    this.config = config;
    logger.info("AI Feeder initialized", {
      module: "ai-feeder",
      config,
    });
  }

  /**
   * Set Frame Send Function
   *
   * Provided by TCP client to enable frame transmission.
   * Called internally when frames need to be sent to worker.
   *
   * @param fn - Function that sends protobuf envelope to worker
   */
  setSendFunction(fn: (envelope: pb.ai.IEnvelope) => void): void {
    this.sendFrameFn = fn;
  }

  /**
   * Set Event Callbacks
   *
   * Register handlers for feeder lifecycle events.
   *
   * @param callbacks - Object with optional callback functions
   */
  setCallbacks(callbacks: FeederCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Set Session ID for Frame Correlation
   *
   * Called by orchestrator when session opens/closes.
   * Attached to every frame sent to worker.
   *
   * @param sessionId - Recording session UUID (null to clear)
   */
  setSessionId(sessionId: string | null): void {
    const normalized = sessionId?.trim();
    this.sessionId = normalized || undefined;

    if (!this.sessionId) {
      // Limpiar frame pendiente para evitar enviar frames sin sesión
      this.pendingFrame = undefined;
    }
  }

  /**
   * Set Stream ID for Connection
   *
   * Called by TCP client after connection is established.
   * Remains constant for the lifetime of this TCP connection.
   *
   * @param streamId - Unique stream identifier (e.g., "edge-1234567890-abc")
   */
  setStreamId(streamId: string): void {
    this.streamId = streamId;
    logger.debug("Stream ID set", {
      module: "ai-feeder",
      streamId,
    });
  }

  /**
   * Build Init Message
   *
   * Constructs protocol Init message with capabilities.
   * Sent as first message during handshake.
   *
   * @param preferJpeg - If true, prioritize JPEG codec (for degradation)
   * @returns Protobuf Envelope containing Init message
   * @throws Error if config or streamId not set
   */
  buildInitMessage(preferJpeg = false): pb.ai.IEnvelope {
    if (!this.config) {
      throw new Error("Config not set");
    }

    if (!this.streamId) {
      throw new Error("Stream ID not set - call setStreamId first");
    }

    return buildInitMessage(this.config, this.streamId, preferJpeg);
  }

  /**
   * Handle InitOk response from worker
   */
  handleInitOk(initOk: pb.ai.IInitOk): void {
    logger.info("[DEBUG] handleInitOk called", {
      module: "ai-feeder",
      hasConfig: !!this.config,
    });

    if (!this.config) {
      logger.error("Config not set", { module: "ai-feeder" });
      return;
    }

    const result = handleInitOk(initOk, this.config);

    logger.info("[DEBUG] handleInitOk result", {
      module: "ai-feeder",
      isInitialized: result.isInitialized,
      maxFrameBytes: result.maxFrameBytes,
      windowSize: result.windowSize,
    });

    this.isInitialized = result.isInitialized;
    this.maxFrameBytes = result.maxFrameBytes;
    this.chosenCodec = result.chosenCodec;
    this.windowManager.initialize(result.windowSize);

    logger.info("[DEBUG] Feeder initialized", {
      module: "ai-feeder",
      isInitialized: this.isInitialized,
      maxFrameBytes: this.maxFrameBytes,
    });

    this.callbacks.onReady?.();
  }

  /**
   * Handle WindowUpdate from worker
   */
  handleWindowUpdate(update: pb.ai.IWindowUpdate): void {
    this.windowManager.handleWindowUpdate(update);

    // Try to send pending frame if any
    this.tryFlushPending();
  }

  /**
   * Handle Result from worker
   */
  handleResult(result: pb.ai.IResult): void {
    this.resultsReceivedCount++;

    // DEBUG: Log cada 25 resultados
    const detCount = result.detections?.items?.length || 0;
    if (this.resultsReceivedCount % 25 === 0 || detCount > 0) {
      logger.info("[DEBUG] Result recibido del worker", {
        module: "ai-feeder",
        resultsReceived: this.resultsReceivedCount,
        frameId: result.frameId?.toString(),
        detections: detCount,
        hasDetections: detCount > 0,
      });
    }

    // Calculate RTT if we tracked this frame
    const frameIdStr = result.frameId?.toString();
    if (frameIdStr) {
      const sentTime = this.sentFrames.get(frameIdStr);
      if (sentTime) {
        const rttMs = Date.now() - sentTime;
        metrics.gauge("ai_rtt_ms", rttMs);
        this.sentFrames.delete(frameIdStr);
      }
    }

    // Release one credit
    this.windowManager.onResultReceived();

    logger.debug("Received Result", {
      module: "ai-feeder",
      frameId: result.frameId?.toString(),
      windowState: this.windowManager.getState(),
    });

    this.callbacks.onResult?.(result);

    // Try to send pending frame
    this.tryFlushPending();
  }

  /**
   * Handle Error from worker
   */
  handleError(error: pb.ai.IError): void {
    logger.error("Received Error from worker", {
      module: "ai-feeder",
      code: error.code,
      message: error.message,
    });

    // Handle specific error codes for degradation
    if (
      error.code === pb.ai.ErrorCode.FRAME_TOO_LARGE ||
      error.code === pb.ai.ErrorCode.UNSUPPORTED_FORMAT
    ) {
      metrics.inc("ai_degrade_codec_events_total");

      logger.warn("Frame error detected, attempting degradation", {
        module: "ai-feeder",
        errorCode: error.code,
        currentFormat: this.config?.preferredFormat,
      });

      // Attempt degradation strategy
      this.attemptDegradation(error.code);
    }

    this.callbacks.onError?.(
      new Error(`Worker error ${error.code}: ${error.message}`)
    );
  }

  /**
   * Attempt codec/format degradation
   * Strategy: Switch to JPEG encoding if supported
   */
  private async attemptDegradation(errorCode: pb.ai.ErrorCode): Promise<void> {
    if (!this.config) return;

    // Check if degradation is applicable
    if (!this.degradationManager.shouldDegrade(errorCode)) {
      return;
    }

    // Start degradation attempt (checks limits and cooldown)
    if (!this.degradationManager.startAttempt()) {
      return;
    }

    logger.info("Degradation strategy initiated", {
      module: "ai-feeder",
      attempt: this.degradationManager.getAttempts(),
      errorCode,
      currentConfig: {
        format: this.config.preferredFormat,
        width: this.config.width,
        height: this.config.height,
      },
    });

    try {
      logger.info("Attempting degradation to JPEG codec", {
        module: "ai-feeder",
        currentFormat: this.config.preferredFormat,
      });

      // NOTE: We do NOT stop capture here (always-on design)
      // Capture continues running while we renegotiate protocol
      // This prevents frame loss during degradation
      // Worker will handle any interim frames with Error responses

      // Rebuild Init with JPEG as preferred codec (worker will choose JPEG)
      const degradedInit = this.buildInitMessage(true); // preferJpeg=true

      // Send degraded Init via TCP client
      if (this.sendFrameFn) {
        this.sendFrameFn(degradedInit);
        logger.info("Degraded Init sent, waiting for InitOk", {
          module: "ai-feeder",
        });

        // InitOk will be handled by handleInitOk (updates maxFrameBytes/windowSize)
        // Capture continues running, no need to restart

        metrics.inc("ai_degrade_jpeg_switch_total");
      } else {
        logger.error("Cannot send degraded Init: sendFrameFn not set", {
          module: "ai-feeder",
        });
      }

      // Record metrics
      this.degradationManager.recordMetrics(errorCode);
    } catch (err) {
      logger.error("Degradation failed", {
        module: "ai-feeder",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Finish attempt (starts cooldown)
    this.degradationManager.finishAttempt();
  }

  /**
   * Start capturing frames (idempotent)
   *
   * Safe to call multiple times - subsequent calls are no-ops.
   * Prevents duplicate frame subscriptions.
   */
  async start(): Promise<void> {
    // Idempotencia: si ya está iniciado, no hacer nada
    if (this._isStarted) {
      logger.debug("AI Feeder already started", { module: "ai-feeder" });
      return;
    }

    const onFrame: OnNV12FrameFn = (data, meta) => {
      this.handleFrame(data, meta);
    };

    await this.capture.start(onFrame);
    this._isStarted = true;

    logger.info("AI Feeder started", { module: "ai-feeder" });
  }

  /**
   * Stop capturing
   */
  async stop(): Promise<void> {
    await this.capture.stop();
    this._isStarted = false;
    this.pendingFrame = undefined;
    logger.info("AI Feeder stopped", { module: "ai-feeder" });
  }

  /**
   * Destroy and Release Resources
   *
   * Cleans up frame cache and releases memory.
   * Call during application shutdown after stop().
   *
   * @example
   * ```typescript
   * await aiFeeder.stop();
   * aiFeeder.destroy();
   * ```
   */
  destroy(): void {
    this.frameCache.destroy();
    logger.info("AI Feeder destroyed", { module: "ai-feeder" });
  }

  /**
   * Change capture mode (idle/active)
   */
  setMode(mode: "idle" | "active"): void {
    this.capture.setMode(mode);
  }

  // ==================== PRIVATE ====================

  private handleFrame(data: Buffer, meta: NV12FrameMeta): void {
    this.framesReceivedCount++;

    // DEBUG: Log EVERY frame reception for debugging
    logger.info("[FRAME_IN] Frame received from capture", {
      module: "ai-feeder",
      frameNum: this.framesReceivedCount,
      frameSize: data.length,
      initialized: this.isInitialized,
      hasConfig: !!this.config,
      hasSendFn: !!this.sendFrameFn,
      streamId: this.streamId,
      maxFrameBytes: this.maxFrameBytes,
    });

    if (!this.isInitialized || !this.config) {
      logger.error("[FRAME_DROP] Not initialized, dropping frame", {
        module: "ai-feeder",
        frameNum: this.framesReceivedCount,
        initialized: this.isInitialized,
        hasConfig: !!this.config,
      });
      return;
    }

    // Validate frame size
    if (data.length > this.maxFrameBytes) {
      logger.error("[FRAME_DROP] Frame exceeds max size, attempting degradation", {
        module: "ai-feeder",
        frameNum: this.framesReceivedCount,
        size: data.length,
        max: this.maxFrameBytes,
      });
      metrics.inc("frame_bytes_max_hit_total");
      
      // Attempt degradation to reduce frame size (switch to JPEG)
      void this.attemptDegradation(pb.ai.ErrorCode.FRAME_TOO_LARGE);
      return;
    }

    // Check if we can send immediately
    if (this.canSend()) {
      logger.info("[FRAME_SEND] Sending frame to worker", {
        module: "ai-feeder",
        frameNum: this.framesReceivedCount,
        windowState: this.windowManager.getState(),
      });
      void this.sendFrame(data, meta); // async, fire-and-forget
    } else {
      // Apply LATEST_WINS backpressure policy
      // Replace pending frame (drop old one, keep newest)
      this.pendingFrame = { data, meta };
      metrics.inc("ai_drops_latestwins_total");

      logger.warn("[FRAME_PENDING] Frame queued (latest-wins)", {
        module: "ai-feeder",
        frameNum: this.framesReceivedCount,
        windowState: this.windowManager.getState(),
      });
    }
  }

  private canSend(): boolean {
    return this.windowManager.hasCredits();
  }

  private async sendFrame(data: Buffer, meta: NV12FrameMeta): Promise<void> {
    if (!this.config || !this.sendFrameFn) {
      return;
    }

    if (!this.streamId) {
      logger.error("Cannot send frame: stream_id not set", {
        module: "ai-feeder",
      });
      return;
    }

    const sessionId = this.sessionId?.trim() ?? "";

    const frameId = this.frameIdCounter++;

    // Map pixel format
    const pixelFormat =
      meta.format === "NV12"
        ? pb.ai.PixelFormat.PF_NV12
        : pb.ai.PixelFormat.PF_I420;

    const expectedFrameBytes = Math.trunc(
      this.config.width * this.config.height * 1.5
    );

    if (data.length !== expectedFrameBytes) {
      logger.error("Frame size mismatch detected, attempting degradation", {
        module: "ai-feeder",
        expected: expectedFrameBytes,
        actual: data.length,
        width: this.config.width,
        height: this.config.height,
        format: meta.format,
      });
      metrics.inc("ai_frame_size_mismatch_total");
      
      // Attempt degradation (may indicate stride/width mismatch or format issue)
      void this.attemptDegradation(pb.ai.ErrorCode.FRAME_TOO_LARGE);
      return;
    }

    // Determine if we need to encode to JPEG based on worker's choice
    let finalData: Buffer;
    let finalCodec: pb.ai.Codec;
    let finalPlanes: pb.ai.IPlane[];

    if (this.chosenCodec === pb.ai.Codec.CODEC_JPEG) {
      // Worker wants JPEG transport - encode NV12→JPEG
      try {
        finalData = await convertNV12ToJpeg(data, meta, { jpegQuality: 85 });
        finalCodec = pb.ai.Codec.CODEC_JPEG;
        finalPlanes = []; // No planes for JPEG (compressed format)

        logger.debug("Frame encoded to JPEG for transport", {
          module: "ai-feeder",
          originalSize: data.length,
          jpegSize: finalData.length,
          compression: ((1 - finalData.length / data.length) * 100).toFixed(1) + "%",
        });
      } catch (error) {
        logger.error("Failed to encode frame to JPEG", {
          module: "ai-feeder",
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall back to RAW if JPEG encoding fails
        finalData = data;
        finalCodec = pb.ai.Codec.CODEC_NONE;
        finalPlanes = meta.planes.map((p) =>
          pb.ai.Plane.create({
            stride: p.stride,
            offset: p.offset,
            size: p.size,
          })
        );
      }
    } else {
      // Worker wants RAW (CODEC_NONE) - send NV12 directly with plane metadata
      finalData = data;
      finalCodec = pb.ai.Codec.CODEC_NONE;
      finalPlanes = meta.planes.map((p) =>
        pb.ai.Plane.create({
          stride: p.stride,
          offset: p.offset,
          size: p.size,
        })
      );

      // Validate: sum(planes.size) == data.length (only for RAW)
      const totalPlaneSize = finalPlanes.reduce((sum, p) => sum + (p.size || 0), 0);
      if (totalPlaneSize !== data.length) {
        logger.error("Plane size mismatch, attempting degradation", {
          module: "ai-feeder",
          totalPlaneSize,
          dataLength: data.length,
        });
        
        // Attempt degradation (plane metadata incorrect)
        void this.attemptDegradation(pb.ai.ErrorCode.FRAME_TOO_LARGE);
        return;
      }
    }

    // Cache frame BEFORE sending to worker (for later retrieval)
    // Always cache original NV12, not JPEG
    if (this.utcOffsetNs === null) {
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      this.utcOffsetNs = nowNs - BigInt(meta.tsMonoNs);
    }
    const tsUtcNsBig = BigInt(meta.tsMonoNs) + (this.utcOffsetNs ?? 0n);
    const captureIso = new Date(Number(tsUtcNsBig / 1_000_000n)).toISOString();

    this.frameCache.set({
      seqNo: frameId.toString(),
      data,
      meta,
      captureTs: captureIso,
    });

    const envelope: pb.ai.IEnvelope = {
      protocolVersion: 1,
      streamId: this.streamId,
      msgType: pb.ai.MsgType.MT_FRAME,
      req: {
        frame: {
          frameId: Long.fromString(frameId.toString()),
          tsMonoNs: Long.fromString(meta.tsMonoNs.toString()),
          tsPdtNs: Long.fromString(meta.tsMonoNs.toString()),
          tsUtcNs: Long.fromString(tsUtcNsBig.toString()),
          width: meta.width,
          height: meta.height,
          pixelFormat,
          codec: finalCodec,  // CODEC_NONE or CODEC_JPEG
          planes: finalPlanes,
          data: finalData,
          colorSpace: "BT.709",
          colorRange: "full",
          sessionId,
        },
      },
    };

    this.sendFrameFn(envelope);
    this.windowManager.onFrameSent();

    // DEBUG: Log frame sent
    this.framesSentCount++;
    if (this.framesSentCount % 25 === 0) {
      logger.info("[DEBUG] Frames sent to worker", {
        module: "ai-feeder",
        framesSent: this.framesSentCount,
        frameId: frameId.toString(),
        sessionId: sessionId || "none",
        frameSize: data.length,
      });
    }

    // Track send time for RTT calculation
    this.sentFrames.set(frameId.toString(), Date.now());

    metrics.inc("ai_frames_sent_total");

    logger.debug("Frame sent", {
      module: "ai-feeder",
      frameId: frameId.toString(),
      windowState: this.windowManager.getState(),
      size: data.length,
    });
  }

  private tryFlushPending(): void {
    if (this.pendingFrame && this.canSend()) {
      const { data, meta } = this.pendingFrame;
      this.pendingFrame = undefined;
      void this.sendFrame(data, meta); // async, fire-and-forget
    }
  }
}
