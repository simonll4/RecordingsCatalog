/**
 * H.264 Encoder Auto-Detection Module
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Automatically detects and selects the best available H.264 hardware encoder
 * on the system, with software fallback support. The detected encoder is cached
 * to avoid repeated detection overhead.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Detection Priority (Best → Worst):
 *
 * 1. nvh264enc (NVIDIA NVENC)
 *    - Hardware: NVIDIA GPU with NVENC support
 *    - Performance: ~10x faster than software encoding
 *    - Quality: High (hardware-accelerated, CBR rate control)
 *    - Latency: Ultra-low (GPU parallel processing)
 *    - Use case: Production systems with NVIDIA GPUs (GTX 10xx+, Tesla, Quadro)
 *
 * 2. vaapih264enc (Intel VA-API)
 *    - Hardware: Intel integrated GPU (iGPU) with Quick Sync Video
 *    - Performance: ~5-8x faster than software encoding
 *    - Quality: Good (hardware-accelerated, CBR rate control)
 *    - Latency: Low (iGPU dedicated video encode)
 *    - Use case: Intel-based systems without discrete GPU (laptops, NUCs, servers)
 *
 * 3. x264enc (Software Fallback)
 *    - Hardware: CPU-only (multi-threaded)
 *    - Performance: Baseline (depends on CPU cores)
 *    - Quality: Excellent (most configurable, zerolatency tune)
 *    - Latency: Moderate (ultrafast preset for real-time streaming)
 *    - Use case: Development environments, systems without GPU acceleration
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DETECTION ALGORITHM
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * For each encoder in priority order:
 *
 * 1. Spawn GStreamer test pipeline:
 *    ```
 *    videotestsrc num-buffers=1 ! <encoder> ! fakesink
 *    ```
 *
 * 2. Test execution with 2-second timeout
 *    - Success (exit code 0): Encoder is available → Use this encoder
 *    - Failure (non-zero exit / timeout): Try next encoder
 *
 * 3. Cache result after first detection (avoid repeated overhead)
 *
 * 4. If all hardware encoders fail → Fallback to x264enc (always available)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CACHING STRATEGY
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Why cache?
 * - Detection involves spawning GStreamer processes (expensive)
 * - Hardware configuration doesn't change during runtime
 * - Repeated calls would waste CPU and add latency
 *
 * Cache lifecycle:
 * - Detected once on first call to detectEncoder()
 * - Stored in module-level variable (cachedEncoder)
 * - Reused for all subsequent calls during process lifetime
 * - Invalidated on process restart (hardware changes require restart anyway)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ENCODER CONFIGURATIONS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Each encoder has optimized parameters for low-latency real-time streaming:
 *
 * nvh264enc (NVIDIA):
 * - preset=low-latency-hq: Low-latency high-quality preset
 * - rc-mode=cbr: Constant bitrate (smooth streaming, predictable bandwidth)
 * - gop-size=30: Keyframe every 30 frames (~1 second at 30fps)
 *
 * vaapih264enc (Intel):
 * - bitrate=2000: 2 Mbps target (good quality for 720p/1080p)
 * - rate-control=cbr: Constant bitrate (avoid spikes)
 * - keyframe-period=30: Keyframe every 30 frames (~1 second at 30fps)
 *
 * x264enc (Software):
 * - tune=zerolatency: Optimize for minimal latency (disable frame buffering)
 * - speed-preset=ultrafast: Fastest encoding (real-time capable on modest CPUs)
 * - bitrate=2000: 2 Mbps target (quality vs performance balance)
 * - key-int-max=30: Keyframe every 30 frames (~1 second at 30fps)
 *
 * Why CBR (Constant Bitrate)?
 * - Predictable bandwidth usage (important for remote streaming)
 * - Smooth playback (no quality fluctuations)
 * - Better for live streaming vs VBR (variable bitrate)
 *
 * Why 30-frame GOP (Group of Pictures)?
 * - 1-second keyframe interval at 30fps (fast seeking/startup)
 * - Balance between compression efficiency and latency
 * - Standard for live streaming applications
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { detectEncoder } from "./media/encoder.js";
 *
 * // Detect encoder (cached after first call)
 * const encoder = await detectEncoder();
 * // → { element: "nvh264enc", extraArgs: ["preset=low-latency-hq", ...] }
 *
 * // Build GStreamer pipeline with detected encoder
 * const pipeline = [
 *   "shmsrc socket-path=/tmp/camera-feed",
 *   "video/x-raw,format=NV12,width=1920,height=1080",
 *   encoder.element,
 *   ...encoder.extraArgs,
 *   "video/x-h264,profile=baseline",
 *   "rtspclientsink location=rtsp://mediamtx:8554/stream",
 * ].join(" ! ");
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * - All hardware encoder tests have 2-second timeout (avoid hanging)
 * - Process spawn errors are caught and logged
 * - If all detection fails → Guaranteed fallback to x264enc (always works)
 * - Logs indicate which encoder was selected (info level)
 * - Fallback logs as warning (indicates missing hardware acceleration)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTEGRATION POINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Used by:
 * - MediaMtxOnDemandPublisherGst: H.264 encoding for RTSP streaming
 * - Future video recording modules (if implemented)
 *
 * Dependencies:
 * - GStreamer 1.0 with encoder plugins (gstreamer1.0-plugins-{good,bad,ugly})
 * - Child process spawning (Node.js built-in)
 * - Logging infrastructure (shared/logging.ts)
 *
 * @module media/encoder
 */

