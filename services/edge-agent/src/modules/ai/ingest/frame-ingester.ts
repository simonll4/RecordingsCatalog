/**
 * Frame Ingester - Sends Compressed Frames + Detections to Session Store
 *
 * Responsible for:
 *   - Orchestrating frame conversion (delegated to media/convert.ts)
 *   - Building multipart payload
 *   - Sending to session-store (delegated to shared/http-multipart.ts)
 *
 * Purpose:
 * ========
 *
 * Frame + Detection Storage:
 *   - Stores JPEG frames for video playback
 *   - Stores detection metadata for timeline/alerts
 *   - Correlates frames with detections via seqNo
 *
 * Flow:
 * =====
 *
 * 1. AI Worker Returns Detections
 *    ```protobuf
 *    InferResult {
 *      frame_id: "123"
 *      detections: [ { cls: "person", conf: 0.95, bbox: {...} } ]
 *    }
 *    ```
 *
 * 2. Main Retrieves Frame from Cache
 *    ```typescript
 *    const frame = frameCache.get("123");
 *    ```
 *
 * 3. Ingester Converts Frame to JPEG
 *    ```typescript
 *    const jpeg = await convertNV12ToJpeg(frame.data, frame.meta);
 *    ```
 *
 * 4. Ingester Sends Multipart HTTP POST
 *    ```http
 *    POST /ingest HTTP/1.1
 *    Content-Type: multipart/form-data; boundary=...
 *
 *    --boundary
 *    Content-Disposition: form-data; name="meta"; filename="meta.json"
 *    Content-Type: application/json
 *
 *    {"sessionId": "sess_123", "seqNo": 123, "captureTs": "...", "detections": [...]}
 *    --boundary
 *    Content-Disposition: form-data; name="frame"; filename="frame.jpg"
 *    Content-Type: image/jpeg
 *
 *    <JPEG binary data>
 *    --boundary--
 *    ```
 *
 * 5. Session Store Saves Frame + Detections
 *    - Inserts frame metadata + detections into database
 *    - Saves JPEG to disk/S3
 *    - Returns inserted/updated/skipped counts
 *
 * Multipart Format:
 * =================
 *
 * Part 1 - Metadata (meta.json):
 *   ```json
 *   {
 *     "sessionId": "sess_1728123456_1",
 *     "seqNo": 123,
 *     "captureTs": "2025-01-11T12:00:00.000Z",
 *     "detections": [
 *       {
 *         "trackId": "track_1",
 *         "cls": "person",
 *         "conf": 0.95,
 *         "bbox": { "x": 100, "y": 150, "w": 200, "h": 300 }
 *       }
 *     ]
 *   }
 *   ```
 *
 * Part 2 - Frame (frame.jpg):
 *   - Binary JPEG data
 *   - Compressed from NV12/I420/RGB
 *   - Typical size: 20-50 KB (vs 460 KB raw)
 *
 * Why JPEG?
 * =========
 *
 * Compression:
 *   - 640×480 NV12 ≈ 460 KB raw
 *   - 640×480 JPEG ≈ 30 KB (15:1 ratio)
 *   - Saves storage and bandwidth
 *
 * Compatibility:
 *   - Universal format (browsers, players, tools)
 *   - Easy to serve in web UI
 *   - No decoding overhead in frontend
 *
 * Trade-offs:
 *   - Lossy compression (quality loss)
 *   - CPU overhead for encode/decode
 *   - But: Storage cost >> CPU cost
 *
 * Retry Logic:
 * ============
 *
 * Automatic Retries:
 *   - Max 3 retries (configured in sendMultipart)
 *   - Exponential backoff (200ms, 400ms, 800ms)
 *   - Respects Retry-After header (429 responses)
 *
 * Failure Handling:
 *   - Returns false if all retries exhausted
 *   - Caller logs error, increments metrics
 *   - Frame is lost (not critical for recording)
 *
 * Metrics:
 * ========
 *
 * frame_ingest_ok_total (counter):
 *   - Successful ingests
 *   - Monitors ingestion rate
 *
 * frame_ingest_error_total (counter):
 *   - Failed ingests (after retries)
 *   - Alerts on high error rate
 *
 * Error Cases:
 * ============
 *
 * Network Errors:
 *   - Session Store unreachable
 *   - Retries with backoff
 *   - Eventually gives up
 *
 * HTTP 429 (Too Many Requests):
 *   - Session Store overloaded
 *   - Respects Retry-After header
 *   - Automatic backoff
 *
 * HTTP 500 (Internal Server Error):
 *   - Session Store error (DB, filesystem)
 *   - Retries (may be transient)
 *   - Alerts if persistent
 *
 * Conversion Errors:
 *   - Invalid NV12 data (corrupted frame)
 *   - JPEG encode fails
 *   - Returns false, logs error
 */

import { logger } from "../../../shared/logging.js";
import { metrics } from "../../../shared/metrics.js";
import type { NV12FrameMeta } from "../../video/adapters/gstreamer/nv12-capture-gst.js";
import { convertNV12ToJpeg, convertRGBToJpeg } from "../../../media/convert.js";
import {
  sendMultipart,
  type MultipartPart,
} from "../../../shared/http-multipart.js";

/**
 * Ingest Payload
 *
 * Metadata sent alongside JPEG frame.
 */
