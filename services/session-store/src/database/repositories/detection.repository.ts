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
}
