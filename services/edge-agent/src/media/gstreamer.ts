/**
 * GStreamer - Unified Pipeline Builder
 *
 * Single source of truth for all GStreamer pipeline constructions in the Edge Agent.
 * This module builds command-line arguments for gst-launch-1.0 to create video pipelines.
 *
 * Purpose:
 * ========
 *
 * Edge Agent uses GStreamer for all video processing:
 * - Camera capture (CameraHub)
 * - Frame extraction for AI (NV12Capture)
 * - RTSP streaming (MediaMtxPublisher)
 *
 * This module centralizes pipeline construction to:
 * - Ensure consistency across all video paths
 * - Make pipelines testable and auditable
 * - Simplify GStreamer configuration
 *
 * Pipelines:
 * ==========
 *
 * 1. **Ingest Pipeline** (buildIngest)
 *    - Always-on camera capture
 *    - Source (RTSP/V4L2) → I420 @ configured resolution → Shared Memory
 *    - Used by: CameraHub
 *
 * 2. **NV12 Capture Pipeline** (buildNV12Capture)
 *    - AI frame extraction
 *    - Shared Memory → videorate → scale → NV12 @ AI resolution → stdout
 *    - Used by: NV12CaptureGst (AI feeder)
 *
 * 3. **RTSP Publish Pipeline** (buildPublish)
 *    - On-demand streaming
 *    - Shared Memory → H.264 encoder → RTSP to MediaMTX
 *    - Used by: MediaMtxOnDemandPublisherGst
 *
 * GStreamer Concepts:
 * ===================
 *
 * Elements:
 *   - rtspsrc: RTSP camera source
 *   - v4l2src: USB/built-in camera source (Video4Linux2)
 *   - shmsink/shmsrc: Shared memory communication (zero-copy IPC)
 *   - videoconvert: Format conversion (YUV, RGB, etc.)
 *   - videoscale: Resolution scaling
 *   - videorate: Framerate adjustment
 *   - h264parse: H.264 stream parsing
 *   - avdec_h264: FFmpeg H.264 decoder
 *   - x264enc/vaapih264enc: H.264 encoders
 *   - rtspclientsink: RTSP client (publishes to server)
 *   - fdsink: File descriptor output (writes to stdout/stderr)
 *
 * Caps (Capabilities):
 *   - video/x-raw: Raw video (uncompressed YUV/RGB)
 *   - image/jpeg: JPEG compressed frames
 *   - video/x-h264: H.264 compressed video
 *
 * Properties:
 *   - format: Pixel format (I420, NV12, YUYV, MJPEG, etc.)
 *   - width/height: Resolution
 *   - framerate: FPS (e.g., 30/1 = 30fps)
 *
 * Queues:
 *   - Buffer management between elements
 *   - max-size-buffers=1: Only 1 frame buffered (low latency)
 *   - leaky=downstream: Drop old frames when full (prevent backpressure)
 *
 * Why Shared Memory?
 * ==================
 *
 * Zero-Copy IPC:
 *   - CameraHub writes frames to SHM once
 *   - Multiple readers (NV12Capture, Publisher) access same memory
 *   - No data copying between processes
 *   - Minimal CPU overhead
 *
 * Decoupling:
 *   - Each pipeline is independent process
 *   - Crashes isolated (one pipeline crash doesn't affect others)
 *   - Can restart pipelines independently
 *
 * Performance:
 *   - 1080p @ 30fps = ~186 MB/s uncompressed
 *   - SHM avoids copying this data multiple times
 *   - Scales to multiple consumers without penalty
 */

import { SourceConfig, AIConfig, MediaMTXConfig } from "../config/schema.js";
import { EncoderConfig } from "./encoder.js";

