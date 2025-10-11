import type { Request, Response } from 'express';
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

const parseIsoDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalised = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalised);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

// POST /detections - Batch insert (metadata only, no frames)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, detections, ts } = req.body;

    // Validate required fields
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid sessionId' });
    }

    if (!Array.isArray(detections) || detections.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid detections array' });
    }

    // Check if session exists
    const session = await db.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Insert detections
    let inserted = 0;
    for (const det of detections) {
      try {
        await db.insertDetection({
          sessionId,
          trackId: det.trackId || '',
          cls: det.cls,
          conf: det.conf,
          bbox: {
            x: det.bbox?.x || 0,
            y: det.bbox?.y || 0,
            w: det.bbox?.w || 0,
            h: det.bbox?.h || 0,
          },
          captureTs: ts || new Date().toISOString(),
        });
        inserted++;
      } catch (err) {
        // Skip duplicates or errors
        console.error('Failed to insert detection:', err);
      }
    }

    return res.status(200).json({ 
      inserted,
      total: detections.length
    });
  } catch (err) {
    console.error('Error in POST /detections:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /detections/session/:sessionId - Get all detections for a session
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    const detections = await db.getDetectionsBySession(sessionId);
    res.json({
      sessionId,
      count: detections.length,
      detections
    });
  } catch (error) {
    console.error('Error fetching detections', error);
    res.status(500).json({ error: 'Failed to fetch detections' });
  }
});

// GET /detections/range - Get detections by time range
router.get('/range', async (req: Request, res: Response) => {
  const { from, to, limit } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Missing from or to query params' });
  }

  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);

  if (!fromDate || !toDate) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  try {
    const parsedLimit = limit ? parseInt(limit as string, 10) : 1000;
    const detections = await db.getDetectionsByTimeRange(fromDate, toDate, parsedLimit);
    
    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      count: detections.length,
      detections
    });
  } catch (error) {
    console.error('Error fetching detections by range', error);
    res.status(500).json({ error: 'Failed to fetch detections' });
  }
});

export { router as detectionsRouter };
