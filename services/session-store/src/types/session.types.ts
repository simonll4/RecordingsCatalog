export interface SessionRecord {
  session_id: string;
  device_id: string;
  path: string;
  status: 'open' | 'closed';
  start_ts: string;
  end_ts: string | null;
  postroll_sec: number | null;
  media_connect_ts: string | null;
  media_start_ts: string | null;
  media_end_ts: string | null;
  recommended_start_offset_ms: number | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionInput {
  sessionId: string;
  deviceId: string;
  path: string;
  startTs: string;
  reason?: string;
}

export interface CloseSessionInput {
  sessionId: string;
  endTs: string;
  postrollSec?: number;
}

export interface OpenSessionRequest {
  sessionId: string;
  devId: string;
  // Support both 'path' and 'streamPath' for compatibility
  path?: string;
  streamPath?: string;
  startTs: string;
  reason?: string;
}

export interface CloseSessionRequest {
  sessionId: string;
  endTs: string;
  postrollSec?: number;
}

export interface TrackSegment {
  i: number;
  t0: number;
  t1: number;
  url: string;
  count: number;
  closed?: boolean;
}

export interface TrackIndex {
  segment_duration_s: number;
  segments: TrackSegment[];
  fps: number;
  duration_s: number;
}