/**
 * Build Ingest Pipeline - Always-On Camera Capture
 *
 * Constructs a GStreamer pipeline that captures video from camera
 * and writes I420 frames to shared memory.
 *
 * Pipeline Architecture:
 * ======================
 *
 * RTSP Path:
 *   rtspsrc → queue → rtph264depay → h264parse → avdec_h264
 *   → videoconvert → videoscale → I420 @ WxH → queue → shmsink
 *
 * V4L2 Path (MJPEG):
 *   v4l2src → image/jpeg → jpegdec → videoconvert → videoscale
 *   → I420 @ WxH → videorate → queue → shmsink
 *
 * V4L2 Path (RAW fallback):
 *   v4l2src → video/x-raw @ 640x480 → videoconvert → videoscale
 *   → I420 @ WxH → videorate → queue → shmsink
 *
 * Output Format:
 *   - Format: I420 (YUV 4:2:0 planar, 3 planes)
 *   - Resolution: CONFIG.source.width × CONFIG.source.height
 *   - Framerate: CONFIG.source.fpsHub
 *   - Destination: CONFIG.source.socketPath (Unix domain socket)
 *
 * Why I420?
 *   - Standard YUV format (widely supported)
 *   - 3 planes: Y (luma), U (chroma), V (chroma)
 *   - 1.5 bytes per pixel (efficient)
 *   - Compatible with videoconvert (easy format changes)
 *
 * Queue Configuration:
 *   - max-size-buffers=1: Minimal buffering (low latency)
 *   - leaky=downstream: Drop old frames when consumer slow
 *   - Prevents memory accumulation during backpressure
 *
 * Sync Behavior:
 *   - sync=true: Maintains real timestamps
 *   - Prevents clock drift
 *   - Important for multi-consumer scenarios
 *
 * @param source - Source configuration (camera type, URI, resolution, FPS)
 * @param tryRawFallback - Use raw YUYV format (640×480 max) if MJPEG fails
 * @returns Array of gst-launch-1.0 arguments
 *
 * @example
 * ```typescript
 * // RTSP camera
 * const args = buildIngest({
 *   kind: "rtsp",
 *   uri: "rtsp://192.168.1.100:554/stream",
 *   width: 1280,
 *   height: 720,
 *   fpsHub: 30,
 *   socketPath: "/tmp/camera_shm",
 *   shmSizeMB: 50
 * });
 *
 * // USB camera (MJPEG)
 * const args = buildIngest({
 *   kind: "v4l2",
 *   uri: "/dev/video0",
 *   width: 1280,
 *   height: 720,
 *   fpsHub: 30,
 *   socketPath: "/tmp/camera_shm",
 *   shmSizeMB: 50
 * });
 * ```
 */
