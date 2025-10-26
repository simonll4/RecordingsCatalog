import { PoolClient } from 'pg';
import { getClient } from './connection.js';

/**
 * Ensure database schema is up to date
 */
export async function ensureSchema(): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    // Create sessions table
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
        media_connect_ts TIMESTAMPTZ,
        media_start_ts TIMESTAMPTZ,
        media_end_ts TIMESTAMPTZ,
        recommended_start_offset_ms INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create detections table
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

    // Create update timestamp function
    await client.query(`
      CREATE OR REPLACE FUNCTION trg_update_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create triggers
    await client.query('DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions');
    await client.query(`
      CREATE TRIGGER trg_sessions_updated_at
      BEFORE UPDATE ON sessions
      FOR EACH ROW
      EXECUTE FUNCTION trg_update_timestamp()
    `);

    await client.query('DROP TRIGGER IF EXISTS trg_detections_updated_at ON detections');
    await client.query(`
      CREATE TRIGGER trg_detections_updated_at
      BEFORE UPDATE ON detections
      FOR EACH ROW
      EXECUTE FUNCTION trg_update_timestamp()
    `);

    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_path_open ON sessions(path) WHERE end_ts IS NULL');
    await client.query('CREATE INDEX IF NOT EXISTS idx_sessions_path_timestamps ON sessions(path, start_ts, end_ts)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_detections_last_ts ON detections(last_ts)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_detections_cls ON detections(cls)');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
