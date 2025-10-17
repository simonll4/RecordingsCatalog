import type { Request, Response } from 'express';
import { Router } from 'express';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { db } from '../db.js';
import { CONFIG } from '../config.js';

const router = Router();

type TrackSegment = {
  i: number;
  t0: number;
  t1: number;
  url: string;
  count: number;
  closed?: boolean;
};

type TrackIndex = {
  segment_duration_s: number;
  segments: TrackSegment[];
  fps: number;
  duration_s: number;
};

const TRACKS_BASE_DIR = path.resolve(CONFIG.TRACKS_STORAGE_PATH);

const ensureWithinBase = (baseDir: string, target: string, errorMessage: string) => {
  const relative = path.relative(baseDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(errorMessage);
  }
};

const normalizeSessionId = (raw: unknown): string => {
  if (typeof raw !== 'string') {
    throw new Error('sessionId is required');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('sessionId is required');
  }
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Invalid sessionId');
  }
  return trimmed;
};

const resolveSessionDir = (sessionId: string): string => {
  const dir = path.resolve(TRACKS_BASE_DIR, sessionId);
  ensureWithinBase(TRACKS_BASE_DIR, dir, 'Invalid session directory');
  return dir;
};

const resolveSessionFile = (sessionId: string, relativePath: string): string => {
  const sessionDir = resolveSessionDir(sessionId);
  const resolved = path.resolve(sessionDir, relativePath);
  ensureWithinBase(sessionDir, resolved, 'Invalid session file path');
  return resolved;
};

const readJsonFile = async <T>(fullPath: string): Promise<T> => {
  const contents = await readFile(fullPath, 'utf-8');
  return JSON.parse(contents) as T;
};

const loadTrackIndex = async (sessionId: string): Promise<TrackIndex> => {
  const indexPath = resolveSessionFile(sessionId, 'index.json');
  return await readJsonFile<TrackIndex>(indexPath);
};

const attachSessionCacheHeaders = (res: Response, maxAgeSeconds: number): void => {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
};

const isErrnoException = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' && error !== null && Object.prototype.hasOwnProperty.call(error, 'code');

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
};

const normaliseTimestamp = (value: string): string =>
  value.includes('T') ? value : value.replace(' ', 'T');

const parseIsoDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalised = normaliseTimestamp(value);
  const parsed = new Date(normalised);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const serializeSession = (session: any) => {
  const toIso = (val: unknown): string | null => {
    if (typeof val !== 'string' || val.trim().length === 0) {
      return null;
    }
    const date = parseIsoDate(val);
    return date ? date.toISOString() : val;
  };

  return {
    ...session,
    start_ts: toIso(session.start_ts) ?? session.start_ts,
    end_ts: toIso(session.end_ts) ?? session.end_ts,
  };
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const limitParam = req.query.limit;
    const limit = parsePositiveInt(limitParam) ?? 50;
    const sessions = await db.listSessions(limit);
    res.json({ sessions: sessions.map(serializeSession) });
  } catch (error) {
    console.error('Failed to list sessions', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/range', async (req: Request, res: Response) => {
  try {
    const { from, to, limit } = req.query;
    const fromDate = parseIsoDate(from);

    if (!fromDate) {
      return res.status(400).json({ error: 'from query parameter is required (ISO string)' });
    }

    let toDate = parseIsoDate(to);
    if (!toDate) {
      toDate = new Date(fromDate.getTime() + 60 * 60 * 1000);
    }

    if (toDate.getTime() <= fromDate.getTime()) {
      return res.status(400).json({ error: 'to must be greater than from' });
    }

    const safeLimit = Math.min(parsePositiveInt(limit) ?? 200, 500);
    const sessions = await db.listSessionsByTimeRange(fromDate, toDate, safeLimit);

    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      sessions: sessions.map(serializeSession)
    });
  } catch (error) {
    console.error('Failed to list sessions by range', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:sessionId/meta', async (req: Request, res: Response) => {
  try {
    const sessionId = normalizeSessionId(req.params.sessionId);
    const metaPath = resolveSessionFile(sessionId, 'meta.json');
    const meta = await readJsonFile<Record<string, any>>(metaPath);
    const session = await db.getSession(sessionId);

    if (session) {
      const sessionPath = typeof session.path === 'string' ? session.path : undefined;
      if (sessionPath && sessionPath.trim().length > 0) {
        meta.path = sessionPath;
      }

      if (!meta.start_time && typeof session.start_ts === 'string') {
        meta.start_time = session.start_ts;
      }
      if (!meta.end_time && typeof session.end_ts === 'string') {
        meta.end_time = session.end_ts;
      }
    }

    attachSessionCacheHeaders(res, 30);
    res.json(meta);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Session meta not found' });
    }
    if (error instanceof Error && (error.message === 'sessionId is required' || error.message.startsWith('Invalid session'))) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to load session meta', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:sessionId/index', async (req: Request, res: Response) => {
  try {
    const sessionId = normalizeSessionId(req.params.sessionId);
    const index = await loadTrackIndex(sessionId);
    attachSessionCacheHeaders(res, 30);
    res.json(index);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Session index not found' });
    }
    if (error instanceof Error && (error.message === 'sessionId is required' || error.message.startsWith('Invalid session'))) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to load session index', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:sessionId/segment/:segmentId', async (req: Request, res: Response) => {
  try {
    const sessionId = normalizeSessionId(req.params.sessionId);
    const segmentId = Number.parseInt(req.params.segmentId, 10);

    if (!Number.isFinite(segmentId) || segmentId < 0) {
      return res.status(400).json({ error: 'segmentId must be a non-negative integer' });
    }

    const index = await loadTrackIndex(sessionId);
    const segment = index.segments.find((entry) => entry.i === segmentId);

    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }

    const segmentPath = resolveSessionFile(sessionId, segment.url);
    const stats = await stat(segmentPath);

    res.setHeader('Content-Type', 'application/x-ndjson');
    const lowerPath = segmentPath.toLowerCase();
    if (lowerPath.endsWith('.gz')) {
      res.setHeader('Content-Encoding', 'gzip');
    } else if (lowerPath.endsWith('.zst')) {
      res.setHeader('Content-Encoding', 'zstd');
    }

    if (segment.closed === true) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=5');
    }

    res.setHeader('Content-Length', stats.size.toString());
    res.setHeader('Accept-Ranges', 'bytes');

    const stream = createReadStream(segmentPath);
    stream.on('error', (streamError) => {
      console.error('Failed while streaming segment', streamError);
      res.destroy(streamError as Error);
    });
    stream.pipe(res);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Segment file not found' });
    }
    if (error instanceof Error && (error.message === 'sessionId is required' || error.message.startsWith('Invalid session'))) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to stream segment', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const sessionId = normalizeSessionId(req.params.sessionId);
    const session = await db.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(serializeSession(session));
  } catch (error) {
    if (error instanceof Error && (error.message === 'sessionId is required' || error.message.startsWith('Invalid session'))) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Failed to get session', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/open', async (req: Request, res: Response) => {
  try {
    const { sessionId, devId, startTs, path, reason } = req.body ?? {};

    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (typeof devId !== 'string' || devId.trim().length === 0) {
      return res.status(400).json({ error: 'devId is required' });
    }
    if (typeof startTs !== 'string' || !parseIsoDate(startTs)) {
      return res.status(400).json({ error: 'startTs must be a valid ISO string' });
    }

    const streamPath = typeof path === 'string' && path.trim().length > 0 ? path : devId;

    const { record, created } = await db.createSession({
      sessionId,
      deviceId: devId,
      path: streamPath,
      startTs,
      reason
    });

    const statusCode = created ? 201 : 200;
    res.status(statusCode).json(record);
  } catch (error) {
    console.error('Failed to open session', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/close', async (req: Request, res: Response) => {
  try {
    const { sessionId, endTs, postrollSec } = req.body ?? {};

    if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (typeof endTs !== 'string' || !parseIsoDate(endTs)) {
      return res.status(400).json({ error: 'endTs must be a valid ISO string' });
    }

    const postrollValue = parsePositiveInt(postrollSec);

    const record = await db.closeSession({
      sessionId,
      endTs,
      postrollSec: postrollValue ?? undefined
    });

    if (!record) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(record);
  } catch (error) {
    console.error('Failed to close session', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:sessionId/clip', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const format = typeof req.query.format === 'string' && req.query.format.trim().length > 0
      ? req.query.format
      : 'mp4';

    const session = await db.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (!session.end_ts) {
      return res.status(409).json({ error: 'Session is still open' });
    }

    const startDate = parseIsoDate(session.start_ts);
    const endDate = parseIsoDate(session.end_ts);
    if (!startDate || !endDate) {
      return res.status(500).json({ error: 'Session timestamps are invalid' });
    }

    // Aplicar offset al timestamp de inicio para compensar delay entre stream.started
    // y el primer GOP escrito por MediaMTX. Esto evita 404 cuando el start_ts cae
    // antes del primer segmento disponible.
    const playbackStartDate = new Date(startDate.getTime() + CONFIG.PLAYBACK_START_OFFSET_MS);

    const durationMs = Math.max(0, endDate.getTime() - startDate.getTime());
    const baseSeconds = Math.ceil(durationMs / 1000);
    const marginSeconds = CONFIG.PLAYBACK_EXTRA_SECONDS;
    const postrollSeconds = session.postroll_sec ?? 0;
    const extraSeconds = Math.max(marginSeconds, postrollSeconds, 0);
    const totalSeconds = Math.max(1, baseSeconds + extraSeconds);

    let playbackBase: URL;
    try {
      playbackBase = new URL(CONFIG.MEDIAMTX_PLAYBACK_BASE_URL);
    } catch (error) {
      console.error('Invalid MediaMTX playback base URL', error);
      return res.status(500).json({ error: 'Playback server misconfigured' });
    }

    playbackBase.pathname = '/get';
    playbackBase.searchParams.set('path', session.path);
    playbackBase.searchParams.set('start', playbackStartDate.toISOString());
    playbackBase.searchParams.set('duration', `${totalSeconds}s`);
    playbackBase.searchParams.set('format', format);

    res.json({
      sessionId,
      playbackUrl: playbackBase.toString(),
      start: playbackStartDate.toISOString(),
      durationSeconds: totalSeconds,
      format
    });
  } catch (error) {
    console.error('Failed to build playback clip URL', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as sessionsRouter };
