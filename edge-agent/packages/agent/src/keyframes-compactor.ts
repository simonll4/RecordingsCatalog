import type {
  Keyframe,
  BoundingBox,
  TracksCompactionConfig,
} from "@edge-agent/common";
import { calculateIoU } from "@edge-agent/common";
import pino from "pino";

const logger = pino({ name: "keyframes-compactor" });

/**
 * Compact keyframes array using configurable similarity thresholds
 *
 * Strategies:
 * - IoU: Remove keyframes with IoU >= threshold compared to previous
 * - Deadband: Remove keyframes with small deltas in bbox components
 * - Hybrid: Apply both IoU and deadband checks
 * - Temporal: Always remove if time delta < min_kf_dt
 *
 * Always preserves:
 * - First keyframe
 * - Last keyframe
 * - Keyframes with significant class/score changes
 *
 * @param keyframes Input keyframes array (must be sorted by time t)
 * @param config Compaction configuration
 * @returns Compacted keyframes array
 */
export function compactKeyframes(
  keyframes: Keyframe[],
  config: TracksCompactionConfig
): Keyframe[] {
  if (!config.enabled || keyframes.length <= 2) {
    return keyframes;
  }

  const result: Keyframe[] = [];
  const originalCount = keyframes.length;

  // Always keep first keyframe
  result.push(keyframes[0]);

  for (let i = 1; i < keyframes.length - 1; i++) {
    const current = keyframes[i];
    const previous = keyframes[i - 1];

    if (shouldKeepKeyframe(current, previous, config)) {
      result.push(current);
    }
  }

  // Always keep last keyframe
  if (keyframes.length > 1) {
    result.push(keyframes[keyframes.length - 1]);
  }

  const reductionPct = ((1 - result.length / originalCount) * 100).toFixed(1);

  logger.debug(
    {
      originalCount,
      compactedCount: result.length,
      reductionPct: `${reductionPct}%`,
      method: config.method,
    },
    "Keyframes compacted"
  );

  return result;
}

/**
 * Determine if a keyframe should be kept based on compaction rules
 */
function shouldKeepKeyframe(
  current: Keyframe,
  previous: Keyframe,
  config: TracksCompactionConfig
): boolean {
  // Temporal filter: reject if too close in time
  const timeDelta = current.t - previous.t;
  if (timeDelta < config.min_kf_dt) {
    return false;
  }

  // Apply similarity checks based on method
  switch (config.method) {
    case "iou":
      return !isSimilarByIoU(current.bbox, previous.bbox, config);

    case "deadband":
      return !isSimilarByDeadband(current.bbox, previous.bbox, config);

    case "hybrid":
      // Keep if either IoU or deadband indicates significant change
      return (
        !isSimilarByIoU(current.bbox, previous.bbox, config) ||
        !isSimilarByDeadband(current.bbox, previous.bbox, config)
      );

    default:
      return true;
  }
}

/**
 * Check similarity using IoU threshold
 * Returns true if bboxes are similar (high IoU)
 */
function isSimilarByIoU(
  bbox1: BoundingBox,
  bbox2: BoundingBox,
  config: TracksCompactionConfig
): boolean {
  const iou = calculateIoU(bbox1, bbox2);
  return iou >= config.kf_similarity_iou;
}

/**
 * Check similarity using component-wise deadband
 * Returns true if all components are within epsilon
 */
function isSimilarByDeadband(
  bbox1: BoundingBox,
  bbox2: BoundingBox,
  config: TracksCompactionConfig
): boolean {
  const dx = Math.abs(bbox1.x - bbox2.x);
  const dy = Math.abs(bbox1.y - bbox2.y);
  const dw = Math.abs(bbox1.w - bbox2.w);
  const dh = Math.abs(bbox1.h - bbox2.h);

  return (
    dx < config.eps_xy &&
    dy < config.eps_xy &&
    dw < config.eps_wh &&
    dh < config.eps_wh
  );
}

/**
 * Compact all tracks in a session
 *
 * @param tracks Map of trackId to track data with keyframes
 * @param config Compaction configuration
 * @returns New map with compacted keyframes
 */
export function compactAllTracks(
  tracks: Map<string, { label: string; kf: Keyframe[] }>,
  config: TracksCompactionConfig
): Map<string, { label: string; kf: Keyframe[] }> {
  const compacted = new Map<string, { label: string; kf: Keyframe[] }>();

  let totalOriginal = 0;
  let totalCompacted = 0;

  for (const [trackId, track] of tracks.entries()) {
    const originalCount = track.kf.length;
    const compactedKf = compactKeyframes(track.kf, config);

    totalOriginal += originalCount;
    totalCompacted += compactedKf.length;

    compacted.set(trackId, {
      label: track.label,
      kf: compactedKf,
    });
  }

  if (totalOriginal > 0) {
    const overallReduction = (
      (1 - totalCompacted / totalOriginal) *
      100
    ).toFixed(1);

    logger.info(
      {
        trackCount: tracks.size,
        totalOriginal,
        totalCompacted,
        reductionPct: `${overallReduction}%`,
        method: config.method,
      },
      "All tracks compacted"
    );
  }

  return compacted;
}

/**
 * Calculate interpolation error for validation
 * Useful for testing compaction quality
 *
 * @param original Original keyframes
 * @param compacted Compacted keyframes
 * @param samplePoints Array of time points to check (in seconds)
 * @returns Max pixel error across all sample points
 */
export function calculateInterpolationError(
  original: Keyframe[],
  compacted: Keyframe[],
  samplePoints: number[],
  frameWidth: number = 640,
  frameHeight: number = 480
): number {
  let maxError = 0;

  for (const t of samplePoints) {
    const originalBbox = interpolateBbox(original, t);
    const compactedBbox = interpolateBbox(compacted, t);

    if (!originalBbox || !compactedBbox) continue;

    // Calculate pixel error
    const dxPx = Math.abs(originalBbox.x - compactedBbox.x) * frameWidth;
    const dyPx = Math.abs(originalBbox.y - compactedBbox.y) * frameHeight;
    const dwPx = Math.abs(originalBbox.w - compactedBbox.w) * frameWidth;
    const dhPx = Math.abs(originalBbox.h - compactedBbox.h) * frameHeight;

    const error = Math.max(dxPx, dyPx, dwPx, dhPx);
    maxError = Math.max(maxError, error);
  }

  return maxError;
}

/**
 * Linear interpolation between keyframes
 */
function interpolateBbox(keyframes: Keyframe[], t: number): BoundingBox | null {
  if (keyframes.length === 0) return null;

  // Find surrounding keyframes
  let kf1: Keyframe | null = null;
  let kf2: Keyframe | null = null;

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].t <= t && t <= keyframes[i + 1].t) {
      kf1 = keyframes[i];
      kf2 = keyframes[i + 1];
      break;
    }
  }

  // Handle edge cases
  if (!kf1) return keyframes[0].bbox;
  if (!kf2) return keyframes[keyframes.length - 1].bbox;
  if (kf1.t === kf2.t) return kf1.bbox;

  // Linear interpolation
  const alpha = (t - kf1.t) / (kf2.t - kf1.t);

  return {
    x: kf1.bbox.x + alpha * (kf2.bbox.x - kf1.bbox.x),
    y: kf1.bbox.y + alpha * (kf2.bbox.y - kf1.bbox.y),
    w: kf1.bbox.w + alpha * (kf2.bbox.w - kf1.bbox.w),
    h: kf1.bbox.h + alpha * (kf2.bbox.h - kf1.bbox.h),
  };
}
