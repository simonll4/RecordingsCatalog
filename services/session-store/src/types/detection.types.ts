export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ColorAttribute {
  name: string;
  rgb: [number, number, number];
  hex?: string;
  confidence?: number;
  family?: string;
}

export interface DetectionAttributes {
  color?: ColorAttribute;
  error?: string;
  enrichment_failed?: boolean;
}

export interface DetectionRecord {
  session_id: string;
  track_id: string;
  cls: string;
  conf: number;
  bbox: BoundingBox;
  url_frame: string | null;
  first_ts: string;
  last_ts: string;
  capture_ts: string;
  ingest_ts: string;
  created_at: string;
  updated_at: string;
  attributes: DetectionAttributes | null;
  enriched: boolean;
}

export interface DetectionInsertInput {
  sessionId: string;
  trackId: string;
  cls: string;
  conf: number;
  bbox: BoundingBox;
  captureTs: string;
  urlFrame?: string;
}

export interface IngestMetadata {
  sessionId: string;
  seqNo: number;
  captureTs: string;
  detections: Array<{
    trackId: string;
    cls: string;
    conf: number;
    bbox: BoundingBox;
  }>;
}
