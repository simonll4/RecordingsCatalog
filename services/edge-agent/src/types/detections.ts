/**
 * Tipos compartidos para detecciones y frames
 * Fuente única de verdad para AI, Store y Orchestrator
 */

export type BoundingBox = [x: number, y: number, w: number, h: number];

export type Detection = {
  cls: string;
  conf: number;
  bbox: BoundingBox;
  trackId?: string;
};

export type FrameMeta = {
  ts: string; // ISO timestamp
  width: number;
  height: number;
  pixFmt: "RGB" | "I420";
};
