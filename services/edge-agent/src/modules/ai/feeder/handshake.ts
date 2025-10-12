/**
 * AI Feeder Handshake - Initial Protocol v1 Negotiation
 *
 * Responsible for:
 *   - Building Init message with capabilities
 *   - Validating InitOk response from worker
 *   - Verifying resolution, policy, and limits
 *
 * Purpose:
 * ========
 *
 * Capability Negotiation:
 *   - Edge advertises capabilities (formats, codecs, max resolution)
 *   - Worker chooses configuration from advertised options
 *   - Edge validates worker's choice and adapts if needed
 *
 * Handshake Flow (Protocol v1):
 * ==============================
 *
 * 1. Edge → Worker: Init message
 *    - Protocol version (1)
 *    - Stream ID (unique identifier)
 *    - Model name (e.g., "yolov8n")
 *    - Capabilities:
 *      * Accepted pixel formats (NV12, I420)
 *      * Accepted codecs (RAW, JPEG)
 *      * Max resolution (width × height)
 *      * Max inflight frames (concurrency limit)
 *      * Preprocessing support (letterbox, normalize)
 *
 * 2. Worker → Edge: InitOk response
 *    - Chosen configuration:
 *      * Pixel format (NV12 or I420)
 *      * Codec (CODEC_NONE for raw or CODEC_JPEG)
 *      * Resolution (width × height, usually matches request)
 *      * Policy (LATEST_WINS: drop old frames if queue full)
 *      * Initial credits (window size, e.g., 4)
 *    - Max frame bytes (size limit for frames)
 *
 * 3. Edge validates:
 *    - Policy is LATEST_WINS (only supported policy)
 *    - Resolution matches configuration
 *    - If mismatch: log error and continue (TODO: reconfigure capture)
 *
 * Capabilities Explained:
 * =======================
 *
 * Pixel Formats:
 *   - NV12: YUV 4:2:0 semi-planar (2 planes: Y + UV interleaved)
 *   - I420: YUV 4:2:0 planar (3 planes: Y, U, V separate)
 *   - Preference: NV12 (better GPU compatibility)
 *
 * Codecs:
 *   - CODEC_NONE: Raw pixels (no compression)
 *   - CODEC_JPEG: JPEG compressed (smaller, CPU overhead)
 *   - Preference: CODEC_NONE (lower latency, no decode overhead)
 *
 * Preprocessing:
 *   - Letterbox: Maintains aspect ratio, pads to target size
 *   - Normalize: Scales pixel values (0-255 → 0-1 or -1 to 1)
 *   - Layout: NCHW (batch, channels, height, width)
 *   - Dtype: FP32 (32-bit float for inference)
 *
 * Why Negotiation?
 * =================
 *
 * Flexibility:
 *   - Different AI models have different requirements
 *   - Worker can choose optimal format for model
 *   - Edge adapts to worker's choice
 *
 * Future-Proofing:
 *   - Can add new formats without breaking compatibility
 *   - Worker can request features if available
 *   - Graceful degradation if feature unavailable
 *
 * Error Handling:
 * ===============
 *
 * Resolution Mismatch:
 *   - Log error but continue (frames may be rejected later)
 *   - Future enhancement: Reconfigure NV12 capture pipeline
 *   - See docs/FUTURE_FEATURES.md for implementation plan
 *
 * Invalid Policy:
 *   - Force LATEST_WINS (only supported policy)
 *   - Log warning if worker chose different policy
 *
 * Missing Configuration:
 *   - Throw error if InitOk missing chosen config
 *   - Connection will fail and retry
 */

import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import pb from "../../../proto/ai_pb_wrapper.js";

/**
 * Handshake Configuration
 *
 * Parameters for building Init message.
 */
export interface HandshakeConfig {
  model: string; // Model name (e.g., "yolov8n")
  width: number; // Target frame width (e.g., 640)
  height: number; // Target frame height (e.g., 480)
  maxInflight: number; // Max concurrent frames (window size, e.g., 4)
  preferredFormat: "NV12" | "I420"; // Preferred pixel format
}

/**
 * Handshake Result
 *
 * Information returned after successful handshake.
 */
export interface HandshakeResult {
  isInitialized: boolean; // true if handshake succeeded
  maxFrameBytes: number; // Maximum frame size in bytes
  windowSize: number; // Initial window size (credits)
}

