/**
 * Temporal Interpolation Utilities
 * Provides smooth interpolation between track detections
 */

import type { RenderObject } from '@/types/tracks'

/**
 * Linear interpolation between two values
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Interpolate between two bounding boxes
 * @param bbox1 First bbox [x1, y1, x2, y2]
 * @param bbox2 Second bbox [x1, y1, x2, y2]
 * @param t Interpolation factor [0, 1]
 * @returns Interpolated bbox
 */
export function interpolateBBox(
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number],
  t: number
): [number, number, number, number] {
  return [
    lerp(bbox1[0], bbox2[0], t),
    lerp(bbox1[1], bbox2[1], t),
    lerp(bbox1[2], bbox2[2], t),
    lerp(bbox1[3], bbox2[3], t),
  ]
}

/**
 * Find the two closest detections around a given time for a specific track
 * @param detections All detections for a track (sorted by time)
 * @param targetTime Target time to interpolate
 * @returns Tuple of [before, after] detections, or null if not found
 */
export function findBracketingDetections(
  detections: RenderObject[],
  targetTime: number
): [RenderObject, RenderObject] | null {
  if (detections.length === 0) return null
  if (detections.length === 1) return [detections[0]!, detections[0]!]

  // Find the index where targetTime would fit
  let beforeIdx = -1
  let afterIdx = -1

  for (let i = 0; i < detections.length; i++) {
    if (detections[i]!.time <= targetTime) {
      beforeIdx = i
    }
    if (detections[i]!.time >= targetTime && afterIdx === -1) {
      afterIdx = i
      break
    }
  }

  // Edge cases
  if (beforeIdx === -1) {
    // Target time is before all detections
    return [detections[0]!, detections[0]!]
  }
  if (afterIdx === -1) {
    // Target time is after all detections
    return [detections[detections.length - 1]!, detections[detections.length - 1]!]
  }

  return [detections[beforeIdx]!, detections[afterIdx]!]
}

/**
 * Interpolate a track's position at a specific time
 * @param track Recent detections for this track (sorted by time)
 * @param targetTime Target time for interpolation
 * @param maxGapSeconds Maximum time gap to allow interpolation (default 0.3s)
 * @returns Interpolated RenderObject or null if gap is too large
 */
export function interpolateTrack(
  trackDetections: RenderObject[],
  targetTime: number,
  maxGapSeconds: number = 0.3
): RenderObject | null {
  const bracket = findBracketingDetections(trackDetections, targetTime)
  if (!bracket) return null

  const [before, after] = bracket

  // If they're the same detection, no interpolation needed
  if (before === after) {
    return before
  }

  // Calculate time gap
  const timeGap = after.time - before.time
  
  // Don't interpolate if gap is too large (object likely disappeared)
  if (timeGap > maxGapSeconds) {
    // Return the closest one
    const distBefore = Math.abs(targetTime - before.time)
    const distAfter = Math.abs(targetTime - after.time)
    return distBefore < distAfter ? before : after
  }

  // Calculate interpolation factor
  const t = (targetTime - before.time) / timeGap

  // Interpolate bbox
  const interpolatedBBox = interpolateBBox(before.bbox, after.bbox, t)

  // Interpolate confidence (simple average weighted by time)
  const interpolatedConf = lerp(before.conf, after.conf, t)

  // Return interpolated object
  return {
    trackId: before.trackId,
    cls: before.cls,
    clsName: before.clsName,
    conf: interpolatedConf,
    bbox: interpolatedBBox,
    time: targetTime,
  }
}
