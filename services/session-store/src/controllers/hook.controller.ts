import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service.js';
import {
  MediaMTXPublishHook,
  MediaMTXRecordSegmentCompleteHook,
} from '../types/hook.types.js';

export class HookController {
  private sessionService: SessionService;

  constructor() {
    this.sessionService = new SessionService();
  }

  /**
   * Handle MediaMTX publish event
   */
  async handlePublish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as MediaMTXPublishHook;

      if (!body.path || !body.eventTs) {
        res.status(400).json({ error: 'Missing required fields: path, eventTs' });
        return;
      }

      // Find open session for this path
      const session = await this.sessionService.findOpenSessionByPath(body.path);
      if (!session) {
        console.warn(`[hook:publish] No open session found for path: ${body.path}`);
        res.json({ status: 'no_session' });
        return;
      }

      // Update media timestamps
      await this.sessionService.updateMediaTimestamps(session.session_id, {
        connectTs: body.eventTs,
      });
      
      // Set default offset to avoid 404 on first GOP
      await this.sessionService.setRecommendedStartOffset(session.session_id, 200);

      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'hook:publish',
        session_id: session.session_id,
        path: body.path,
        eventTs: body.eventTs,
      }));

      res.json({ 
        status: 'ok', 
        session_id: session.session_id 
      });
    } catch (error) {
      console.error('[hook:publish] Error:', error);
      next(error);
    }
  }

  /**
   * Handle MediaMTX record segment complete event
   */
  async handleRecordSegmentComplete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as MediaMTXRecordSegmentCompleteHook;

      if (!body.path || !body.segmentPath) {
        res.status(400).json({ error: 'Missing required fields: path, segmentPath' });
        return;
      }

      // Find session for this path (open or recently closed)
      // Allow updating closed sessions for up to 60 seconds after they close
      let session = await this.sessionService.findOpenSessionByPath(body.path);
      
      if (!session) {
        // Try to find recently closed session (within last 60 seconds)
        session = await this.sessionService.findRecentlyClosedSessionByPath(body.path, 60);
      }
      
      if (!session) {
        console.warn(`[hook:segment_complete] No session found for path: ${body.path}`);
        res.json({ status: 'no_session' });
        return;
      }

      // Update media timestamps
      // Use segmentStartTs for media_start_ts if it's the first segment
      // Always update media_end_ts with current eventTs (when segment finishes)
      const timestamps: { startTs?: string; endTs?: string } = {};
      
      if (body.segmentStartTs) {
        timestamps.startTs = body.segmentStartTs;
      }
      
      // Use eventTs as the end timestamp (when the segment completed)
      if (body.eventTs) {
        timestamps.endTs = body.eventTs;
      }

      if (Object.keys(timestamps).length > 0) {
        await this.sessionService.updateMediaTimestamps(session.session_id, timestamps);
      }

      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'hook:segment_complete',
        session_id: session.session_id,
        path: body.path,
        segmentPath: body.segmentPath,
        segmentStartTs: body.segmentStartTs,
        eventTs: body.eventTs,
      }));

      res.json({ 
        status: 'ok', 
        session_id: session.session_id 
      });
    } catch (error) {
      console.error('[hook:segment_complete] Error:', error);
      next(error);
    }
  }
}
