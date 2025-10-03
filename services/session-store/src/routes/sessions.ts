import type { Request, Response } from 'express';
import { Router } from 'express';
import { db } from '../db.js';
import { CONFIG } from '../config.js';

const router = Router();

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

router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const session = await db.getSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(serializeSession(session));
  } catch (error) {
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
    playbackBase.searchParams.set('start', startDate.toISOString());
    playbackBase.searchParams.set('duration', `${totalSeconds}s`);
    playbackBase.searchParams.set('format', format);

    res.json({
      sessionId,
      playbackUrl: playbackBase.toString(),
      start: startDate.toISOString(),
      durationSeconds: totalSeconds,
      format
    });
  } catch (error) {
    console.error('Failed to build playback clip URL', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as sessionsRouter };