/**
 * Build Init Message with Edge Capabilities
 *
 * Constructs protobuf Init message advertising edge capabilities.
 * Worker will choose configuration from these options.
 *
 * @param config - Handshake configuration (model, resolution, etc.)
 * @param streamId - Unique stream identifier (e.g., UUID)
 * @returns Init message envelope
 *
 * @example
 * ```typescript
 * const init = buildInitMessage({
 *   model: "yolov8n",
 *   width: 640,
 *   height: 480,
 *   maxInflight: 4,
 *   preferredFormat: "NV12"
 * }, crypto.randomUUID());
 *
 * await tcpClient.writeEnvelope(init);
 * const response = await tcpClient.readEnvelope();
 * const result = handleInitOk(response.resp.initOk, config);
 * ```
 */
export function buildInitMessage(
  config: HandshakeConfig,
  streamId: string
): pb.ai.IEnvelope {
  return {
    protocolVersion: 1,
    streamId: streamId,
    msgType: pb.ai.MsgType.MT_INIT,
    req: {
      init: {
        model: config.model,
        caps: {
          acceptedPixelFormats: [
            pb.ai.PixelFormat.PF_NV12,
            pb.ai.PixelFormat.PF_I420,
          ],
          acceptedCodecs: [
            pb.ai.Codec.CODEC_NONE, // RAW
            pb.ai.Codec.CODEC_JPEG,
          ],
          maxWidth: config.width,
          maxHeight: config.height,
          maxInflight: config.maxInflight,
          supportsLetterbox: true,
          supportsNormalize: true,
          preferredLayout: "NCHW",
          preferredDtype: "FP32",
          // NV12/I420 requires 1.5 bytes per pixel (Y + UV/2)
          desiredMaxFrameBytes: Math.floor(config.width * config.height * 1.5),
        },
      },
    },
  };
}

/**
 * Validate and Process InitOk Response from Worker
 *
 * Validates worker's chosen configuration and extracts parameters.
 * Checks for resolution mismatch and policy compatibility.
 *
 * Error Cases:
 *   - Missing chosen config → throws Error
 *   - Wrong policy → logs warning, continues with LATEST_WINS
 *   - Resolution mismatch → logs error, continues (see docs/FUTURE_FEATURES.md)
 *
 * @param initOk - InitOk message from worker
 * @param config - Original handshake config (for validation)
 * @returns Handshake result with window size and frame limits
 * @throws Error if InitOk missing chosen configuration
 *
 * @example
 * ```typescript
 * try {
 *   const result = handleInitOk(initOkMsg, config);
 *   console.log(`Window size: ${result.windowSize}`);
 *   console.log(`Max frame bytes: ${result.maxFrameBytes}`);
 *   // Can now start sending frames
 * } catch (err) {
 *   console.error("Handshake failed:", err);
 *   // Retry connection
 * }
 * ```
 */
export function handleInitOk(
  initOk: pb.ai.IInitOk,
  config: HandshakeConfig
): HandshakeResult {
  if (!initOk.chosen) {
    logger.error("InitOk missing chosen config", { module: "handshake" });
    throw new Error("InitOk missing chosen config");
  }

  // Validate policy matches our configuration
  if (initOk.chosen.policy !== pb.ai.Policy.LATEST_WINS) {
    logger.warn("Worker chose unsupported policy, forcing LATEST_WINS", {
      module: "handshake",
      workerPolicy: initOk.chosen.policy,
    });
  }

  // Validate resolution matches our configuration
  const chosenWidth = initOk.chosen.width || 0;
  const chosenHeight = initOk.chosen.height || 0;

  if (chosenWidth !== config.width || chosenHeight !== config.height) {
    logger.error("Resolution mismatch between requested and chosen", {
      module: "handshake",
      requested: { width: config.width, height: config.height },
      chosen: { width: chosenWidth, height: chosenHeight },
      warning: "Worker may not process frames correctly. See docs/FUTURE_FEATURES.md for reconfiguration plan.",
    });

    // Future enhancement: Reconfigure capture pipeline to match chosen resolution
    // See docs/FUTURE_FEATURES.md for implementation plan
  }

  const maxFrameBytes = initOk.maxFrameBytes || 0;
  const windowSize = initOk.chosen.initialCredits || 4;

  logger.info("Handshake completed", {
    module: "handshake",
    chosen: initOk.chosen,
    maxFrameBytes,
    windowSize,
  });

  metrics.gauge("ai_window_size", windowSize);

  return {
    isInitialized: true,
    maxFrameBytes,
    windowSize,
  };
}
