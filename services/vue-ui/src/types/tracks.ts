export interface TrackObject {
  track_id: number;
  cls: number;
  cls_name: string;
  conf: number;
  bbox_xyxy: [number, number, number, number];
}

export interface TrackEvent {
  t_rel_s: number;
  frame: number;
  objs: TrackObject[];
}

export interface TrackMeta {
  session_id: string;
  device_id: string;
  start_time: string;
  end_time: string | null;
  frame_count: number;
  fps: number;
  path?: string | null;
  video: {
    width: number | null;
    height: number | null;
    fps: number | null;
  };
  classes: Array<{ id: number; name: string }>;
}

export interface TrackSegmentInfo {
  i: number;
  t0: number;
  t1: number;
  url: string;
  count: number;
  closed?: boolean;
}

export interface TrackIndex {
  segment_duration_s: number;
  segments: TrackSegmentInfo[];
  fps: number;
  duration_s: number;
}

export interface FetchedSegment {
  buffer: ArrayBuffer;
  encoding: string | null;
  segment: TrackSegmentInfo | null;
}

export interface RenderObject {
  trackId: number;
  cls: number;
  clsName: string;
  conf: number;
  bbox: [number, number, number, number];
  time: number;
}

export interface RenderFrame {
  time: number;
  objects: RenderObject[];
  trails: Map<number, RenderObject[]>;
}