export type IngestPayload = {
  sessionId: string; // Active session ID
  seqNo: number; // Frame sequence number
  captureTs: string; // ISO timestamp when frame was captured
  detections: Array<{
    trackId: string; // Unique object tracker ID
    cls: string; // Object class (e.g., "person", "helmet")
    conf: number; // Confidence score (0-1)
    bbox: { x: number; y: number; w: number; h: number }; // Bounding box
  }>;
};

export class FrameIngester {
  private baseUrl: string;

  /**
   * Creates FrameIngester
   *
   * @param baseUrl - Session Store base URL (e.g., "http://session-store:3001")
   *
   * @example
   * ```typescript
   * const ingester = new FrameIngester("http://session-store:3001");
   * await ingester.ingestNV12(payload, nv12Buffer, meta);
   * ```
   */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Ingest Frame + Metadata to Session Store (RGB/JPEG)
   *
   * Sends frame (RGB or JPEG) + detection metadata to session store.
   * Converts RGB to JPEG if needed.
   *
   * Use Cases:
   *   - RGB buffer from non-GStreamer source
   *   - Pre-compressed JPEG frame
   *
   * @param payload - Detection metadata
   * @param frameBuffer - RGB or JPEG buffer
   * @param width - Frame width (required for RGB conversion)
   * @param height - Frame height (required for RGB conversion)
   * @param isJpegBuffer - true if already JPEG, false if RGB (default: false)
   * @returns true if sent successfully, false if failed
   *
   * @example
   * ```typescript
   * // RGB buffer
   * const success = await ingester.ingest(
   *   payload,
   *   rgbBuffer,
   *   640, 480,
   *   false // Not JPEG, needs conversion
   * );
   *
   * // Pre-compressed JPEG
   * const success = await ingester.ingest(
   *   payload,
   *   jpegBuffer,
   *   0, 0, // Width/height ignored
   *   true // Already JPEG
   * );
   * ```
   */
  async ingest(
    payload: IngestPayload,
    frameBuffer: Buffer,
    width: number,
    height: number,
    isJpegBuffer: boolean = false
  ): Promise<boolean> {
    try {
      // Convert to JPEG if necessary
      const jpegBuffer = isJpegBuffer
        ? frameBuffer
        : await convertRGBToJpeg(frameBuffer, width, height);

      // Send multipart
      const result = await this.sendIngest(payload, jpegBuffer);
      return result;
    } catch (error: any) {
      logger.error("Frame ingest failed", {
        module: "frame-ingester",
        sessionId: payload.sessionId,
        seqNo: payload.seqNo,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Ingest NV12/I420 Frame + Metadata to Session Store
   *
   * Sends NV12/I420 frame + detection metadata to session store.
   * Converts NV12/I420 to JPEG before sending.
   *
   * Primary Use Case:
   *   - AI feeder sends NV12 frames from GStreamer
   *   - Most common ingestion path
   *
   * @param payload - Detection metadata
   * @param nv12Data - Raw NV12/I420 buffer
   * @param meta - Frame metadata (format, resolution, plane info)
   * @returns true if sent successfully, false if failed
   *
   * @example
   * ```typescript
   * const frame = frameCache.get(seqNo);
   * if (frame) {
   *   const success = await ingester.ingestNV12(
   *     {
   *       sessionId: "sess_123",
   *       seqNo: 123,
   *       captureTs: frame.captureTs,
   *       detections: [...]
   *     },
   *     frame.data,
   *     frame.meta
   *   );
   * }
   * ```
   */
  async ingestNV12(
    payload: IngestPayload,
    nv12Data: Buffer,
    meta: NV12FrameMeta
  ): Promise<boolean> {
    try {
      // Convert NV12/I420 → JPEG
      const jpegBuffer = await convertNV12ToJpeg(nv12Data, meta);

      // Send multipart
      const result = await this.sendIngest(payload, jpegBuffer);
      return result;
    } catch (error: any) {
      logger.error("NV12 ingest failed", {
        module: "frame-ingester",
        sessionId: payload.sessionId,
        seqNo: payload.seqNo,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Send Multipart HTTP POST to Session Store
   *
   * Private helper that sends multipart/form-data request.
   * Includes retry logic with exponential backoff.
   *
   * @param payload - Detection metadata
   * @param jpegBuffer - JPEG frame data
   * @returns true if sent successfully, false if failed
   * @private
   */
  private async sendIngest(
    payload: IngestPayload,
    jpegBuffer: Buffer
  ): Promise<boolean> {
    const parts: MultipartPart[] = [
      {
        name: "meta",
        data: JSON.stringify(payload),
        filename: "meta.json",
        contentType: "application/json",
      },
      {
        name: "frame",
        data: jpegBuffer,
        filename: "frame.jpg",
        contentType: "image/jpeg",
      },
    ];

    const response = await sendMultipart(`${this.baseUrl}/ingest`, parts, {
      maxRetries: 3,
      backoffMs: 200,
      respectRetryAfter: true,
    });

    if (response.ok) {
      logger.debug("Frame ingested successfully", {
        module: "frame-ingester",
        sessionId: payload.sessionId,
        seqNo: payload.seqNo,
        inserted: response.data?.inserted,
        updated: response.data?.updated,
        skipped: response.data?.skipped,
      });

      metrics.inc("frame_ingest_ok_total");
      return true;
    } else {
      logger.error("Frame ingest failed after all retries", {
        module: "frame-ingester",
        sessionId: payload.sessionId,
        seqNo: payload.seqNo,
        status: response.status,
        statusText: response.statusText,
      });

      metrics.inc("frame_ingest_error_total");
      return false;
    }
  }
}
