import { Pool, PoolClient } from 'pg';
import { CONFIG } from './config.js';

export interface SessionRecord {
  session_id: string;
  device_id: string;
  path: string;
  status: string;
  start_ts: string;
  end_ts: string | null;
  postroll_sec: number | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionInput {
  sessionId: string;
  deviceId: string;
  path: string;
  startTs: string;
  reason?: string;
}

export interface CloseSessionInput {
  sessionId: string;
  endTs: string;
  postrollSec?: number;
}

export interface DetectionRecord {
  id: number;
  session_id: string;
  event_id: string;
  ts: string;
  detection_data: any;
  created_at: string;
}

export interface DetectionInsertInput {
  sessionId: string;
  eventId: string;
  ts: string;
  detections: any;
}

const pool = new Pool({ connectionString: CONFIG.DATABASE_URL });

const tableExists = async (client: PoolClient, tableName: string): Promise<boolean> => {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  return res.rows[0]?.exists ?? false;
};

const columnExists = async (client: PoolClient, columnName: string): Promise<boolean> => {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = $1
     ) AS exists`,
    [columnName]
  );
  return res.rows[0]?.exists ?? false;
};

const ensureSchema = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const hasTable = await tableExists(client, 'sessions');
    if (!hasTable) {
      return;
    }

    await client.query('BEGIN');

    if (!(await columnExists(client, 'path')) && (await columnExists(client, 'stream_path'))) {
      await client.query('ALTER TABLE sessions RENAME COLUMN stream_path TO path');
    }

    if (!(await columnExists(client, 'start_ts'))) {
      await client.query('ALTER TABLE sessions ADD COLUMN start_ts TIMESTAMPTZ');
    }

    if (await columnExists(client, 'edge_start_ts')) {
      await client.query(
        `UPDATE sessions
         SET start_ts = TO_TIMESTAMP(edge_start_ts / 1000.0)
         WHERE edge_start_ts IS NOT NULL AND (start_ts IS NULL OR start_ts = 'epoch')`
      );
    }

    await client.query(
      `UPDATE sessions SET start_ts = created_at
       WHERE start_ts IS NULL`
    );

    await client.query('ALTER TABLE sessions ALTER COLUMN start_ts SET NOT NULL');

    if (!(await columnExists(client, 'end_ts'))) {
      await client.query('ALTER TABLE sessions ADD COLUMN end_ts TIMESTAMPTZ');
    }

    if (await columnExists(client, 'edge_end_ts')) {
      await client.query(
        `UPDATE sessions
         SET end_ts = TO_TIMESTAMP(edge_end_ts / 1000.0)
         WHERE edge_end_ts IS NOT NULL AND end_ts IS NULL`
      );
    }

    if (!(await columnExists(client, 'postroll_sec'))) {
      await client.query('ALTER TABLE sessions ADD COLUMN postroll_sec INTEGER');
    }

    if (!(await columnExists(client, 'reason'))) {
      await client.query('ALTER TABLE sessions ADD COLUMN reason TEXT');
    }

    await client.query('ALTER TABLE sessions DROP COLUMN IF EXISTS edge_start_ts');
    await client.query('ALTER TABLE sessions DROP COLUMN IF EXISTS edge_end_ts');
    await client.query('ALTER TABLE sessions DROP COLUMN IF EXISTS playlist_url');
    await client.query('ALTER TABLE sessions DROP COLUMN IF EXISTS notes');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const db = {
  ensureSchema,
  async healthCheck(): Promise<boolean> {
    try {
      const res = await pool.query('SELECT 1');
      return res.rowCount === 1;
    } catch (error) {
      console.error('Database health check failed', error);
      return false;
    }
  },

  async close(): Promise<void> {
    await pool.end();
  },

  async createSession(input: CreateSessionInput): Promise<{ record: SessionRecord; created: boolean }> {
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

    const existing = await db.getSession(sessionId);
    if (!existing) {
      throw new Error(`Session ${sessionId} was not inserted and could not be fetched`);
    }
    return { record: existing, created: false };
  },

  async closeSession(input: CloseSessionInput): Promise<SessionRecord | null> {
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
  },

  async listSessions(limit = 50): Promise<SessionRecord[]> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       ORDER BY start_ts DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async listSessionsByTimeRange(from: Date, to: Date, limit = 200): Promise<SessionRecord[]> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       WHERE start_ts < $2
         AND (end_ts IS NULL OR end_ts >= $1)
       ORDER BY start_ts DESC
       LIMIT $3`,
      [from.toISOString(), to.toISOString(), limit]
    );
    return result.rows;
  },

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions WHERE session_id = $1`,
      [sessionId]
    );
    return result.rows[0] ?? null;
  },

  async insertDetection(input: DetectionInsertInput): Promise<DetectionRecord> {
    const { sessionId, eventId, ts, detections } = input;
    const result = await pool.query<DetectionRecord>(
      `INSERT INTO detections (session_id, event_id, ts, detection_data)
       VALUES ($1, $2, $3::timestamptz, $4::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING *`,
      [sessionId, eventId, ts, JSON.stringify(detections)]
    );
    return result.rows[0];
  },

  async getDetectionsBySession(sessionId: string): Promise<DetectionRecord[]> {
    const result = await pool.query<DetectionRecord>(
      `SELECT * FROM detections
       WHERE session_id = $1
       ORDER BY ts ASC`,
      [sessionId]
    );
    return result.rows;
  },

  async getDetectionsByTimeRange(from: Date, to: Date, limit = 1000): Promise<DetectionRecord[]> {
    const result = await pool.query<DetectionRecord>(
      `SELECT * FROM detections
       WHERE ts >= $1 AND ts < $2
       ORDER BY ts ASC
       LIMIT $3`,
      [from.toISOString(), to.toISOString(), limit]
    );
    return result.rows;
  }
};
