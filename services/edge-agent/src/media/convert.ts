/**
 * Media Format Converter - YUV/RGB to JPEG Conversion
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Converts raw video frames from various pixel formats (NV12, I420, RGB) to
 * compressed JPEG images for efficient storage and transmission. Used by AI
 * frame ingestion pipeline to upload frames to Session Store.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Supported conversions:
 *
 * 1. NV12/I420 → JPEG (grayscale)
 *    - Input: YUV 4:2:0 planar formats (camera capture, GStreamer output)
 *    - Process: Extract Y plane (luminance) → Compress to JPEG
 *    - Output: Grayscale JPEG (suitable for object detection)
 *    - Limitation: No color information (Sharp library doesn't support YUV)
 *
 * 2. RGB → JPEG (full color)
 *    - Input: RGB 24-bit (3 bytes per pixel)
 *    - Process: Direct compression to JPEG with sRGB colorspace
 *    - Output: Color JPEG (full quality)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY GRAYSCALE FOR NV12/I420?
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Problem: Sharp library doesn't natively support YUV formats
 *
 * Options considered:
 *
 * 1. Manual YUV→RGB conversion in JavaScript
 *    ✗ Very slow (JS is not optimized for pixel manipulation)
 *    ✗ High CPU usage (defeats purpose of hardware encoding)
 *    ✗ Complex (need to handle NV12 vs I420 plane layouts)
 *
 * 2. Use FFmpeg/GStreamer for conversion
 *    ✗ Requires spawning external process (overhead)
 *    ✗ Adds dependency and complexity
 *    ✓ Would provide full color conversion
 *
 * 3. Extract Y plane only (current implementation)
 *    ✓ Fast (single memcpy, no computation)
 *    ✓ Simple (works with Sharp's raw grayscale mode)
 *    ✓ Good enough for AI detection (models work on grayscale)
 *    ✗ Loses color information (not suitable for human viewing)
 *
 * Decision: Use grayscale (option 3) for AI pipeline efficiency
 * - AI detection models don't require color (YOLO works fine on grayscale)
 * - Huge performance gain (no conversion overhead)
 * - If color is needed later, can add FFmpeg conversion as optional path
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * YUV FORMAT DETAILS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * NV12 (Semi-planar YUV 4:2:0):
 * - Plane 0: Y (luminance) - width × height bytes
 * - Plane 1: UV interleaved (chrominance) - (width × height / 2) bytes
 * - Total size: width × height × 1.5 bytes
 * - Memory layout: [Y Y Y Y ...] [UV UV UV UV ...]
 *
 * I420 (Planar YUV 4:2:0):
 * - Plane 0: Y (luminance) - width × height bytes
 * - Plane 1: U (chrominance) - (width × height / 4) bytes
 * - Plane 2: V (chrominance) - (width × height / 4) bytes
 * - Total size: width × height × 1.5 bytes
 * - Memory layout: [Y Y Y Y ...] [U U U U ...] [V V V V ...]
 *
 * Current implementation:
 * - Reads entire buffer (Y + UV/U+V)
 * - Sharp extracts first (width × height) bytes as Y plane
 * - UV/U+V data is ignored (hence grayscale output)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * JPEG COMPRESSION SETTINGS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Default quality: 85 (0-100 scale)
 * - Balance between file size and visual quality
 * - Good enough for AI detection (models are robust to compression)
 * - ~5-10x compression ratio (depends on content complexity)
 *
 * Chroma subsampling: 4:2:0 (default)
 * - Matches input format (NV12/I420 are also 4:2:0)
 * - Reduces file size without noticeable quality loss
 * - Alternative 4:4:4 (no subsampling) for high-quality color images
 *
 * Example compression ratios (1920×1080 frame):
 * - NV12 raw: 1920 × 1080 × 1.5 = 3,110,400 bytes (~3 MB)
 * - JPEG (quality 85): ~200-400 KB (compression ratio ~8-15x)
 * - JPEG (quality 95): ~600-800 KB (compression ratio ~4-5x)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * ```typescript
 * import { convertNV12ToJpeg, convertRGBToJpeg } from "./media/convert.js";
 *
 * // Example 1: NV12 → JPEG (grayscale)
 * const nv12Buffer = Buffer.from(...); // Raw NV12 data from camera
 * const meta = {
 *   format: "NV12",
 *   width: 1920,
 *   height: 1080,
 *   planes: [{ offset: 0, stride: 1920 }],
 * };
 *
 * const jpegGrayscale = await convertNV12ToJpeg(nv12Buffer, meta);
 * // → Buffer (JPEG, grayscale, ~200 KB)
 *
 * // Example 2: NV12 → JPEG with custom quality
 * const jpegHighQuality = await convertNV12ToJpeg(nv12Buffer, meta, {
 *   jpegQuality: 95, // Higher quality, larger file
 *   chromaSubsampling: "4:4:4", // No chroma subsampling
 * });
 *
 * // Example 3: RGB → JPEG (full color)
 * const rgbBuffer = Buffer.alloc(1920 * 1080 * 3); // RGB data
 * const jpegColor = await convertRGBToJpeg(rgbBuffer, 1920, 1080);
 * // → Buffer (JPEG, full color, ~300 KB)
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Validation checks:
 * - RGB buffer size must match (width × height × 3) bytes
 * - Logs warning if size mismatch (may indicate corrupted frame)
 *
 * Sharp errors:
 * - Invalid dimensions (width/height ≤ 0)
 * - Corrupted buffer data (invalid pixel values)
 * - Out of memory (very large frames)
 *
 * All errors are logged and re-thrown with descriptive messages.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTEGRATION POINTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Used by:
 * - FrameIngester: Converts captured frames before uploading to Session Store
 * - Future frame recording modules (if implemented)
 *
 * Dependencies:
 * - Sharp: Fast image processing library (native C++ bindings)
 * - Logging infrastructure (shared/logging.ts)
 * - Video types (modules/video/index.ts → NV12FrameMeta)
 *
 * @module media/convert
 */

