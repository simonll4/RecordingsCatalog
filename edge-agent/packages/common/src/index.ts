import { z } from "zod";
import { randomUUID } from "crypto";

// Basic types
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  class: string;
  score: number;
  // Normalized bbox in [0,1] relative to frame width/height
  bbox: BoundingBox;
  trackId?: string;
}

export interface Frame {
  data: Buffer;
  width: number;
  height: number;
  timestamp: number;
}

export interface Track {
  trackId: string;
  class: string;
  score: number;
  bbox: BoundingBox;
  firstTimestamp: number;
  lastTimestamp: number;
}

// Session states
export type SessionState = "IDLE" | "OPEN" | "ACTIVE" | "CLOSING";

// Tracks compaction configuration
export const TracksCompactionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  method: z.enum(["iou", "deadband", "hybrid"]).default("hybrid"),
  kf_similarity_iou: z.number().min(0).max(1).default(0.98),
  eps_xy: z.number().min(0).default(0.005),
  eps_wh: z.number().min(0).default(0.005),
  min_kf_dt: z.number().min(0).default(0.03), // seconds
});

export type TracksCompactionConfig = z.infer<
  typeof TracksCompactionConfigSchema
>;

// Backpressure configuration
export const BackpressureConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxQueueSize: z.number().int().positive().default(8),
  maxQueueLatencyMs: z.number().positive().default(400),
  dropPolicy: z.enum(["drop_oldest", "drop_newest"]).default("drop_oldest"),
  adaptCaptureFps: z.boolean().default(false),
  minFps: z.number().positive().default(3),
  maxFps: z.number().positive().default(15),
});

export type BackpressureConfig = z.infer<typeof BackpressureConfigSchema>;

// Camera configuration schema
export const CameraConfigSchema = z.object({
  id: z.string(),
  device: z.union([z.number(), z.string()]),
  modelPath: z.string(),
  input: z.object({
    width: z.number(),
    height: z.number(),
  }),
  classNames: z.array(z.string()),
  classesOfInterest: z.array(z.string()),
  threshold: z.number().min(0).max(1),
  fps: z.number().positive(),
  postRollMs: z.number().positive(),
  maxSessionMs: z.number().positive().default(30000),
  captureProvider: z.enum(["opencv", "ffmpeg"]),
  // Optional compaction config
  tracksCompaction: TracksCompactionConfigSchema.optional(),
  // Optional backpressure config
  backpressure: BackpressureConfigSchema.optional(),
});

export type CameraConfig = z.infer<typeof CameraConfigSchema>;

export const CamerasConfigSchema = z.object({
  cameras: z.array(CameraConfigSchema),
});

export type CamerasConfig = z.infer<typeof CamerasConfigSchema>;

// Database types
export interface SessionData {
  sessionId: string;
  name: string;
  segmentIdx: number;
  devId: string;
  streamPath?: string;
  edgeStartTs: number;
  edgeEndTs?: number;
  playlistUrl?: string;
  startPdt?: string;
  endPdt?: string;
  metaUrl?: string;
  thumbUrl?: string;
  thumbTs?: number;
  classes?: string[];
  createdAt: number;
}

export interface DetectionData {
  detectionId: string;
  sessionId: string;
  trackId: string;
  firstTs: number;
  lastTs: number;
  class: string;
  score: number;
  // Normalized bbox in [0,1]
  bb: BoundingBox;
  frameUrl?: string;
  attributes?: Record<string, any>;
  detectionRef?: string;
  // Optional detailed tracking timeline (NOT stored inside attributes)
  trackDetails?: TrackDetails;
}

export interface Keyframe {
  // seconds relative to track start
  t: number;
  // Normalized bbox [0,1]
  bbox: BoundingBox;
  // Optional detection confidence at keyframe
  score?: number;
}

export interface TrackDetails {
  // Track identifier (mirror of detection.trackId for direct mapping)
  trackId: string;
  label: string;
  // optional attrs reserved for future
  attrs?: Record<string, any>;
  kf: Keyframe[];
}

// Re-export everything as a types namespace for convenience (optional)
export type {
  BoundingBox as TBoundingBox,
  Detection as TDetection,
  Frame as TFrame,
  Track as TTrack,
  SessionState as TSessionState,
  CameraConfig as TCameraConfig,
  CamerasConfig as TCamerasConfig,
  SessionData as TSessionData,
  DetectionData as TDetectionData,
};

// Utility functions
export function calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
  const x1 = Math.max(box1.x, box2.x);
  const y1 = Math.max(box1.y, box2.y);
  const x2 = Math.min(box1.x + box1.w, box2.x + box2.w);
  const y2 = Math.min(box1.y + box1.h, box2.y + box2.h);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const area1 = box1.w * box1.h;
  const area2 = box2.w * box2.h;
  const union = area1 + area2 - intersection;

  return intersection / union;
}

export function generateId(): string {
  return randomUUID();
}
