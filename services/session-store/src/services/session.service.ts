import { readFile } from 'fs/promises';
import { SessionRepository } from '../database/repositories/session.repository.js';
import {
  SessionRecord,
  CreateSessionInput,
  CloseSessionInput,
  TrackIndex,
} from '../types/session.types.js';
import { resolveSessionFile } from '../utils/path.utils.js';

export class SessionService {
  private sessionRepository: SessionRepository;

  constructor() {
    this.sessionRepository = new SessionRepository();
  }

  /**
   * Create a new session
   */
  async createSession(input: CreateSessionInput): Promise<{ record: SessionRecord; created: boolean }> {
    return this.sessionRepository.create(input);
  }

  /**
   * Close an existing session
   */
  async closeSession(input: CloseSessionInput): Promise<SessionRecord | null> {
    return this.sessionRepository.close(input);
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionRecord | null> {
    return this.sessionRepository.findById(sessionId);
  }

  /**
   * List all sessions
   */
  async listSessions(limit?: number): Promise<SessionRecord[]> {
    return this.sessionRepository.list(limit);
  }

  /**
   * List sessions by time range
   * Optionally filter by classes and/or color
   */
  async listSessionsByTimeRange(
    from: Date, 
    to: Date, 
    classes?: string[], 
    color?: string,
    limit?: number
  ): Promise<SessionRecord[]> {
    // Filter by both classes and color
    if (classes && classes.length > 0 && color) {
      return this.sessionRepository.listByTimeRangeClassesAndColor(from, to, classes, color, limit);
    }
    
    // Filter by color only
    if (color) {
      return this.sessionRepository.listByTimeRangeAndColor(from, to, color, limit);
    }
    
    // Filter by classes only
    if (classes && classes.length > 0) {
      return this.sessionRepository.listByTimeRangeAndClasses(from, to, classes, limit);
    }
    
    // No filters
    return this.sessionRepository.listByTimeRange(from, to, limit);
  }

  /**
   * Find open session by path
   */
  async findOpenSessionByPath(path: string): Promise<SessionRecord | null> {
    return this.sessionRepository.findOpenByPath(path);
  }

  /**
   * Find recently closed session by path
   */
  async findRecentlyClosedSessionByPath(path: string, withinSeconds: number): Promise<SessionRecord | null> {
    return this.sessionRepository.findRecentlyClosedByPath(path, withinSeconds);
  }

  /**
   * Update media timestamps
   */
  async updateMediaTimestamps(
    sessionId: string,
    timestamps: {
      connectTs?: string;
      startTs?: string;
      endTs?: string;
    }
  ): Promise<void> {
    if (timestamps.connectTs) {
      await this.sessionRepository.updateMediaConnectTs(sessionId, timestamps.connectTs);
    }
    if (timestamps.startTs) {
      await this.sessionRepository.updateMediaStartTs(sessionId, timestamps.startTs);
    }
    if (timestamps.endTs) {
      await this.sessionRepository.updateMediaEndTs(sessionId, timestamps.endTs);
    }
  }

  /**
   * Set recommended start offset
   */
  async setRecommendedStartOffset(sessionId: string, offsetMs: number): Promise<void> {
    await this.sessionRepository.setRecommendedStartOffsetIfNull(sessionId, offsetMs);
  }

  /**
   * Load track meta for a session
   */
  async loadTrackMeta(sessionId: string): Promise<any> {
    const metaPath = resolveSessionFile(sessionId, 'meta.json');
    const contents = await readFile(metaPath, 'utf-8');
    return JSON.parse(contents);
  }

  /**
   * Load track index for a session
   */
  async loadTrackIndex(sessionId: string): Promise<TrackIndex> {
    const indexPath = resolveSessionFile(sessionId, 'index.json');
    const contents = await readFile(indexPath, 'utf-8');
    return JSON.parse(contents) as TrackIndex;
  }
}
