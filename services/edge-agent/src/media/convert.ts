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
* 1. NV12/I420 → JPEG (full color)
*    - Input: YUV 4:2:0 planar/semi-planar formats (camera capture, GStreamer output)
*    - Process: Convert YUV (BT.601) → RGB (software) → JPEG (Sharp)
*    - Output: Color JPEG
*
* 2. RGB → JPEG (full color)
 *    - Input: RGB 24-bit (3 bytes per pixel)
 *    - Process: Direct compression to JPEG with sRGB colorspace
 *    - Output: Color JPEG (full quality)
 *
* Note on YUV support:
* - Sharp no soporta NV12/I420 directamente; por eso convertimos a RGB en memoria
*   respetando stride/offset y luego comprimimos con Sharp a JPEG.
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
* Conversión actual:
* - Leemos los planos Y y UV/U+V respetando stride/offset
* - Convertimos YUV (BT.601) → RGB fila por fila
* - Comprimimos a JPEG con Sharp (sRGB)
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
* // Example 1: NV12 → JPEG (color)
 * const nv12Buffer = Buffer.from(...); // Raw NV12 data from camera
 * const meta = {
 *   format: "NV12",
 *   width: 1920,
 *   height: 1080,
 *   planes: [{ offset: 0, stride: 1920 }],
 * };
 *
* const jpegColor = await convertNV12ToJpeg(nv12Buffer, meta);
* // → Buffer (JPEG, color)
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
 * Converts NV12/I420 buffer to JPEG (full color)
 *
 * Sharp does not natively support NV12, so we manually convert to RGB first.
 * The conversion implements BT.601 YUV→RGB and honours the stride information
 * provided in NV12FrameMeta to avoid artifacts.
 *
 * @param data - Raw NV12/I420 buffer (Y plane + UV/U+V planes)
 * @param meta - Frame metadata (format, width, height, planes)
 * @param options - Compression options (quality, chroma subsampling)
 * @returns Compressed JPEG buffer (color)
 *
 * @throws Error if conversion fails
 */
export async function convertNV12ToJpeg(
  data: Buffer,
  meta: NV12FrameMeta,
  options: ConversionOptions = {}
): Promise<Buffer> {
  const { jpegQuality = 85, chromaSubsampling = "4:2:0" } = options;

  try {
    const rgbBuffer = nv12ToRgb(data, meta);

    const jpegBuffer = await sharp(rgbBuffer, {
      raw: {
        width: meta.width,
        height: meta.height,
        channels: 3, // RGB
      },
    })
      .toColorspace("srgb")
      .jpeg({
        quality: jpegQuality,
        chromaSubsampling,
        force: true,
      })
      .toBuffer();

    logger.debug("NV12→JPEG conversion successful", {
      module: "convert",
      format: meta.format,
      dimensions: `${meta.width}×${meta.height}`,
      originalSize: data.length,
      compressedSize: jpegBuffer.length,
      compressionRatio: ((jpegBuffer.length / data.length) * 100).toFixed(1) + "%",
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

/**
 * Convert NV12/I420 buffer into packed RGB buffer (width × height × 3 bytes).
 *
 * Implements BT.601 conversion with clamping, iterating row-wise while respecting
 * the stride values defined in NV12FrameMeta.
 */
function nv12ToRgb(data: Buffer, meta: NV12FrameMeta): Buffer {
  const { width, height, format } = meta;
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid NV12 frame dimensions");
  }

  if (!meta.planes || meta.planes.length < 2) {
    throw new Error("NV12 frame meta missing plane information");
  }

  const rgb = Buffer.allocUnsafe(width * height * 3);

  if (format === "NV12") {
    const yPlane = meta.planes[0];
    const uvPlane = meta.planes[1];

    const yStride = yPlane.stride || width;
    const uvStride = uvPlane.stride || width;

    const yBase = yPlane.offset || 0;
    const uvBase = uvPlane.offset || 0;

    for (let row = 0; row < height; row++) {
      const yRowOffset = yBase + row * yStride;
      const uvRowOffset = uvBase + Math.floor(row / 2) * uvStride;

      for (let col = 0; col < width; col++) {
        const yValue = data[yRowOffset + col];
        const uvIndex = uvRowOffset + Math.floor(col / 2) * 2;
        const uValue = data[uvIndex];
        const vValue = data[uvIndex + 1];

        writePixel(rgb, row, col, width, yValue, uValue, vValue);
      }
    }

    return rgb;
  }

  if (format === "I420") {
    if (meta.planes.length < 3) {
      throw new Error("I420 frame meta missing UV plane information");
    }

    const yPlane = meta.planes[0];
    const uPlane = meta.planes[1];
    const vPlane = meta.planes[2];

    const yStride = yPlane.stride || width;
    const uStride = uPlane.stride || Math.floor(width / 2);
    const vStride = vPlane.stride || Math.floor(width / 2);

    const yBase = yPlane.offset || 0;
    const uBase = uPlane.offset || 0;
    const vBase = vPlane.offset || 0;

    for (let row = 0; row < height; row++) {
      const yRowOffset = yBase + row * yStride;
      const uvRow = Math.floor(row / 2);
      const uRowOffset = uBase + uvRow * uStride;
      const vRowOffset = vBase + uvRow * vStride;

      for (let col = 0; col < width; col++) {
        const c = col;
        const yValue = data[yRowOffset + c];
        const uValue = data[uRowOffset + Math.floor(c / 2)];
        const vValue = data[vRowOffset + Math.floor(c / 2)];

        writePixel(rgb, row, col, width, yValue, uValue, vValue);
      }
    }

    return rgb;
  }

  throw new Error(`Unsupported pixel format for NV12 conversion: ${format}`);
}

function writePixel(
  rgb: Buffer,
  row: number,
  col: number,
  width: number,
  yValue: number,
  uValue: number,
  vValue: number
): void {
  const c = yValue - 16;
  const d = uValue - 128;
  const e = vValue - 128;

  const r = clamp((298 * c + 409 * e + 128) >> 8);
  const g = clamp((298 * c - 100 * d - 208 * e + 128) >> 8);
  const b = clamp((298 * c + 516 * d + 128) >> 8);

  const index = (row * width + col) * 3;
  rgb[index] = r;
  rgb[index + 1] = g;
  rgb[index + 2] = b;
}

function clamp(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}
