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

// POST /detections - Batch insert
router.post('/', async (req: Request, res: Response) => {
  const { batchId, sessionId, sourceTs, items } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid sessionId' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid items array' });
  }

  try {
    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.eventId || !item.ts || !item.detections) {
        skipped++;
        continue;
      }

      try {
        const result = await db.insertDetection({
          sessionId,
          eventId: item.eventId,
          ts: item.ts,
          detections: item.detections
        });

        if (result) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        // Conflict en event_id (duplicate)
        if (err.code === '23505') {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    res.status(201).json({
      batchId,
      sessionId,
      inserted,
      skipped,
      total: items.length
    });
  } catch (error) {
    console.error('Error inserting detections batch', error);
    res.status(500).json({ error: 'Failed to insert detections' });
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
