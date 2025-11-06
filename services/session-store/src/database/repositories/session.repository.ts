import { pool } from '../connection.js';
import {
  SessionRecord,
  CreateSessionInput,
  CloseSessionInput,
} from '../../types/session.types.js';

export class SessionRepository {
  async create(input: CreateSessionInput): Promise<{ record: SessionRecord; created: boolean }> {
    const { sessionId, deviceId, path, startTs, reason } = input;
    
    const result = await pool.query<SessionRecord>(
      `INSERT INTO sessions (session_id, device_id, path, start_ts, reason, status)
       VALUES ($1, $2, $3, $4::timestamptz, $5, 'open')
       ON CONFLICT (session_id) DO NOTHING
       RETURNING *`,
      [sessionId, deviceId, path, startTs, reason ?? null]
    );

    if (result.rows[0]) {
      return { record: result.rows[0], created: true };
    }

    // Session already exists, fetch it
    const existing = await this.findById(sessionId);
    if (!existing) {
      throw new Error(`Session ${sessionId} was not inserted and could not be fetched`);
    }
    return { record: existing, created: false };
  }

  async close(input: CloseSessionInput): Promise<SessionRecord | null> {
    const { sessionId, endTs, postrollSec } = input;
    
    const result = await pool.query<SessionRecord>(
      `UPDATE sessions
       SET status = 'closed',
           end_ts = $2::timestamptz,
           postroll_sec = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, endTs, postrollSec ?? null]
    );

    return result.rows[0] ?? null;
  }

  async findById(sessionId: string): Promise<SessionRecord | null> {
    const result = await pool.query<SessionRecord>(
      'SELECT * FROM sessions WHERE session_id = $1',
      [sessionId]
    );
    return result.rows[0] ?? null;
  }

  async findOpenByPath(path: string): Promise<SessionRecord | null> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       WHERE (path = $1 OR (path IS NULL AND device_id = $1))
         AND end_ts IS NULL
       ORDER BY start_ts DESC
       LIMIT 1`,
      [path]
    );
    return result.rows[0] ?? null;
  }

  async findRecentlyClosedByPath(path: string, withinSeconds: number): Promise<SessionRecord | null> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       WHERE (path = $1 OR (path IS NULL AND device_id = $1))
         AND end_ts IS NOT NULL
         AND end_ts > NOW() - INTERVAL '1 second' * $2
       ORDER BY end_ts DESC
       LIMIT 1`,
      [path, withinSeconds]
    );
    return result.rows[0] ?? null;
  }

  async list(limit = 50): Promise<SessionRecord[]> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       ORDER BY start_ts DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async listByTimeRange(from: Date, to: Date, limit = 200): Promise<SessionRecord[]> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       WHERE start_ts < $2
         AND (end_ts IS NULL OR end_ts >= $1)
       ORDER BY start_ts DESC
       LIMIT $3`,
      [from.toISOString(), to.toISOString(), limit]
    );
    return result.rows;
  }

  async listByTimeRangeAndClasses(
    from: Date, 
    to: Date, 
    classes: string[], 
    limit = 200
  ): Promise<SessionRecord[]> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       WHERE start_ts < $2
         AND (end_ts IS NULL OR end_ts >= $1)
         AND detected_classes @> $3::text[]
         AND array_length(detected_classes, 1) > 0
       ORDER BY start_ts DESC
       LIMIT $4`,
      [from.toISOString(), to.toISOString(), classes, limit]
    );
    return result.rows;
  }

  async addDetectedClass(sessionId: string, className: string): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET detected_classes = array_append(detected_classes, $2)
       WHERE session_id = $1 
         AND NOT ($2 = ANY(detected_classes))`,
      [sessionId, className]
    );
  }

  async updateMediaConnectTs(sessionId: string, connectTs: string): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET media_connect_ts = $2::timestamptz
       WHERE session_id = $1 AND media_connect_ts IS NULL`,
      [sessionId, connectTs]
    );
  }

  async updateMediaStartTs(sessionId: string, startTs: string): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET media_start_ts = $2::timestamptz
       WHERE session_id = $1 AND media_start_ts IS NULL`,
      [sessionId, startTs]
    );
  }

  async updateMediaEndTs(sessionId: string, endTs: string): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET media_end_ts = GREATEST(COALESCE(media_end_ts, $2::timestamptz), $2::timestamptz)
       WHERE session_id = $1`,
      [sessionId, endTs]
    );
  }

  async setRecommendedStartOffsetIfNull(sessionId: string, offsetMs: number): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET recommended_start_offset_ms = $2
       WHERE session_id = $1 AND recommended_start_offset_ms IS NULL`,
      [sessionId, offsetMs]
    );
  }
}