import sharp from "sharp";
import { logger } from "../shared/logging.js";
import type { NV12FrameMeta } from "../modules/video/index.js";

/**
 * JPEG Conversion Options
 *
 * @property jpegQuality - Quality level (0-100), default: 85
 *   - Higher = better quality, larger file
 *   - Lower = worse quality, smaller file
 *   - Recommended: 80-90 for AI detection, 95+ for archival
 *
 * @property chromaSubsampling - Chroma subsampling mode, default: "4:2:0"
 *   - "4:2:0": Reduces chroma resolution (standard, good compression)
 *   - "4:4:4": Full chroma resolution (better quality, larger files)
 */
export interface ConversionOptions {
  jpegQuality?: number; // 0-100, default: 85
  chromaSubsampling?: "4:2:0" | "4:4:4"; // default: "4:2:0"
}

/**
 * Converts NV12/I420 buffer to JPEG (grayscale)
 *
 * IMPORTANT LIMITATION:
 * This function produces grayscale JPEG images because Sharp library
 * doesn't support YUV formats natively. Only the Y plane (luminance)
 * is used, discarding color information (UV/U+V planes).
 *
 * Why grayscale is acceptable:
 * - AI detection models work fine on grayscale (YOLO, SSD, etc.)
 * - Huge performance gain (no YUV→RGB conversion overhead)
 * - If color is needed, use FFmpeg/GStreamer for proper YUV→RGB conversion
 *
 * For full-color conversion:
 * - Option 1: Use FFmpeg to convert NV12→RGB first
 * - Option 2: Use GStreamer jpegenc directly (bypasses Sharp)
 * - Option 3: Implement manual YUV→RGB in JS (slow, not recommended)
 *
 * @param data - Raw NV12/I420 buffer (Y plane + UV/U+V planes)
 * @param meta - Frame metadata (format, width, height, planes)
 * @param options - Compression options (quality, chroma subsampling)
 * @returns Compressed JPEG buffer (grayscale)
 *
 * @throws Error if Sharp fails to process the buffer
 *
 * @example
 * ```typescript
 * const meta: NV12FrameMeta = {
 *   format: "NV12",
 *   width: 1920,
 *   height: 1080,
 *   planes: [{ offset: 0, stride: 1920 }],
 * };
 *
 * const nv12Buffer = Buffer.from(...); // 3,110,400 bytes (1920×1080×1.5)
 * const jpeg = await convertNV12ToJpeg(nv12Buffer, meta);
 * // → ~200 KB JPEG (grayscale, quality 85)
 * ```
 */
