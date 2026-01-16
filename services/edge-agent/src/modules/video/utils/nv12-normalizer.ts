/**
 * NV12 Split Frame Normalizer
 *
 * Detects and corrects split-frame artifacts where the Y/UV planes are
 * cyclically shifted (classic tearing when framing got misaligned).
 *
 * Usage:
 *   const { buffer, seam } = normalizeNV12SplitFrame(
 *     frameBuffer,
 *     width,
 *     height,
 *     previousSeam
 *   );
 *   // buffer will be the corrected frame (same reference if no seam found)
 */

export interface SplitFrameNormalizationResult {
  buffer: Buffer;
  seam: number | null;
  detected: boolean;
  confidence?: number;
}

/**
 * Normalize a NV12 frame by detecting the seam where the buffer is split and
 * rotating each row so that the frame becomes contiguous again.
 *
 * @param data         Raw NV12 frame (Y plane followed by interleaved UV)
 * @param width        Frame width in pixels
 * @param height       Frame height in pixels
 * @param fallbackSeam Previously detected seam to reuse if detection fails
 */
export function normalizeNV12SplitFrame(
  data: Buffer,
  width: number,
  height: number,
  fallbackSeam: number | null = null
): SplitFrameNormalizationResult {
  const planeSize = width * height;
  if (planeSize === 0 || data.length < planeSize) {
    return { buffer: data, seam: null, detected: false, confidence: 0 };
  }

  const detected = detectSplitSeam(data, width, height);
  const { seam: detectedSeam, confidence } = detected;

  const seamToUse = selectSeam(detectedSeam, fallbackSeam, width);
  if (seamToUse === null) {
    return { buffer: data, seam: null, detected: false, confidence };
  }

  const fixed = Buffer.allocUnsafe(data.length);

  rotatePlane(data.subarray(0, planeSize), fixed, 0, width, height, seamToUse);

  const uvPlane = data.subarray(planeSize);
  const uvRows = Math.floor(height / 2);

  rotatePlane(uvPlane, fixed, planeSize, width, uvRows, seamToUse);

  return {
    buffer: fixed,
    seam: seamToUse,
    detected: seamToUse === detectedSeam,
    confidence,
  };
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
): { seam: number | null; confidence: number } {
  const planeSize = width * height;
  if (planeSize === 0 || data.length < planeSize) {
    return { seam: null, confidence: 0 };
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

  const uvPlane = data.subarray(planeSize, planeSize + Math.floor(planeSize / 2));
  const uvRows = Math.floor(height / 2);
  const uvSampleRows = Math.min(uvRows, 64);
  const uvStep = Math.max(1, Math.floor(uvRows / Math.max(uvSampleRows, 1)));

  for (let row = 0; row < uvRows; row += uvStep) {
    const rowOffset = row * width;
    for (let col = 0; col < width; col++) {
      const next = (col + 1) % width;
      const diff = Math.abs(uvPlane[rowOffset + col] - uvPlane[rowOffset + next]);
      diffs[next] += diff * 0.5; // UV plane contributes but with lower weight
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
    return { seam: null, confidence: 0 };
  }

  const average =
    diffs.reduce((sum, value) => sum + value, 0) / Math.max(width, 1);

  const variance =
    diffs.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) /
    Math.max(width, 1);
  const std = Math.sqrt(variance);

  const relGain = secondVal > 0 ? (maxVal - secondVal) / secondVal : maxVal;
  const conf = maxVal === 0 ? 0 : (maxVal - secondVal) / Math.max(maxVal, 1);

  const absoluteThreshold = 5000;
  const ratioThreshold = 1.35;
  const stdThreshold = average + std * 1.5;
  const secondThreshold = secondVal * (1 + relGain * 0.5 + 0.15);

  const passesAbsolute = maxVal > absoluteThreshold;
  const passesStd = maxVal > stdThreshold;
  const passesRatio =
    average > 0 ? maxVal / Math.max(average, 1) > ratioThreshold : false;
  const passesSecond = maxVal > Math.max(secondThreshold, secondVal + 2500);

  if (!(passesAbsolute || passesStd || passesRatio || passesSecond)) {
    return { seam: null, confidence: conf };
  }

  return { seam: seamIndex, confidence: conf };
}

function selectSeam(
  detected: number | null,
  fallback: number | null,
  width: number
): number | null {
  const valid = (value: number | null) =>
    value !== null && value > 0 && value < width;

  if (valid(detected)) {
    return detected as number;
  }

  if (valid(fallback)) {
    return fallback as number;
  }

  return null;
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