import { spawn } from "child_process";
import { logger } from "../shared/logging.js";

/**
 * H.264 Encoder Configuration
 *
 * Returned by detectEncoder() with encoder-specific parameters.
 *
 * @property element - GStreamer encoder element name (e.g., "nvh264enc")
 * @property extraArgs - Encoder-specific arguments (e.g., ["preset=low-latency-hq"])
 */
export type EncoderConfig = {
  element: string;
  extraArgs: string[];
};

/**
 * Cached encoder configuration (module-level singleton)
 *
 * Why module-level?
 * - Detection is expensive (spawns processes)
 * - Hardware config doesn't change during runtime
 * - Shared across all consumers of this module
 *
 * Lifecycle:
 * - undefined initially (not yet detected)
 * - Set on first detectEncoder() call
 * - Reused for all subsequent calls
 * - Invalidated on process restart
 */
let cachedEncoder: EncoderConfig | undefined;

/**
 * Detects the best H.264 encoder available on the system
 *
 * Tests encoders in priority order (NVIDIA > Intel > Software) and returns
 * the first working encoder. Result is cached to avoid repeated detection.
 *
 * Priority:
 * 1. nvh264enc (NVIDIA NVENC) - GPU hardware encoding
 * 2. vaapih264enc (Intel VA-API) - iGPU hardware encoding
 * 3. x264enc (Software) - CPU software encoding (fallback)
 *
 * @returns Encoder configuration with element name and optimized parameters
 *
 * @example
 * ```typescript
 * const encoder = await detectEncoder();
 * // First call: Detects and caches
 * // → { element: "nvh264enc", extraArgs: ["preset=low-latency-hq", ...] }
 *
 * const encoder2 = await detectEncoder();
 * // Second call: Returns cached result (instant)
 * // → Same object as first call
 * ```
 */
export async function detectEncoder(): Promise<EncoderConfig> {
  // Return cached result if already detected
  if (cachedEncoder) {
    return cachedEncoder;
  }

  // Priority order: Hardware encoders first, software fallback last
  const encoders = ["nvh264enc", "vaapih264enc", "x264enc"];

  // Test each encoder in priority order
  for (const encoder of encoders) {
    if (await testEncoder(encoder)) {
      const config = getEncoderConfig(encoder);
      cachedEncoder = config; // Cache for future calls
      logger.info(`H.264 encoder detected and cached`, {
        encoder: config.element,
        type: encoder === "x264enc" ? "software" : "hardware",
      });
      return config;
    }
  }

  // Guaranteed fallback: x264enc always works (software-only)
  // This should never execute (x264enc test should succeed above)
  const fallback = getEncoderConfig("x264enc");
  cachedEncoder = fallback;
  logger.warn(`No hardware encoder found, using software fallback`, {
    encoder: fallback.element,
    note: "Performance will be CPU-bound (consider adding GPU acceleration)",
  });
  return fallback;
}

