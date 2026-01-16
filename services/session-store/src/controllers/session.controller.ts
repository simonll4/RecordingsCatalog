import { Request, Response, NextFunction } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { SessionService } from '../services/session.service.js';
import {
  OpenSessionRequest,
  CloseSessionRequest,
} from '../types/session.types.js';
import { parseIsoDate, parsePositiveInt } from '../utils/date.utils.js';
import { normalizeSessionId, resolveSessionFile } from '../utils/path.utils.js';

export class SessionController {
  private sessionService: SessionService;

  constructor() {
    this.sessionService = new SessionService();
  }

  /**
   * Open a new session
   */
  async openSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as OpenSessionRequest;
      
      // Validate required fields
      if (!body.sessionId?.trim()) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      
      if (!body.devId?.trim()) {
        res.status(400).json({ error: 'devId is required' });
        return;
      }
      
      if (!body.startTs || !parseIsoDate(body.startTs)) {
        res.status(400).json({ error: 'startTs must be a valid ISO string' });
        return;
      }

      // Support both 'path' and 'streamPath' for compatibility
      const path = body.path || body.streamPath || body.devId;
      const rawConfigured: unknown[] = Array.isArray(body.configuredClasses)
        ? body.configuredClasses
        : Array.isArray((body as any).configured_classes)
        ? (body as any).configured_classes
        : [];

      const configuredClasses = rawConfigured
        .map((cls) => (typeof cls === 'string' ? cls.trim() : ''))
        .filter((cls): cls is string => cls.length > 0);

      const { record, created } = await this.sessionService.createSession({
        sessionId: body.sessionId,
        deviceId: body.devId,
        path: path,
        startTs: body.startTs,
        reason: body.reason,
        configuredClasses,
      });

      res.status(created ? 201 : 200).json(record);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Close an existing session
   */
  async closeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CloseSessionRequest;
      
      if (!body.sessionId?.trim()) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      
      if (!body.endTs || !parseIsoDate(body.endTs)) {
        res.status(400).json({ error: 'endTs must be a valid ISO string' });
        return;
      }

      const postrollSec = parsePositiveInt(body.postrollSec);

      const record = await this.sessionService.closeSession({
        sessionId: body.sessionId,
        endTs: body.endTs,
        postrollSec: postrollSec ?? undefined,
      });

      if (!record) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json(record);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get session by ID
   */
  async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }

      const session = await this.sessionService.getSession(sessionId);
      
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json(session);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List sessions by time range
   * Supports filtering by classes and/or color
   */
  async listSessionsByRange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parsePositiveInt(req.query.limit) || 50;
      const { from, to, classes, color } = req.query;

      const fromDate = parseIsoDate(from);
      const toDate = parseIsoDate(to);
      
      if (!fromDate || !toDate) {
        res.status(400).json({ error: 'from and to query parameters are required and must be valid ISO dates' });
        return;
      }

      // Parse classes filter (comma-separated string or array)
      let classFilter: string[] | undefined;
      if (classes) {
        if (typeof classes === 'string') {
          classFilter = classes.split(',').map(c => c.trim()).filter(Boolean);
        } else if (Array.isArray(classes)) {
          classFilter = classes.map(c => String(c).trim()).filter(Boolean);
        }
      }

      // Parse color filter (single string)
      let colorFilter: string | undefined;
      if (color && typeof color === 'string') {
        colorFilter = color.trim();
      }
      
      const sessions = await this.sessionService.listSessionsByTimeRange(
        fromDate, 
        toDate, 
        classFilter,
        colorFilter,
        limit
      );

      res.json({ 
        from: fromDate,
        to: toDate,
        classes: classFilter,
        color: colorFilter,
        sessions 
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List sessions (all)
   */
  async listSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = parsePositiveInt(req.query.limit) || 50;
      const { classes, color } = req.query;

      let classFilter: string[] | undefined;
      if (classes) {
        if (typeof classes === 'string') {
          classFilter = classes.split(',').map(c => c.trim()).filter(Boolean);
        } else if (Array.isArray(classes)) {
          classFilter = classes.map(c => String(c).trim()).filter(Boolean);
        }
      }

      let colorFilter: string | undefined;
      if (color && typeof color === 'string') {
        colorFilter = color.trim();
      }

      const sessions = await this.sessionService.listSessions(limit, classFilter, colorFilter);

      res.json({ sessions, classes: classFilter, color: colorFilter });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get track meta
   */
  async getTrackMeta(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = normalizeSessionId(req.params.sessionId);
      const trackMeta = await this.sessionService.loadTrackMeta(sessionId);
      
      res.json(trackMeta);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Track meta not found' });
      } else {
        next(error);
      }
    }
  }

  /**
   * Get track index
   */
  async getTrackIndex(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = normalizeSessionId(req.params.sessionId);
      const trackIndex = await this.sessionService.loadTrackIndex(sessionId);
      
      res.json(trackIndex);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Track index not found' });
      } else {
        next(error);
      }
    }
  }

  /**
   * Stream track segment
   */
  async streamSegment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = normalizeSessionId(req.params.sessionId);
      const { segment } = req.params;
      
      if (!segment) {
        res.status(400).json({ error: 'Segment parameter required' });
        return;
      }

      // Segments are stored in a subdirectory
      const segmentPath = resolveSessionFile(sessionId, `tracks/${segment}`);
      const stats = await stat(segmentPath);

      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Length', stats.size.toString());
      
      const stream = createReadStream(segmentPath);
      stream.pipe(res);
      
      stream.on('error', (error: any) => {
        if (!res.headersSent) {
          if (error.code === 'ENOENT') {
            res.status(404).json({ error: 'Segment not found' });
          } else {
            res.status(500).json({ error: 'Failed to read segment' });
          }
        }
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'Segment not found' });
      } else {
        next(error);
      }
    }
  }

}
