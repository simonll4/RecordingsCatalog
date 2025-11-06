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
  private static readonly UNKNOWN_TRACK_PLACEHOLDER = 'unknown';

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
    const { sessionId, captureTs, detections } = metadata;

    // Verify session exists
    const session = await this.sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const hasFrameBuffer = Boolean(frameBuffer && frameBuffer.length > 0);
    let frameSaved = false;

    // Get existing detections to check for updates
    const existingDetections = await this.detectionRepository.findBySession(sessionId);
    const existingByTrackId = new Map(existingDetections.map(d => [d.track_id, d]));

    const sessionFrameDir = hasFrameBuffer ? getFramesDir(sessionId) : null;
    const framesToWrite: Array<{ path: string; buffer: Buffer }> = [];

    // Track new classes detected in this frame
    const newClassesInFrame = new Set<string>();

    const updates: Array<{
      detection: IngestMetadata['detections'][number];
      frameUrl?: string;
    }> = [];

    // Process detections
    for (const detection of detections) {
      // Track class for session summary
      newClassesInFrame.add(detection.cls);

      const existingDetection = existingByTrackId.get(detection.trackId);
      const isNewDetection = !existingDetection;
      const hasBetterConfidence =
        existingDetection ? detection.conf > existingDetection.conf : false;
      const shouldUpdate = isNewDetection || hasBetterConfidence;

      if (shouldUpdate) {
        let frameUrl: string | undefined;

        if (hasFrameBuffer && sessionFrameDir) {
          const filename = this.buildTrackFrameFilename(detection.trackId);
          const framePath = path.join(sessionFrameDir, filename);
          // Only add to write queue if we should update (better confidence or new)
          framesToWrite.push({ path: framePath, buffer: frameBuffer as Buffer });
          frameUrl = `/frames/${sessionId}/${filename}`;
        }

        updates.push({ detection, frameUrl });
      }
    }

    if (framesToWrite.length > 0 && sessionFrameDir) {
      await fs.mkdir(sessionFrameDir, { recursive: true });
      await Promise.all(
        framesToWrite.map(({ path, buffer }) =>
          fs.writeFile(path, buffer)
        )
      );
      frameSaved = true;
    }

    let inserted = 0;
    for (const { detection, frameUrl } of updates) {
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

    // Update session with new detected classes (as a Set)
    for (const className of newClassesInFrame) {
      try {
        await this.sessionRepository.addDetectedClass(sessionId, className);
      } catch (error) {
        console.error('Failed to add detected class to session:', error);
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

  private buildTrackFrameFilename(trackId: string | number): string {
    const safeId =
      String(trackId).replace(/[^a-zA-Z0-9-_]/g, '_') ||
      IngestService.UNKNOWN_TRACK_PLACEHOLDER;
    return `track_${safeId}.jpg`;
  }
}