/**
 * Tests if a specific encoder is available and functional
 *
 * Spawns a minimal GStreamer test pipeline:
 * - videotestsrc: Generates 1 test frame
 * - encoder: Encodes the frame
 * - fakesink: Discards output (we only test availability)
 *
 * Success criteria:
 * - Process exits with code 0 within 2 seconds
 *
 * Failure cases:
 * - Encoder plugin not installed (spawn error)
 * - Encoder fails to initialize (non-zero exit code)
 * - Timeout after 2 seconds (hanging/slow initialization)
 *
 * @param encoder - GStreamer encoder element name (e.g., "nvh264enc")
 * @returns true if encoder is available and functional, false otherwise
 *
 * @example
 * ```typescript
 * await testEncoder("nvh264enc") → true  // NVIDIA GPU available
 * await testEncoder("vaapih264enc") → false  // No Intel iGPU
 * await testEncoder("x264enc") → true  // Always available (software)
 * ```
 */
async function testEncoder(encoder: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Base pipeline: Generate 1 test frame
    const base = ["--gst-debug=0", "videotestsrc", "num-buffers=1", "!"];

    // Encoder-specific test pipeline
    // Note: vaapih264enc requires explicit NV12 format specification
    const testArgs =
      encoder === "vaapih264enc"
        ? [
            ...base,
            "video/x-raw,format=NV12,width=64,height=64", // VA-API requires NV12
            "!",
            "vaapih264enc",
            "bitrate=1000", // Minimal config for test
            "rate-control=cbr",
            "!",
            "fakesink", // Discard output
          ]
        : [
            ...base,
            "video/x-raw,width=64,height=64", // Other encoders auto-negotiate format
            "!",
            encoder,
            "!",
            "fakesink", // Discard output
          ];

    // Spawn GStreamer test pipeline
    const proc = spawn("gst-launch-1.0", testArgs, { stdio: "ignore" });

    // Timeout: If encoder hangs or is slow, assume unavailable
    const timeout = setTimeout(() => {
      proc.kill(); // Force kill hanging process
      resolve(false);
    }, 2000); // 2-second timeout

    // Success: Process exits cleanly
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      resolve(code === 0); // Exit code 0 = success
    });

    // Error: Process failed to spawn (plugin not installed)
    proc.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Returns optimized encoder configuration for a specific encoder
 *
 * Each encoder has carefully tuned parameters for low-latency real-time
 * streaming. Configurations balance quality, latency, and CPU/GPU usage.
 *
 * @param encoder - Encoder element name (nvh264enc, vaapih264enc, x264enc)
 * @returns Configuration with element name and optimized parameters
 *
 * @example
 * ```typescript
 * getEncoderConfig("nvh264enc")
 * // → {
 * //   element: "nvh264enc",
 * //   extraArgs: ["preset=low-latency-hq", "rc-mode=cbr", "gop-size=30"]
 * // }
 *
 * getEncoderConfig("x264enc")
 * // → {
 * //   element: "x264enc",
 * //   extraArgs: ["tune=zerolatency", "speed-preset=ultrafast", ...]
 * // }
 * ```
 */
function getEncoderConfig(encoder: string): EncoderConfig {
  switch (encoder) {
    case "nvh264enc":
      // NVIDIA NVENC: GPU hardware encoding
      return {
        element: "nvh264enc",
        extraArgs: [
          "preset=low-latency-hq", // Low latency + high quality
          "rc-mode=cbr", // Constant bitrate (smooth streaming)
          "gop-size=30", // Keyframe every 30 frames (~1 sec at 30fps)
        ],
      };

    case "vaapih264enc":
      // Intel VA-API: iGPU hardware encoding
      return {
        element: "vaapih264enc",
        extraArgs: [
          "bitrate=2000", // 2 Mbps target (good for 720p/1080p)
          "rate-control=cbr", // Constant bitrate (avoid spikes)
          "keyframe-period=30", // Keyframe every 30 frames
        ],
      };

    case "x264enc":
    default:
      // Software fallback: CPU-based encoding
      return {
        element: "x264enc",
        extraArgs: [
          "tune=zerolatency", // Disable frame buffering (low latency)
          "speed-preset=ultrafast", // Fastest preset (real-time capable)
          "bitrate=2000", // 2 Mbps target (quality vs speed balance)
          "key-int-max=30", // Keyframe every 30 frames
        ],
      };
  }
}
