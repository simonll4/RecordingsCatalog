/**
 * Bounding Box Utilities
 * Helpers for working with bounding boxes
 */

/**
 * Clamp a value between min and max
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

/**
 * Normalized bounding box [x1, y1, x2, y2] where values are in [0, 1]
 */
export type NormalizedBBox = [number, number, number, number]

/**
 * Check if bbox coordinates seem to be in pixel space (heuristic: > 1.5)
 */
export const isPixelBBox = (bbox: number[]): boolean => {
  return bbox.some(coord => coord > 1.5)
}

/**
 * Normalize a bounding box from pixel coordinates to [0, 1] range
 */
export const normalizeBBox = (
  bbox: [number, number, number, number],
  width: number,
  height: number
): NormalizedBBox => {
  const [x1, y1, x2, y2] = bbox
  return [
    x1 / width,
    y1 / height,
    x2 / width,
    y2 / height,
  ]
}

/**
 * Clamp bounding box coordinates to [0, 1] range
 */
export const clampBBox = (bbox: [number, number, number, number]): NormalizedBBox => {
  return bbox.map(coord => clamp(coord, 0, 1)) as NormalizedBBox
}

/**
 * Check if a bounding box is valid (x1 < x2 and y1 < y2)
 */
export const isValidBBox = (bbox: [number, number, number, number]): boolean => {
  const [x1, y1, x2, y2] = bbox
  return x1 < x2 && y1 < y2
}

/**
 * Process a bounding box: normalize if needed, clamp, and validate
 */
export const processBBox = (
  bbox: [number, number, number, number],
  videoWidth?: number | null,
  videoHeight?: number | null
): NormalizedBBox | null => {
  let [x1, y1, x2, y2] = bbox

  // Normalize from pixels if detected and dimensions available
  if (isPixelBBox(bbox) && videoWidth && videoHeight) {
    ;[x1, y1, x2, y2] = normalizeBBox(bbox, videoWidth, videoHeight)
  }

  // Clamp to [0, 1]
  const clamped = clampBBox([x1, y1, x2, y2])

  // Validate
  if (!isValidBBox(clamped)) {
    return null
  }

  return clamped
}
