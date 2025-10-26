import { promises as fs } from 'fs';
import path from 'path';
import { DetectionRepository } from '../database/repositories/detection.repository.js';
import { SessionRepository } from '../database/repositories/session.repository.js';
import {
  DetectionRecord,
  IngestMetadata,
} from '../types/detection.types.js';
import { getFramesDir } from '../utils/path.utils.js';
import { CONFIG } from '../config/config.js';

export class IngestService {
  private detectionRepository: DetectionRepository;
  private sessionRepository: SessionRepository;

  constructor() {
    this.detectionRepository = new DetectionRepository();
    this.sessionRepository = new SessionRepository();
  }

  /**
   * Initialize frames directory
   */
  async initFramesDirectory(): Promise<void> {
    await fs.mkdir(CONFIG.FRAMES_STORAGE_PATH, { recursive: true });
  }

  /**
   * Process frame ingestion with detections
   */
  async processIngest(
    metadata: IngestMetadata,
    frameBuffer?: Buffer
  ): Promise<{
    sessionId: string;
    inserted: number;
    total: number;
    frameSaved: boolean;
  }> {
    const { sessionId, seqNo, captureTs, detections } = metadata;

    // Verify session exists
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Save frame if provided
    let frameSaved = false;
    let frameUrl: string | undefined;

    if (frameBuffer && frameBuffer.length > 0) {
      const sessionFramesDir = getFramesDir(sessionId);
      await fs.mkdir(sessionFramesDir, { recursive: true });
      
      const framePath = path.join(sessionFramesDir, `frame_${seqNo}.jpg`);
      await fs.writeFile(framePath, frameBuffer);
      
      frameUrl = `/frames/${sessionId}/frame_${seqNo}.jpg`;
      frameSaved = true;
    }

    // Get existing detections to check for updates
    const existingDetections = await this.detectionRepository.findBySession(sessionId);
    const existingTrackIds = new Set(existingDetections.map(d => d.track_id));

    // Process detections
    let inserted = 0;
    for (const detection of detections) {
      // Only insert/update if this is a new detection or confidence is better
      const shouldUpdate = !existingTrackIds.has(detection.trackId) ||
        existingDetections.find(d => d.track_id === detection.trackId && d.conf < detection.conf);

      if (shouldUpdate) {
        try {
          const result = await this.detectionRepository.insert({
            sessionId,
            trackId: detection.trackId,
            cls: detection.cls,
            conf: detection.conf,
            bbox: detection.bbox,
            captureTs,
            urlFrame: frameUrl,
          });
          
          if (result) {
            inserted++;
          }
        } catch (error) {
          console.error('Failed to insert/update detection:', error);
        }
      }
    }

    return {
      sessionId,
      inserted,
      total: detections.length,
      frameSaved,
    };
  }

  /**
   * Get detections for a session
   */
  async getSessionDetections(sessionId: string): Promise<DetectionRecord[]> {
    return this.detectionRepository.findBySession(sessionId);
  }
}
