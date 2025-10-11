CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
);

CREATE OR REPLACE FUNCTION trg_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
CREATE TRIGGER trg_sessions_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION trg_update_timestamp();

-- Tabla de detecciones - Nueva estructura con PK compuesta (session_id, track_id)
-- Cada combinación (session_id, track_id) representa un objeto único rastreado
CREATE TABLE IF NOT EXISTS detections (
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    cls TEXT NOT NULL,
    conf NUMERIC NOT NULL CHECK (conf >= 0 AND conf <= 1),
    bbox JSONB NOT NULL,  -- {x, y, w, h} normalizadas 0..1
    url_frame TEXT,
    first_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    capture_ts TIMESTAMPTZ NOT NULL,
    ingest_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id);
CREATE INDEX IF NOT EXISTS idx_detections_last_ts ON detections(last_ts);
CREATE INDEX IF NOT EXISTS idx_detections_cls ON detections(cls);

DROP TRIGGER IF EXISTS trg_detections_updated_at ON detections;
CREATE TRIGGER trg_detections_updated_at
BEFORE UPDATE ON detections
FOR EACH ROW
EXECUTE FUNCTION trg_update_timestamp();
