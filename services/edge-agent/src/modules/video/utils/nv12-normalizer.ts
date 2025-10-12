/**
 * NV12 Split Frame Normalizer
 *
 * Detects and corrects split-frame artifacts where the Y/UV planes are
 * cyclically shifted (classic tearing when framing got misaligned).
 *
 * Usage:
 *   const { buffer, seam } = normalizeNV12SplitFrame(frameBuffer, width, height);
 *   // buffer will be the corrected frame (same reference if no seam found)
 */

export interface SplitFrameNormalizationResult {
  buffer: Buffer;
  seam: number | null;
}

/**
 * Normalize a NV12 frame by detecting the seam where the buffer is split and
 * rotating each row so that the frame becomes contiguous again.
 *
 * @param data   Raw NV12 frame (Y plane followed by interleaved UV)
 * @param width  Frame width in pixels
 * @param height Frame height in pixels
 */
export function normalizeNV12SplitFrame(
  data: Buffer,
  width: number,
  height: number
): SplitFrameNormalizationResult {
  const planeSize = width * height;
  if (planeSize === 0 || data.length < planeSize) {
    return { buffer: data, seam: null };
  }

  const seam = detectSplitSeam(data, width, height);
  if (seam === null || seam <= 0 || seam >= width) {
    return { buffer: data, seam: null };
  }

  const fixed = Buffer.allocUnsafe(data.length);

  rotatePlane(data.subarray(0, planeSize), fixed, 0, width, height, seam);

  const uvPlane = data.subarray(planeSize);
  const uvRows = Math.floor(height / 2);

  rotatePlane(uvPlane, fixed, planeSize, width, uvRows, seam);

  return { buffer: fixed, seam };
}

/**
 * Detect the split seam by summing absolute deltas between neighbourhood
 * pixels across sampled rows. The seam manifests as a very large jump in
 * luminance values.
 */
export function detectSplitSeam(
  data: Buffer,
  width: number,
  height: number
): number | null {
  const planeSize = width * height;
  if (planeSize === 0 || data.length < planeSize) {
    return null;
  }

  const yPlane = data.subarray(0, planeSize);
  const diffs = new Array<number>(width).fill(0);

  const sampleRows = Math.min(height, 64);
  const step = Math.max(1, Math.floor(height / sampleRows));

  for (let row = 0; row < height; row += step) {
    const rowOffset = row * width;
    for (let col = 0; col < width; col++) {
      const next = (col + 1) % width;
      const diff = Math.abs(yPlane[rowOffset + col] - yPlane[rowOffset + next]);
      diffs[next] += diff;
    }
  }

  let maxVal = 0;
  let secondVal = 0;
  let seamIndex = -1;

  for (let i = 0; i < width; i++) {
    const value = diffs[i];
    if (value > maxVal) {
      secondVal = maxVal;
      maxVal = value;
      seamIndex = i;
    } else if (value > secondVal) {
      secondVal = value;
    }
  }

  if (seamIndex <= 0) {
    return null;
  }

  const average =
    diffs.reduce((sum, value) => sum + value, 0) / Math.max(width, 1);

  if (maxVal < average * 2.5 || maxVal < secondVal * 1.5) {
    return null;
  }

  return seamIndex;
}

/**
 * Rotate each row so that bytes [seam, end) become the prefix and
 * [0, seam) the suffix (cyclic shift).
 */
function rotatePlane(
  src: Buffer,
  dst: Buffer,
  dstOffset: number,
  width: number,
  rows: number,
  seam: number
): void {
  if (seam <= 0 || seam >= width) {
    src.copy(dst, dstOffset);
    return;
  }

  for (let row = 0; row < rows; row++) {
    const srcRowStart = row * width;
    const dstRowStart = dstOffset + row * width;

    const tailLength = width - seam;

    src.copy(dst, dstRowStart, srcRowStart + seam, srcRowStart + width);

    src.copy(dst, dstRowStart + tailLength, srcRowStart, srcRowStart + seam);
  }
}
