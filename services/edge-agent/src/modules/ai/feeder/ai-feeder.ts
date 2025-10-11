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

  // === Frame Cache ===

  // In-memory cache for NV12 frames
  // TTL-based eviction (default 2000ms)
  // Shared with SessionManager for frame ingestion
  private frameCache: FrameCache;

  // === Performance Tracking ===

  // RTT (Round-Trip Time) tracking per frame
  // Map: frameId → send timestamp
  // Used to calculate processing latency
  private sentFrames = new Map<string, number>();

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
    this.sessionId = sessionId || undefined;
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
   * @returns Protobuf Envelope containing Init message
   * @throws Error if config or streamId not set
   */
  buildInitMessage(): pb.ai.IEnvelope {
    if (!this.config) {
      throw new Error("Config not set");
    }

    if (!this.streamId) {
      throw new Error("Stream ID not set - call setStreamId first");
    }

    return buildInitMessage(this.config, this.streamId);
  }

  /**
   * Handle InitOk response from worker
   */
  handleInitOk(initOk: pb.ai.IInitOk): void {
    if (!this.config) {
      logger.error("Config not set", { module: "ai-feeder" });
      return;
    }

    const result = handleInitOk(initOk, this.config);

    this.isInitialized = result.isInitialized;
    this.maxFrameBytes = result.maxFrameBytes;
    this.windowManager.initialize(result.windowSize);

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

      // Stop current capture
      await this.capture.stop();

      // Rebuild Init with JPEG as preferred codec (acceptedCodecs includes JPEG in buildInitMessage)
      const degradedInit = this.buildInitMessage();

      // Send degraded Init via TCP client
      if (this.sendFrameFn) {
        this.sendFrameFn(degradedInit);
        logger.info("Degraded Init sent, waiting for InitOk", {
          module: "ai-feeder",
        });

        // InitOk will be handled by handleInitOk (updates maxFrameBytes/windowSize)
        // Then restart capture via onReady callback

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
   * Start capturing frames
   */
  async start(): Promise<void> {
    const onFrame: OnNV12FrameFn = (data, meta) => {
      this.handleFrame(data, meta);
    };

    await this.capture.start(onFrame);

    logger.info("AI Feeder started", { module: "ai-feeder" });
  }

  /**
   * Stop capturing
   */
  async stop(): Promise<void> {
    await this.capture.stop();
    this.pendingFrame = undefined;
    logger.info("AI Feeder stopped", { module: "ai-feeder" });
  }

  /**
   * Change capture mode (idle/active)
   */
  setMode(mode: "idle" | "active"): void {
    this.capture.setMode(mode);
  }

  // ==================== PRIVATE ====================

  private handleFrame(data: Buffer, meta: NV12FrameMeta): void {
    if (!this.isInitialized || !this.config) {
      logger.debug("Not initialized, dropping frame", { module: "ai-feeder" });
      return;
    }

    // Validate frame size
    if (data.length > this.maxFrameBytes) {
      logger.error("Frame exceeds max size", {
        module: "ai-feeder",
        size: data.length,
        max: this.maxFrameBytes,
      });
      metrics.inc("frame_bytes_max_hit_total");
      return;
    }

    // Check if we can send immediately
    if (this.canSend()) {
      this.sendFrame(data, meta);
    } else {
      // Apply LATEST_WINS backpressure policy
      // Replace pending frame (drop old one, keep newest)
      this.pendingFrame = { data, meta };
      metrics.inc("ai_drops_latestwins_total");

      logger.debug("Frame queued (latest-wins)", {
        module: "ai-feeder",
        windowState: this.windowManager.getState(),
      });
    }
  }

  private canSend(): boolean {
    return this.windowManager.hasCredits();
  }

  private sendFrame(data: Buffer, meta: NV12FrameMeta): void {
    if (!this.config || !this.sendFrameFn) {
      return;
    }

    if (!this.streamId) {
      logger.error("Cannot send frame: stream_id not set", {
        module: "ai-feeder",
      });
      return;
    }

    const frameId = this.frameIdCounter++;

    // Map pixel format
    const pixelFormat =
      meta.format === "NV12"
        ? pb.ai.PixelFormat.PF_NV12
        : pb.ai.PixelFormat.PF_I420;

    // Build planes
    const planes = meta.planes.map((p) =>
      pb.ai.Plane.create({
        stride: p.stride,
        offset: p.offset,
        size: p.size,
      })
    );

    // Validate: sum(planes.size) == data.length
    const totalPlaneSize = planes.reduce((sum, p) => sum + p.size, 0);
    if (totalPlaneSize !== data.length) {
      logger.error("Plane size mismatch", {
        module: "ai-feeder",
        totalPlaneSize,
        dataLength: data.length,
      });
      return;
    }

    // Cache frame BEFORE sending to worker (for later retrieval)
    this.frameCache.set({
      seqNo: frameId.toString(),
      data,
      meta,
      captureTs: new Date().toISOString(),
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
          tsUtcNs: Long.fromString(
            (BigInt(Date.now()) * 1_000_000n).toString()
          ),
          width: meta.width,
          height: meta.height,
          pixelFormat,
          codec: pb.ai.Codec.CODEC_NONE, // RAW
          planes,
          data,
          colorSpace: "BT.709",
          colorRange: "full",
          sessionId: this.sessionId || "",
        },
      },
    };

    this.sendFrameFn(envelope);
    this.windowManager.onFrameSent();

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
      this.sendFrame(data, meta);
    }
  }
}
