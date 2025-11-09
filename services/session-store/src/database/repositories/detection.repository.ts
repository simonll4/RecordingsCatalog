import { pool } from '../connection.js';
import {
  DetectionRecord,
  DetectionInsertInput,
} from '../../types/detection.types.js';

export class DetectionRepository {
  async insert(input: DetectionInsertInput): Promise<DetectionRecord | null> {
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
           WHEN EXCLUDED.conf > detections.conf THEN COALESCE(EXCLUDED.url_frame, detections.url_frame)
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
  }

  async findBySession(sessionId: string): Promise<DetectionRecord[]> {
    const result = await pool.query<DetectionRecord>(
      `SELECT * FROM detections
       WHERE session_id = $1
       ORDER BY last_ts ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async findEnrichedBySession(sessionId: string): Promise<DetectionRecord[]> {
    const result = await pool.query<DetectionRecord>(
      `SELECT * FROM detections
       WHERE session_id = $1 AND enriched = TRUE
       ORDER BY last_ts ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async findByColor(sessionId: string, colorPattern: string): Promise<DetectionRecord[]> {
    const result = await pool.query<DetectionRecord>(
      `SELECT * FROM detections
       WHERE session_id = $1 
       AND enriched = TRUE
       AND attributes->'color'->>'name' ILIKE $2
       ORDER BY last_ts ASC`,
      [sessionId, `%${colorPattern}%`]
    );
    return result.rows;
  }

  async getEnrichmentStats(sessionId?: string): Promise<{
    total: number;
    enriched: number;
    with_color: number;
    failed: number;
  }> {
    const query = sessionId
      ? `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE enriched = TRUE) as enriched,
          COUNT(*) FILTER (WHERE attributes->'color' IS NOT NULL) as with_color,
          COUNT(*) FILTER (WHERE attributes->>'enrichment_failed' = 'true') as failed
         FROM detections
         WHERE session_id = $1`
      : `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE enriched = TRUE) as enriched,
          COUNT(*) FILTER (WHERE attributes->'color' IS NOT NULL) as with_color,
          COUNT(*) FILTER (WHERE attributes->>'enrichment_failed' = 'true') as failed
         FROM detections`;
    
    const result = await pool.query<{
      total: string;
      enriched: string;
      with_color: string;
      failed: string;
    }>(query, sessionId ? [sessionId] : []);
    
    const row = result.rows[0];
    return {
      total: parseInt(row?.total ?? '0'),
      enriched: parseInt(row?.enriched ?? '0'),
      with_color: parseInt(row?.with_color ?? '0'),
      failed: parseInt(row?.failed ?? '0'),
    };
  }
}
