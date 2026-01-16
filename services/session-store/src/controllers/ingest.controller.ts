import { Request, Response, NextFunction } from 'express';
import { IngestService } from '../services/ingest.service.js';
import { IngestMetadata } from '../types/detection.types.js';

export class IngestController {
  private ingestService: IngestService;

  constructor() {
    this.ingestService = new IngestService();
  }

  /**
   * Process frame and metadata ingestion
   */
  async processIngest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      
      // Get metadata from multipart
      const metaFile = files?.meta?.[0];
      if (!metaFile) {
        res.status(400).json({ error: 'Missing meta field in multipart request' });
        return;
      }

      // Parse metadata
      let metadata: IngestMetadata;
      try {
        metadata = JSON.parse(metaFile.buffer.toString('utf-8'));
      } catch (error) {
        res.status(400).json({ error: 'Invalid JSON in meta field' });
        return;
      }

      // Validate metadata
      if (!metadata.sessionId) {
        res.status(400).json({ error: 'Missing sessionId in metadata' });
        return;
      }

      if (!Array.isArray(metadata.detections)) {
        res.status(400).json({ error: 'Detections must be an array' });
        return;
      }

      // Get frame if provided
      const frameFile = files?.frame?.[0];
      const frameBuffer = frameFile?.buffer;

      // Process ingestion
      const result = await this.ingestService.processIngest(
        metadata,
        frameBuffer
      );

      res.json({
        sessionId: result.sessionId,
        inserted: result.inserted,
        total: result.total,
        frameSaved: result.frameSaved,
      });
    } catch (error: any) {
      if (error.message === 'Session not found') {
        res.status(404).json({ error: error.message });
      } else {
        next(error);
      }
    }
  }

  /**
   * Get detections for a session
   */
  async getSessionDetections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }

      const detections = await this.ingestService.getSessionDetections(sessionId);
      
      res.json({
        sessionId,
        count: detections.length,
        detections,
      });
    } catch (error) {
      next(error);
    }
  }
}