export async function convertNV12ToJpeg(
  data: Buffer,
  meta: NV12FrameMeta,
  options: ConversionOptions = {}
): Promise<Buffer> {
  const { jpegQuality = 85, chromaSubsampling = "4:2:0" } = options;

  try {
    // Sharp doesn't support NV12/I420 natively
    // We process only the Y plane (luminance) as grayscale
    // This produces a valid B&W image (good enough for AI detection)

    const jpegBuffer = await sharp(data, {
      raw: {
        width: meta.width,
        height: meta.height,
        channels: 1, // Only Y channel (luminance, grayscale)
      },
    })
      .jpeg({
        quality: jpegQuality,
        chromaSubsampling,
        force: true, // Force JPEG output even for grayscale
      })
      .toBuffer();

    logger.debug("NV12→JPEG conversion successful (grayscale)", {
      module: "convert",
      format: meta.format,
      dimensions: `${meta.width}×${meta.height}`,
      originalSize: data.length,
      compressedSize: jpegBuffer.length,
      compressionRatio: ((jpegBuffer.length / data.length) * 100).toFixed(1) + "%",
      note: "Grayscale output (color info discarded)",
    });

    return jpegBuffer;
  } catch (error: any) {
    logger.error("NV12→JPEG conversion failed", {
      module: "convert",
      format: meta.format,
      width: meta.width,
      height: meta.height,
      bufferSize: data.length,
      error: error.message,
    });
    throw new Error(`NV12→JPEG conversion failed: ${error.message}`);
  }
}

/**
 * Converts RGB buffer to JPEG (full color)
 *
 * Direct conversion from RGB to JPEG with sRGB colorspace. No format
 * conversion needed (Sharp natively supports RGB).
 *
 * Buffer size validation:
 * - Expected size: width × height × 3 bytes (24-bit RGB)
 * - Logs warning if size mismatch (may indicate corrupted frame)
 *
 * @param rgb - Raw RGB buffer (3 bytes per pixel: R, G, B)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param options - Compression options (quality, chroma subsampling)
 * @returns Compressed JPEG buffer (full color)
 *
 * @throws Error if Sharp fails to process the buffer
 *
 * @example
 * ```typescript
 * // Example: 1920×1080 RGB frame
 * const width = 1920;
 * const height = 1080;
 * const rgbBuffer = Buffer.alloc(width * height * 3); // 6,220,800 bytes
 *
 * // Fill with RGB data (from camera, decoder, etc.)
 * // ...
 *
 * const jpeg = await convertRGBToJpeg(rgbBuffer, width, height);
 * // → ~300 KB JPEG (full color, quality 85)
 *
 * // High quality conversion
 * const jpegHQ = await convertRGBToJpeg(rgbBuffer, width, height, {
 *   jpegQuality: 95,
 *   chromaSubsampling: "4:4:4",
 * });
 * // → ~800 KB JPEG (high quality, no chroma subsampling)
 * ```
 */
export async function convertRGBToJpeg(
  rgb: Buffer,
  width: number,
  height: number,
  options: ConversionOptions = {}
): Promise<Buffer> {
  const { jpegQuality = 85, chromaSubsampling = "4:2:0" } = options;

  try {
    // Validate buffer size (should be width × height × 3 bytes)
    const expectedSize = width * height * 3; // RGB = 3 bytes per pixel
    if (rgb.length !== expectedSize) {
      logger.warn("RGB buffer size mismatch (may indicate corrupted frame)", {
        module: "convert",
        expected: expectedSize,
        actual: rgb.length,
        width,
        height,
        difference: rgb.length - expectedSize,
      });
    }

    // Convert RGB to JPEG with sRGB colorspace
    const jpegBuffer = await sharp(rgb, {
      raw: {
        width,
        height,
        channels: 3, // RGB (3 bytes per pixel)
      },
    })
      .toColorspace("srgb") // Ensure sRGB colorspace (standard for web/display)
      .jpeg({
        quality: jpegQuality,
        chromaSubsampling,
        force: true,
      })
      .toBuffer();

    logger.debug("RGB→JPEG compression successful", {
      module: "convert",
      dimensions: `${width}×${height}`,
      originalSize: rgb.length,
      compressedSize: jpegBuffer.length,
      compressionRatio: ((jpegBuffer.length / rgb.length) * 100).toFixed(1) + "%",
      quality: jpegQuality,
    });

    return jpegBuffer;
  } catch (error: any) {
    logger.error("RGB→JPEG compression failed", {
      module: "convert",
      error: error.message,
      width,
      height,
      bufferSize: rgb.length,
    });
    throw new Error(`RGB→JPEG conversion failed: ${error.message}`);
  }
}
