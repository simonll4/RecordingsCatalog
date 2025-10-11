/**
 * AI Feeder - Frame feeder with protocol support
 *
 * Subscribes to camera-hub (NV12/I420 producer) and implements:
 * - Handshake (Init/InitOk)
 * - Request.Frame construction with metadata, planes, and payload
 * - Flow control (sliding window)
 * - LATEST_WINS policy (drop pending frame when window full)
 * - Validation of data.size ≤ max_frame_bytes
 */

import Long from "long";
import { logger } from "../../shared/logging.js";
import { metrics } from "../../shared/metrics.js";
import type {
  NV12CaptureGst,
  NV12FrameMeta,
  OnNV12FrameFn,
} from "../video/adapters/gstreamer/nv12-capture-gst.js";
import pb from "../../proto/ai_pb_wrapper.js";
import { FrameCache } from "./cache/frame-cache.js";

export interface AIFeederConfig {
  model: string;
  width: number;
  height: number;
  maxInflight: number;
  /**
   * Frame queuing policy.
   * 
   * Only "LATEST_WINS" is supported.
   * When the sliding window is full, the newest frame replaces any pending frame.
   */
  policy: "LATEST_WINS";
  preferredFormat: "NV12" | "I420";
}

export interface FeederCallbacks {
  onReady?: () => void;
  onResult?: (result: pb.ai.IResult) => void;
  onError?: (error: Error) => void;
}

export class AIFeeder {
  private capture: NV12CaptureGst;
  private config?: AIFeederConfig;
  private callbacks: FeederCallbacks = {};
  
  // Protocol state
  private isInitialized = false;
  private maxFrameBytes = 0;
  private windowSize = 0;
  private inflight = 0;
  private frameIdCounter = 0n;
  private sessionId?: string;
  private streamId?: string; // Constant stream_id per connection
  
  // Degradation state
  private degradationAttempts = 0;
  private readonly maxDegradationAttempts = 3;
  private isDegrading = false;
  
  // Latest-wins pending frame
  private pendingFrame?: {
    data: Buffer;
    meta: NV12FrameMeta;
  };
  
  // Frame sending function (set by client)
  private sendFrameFn?: (envelope: pb.ai.IEnvelope) => void;
  
  // Frame cache for storing NV12 frames before sending to worker
  private frameCache: FrameCache;
  
  // RTT tracking: frameId -> sendTimestamp
  private sentFrames = new Map<string, number>();

  constructor(capture: NV12CaptureGst, frameCacheTtlMs?: number) {
    this.capture = capture;
    this.frameCache = new FrameCache(frameCacheTtlMs || 2000);
  }
  
  /**
   * Get frame cache (exposed for main.ts to retrieve frames)
   */
  getFrameCache(): FrameCache {
    return this.frameCache;
  }

  /**
   * Initialize feeder with config
   */
  init(config: AIFeederConfig): void {
    this.config = config;
    logger.info("AI Feeder initialized", {
      module: "ai-feeder",
      config,
    });
  }

  /**
   * Set frame sender function (provided by TCP client)
   */
  setSendFunction(fn: (envelope: pb.ai.IEnvelope) => void): void {
    this.sendFrameFn = fn;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: FeederCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Set session ID for frame correlation
   */
  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId || undefined;
  }

  /**
   * Set stream ID for this connection (constant per connection)
   */
  setStreamId(streamId: string): void {
    this.streamId = streamId;
    logger.debug("Stream ID set", {
      module: "ai-feeder",
      streamId,
    });
  }

  /**
   * Build Init message with capabilities
   */
  buildInitMessage(): pb.ai.IEnvelope {
    if (!this.config) {
      throw new Error("Config not set");
    }

    if (!this.streamId) {
      throw new Error("Stream ID not set - call setStreamId first");
    }
    
    return {
      protocolVersion: 1,
      streamId: this.streamId,
      msgType: pb.ai.MsgType.MT_INIT,
      req: {
        init: {
          model: this.config.model,
          caps: {
            acceptedPixelFormats: [
              pb.ai.PixelFormat.PF_NV12,
              pb.ai.PixelFormat.PF_I420,
            ],
            acceptedCodecs: [
              pb.ai.Codec.CODEC_NONE, // RAW
              pb.ai.Codec.CODEC_JPEG,
            ],
            maxWidth: this.config.width,
            maxHeight: this.config.height,
            maxInflight: this.config.maxInflight,
            supportsLetterbox: true,
            supportsNormalize: true,
            preferredLayout: "NCHW",
            preferredDtype: "FP32",
            // NV12/I420 requires 1.5 bytes per pixel (Y + UV/2)
            desiredMaxFrameBytes: Math.floor(this.config.width * this.config.height * 1.5),
          },
        },
      },
    };
  }