export function buildIngest(
  source: SourceConfig,
  tryRawFallback: boolean = false
): string[] {
  const { kind, uri, width, height, fpsHub, socketPath, shmSizeMB } = source;
  const shmSizeBytes = shmSizeMB * 1024 * 1024;

  const base = [
    "--gst-debug-no-color",
    `--gst-debug=shmsink:4`,
    "-e", // Send EOS (End-Of-Stream) on SIGINT for graceful shutdown
  ];

  if (kind === "rtsp") {
    return [
      ...base,
      "rtspsrc",
      `location=${uri}`,
      "latency=50", // 50ms buffering (low latency mode)
      "!",
      "queue",
      "max-size-buffers=1",
      "leaky=downstream",
      "!",
      "rtph264depay", // Extract H.264 from RTP packets
      "!",
      "h264parse", // Parse H.264 stream for decoder
      "!",
      "avdec_h264", // FFmpeg H.264 decoder
      "max-threads=2", // Limit decoder threads (reduce CPU)
      "!",
      "videoconvert", // Convert to I420 if needed
      "!",
      "videoscale", // Scale to target resolution
      "!",
      `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
      "!",
      "queue",
      "max-size-buffers=1",
      "leaky=downstream",
      "!",
      "shmsink",
      `socket-path=${socketPath}`,
      `shm-size=${shmSizeBytes}`,
      "wait-for-connection=false", // Don't block if no readers
      "sync=true", // Maintain real timestamps, prevent drift
    ];
  }

  // V4L2 (USB/integrated cameras)
  if (kind === "v4l2") {
    // Raw fallback: use lower resolution (640×480) since YUYV doesn't support high res
    const fallbackWidth = 640;
    const fallbackHeight = 480;

    const formatCaps = tryRawFallback
      ? `video/x-raw,width=${fallbackWidth},height=${fallbackHeight}`
      : `image/jpeg,width=${width},height=${height}`;

    const decoder = tryRawFallback ? [] : ["jpegdec", "!"];

    return [
      ...base,
      "v4l2src",
      `device=${uri}`,
      "!",
      formatCaps,
      "!",
      ...decoder,
      "videoconvert",
      "!",
      "videoscale",
      "!",
      `video/x-raw,format=I420,width=${width},height=${height}`,
      "!",
      "videorate", // Adjust framerate if camera doesn't support fpsHub exactly
      "!",
      `video/x-raw,framerate=${fpsHub}/1`,
      "!",
      "queue",
      "max-size-buffers=1",
      "leaky=downstream",
      "!",
      "shmsink",
      `socket-path=${socketPath}`,
      `shm-size=${shmSizeBytes}`,
      "wait-for-connection=false",
      "sync=true", // Maintain real timestamps, prevent drift
    ];
  }

  throw new Error(`Unknown source kind: ${kind}`);
}

/**
 * Build NV12 Capture Pipeline - AI Frame Extraction
 *
 * Constructs a GStreamer pipeline that reads frames from shared memory,
 * scales them to AI resolution, converts to NV12 format, and outputs
 * binary frames to stdout.
 *
 * Pipeline Architecture:
 * ======================
 *
 * shmsrc → queue → videorate → videoscale → I420 @ AI_WxH
 * → videoconvert → NV12 → queue → fdsink (stdout)
 *
 * Output Format:
 *   - Format: NV12 (YUV 4:2:0 semi-planar, 2 planes)
 *   - Resolution: CONFIG.ai.width × CONFIG.ai.height
 *   - Framerate: Dynamic (idle or active FPS)
 *   - Destination: stdout (file descriptor 1)
 *
 * Why NV12?
 * =========
 *
 * Efficiency:
 *   - 2 planes instead of 3 (I420 has Y, U, V separate)
 *   - Better cache locality (UV interleaved)
 *   - 1.5 bytes per pixel (same as I420)
 *
 * GPU Compatibility:
 *   - Preferred format for CUDA/TensorRT
 *   - Better performance on GPU inference
 *   - Less conversion overhead
 *
 * AI Integration:
 *   - YOLO models expect YUV input
 *   - NV12 → RGB conversion in AI worker
 *   - Or direct NV12 inference (faster)
 *
 * Frame Rate Control:
 * ===================
 *
 * videorate element:
 *   - Adjusts FPS from hub rate to AI rate
 *   - Drops frames if AI FPS < hub FPS
 *   - Duplicates frames if AI FPS > hub FPS (rare)
 *
 * Dynamic FPS (deprecated in protocol v1):
 *   - Idle: CONFIG.ai.fps.idle (e.g., 5 FPS)
 *   - Active: CONFIG.ai.fps.active (e.g., 12 FPS)
 *   - v1 protocol uses window-based backpressure instead
 *
 * Binary Output:
 * ==============
 *
 * fdsink fd=1:
 *   - Writes raw NV12 bytes to stdout
 *   - No framing, no headers (just pixels)
 *   - Consumer must know frame size to parse
 *   - Frame size = width × height × 1.5
 *
 * @param sourceSock - Shared memory socket path (from CONFIG.source.socketPath)
 * @param sourceWidth - Hub resolution width
 * @param sourceHeight - Hub resolution height
 * @param sourceFpsHub - Hub framerate
 * @param aiWidth - AI resolution width (CONFIG.ai.width)
 * @param aiHeight - AI resolution height (CONFIG.ai.height)
 * @param fps - Target AI framerate (idle or active)
 * @returns Array of gst-launch-1.0 arguments
 *
 * @example
 * ```typescript
 * const args = buildNV12Capture(
 *   "/tmp/camera_shm",  // Shared memory socket
 *   1280, 720,          // Hub resolution
 *   30,                 // Hub FPS
 *   640, 480,           // AI resolution
 *   12                  // AI FPS (active)
 * );
 *
 * // Spawn: gst-launch-1.0 ...args
 * // Read NV12 frames from stdout
 * ```
 */
export function buildNV12Capture(
  sourceSock: string,
  sourceWidth: number,
  sourceHeight: number,
  sourceFpsHub: number,
  aiWidth: number,
  aiHeight: number,
  fps: number
): string[] {
  return [
    "--gst-debug-no-color",
    "--gst-debug=shmsrc:3,fdsink:3",
    "shmsrc",
    `socket-path=${sourceSock}`,
    "is-live=true", // Treat as live source (don't buffer excessively)
    "do-timestamp=true", // Generate timestamps if not present
    "!",
    `video/x-raw,format=I420,width=${sourceWidth},height=${sourceHeight},framerate=${sourceFpsHub}/1`,
    "!",
    "queue",
    "max-size-buffers=1",
    "leaky=downstream",
    "!",
    "videorate", // Adjust FPS from hub rate to AI rate
    "!",
    `video/x-raw,framerate=${fps}/1`,
    "!",
    "videoscale", // Scale from hub resolution to AI resolution
    "!",
    `video/x-raw,format=I420,width=${aiWidth},height=${aiHeight},framerate=${fps}/1`,
    "!",
    "videoconvert", // Convert I420 → NV12
    "!",
    `video/x-raw,format=NV12,width=${aiWidth},height=${aiHeight},framerate=${fps}/1`,
    "!",
    "rawvideoparse",
    "format=nv12",
    `width=${aiWidth}`,
    `height=${aiHeight}`,
    `framerate=${fps}/1`,
    "!",
    "queue",
    "max-size-buffers=2", // Small buffer to smooth jitter
    "leaky=downstream",
    "!",
    "fdsink", // Write to file descriptor
    "fd=1", // stdout (file descriptor 1)
    "sync=false", // Don't throttle based on timestamps (output ASAP)
  ];
}

/**
 * Build RTSP Publish Pipeline - On-Demand Streaming
 *
 * Constructs a GStreamer pipeline that reads frames from shared memory,
 * encodes them to H.264, and publishes to MediaMTX RTSP server.
 *
 * Pipeline Architecture:
 * ======================
 *
 * shmsrc → queue → videoconvert → H.264 encoder → h264parse
 * → video/x-h264 (byte-stream) → rtspclientsink
 *
 * Encoder Options:
 *   - x264enc: Software encoder (CPU, slow but compatible)
 *   - vaapih264enc: Hardware encoder (Intel VAAPI, fast)
 *   - nvh264enc: Hardware encoder (NVIDIA, fast)
 *   - See encoder.ts for auto-detection logic
 *
 * Output:
 *   - Protocol: RTSP over TCP
 *   - Format: H.264 byte-stream
 *   - Destination: rtsp://{mediamtx.host}:{mediamtx.port}/{mediamtx.path}
 *
 * Why H.264?
 * ==========
 *
 * Compatibility:
 *   - Universal browser support
 *   - Works with VLC, FFmpeg, web players
 *   - HLS/DASH compatible
 *
 * Compression:
 *   - ~100:1 compression ratio
 *   - 1080p @ 30fps ≈ 4 Mbps (vs 186 MB/s raw)
 *   - Network-friendly
 *
 * Latency:
 *   - Low latency profile (tune=zerolatency)
 *   - ~100-300ms end-to-end
 *   - Good enough for monitoring
 *
 * MediaMTX Integration:
 * ======================
 *
 * rtspclientsink:
 *   - Acts as RTSP client (publishes to server)
 *   - MediaMTX acts as RTSP server (receives stream)
 *   - Uses TCP for reliability (protocols=tcp)
 *   - Low latency mode (latency=50ms)
 *
 * On-Demand Publishing:
 *   - Pipeline starts when FSM enters ACTIVE state
 *   - Pipeline stops when FSM returns to IDLE
 *   - Saves CPU/GPU when not recording
 *
 * @param sourceSock - Shared memory socket path
 * @param sourceWidth - Hub resolution width
 * @param sourceHeight - Hub resolution height
 * @param sourceFpsHub - Hub framerate (not hardcoded!)
 * @param mediamtx - MediaMTX server configuration
 * @param encoder - H.264 encoder configuration (from detectEncoder())
 * @returns Array of gst-launch-1.0 arguments
 *
 * @example
 * ```typescript
 * const args = buildPublish(
 *   "/tmp/camera_shm",
 *   1280, 720,
 *   30,
 *   { host: "mediamtx", port: 8554, path: "live" },
 *   { element: "x264enc", extraArgs: ["tune=zerolatency", "bitrate=2000"] }
 * );
 *
 * // Publishes to: rtsp://mediamtx:8554/live
 * ```
 */
export function buildPublish(
  sourceSock: string,
  sourceWidth: number,
  sourceHeight: number,
  sourceFpsHub: number, // FPS from hub (don't hardcode!)
  mediamtx: MediaMTXConfig,
  encoder: EncoderConfig
): string[] {
  const rtspUrl = `rtsp://${mediamtx.host}:${mediamtx.port}/${mediamtx.path}`;

  const base = [
    "--gst-debug-no-color",
    "--gst-debug=shmsrc:3,rtspclientsink:4",
    "-e", // Send EOS on SIGINT for graceful shutdown
    "shmsrc",
    `socket-path=${sourceSock}`,
    "is-live=true",
    "do-timestamp=true",
    "!",
    `video/x-raw,format=I420,width=${sourceWidth},height=${sourceHeight},framerate=${sourceFpsHub}/1`,
    "!",
    "queue",
    "max-size-buffers=1",
    "leaky=downstream",
    "!",
    "videoconvert", // Ensure correct format for encoder
    "!",
  ];

  // H.264 encoder element (e.g., "x264enc tune=zerolatency bitrate=2000")
  const encoderElement = [encoder.element, ...encoder.extraArgs, "!"];

  const sink = [
    "h264parse", // Parse H.264 stream for proper formatting
    "!",
    "video/x-h264,stream-format=byte-stream", // Ensure byte-stream format
    "!",
    "rtspclientsink",
    `location=${rtspUrl}`,
    "protocols=tcp", // Use TCP for reliability (vs UDP)
    "latency=50", // Low latency mode (50ms buffering)
  ];

  return [...base, ...encoderElement, ...sink];
}
