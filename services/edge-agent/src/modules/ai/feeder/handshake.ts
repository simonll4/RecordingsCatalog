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
 *    - If mismatch: log warning and continue (worker adapts or triggers degradation)
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
 *   - Futuro: Reconfigurar NV12 capture dinámicamente (no implementado)
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
  classesFilter?: string[]; // Optional list of classes to filter
  confidenceThreshold?: number; // Optional detection confidence threshold
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
  chosenCodec: pb.ai.Codec; // Codec chosen by worker (CODEC_NONE for RAW, CODEC_JPEG for JPEG)
}

/**
 * Build Init Message with Edge Capabilities
 *
 * Constructs protobuf Init message advertising edge capabilities.
 * Worker will choose configuration from these options.
 *
 * @param config - Handshake configuration (model, resolution, etc.)
 * @param streamId - Unique stream identifier (e.g., UUID)
 * @param preferJpeg - If true, prioritize JPEG codec (for degradation scenarios)
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
  streamId: string,
  preferJpeg = false
): pb.ai.IEnvelope {
  const classesFilter = Array.isArray(config.classesFilter)
    ? config.classesFilter
        .map((cls) => cls.trim())
        .filter((cls) => cls.length > 0)
    : [];

  const initMessage: pb.ai.IInit = {
    model: config.model,
    caps: {
      acceptedPixelFormats: [
        pb.ai.PixelFormat.PF_NV12,
        pb.ai.PixelFormat.PF_I420,
      ],
      // Prefer JPEG during degradation (smaller frames)
      acceptedCodecs: preferJpeg
        ? [
            pb.ai.Codec.CODEC_JPEG, // Prefer JPEG
            pb.ai.Codec.CODEC_NONE, // RAW fallback
          ]
        : [
            pb.ai.Codec.CODEC_NONE, // Prefer RAW
            pb.ai.Codec.CODEC_JPEG, // JPEG fallback
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
  };

  if (classesFilter.length > 0) {
    initMessage.classesFilter = classesFilter;
  }

  if (typeof config.confidenceThreshold === "number") {
    initMessage.confidenceThreshold = config.confidenceThreshold;
  }

  return {
    protocolVersion: 1,
    streamId: streamId,
    msgType: pb.ai.MsgType.MT_INIT,
    req: {
      init: initMessage,
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
 *   - Resolution mismatch → logs error, continúa (posible reconfiguración futura)
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
    logger.warn("Resolution mismatch - worker chose different resolution", {
      module: "handshake",
      requested: { width: config.width, height: config.height },
      chosen: { width: chosenWidth, height: chosenHeight },
      impact: "Frames will be sent at configured resolution, worker will adapt",
    });

    // NOTA: Reconfiguración dinámica completa requeriría:
    // 1. Pasar referencia de nv12Capture a handleInitOk()
    // 2. Detener capture, actualizar config, reiniciar con nueva resolución
    // 3. Actualizar expectedFrameBytes en AIFeeder
    //
    // Por ahora, continuamos con resolución configurada.
    // Si worker no puede procesar, disparará Error y activará degradación.
    // Nota: Reconfiguración dinámica de pipeline no implementada.
  }

  const maxFrameBytes = initOk.maxFrameBytes || 0;
  const windowSize = initOk.chosen.initialCredits || 4;

  // Extract chosen codec
  const chosenCodec = initOk.chosen.codec || pb.ai.Codec.CODEC_NONE;

  logger.info("Handshake completed", {
    module: "handshake",
    chosen: initOk.chosen,
    maxFrameBytes,
    windowSize,
    codec: chosenCodec,
  });

  metrics.gauge("ai_window_size", windowSize);

  return {
    isInitialized: true,
    maxFrameBytes,
    windowSize,
    chosenCodec,
  };
}