  /**
   * Handle InitOk response from worker
   */
  handleInitOk(initOk: pb.ai.IInitOk): void {
    if (!initOk.chosen) {
      logger.error("InitOk missing chosen config", { module: "ai-feeder" });
      return;
    }

    // Validate policy matches our configuration
    if (initOk.chosen.policy !== pb.ai.Policy.LATEST_WINS) {
      logger.warn("Worker chose unsupported policy, forcing LATEST_WINS", {
        module: "ai-feeder",
        workerPolicy: initOk.chosen.policy,
      });
    }

    // Validate resolution matches our configuration
    if (this.config) {
      const chosenWidth = initOk.chosen.width || 0;
      const chosenHeight = initOk.chosen.height || 0;
      
      if (chosenWidth !== this.config.width || chosenHeight !== this.config.height) {
        logger.error("Resolution mismatch between requested and chosen", {
          module: "ai-feeder",
          requested: { width: this.config.width, height: this.config.height },
          chosen: { width: chosenWidth, height: chosenHeight },
          warning: "Worker may not process frames correctly",
        });
        
        // TODO: Re-configure capture pipeline to match chosen resolution
        // This would require:
        // 1. Stop current capture
        // 2. Update config with chosen width/height
        // 3. Restart capture with new resolution
        // For now: log error and proceed (frames may be rejected)
      }
    }

    this.isInitialized = true;
    this.maxFrameBytes = initOk.maxFrameBytes || 0;
    this.windowSize = initOk.chosen.initialCredits || 4;
    this.inflight = 0;

    logger.info("Received InitOk", {
      module: "ai-feeder",
      chosen: initOk.chosen,
      maxFrameBytes: this.maxFrameBytes,
      windowSize: this.windowSize,
    });

    metrics.gauge("ai_window_size", this.windowSize);

    this.callbacks.onReady?.();
  }

  /**
   * Handle WindowUpdate from worker
   */
  handleWindowUpdate(update: pb.ai.IWindowUpdate): void {
    this.windowSize = update.newWindowSize || this.windowSize;
    
    logger.debug("Window updated", {
      module: "ai-feeder",
      newWindowSize: this.windowSize,
    });

    metrics.gauge("ai_window_size", this.windowSize);
    metrics.inc("window_size_set_events_total");

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
    if (this.inflight > 0) {
      this.inflight--;
      metrics.gauge("ai_inflight", this.inflight);
    }

    logger.debug("Received Result", {
      module: "ai-feeder",
      frameId: result.frameId?.toString(),
      inflight: this.inflight,
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
    if (error.code === pb.ai.ErrorCode.FRAME_TOO_LARGE || 
        error.code === pb.ai.ErrorCode.UNSUPPORTED_FORMAT) {
      
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
    if (!this.config || this.isDegrading) return;

    // Check degradation limits
    if (this.degradationAttempts >= this.maxDegradationAttempts) {
      logger.error("Max degradation attempts reached, stopping", {
        module: "ai-feeder",
        attempts: this.degradationAttempts,
      });
      return;
    }

    this.isDegrading = true;
    this.degradationAttempts++;

    logger.info("Degradation strategy initiated", {
      module: "ai-feeder",
      attempt: this.degradationAttempts,
      errorCode,
      currentConfig: {
        format: this.config.preferredFormat,
        width: this.config.width,
        height: this.config.height,
      },
    });

    try {
      // Strategy: Switch to JPEG if FRAME_TOO_LARGE or UNSUPPORTED_FORMAT
      if (errorCode === pb.ai.ErrorCode.FRAME_TOO_LARGE || 
          errorCode === pb.ai.ErrorCode.UNSUPPORTED_FORMAT) {
        
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
      }

      if (errorCode === pb.ai.ErrorCode.FRAME_TOO_LARGE) {
        metrics.inc("ai_degrade_frame_too_large_total");
      }
      
      if (errorCode === pb.ai.ErrorCode.UNSUPPORTED_FORMAT) {
        metrics.inc("ai_degrade_unsupported_format_total");
      }

    } catch (err) {
      logger.error("Degradation failed", {
        module: "ai-feeder",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Reset degrading flag after delay to allow retry
    setTimeout(() => {
      this.isDegrading = false;
      logger.debug("Degradation cooldown complete", { module: "ai-feeder" });
    }, 5000); // 5s cooldown
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
        inflight: this.inflight,
        windowSize: this.windowSize,
      });
    }
  }

  private canSend(): boolean {
    return this.inflight < this.windowSize;
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
          tsUtcNs: Long.fromString((BigInt(Date.now()) * 1_000_000n).toString()),
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
    this.inflight++;
    
    // Track send time for RTT calculation
    this.sentFrames.set(frameId.toString(), Date.now());
    
    metrics.inc("ai_frames_sent_total");
    metrics.gauge("ai_inflight", this.inflight);

    logger.debug("Frame sent", {
      module: "ai-feeder",
      frameId: frameId.toString(),
      inflight: this.inflight,
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
