import { promises as fs } from "fs";
import { join } from "path";
import type {
  SessionData,
  DetectionData,
  BoundingBox,
} from "@edge-agent/common";
import pino from "pino";

const logger = pino({ name: "tracks-exporter" });

export interface TrackKeyframe {
  t: number; // Time in seconds relative to session start
  bbox: number[]; // Normalized [x, y, w, h] in range [0..1]
  score?: number;
}

export interface TrackInfo {
  label: string;
  kf: TrackKeyframe[];
}

export interface TracksJson {
  session_id: string;
  dev_id: string;
  start_ts: number; // Epoch ms
  duration_s: number;
  tracks: Record<string, TrackInfo>; // key = track_id
}

/**
 * Generate tracks.json file for a session
 *
 * @param sessionName Session name (e.g., "sesion_20251007-143000_1")
 * @param sessionData Session metadata
 * @param detections All detections for this session
 * @param storageDir Base storage directory
 * @returns HTTP URL to the generated tracks.json file
 */
export async function generateTracksJson(
  sessionName: string,
  sessionData: SessionData,
  detections: DetectionData[],
  storageDir: string
): Promise<string> {
  try {
    // Create meta directory if it doesn't exist
    const metaDir = join(storageDir, "meta");
    await fs.mkdir(metaDir, { recursive: true });

    // Calculate session duration
    const startTs = sessionData.edgeStartTs;
    const endTs = sessionData.edgeEndTs ?? Date.now();
    const durationS = (endTs - startTs) / 1000;

    // Build tracks object from detections
    const tracks: Record<string, TrackInfo> = {};

    for (const detection of detections) {
      const trackId = detection.trackId;

      // Extract keyframes from trackDetails if available
      let keyframes: TrackKeyframe[] = [];

      if (detection.trackDetails && Array.isArray(detection.trackDetails.kf)) {
        keyframes = detection.trackDetails.kf.map((kf: any) => ({
          t: Number(kf.t || 0),
          bbox: bboxToArray(kf.bbox),
          score: kf.score,
        }));
      } else {
        // Fallback: create single keyframe from detection data
        const relativeTime = (detection.firstTs - startTs) / 1000;
        keyframes = [
          {
            t: relativeTime,
            bbox: bboxToArray(detection.bb),
            score: detection.score,
          },
        ];
      }

      tracks[trackId] = {
        label: detection.class,
        kf: keyframes,
      };
    }

    // Build final structure
    const tracksData: TracksJson = {
      session_id: sessionData.sessionId,
      dev_id: sessionData.devId,
      start_ts: startTs,
      duration_s: Number(durationS.toFixed(2)),
      tracks,
    };

    // Write to file using sessionName format (sesion_YYYYMMDD-HHMMSS_N)
    const filePath = join(metaDir, `${sessionName}.json`);
    await fs.writeFile(filePath, JSON.stringify(tracksData, null, 2), "utf-8");

    // Return HTTP URL instead of filesystem path
    const metaUrl = `/meta/${sessionName}.json`;

    logger.info(
      {
        sessionName,
        sessionId: sessionData.sessionId,
        filePath,
        metaUrl,
        trackCount: Object.keys(tracks).length,
        durationS: tracksData.duration_s,
      },
      "Generated tracks.json"
    );

    return metaUrl;
  } catch (error) {
    logger.error(
      {
        sessionName,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to generate tracks.json"
    );
    throw error;
  }
}

/**
 * Convert BoundingBox to array format [x, y, w, h]
 * Ensures values are in [0..1] range
 */
function bboxToArray(bbox: BoundingBox): number[] {
  return [
    clamp(bbox.x, 0, 1),
    clamp(bbox.y, 0, 1),
    clamp(bbox.w, 0, 1),
    clamp(bbox.h, 0, 1),
  ].map((v) => Number(v.toFixed(4)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
