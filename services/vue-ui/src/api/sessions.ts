import { z } from 'zod';
import type { TrackIndex, TrackMeta } from '../types/tracks';
import { MEDIAMTX_BASE_URL, SESSION_STORE_BASE_URL, mediamtxGetUrl } from '../config';

export class HttpError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

const sessionSummarySchema = z.object({
  session_id: z.string(),
  device_id: z.string(),
  path: z.string().optional(),
  status: z.string(),
  start_ts: z.string(),
  end_ts: z.string().nullable(),
  postroll_sec: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});

const rangeSessionsSchema = z.object({
  from: z.string(),
  to: z.string(),
  sessions: z.array(sessionSummarySchema)
});

const listSessionsSchema = z.object({
  sessions: z.array(sessionSummarySchema)
});

const clipResponseSchema = z.object({
  playbackUrl: z.string(),
  start: z.string(),
  durationSeconds: z.number(),
  format: z.string().optional()
});

const metaSchema = z.object({
  session_id: z.string(),
  device_id: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable(),
  frame_count: z.number(),
  fps: z.number(),
  path: z.string().nullable().optional(),
  video: z.object({
    width: z.number().nullable(),
    height: z.number().nullable(),
    fps: z.number().nullable()
  }),
  classes: z
    .array(
      z.object({
        id: z.number(),
        name: z.string()
      })
    )
    .default([])
});

const segmentSchema = z.object({
  i: z.number(),
  t0: z.number(),
  t1: z.number(),
  url: z.string(),
  count: z.number(),
  closed: z.boolean().optional()
});

const indexSchema = z.object({
  segment_duration_s: z.number(),
  segments: z.array(segmentSchema),
  fps: z.number(),
  duration_s: z.number()
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type ClipInfo = z.infer<typeof clipResponseSchema>;

const parseErrorBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const fetchJson = async <T>(input: URL, schema: z.ZodSchema<T>): Promise<T> => {
  const response = await fetch(input, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new HttpError(
      response.status,
      body,
      `Request failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`
    );
  }

  const payload = await response.json();
  return schema.parse(payload);
};

const sessionStoreUrl = (path: string) => new URL(path, `${SESSION_STORE_BASE_URL}/`);

export const listSessions = async (params: { mode?: 'range' | 'all'; limit?: number; from?: string; to?: string } = {}) => {
  if (params.mode === 'all') {
    const url = sessionStoreUrl('/sessions');
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    const data = await fetchJson(url, listSessionsSchema);
    return {
      mode: 'all' as const,
      sessions: data.sessions,
      from: undefined,
      to: undefined
    };
  }

  const url = sessionStoreUrl('/sessions/range');
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.from) url.searchParams.set('from', params.from);
  if (params.to) url.searchParams.set('to', params.to);
  const data = await fetchJson(url, rangeSessionsSchema);
  return {
    mode: 'range' as const,
    sessions: data.sessions,
    from: data.from,
    to: data.to
  };
};

export const fetchSessionMeta = async (sessionId: string): Promise<TrackMeta | null> => {
  const url = sessionStoreUrl(`/sessions/${encodeURIComponent(sessionId)}/meta`);
  try {
    const meta = await fetchJson(url, metaSchema);
    return {
      ...meta,
      classes: meta.classes ?? []
    };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export const fetchSessionIndex = async (sessionId: string): Promise<TrackIndex | null> => {
  const url = sessionStoreUrl(`/sessions/${encodeURIComponent(sessionId)}/index`);
  try {
    return await fetchJson(url, indexSchema);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export const fetchSessionClip = async (sessionId: string): Promise<ClipInfo> => {
  const url = sessionStoreUrl(`/sessions/${encodeURIComponent(sessionId)}/clip`);
  const data = await fetchJson(url, clipResponseSchema);

  try {
    const original = new URL(data.playbackUrl);
    data.playbackUrl = mediamtxGetUrl(original.search);
  } catch (error) {
    console.warn('Failed to rewrite playback URL, falling back to original', error);
    if (!data.playbackUrl.startsWith(MEDIAMTX_BASE_URL)) {
      data.playbackUrl = `${MEDIAMTX_BASE_URL}/get${new URL(data.playbackUrl, MEDIAMTX_BASE_URL).search}`;
    }
  }

  return data;
};

export interface SegmentFetchResult {
  buffer: ArrayBuffer;
  encoding: string | null;
}

export const fetchSessionSegment = async (sessionId: string, segmentIndex: number): Promise<SegmentFetchResult> => {
  const url = sessionStoreUrl(
    `/sessions/${encodeURIComponent(sessionId)}/segment/${encodeURIComponent(String(segmentIndex))}`
  );
  const response = await fetch(url, {
    headers: {
      Accept: 'application/x-ndjson'
    }
  });

  if (!response.ok) {
    const body = await parseErrorBody(response);
    throw new HttpError(
      response.status,
      body,
      `Failed to fetch segment ${segmentIndex}: ${typeof body === 'string' ? body : JSON.stringify(body)}`
    );
  }

  const buffer = await response.arrayBuffer();
  const encoding = response.headers.get('content-encoding');
  return {
    buffer,
    encoding
  };
};
