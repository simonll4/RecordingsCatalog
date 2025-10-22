import { Pool, PoolClient } from "pg";
import { CONFIG } from "./config.js";

export interface SessionRecord {
  session_id: string;
  device_id: string;
  path: string;
  status: string;
  start_ts: string;
  end_ts: string | null;
  postroll_sec: number | null;
  media_connect_ts: string | null;
  media_start_ts: string | null;
  media_end_ts: string | null;
  recommended_start_offset_ms: number | null;
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
  session_id: string;
  track_id: string;
  cls: string;
  conf: number;
  bbox: any; // {x, y, w, h}
  url_frame: string | null;
  first_ts: string;
  last_ts: string;
  capture_ts: string;
  ingest_ts: string;
  created_at: string;
  updated_at: string;
}

export interface DetectionInsertInput {
  sessionId: string;
  trackId: string;
  cls: string;
  conf: number;
  bbox: { x: number; y: number; w: number; h: number };
  captureTs: string;
  urlFrame?: string;
}

const pool = new Pool({ connectionString: CONFIG.DATABASE_URL });

const tableExists = async (
  client: PoolClient,
  tableName: string
): Promise<boolean> => {
  const res = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  return res.rows[0]?.exists ?? false;
};

const columnExists = async (
  client: PoolClient,
  columnName: string
): Promise<boolean> => {
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
    await client.query("BEGIN");

    // Crear extensión UUID
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Crear tabla sessions si no existe
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        start_ts TIMESTAMPTZ NOT NULL,
        end_ts TIMESTAMPTZ,
        postroll_sec INTEGER,
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear función de trigger para updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION trg_update_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Trigger para sessions
    await client.query(
      "DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions"
    );
    await client.query(`
      CREATE TRIGGER trg_sessions_updated_at
      BEFORE UPDATE ON sessions
      FOR EACH ROW
      EXECUTE FUNCTION trg_update_timestamp()
    `);

    // Crear tabla detections (nueva estructura con PK compuesta)
    await client.query(`
      CREATE TABLE IF NOT EXISTS detections (
        session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
        track_id TEXT NOT NULL,
        cls TEXT NOT NULL,
        conf NUMERIC NOT NULL CHECK (conf >= 0 AND conf <= 1),
        bbox JSONB NOT NULL,
        url_frame TEXT,
        first_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        capture_ts TIMESTAMPTZ NOT NULL,
        ingest_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, track_id)
      )
    `);

    // Índices para detections
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_detections_last_ts ON detections(last_ts)"
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_detections_cls ON detections(cls)"
    );

    // Trigger para detections
    await client.query(
      "DROP TRIGGER IF EXISTS trg_detections_updated_at ON detections"
    );
    await client.query(`
      CREATE TRIGGER trg_detections_updated_at
      BEFORE UPDATE ON detections
      FOR EACH ROW
      EXECUTE FUNCTION trg_update_timestamp()
    `);

    // Migraciones incrementales de sessions (si existen columnas viejas)
    const hasTable = await tableExists(client, "sessions");
    if (hasTable) {
      if (
        !(await columnExists(client, "path")) &&
        (await columnExists(client, "stream_path"))
      ) {
        await client.query(
          "ALTER TABLE sessions RENAME COLUMN stream_path TO path"
        );
      }

      if (await columnExists(client, "edge_start_ts")) {
        await client.query(
          `UPDATE sessions
           SET start_ts = TO_TIMESTAMP(edge_start_ts / 1000.0)
           WHERE edge_start_ts IS NOT NULL AND (start_ts IS NULL OR start_ts = 'epoch')`
        );
      }

      if (await columnExists(client, "edge_end_ts")) {
        await client.query(
          `UPDATE sessions
           SET end_ts = TO_TIMESTAMP(edge_end_ts / 1000.0)
           WHERE edge_end_ts IS NOT NULL AND end_ts IS NULL`
        );
      }

      // Limpiar columnas obsoletas
      await client.query(
        "ALTER TABLE sessions DROP COLUMN IF EXISTS edge_start_ts"
      );
      await client.query(
        "ALTER TABLE sessions DROP COLUMN IF EXISTS edge_end_ts"
      );
      await client.query(
        "ALTER TABLE sessions DROP COLUMN IF EXISTS playlist_url"
      );
      await client.query("ALTER TABLE sessions DROP COLUMN IF EXISTS notes");

      // Agregar columnas de sincronización temporal si no existen
      await client.query(
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS media_connect_ts TIMESTAMPTZ"
      );
      await client.query(
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS media_start_ts TIMESTAMPTZ"
      );
      await client.query(
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS media_end_ts TIMESTAMPTZ"
      );
      await client.query(
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recommended_start_offset_ms INTEGER"
      );

      // Índices para búsquedas de hooks
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_sessions_path_open ON sessions(path) WHERE end_ts IS NULL"
      );
      await client.query(
        "CREATE INDEX IF NOT EXISTS idx_sessions_path_timestamps ON sessions(path, start_ts, end_ts)"
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const db = {
  ensureSchema,
  async healthCheck(): Promise<boolean> {
    try {
      const res = await pool.query("SELECT 1");
      return res.rowCount === 1;
    } catch (error) {
      console.error("Database health check failed", error);
      return false;
    }
  },

  async close(): Promise<void> {
    await pool.end();
  },

  async createSession(
    input: CreateSessionInput
  ): Promise<{ record: SessionRecord; created: boolean }> {
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
      throw new Error(
        `Session ${sessionId} was not inserted and could not be fetched`
      );
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

  async listSessionsByTimeRange(
    from: Date,
    to: Date,
    limit = 200
  ): Promise<SessionRecord[]> {
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

  async insertDetection(
    input: DetectionInsertInput
  ): Promise<DetectionRecord | null> {
    const { sessionId, trackId, cls, conf, bbox, captureTs, urlFrame } = input;
    const result = await pool.query<DetectionRecord>(
      `INSERT INTO detections (session_id, track_id, cls, conf, bbox, capture_ts, url_frame, first_ts, last_ts)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, $7, $6::timestamptz, $6::timestamptz)
       ON CONFLICT (session_id, track_id) DO UPDATE
       SET conf = CASE
           WHEN EXCLUDED.conf > detections.conf THEN EXCLUDED.conf
           ELSE detections.conf
         END,
         bbox = CASE
           WHEN EXCLUDED.conf > detections.conf THEN EXCLUDED.bbox
           ELSE detections.bbox
         END,
         cls = CASE
           WHEN EXCLUDED.conf > detections.conf THEN EXCLUDED.cls
           ELSE detections.cls
         END,
         url_frame = CASE
           WHEN EXCLUDED.conf > detections.conf THEN EXCLUDED.url_frame
           ELSE detections.url_frame
         END,
         last_ts = EXCLUDED.last_ts
       RETURNING *`,
      [
        sessionId,
        trackId,
        cls,
        conf,
        JSON.stringify(bbox),
        captureTs,
        urlFrame ?? null,
      ]
    );
    return result.rows[0] ?? null;
  },

  async getDetectionsBySession(sessionId: string): Promise<DetectionRecord[]> {
    const result = await pool.query<DetectionRecord>(
      `SELECT * FROM detections
       WHERE session_id = $1
       ORDER BY last_ts ASC`,
      [sessionId]
    );
    return result.rows;
  },

  async getDetectionsByTimeRange(
    from: Date,
    to: Date,
    limit = 1000
  ): Promise<DetectionRecord[]> {
    const result = await pool.query<DetectionRecord>(
      `SELECT * FROM detections
       WHERE last_ts >= $1 AND last_ts < $2
       ORDER BY last_ts ASC
       LIMIT $3`,
      [from.toISOString(), to.toISOString(), limit]
    );
    return result.rows;
  },

  // Funciones para hooks de MediaMTX
  async findOpenSessionByPath(path: string): Promise<SessionRecord | null> {
    const result = await pool.query<SessionRecord>(
      `SELECT * FROM sessions
       WHERE path = $1 AND end_ts IS NULL
       ORDER BY start_ts DESC
       LIMIT 1`,
      [path]
    );
    return result.rows[0] ?? null;
  },

  async updateMediaConnectTs(
    sessionId: string,
    connectTs: string
  ): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET media_connect_ts = $2::timestamptz
       WHERE session_id = $1 AND media_connect_ts IS NULL`,
      [sessionId, connectTs]
    );
  },

  async updateMediaStartTs(sessionId: string, startTs: string): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET media_start_ts = $2::timestamptz
       WHERE session_id = $1 AND media_start_ts IS NULL`,
      [sessionId, startTs]
    );
  },

  async updateMediaEndTs(sessionId: string, endTs: string): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET media_end_ts = GREATEST(COALESCE(media_end_ts, $2::timestamptz), $2::timestamptz)
       WHERE session_id = $1`,
      [sessionId, endTs]
    );
  },

  async setRecommendedStartOffsetIfNull(
    sessionId: string,
    offsetMs: number
  ): Promise<void> {
    await pool.query(
      `UPDATE sessions
       SET recommended_start_offset_ms = $2
       WHERE session_id = $1 AND recommended_start_offset_ms IS NULL`,
      [sessionId, offsetMs]
    );
  },
};
