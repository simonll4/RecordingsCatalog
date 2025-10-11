/**
 * Session Manager - Active Session Tracking & Frame Ingestion Coordinator
 *
 * This module manages the lifecycle of recording sessions and coordinates
 * the ingestion of frames with detection metadata to the session-store service.
 *
 * Key Responsibilities:
 * ====================
 *
 * 1. Session Lifecycle Tracking
 *    - Tracks currently active sessionId (set by orchestrator FSM)
 *    - Resets state on session open/close events
 *    - Provides query methods for session state
 *
 * 2. Frame Sequence Numbering
 *    - Maintains monotonic sequence number (seqNo) per session
 *    - Resets to 0 on each new session
 *    - Ensures frames can be ordered correctly on backend
 *
 * 3. Frame + Detection Ingestion
 *    - Retrieves original NV12 frames from cache by frameId
 *    - Combines frame data with detection metadata
 *    - Uploads to session-store via FrameIngester (handles batching/retries)
 *
 * Integration:
 * ===========
 * - Called by main.ts when relevant detections are received from AI worker
 * - Session lifecycle controlled by orchestrator via bus events
 * - Reads from FrameCache (populated by AIFeeder)
 * - Writes to session-store via FrameIngester HTTP client
 *
 * Flow:
 * =====
 * 1. Orchestrator publishes session.open event → openSession() called
 * 2. AI worker returns detections → main.ts calls ingestFrame()
 * 3. Retrieve NV12 frame from cache, attach detections, upload
 * 4. Orchestrator publishes session.close event → closeSession() called
 */

import { logger } from "../shared/logging.js";
import type { FrameCache, FrameIngester } from "../modules/ai/index.js";

/**
 * Detection Metadata for Frame Ingestion
 *
 * This format matches the session-store /ingest API schema.
 * Coordinates are absolute pixel values (not normalized).
 */
export interface IngestDetection {
  trackId: string; // Unique tracking ID across frames (from ByteTrack/BoT-SORT)
  cls: string; // Class name (e.g., "person", "car")
  conf: number; // Confidence score [0.0, 1.0]
  bbox: {
    x: number; // Top-left X coordinate (pixels)
    y: number; // Top-left Y coordinate (pixels)
    w: number; // Width (pixels)
    h: number; // Height (pixels)
  };
}

export class SessionManager {
  // Currently active session ID (null when no session is active)
  private currentSessionId: string | null = null;

  // Monotonic frame sequence number for current session
  // Resets to 0 on each new session
  private frameSeqNo = 0;

  // Frame cache reference (shared with AIFeeder)
  // Used to retrieve original NV12 frames by frameId
  private frameCache: FrameCache;

  // Frame ingester client (uploads to session-store /ingest endpoint)
  private frameIngester: FrameIngester;

  constructor(frameCache: FrameCache, frameIngester: FrameIngester) {
    this.frameCache = frameCache;
    this.frameIngester = frameIngester;
  }

  /**
   * Open New Session
   *
   * Called when orchestrator FSM transitions to ACTIVE state.
   * Resets frame sequence number and sets active sessionId.
   *
   * @param sessionId - UUID from session-store (created by orchestrator)
   */
  openSession(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.frameSeqNo = 0;
    logger.info("Session opened", {
      module: "session-manager",
      sessionId,
    });
  }

  /**
   * Close Active Session
   *
   * Called when orchestrator FSM transitions from CLOSING to IDLE.
   * Clears active sessionId and resets sequence number.
   *
   * @param sessionId - Session ID for logging/validation
   */
  closeSession(sessionId: string): void {
    this.currentSessionId = null;
    this.frameSeqNo = 0;
    logger.info("Session closed", {
      module: "session-manager",
      sessionId,
    });
  }

  /**
   * Check if Session is Active
   *
   * @returns true if there's currently an active recording session
   */
  hasActiveSession(): boolean {
    return this.currentSessionId !== null;
  }

  /**
   * Get Active Session ID
   *
   * @returns Current sessionId or null if no session is active
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Ingest Frame with Detections to Session Store
   *
   * This is the core method that coordinates frame + detection uploads.
   *
   * Process:
   * ========
   * 1. Validate active session exists (guard)
   * 2. Retrieve original NV12 frame from cache by frameId
   * 3. Construct ingestion payload with metadata
   * 4. Upload frame + detections via FrameIngester
   * 5. Increment sequence number on success
   *
   * Frame Cache Lookup:
   * ===================
   * - frameId is the correlation key between AI results and cached frames
   * - FrameCache has TTL (default 2s) so old frames may be evicted
   * - If frame not in cache, ingestion is skipped (logged as warning)
   *
   * Ingestion Endpoint:
   * ===================
   * - POST /ingest (multipart/form-data)
   * - Fields: sessionId, seqNo, captureTs, detections (JSON)
   * - File: frame (NV12 raw binary)
   *
   * Error Handling:
   * ===============
   * - Network errors: Logged and return false (non-blocking)
   * - Missing frame: Logged and return false (expected during high load)
   * - FrameIngester handles retries with exponential backoff
   *
   * @param frameId - Frame ID from AI worker result (cache lookup key)
   * @param detections - Array of relevant detections for this frame
   * @returns Promise<boolean> - true if ingestion succeeded, false otherwise
   */
  async ingestFrame(
    frameId: string,
    detections: IngestDetection[]
  ): Promise<boolean> {
    // Guard: Only ingest if session is active
    if (!this.currentSessionId) {
      logger.debug("No active session, skipping ingestion", {
        module: "session-manager",
        frameId,
      });
      return false;
    }

    // Retrieve original NV12 frame from cache
    const cachedFrame = this.frameCache.get(frameId);

    if (!cachedFrame) {
      // Frame not in cache (TTL expired or evicted)
      // This can happen during high load or if cache TTL is too short
      logger.warn("No cached NV12 frame available for ingestion", {
        module: "session-manager",
        requestedFrameId: frameId,
        sessionId: this.currentSessionId,
      });
      return false;
    }

    // Construct ingestion payload
    const payload = {
      sessionId: this.currentSessionId, // Current recording session
      seqNo: this.frameSeqNo++, // Increment sequence (atomic)
      captureTs: cachedFrame.captureTs, // Original capture timestamp
      detections, // Detection metadata array
    };

    // Upload frame + metadata to session-store
    try {
      const success = await this.frameIngester.ingestNV12(
        payload,
        cachedFrame.data, // NV12 raw binary (Y + UV planes)
        cachedFrame.meta // Frame metadata (width, height, format)
      );

      if (success) {
        logger.debug("Frame + detections ingested", {
          module: "session-manager",
          sessionId: this.currentSessionId,
          seqNo: payload.seqNo,
          frameId,
          detections: detections.length,
        });
      }

      return success;
    } catch (err) {
      // Log error but don't crash (ingestion is non-critical for system operation)
      logger.error("Failed to ingest frame", {
        module: "session-manager",
        frameId,
        sessionId: this.currentSessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
