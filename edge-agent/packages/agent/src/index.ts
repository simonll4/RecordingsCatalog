import pino from "pino";
import type {
  CameraConfig,
  SessionState as SessionStateType,
  Detection,
  SessionData,
  DetectionData,
  BoundingBox,
  Frame,
} from "@edge-agent/common";
import { DatabaseClient, SessionsRepo, DetectionsRepo } from "@edge-agent/db";
import { PythonDetector } from "@edge-agent/detector";
import { createCaptureProvider, CaptureProvider } from "@edge-agent/capture";
import { generateTracksJson } from "./tracks-exporter";
import { VideoRecorder } from "./video-recorder";
import { promises as fs } from "fs";
import { join } from "path";

// Re-export for external use
export { generateTracksJson } from "./tracks-exporter";
export { VideoRecorder } from "./video-recorder";

function serializeError(e: unknown) {
  if (e instanceof Error) {
    return { name: e.name, message: e.message, stack: e.stack };
  }
  try {
    return { message: JSON.stringify(e) };
  } catch {
    return { message: String(e) };
  }
}

export interface EdgeAgentConfig {
  camera: CameraConfig;
  detector: "python";
  storageDir: string;
  // Optional max session duration in ms (default 30000)
  sessionMaxDurationMs?: number;
}

interface SessionManager {
  state: SessionStateType;
  sessionId?: string;
  sessionName?: string;
  openedAt?: number;
  lastRelevantAt?: number;
  postRollMs: number;
  classes: Set<string>;
  bestThumbnail?: {
    frameData: Buffer;
    score: number;
    timestamp: number;
  };
  // Rolling sessions
  chainBase?: string;
  chainIndex?: number;
  maxDurationMs: number;
  // In-memory track accumulation for tracks.json
  tracksKeyframes: Map<
    string,
    {
      label: string;
      kf: Array<{ t: number; bbox: BoundingBox; score?: number }>;
    }
  >;
}

export class EdgeAgent {
  private config: EdgeAgentConfig;
  private logger: pino.Logger;
  private capture: CaptureProvider;
  private detector: PythonDetector;
  private sessionsRepo: SessionsRepo;
  private detectionsRepo: DetectionsRepo;
  private dbClient: DatabaseClient;
  private videoRecorder: VideoRecorder;

  private sessionState: SessionManager;
  private running = false;
  private frameCount = 0;

  constructor(config: EdgeAgentConfig) {
    this.config = config;
    this.logger = pino({
      name: "edge-agent",
      level: process.env.LOG_LEVEL || "info",
    });

    // Initialize components
    this.dbClient = new DatabaseClient();
    this.sessionsRepo = new SessionsRepo(this.dbClient.client);
    this.detectionsRepo = new DetectionsRepo(this.dbClient.client);

    this.capture = createCaptureProvider(config.camera.captureProvider, {
      device: config.camera.device,
      fps: config.camera.fps,
      width: config.camera.input.width,
      height: config.camera.input.height,
    });

    // Initialize detector with integrated tracking
    this.detector = new PythonDetector({
      modelPath: config.camera.modelPath,
      classesOfInterest: config.camera.classesOfInterest,
      threshold: config.camera.threshold,
      tracker: {
        type: "bytetrack",
        trackHighThresh: 0.5,
        trackLowThresh: 0.1,
        newTrackThresh: 0.6,
        trackBuffer: 30,
        matchThresh: 0.8,
      },
      pythonPath: "python3",
    });

    // Initialize video recorder
    this.videoRecorder = new VideoRecorder({
      storageDir: config.storageDir,
      deviceId: config.camera.id,
      videoSource: String(config.camera.device),
      fps: config.camera.fps,
      width: config.camera.input.width,
      height: config.camera.input.height,
    });

    this.sessionState = {
      state: "IDLE",
      postRollMs: config.camera.postRollMs,
      classes: new Set(),
      tracksKeyframes: new Map(),
      // Enforce hard cap of 30s per requirement (sessions must NOT exceed 30s)
      maxDurationMs: Math.min(30000, config.camera.maxSessionMs ?? 30000),
    };
  }

  async start(): Promise<void> {
    this.logger.info("Starting Edge Agent");

    try {
      // Connect to database
      await this.dbClient.connect();
      this.logger.info("Database connected");

      // Load detector model
      await this.detector.load();
      this.logger.info("Detector loaded");

      // Start capture
      await this.capture.start();
      this.logger.info("Capture started");

      // Start processing loop
      this.running = true;
      this.processFrames();

      this.logger.info("Edge Agent started successfully");
    } catch (error) {
      this.logger.error(
        { err: serializeError(error) },
        "Failed to start Edge Agent"
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping Edge Agent");

    this.running = false;

    // Close any open session
    if (this.sessionState.sessionId) {
      await this.closeSession();
    }

    // Stop components
    await this.capture.stop();
    await this.dbClient.disconnect();

    this.logger.info("Edge Agent stopped");
  }

  private async processFrames(): Promise<void> {
    const targetFrameTime = 1000 / this.config.camera.fps;

    while (this.running) {
      const frameStart = Date.now();

      try {
        const frame = await this.capture.getFrame();
        if (!frame) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }

        await this.processFrame(frame);
        this.frameCount++;

        // Frame rate control
        const processingTime = Date.now() - frameStart;
        const sleepTime = Math.max(0, targetFrameTime - processingTime);

        if (sleepTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, sleepTime));
        }
      } catch (error) {
        this.logger.error(
          { err: serializeError(error) },
          "Error processing frame"
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async processFrame(frame: Frame): Promise<void> {
    const frameStart = Date.now();

    // Run detection with integrated tracking
    const detections = await this.detector.infer(frame);

    // Filter relevant detections (already done by PythonDetector, but keep for compatibility)
    const relevantDetections = detections.filter(
      (det: Detection) =>
        this.config.camera.classesOfInterest.includes(det.class) &&
        det.score >= this.config.camera.threshold
    );

    // Log detections info (visible)
    if (detections.length > 0) {
      this.logger.info(
        `🔍 Frame ${this.frameCount}: ${detections.length} detections, ${relevantDetections.length} relevant`
      );
      detections.forEach((det: Detection) => {
        this.logger.info(
          `   - ${det.class}: ${(det.score * 100).toFixed(
            1
          )}% at [${det.bbox.x.toFixed(0)}, ${det.bbox.y.toFixed(
            0
          )}, ${det.bbox.w.toFixed(0)}, ${det.bbox.h.toFixed(0)}]${
            det.trackId ? ` (${det.trackId})` : ""
          }`
        );
      });
    }

    // Update session state
    await this.updateSessionState(relevantDetections, frame);

    // Persist detections if session is active
    if (this.sessionState.sessionId && relevantDetections.length > 0) {
      this.logger.info(
        `💾 Saving ${relevantDetections.length} detections to database`
      );
      await this.persistDetections(relevantDetections, frame);
    }

    const processingTime = Date.now() - frameStart;

    // Log frame statistics every 10 frames
    if (this.frameCount % 10 === 0) {
      this.logger.info({
        frame: this.frameCount,
        camera: this.config.camera.id,
        state: this.sessionState.state,
        detections: detections.length,
        relevantDetections: relevantDetections.length,
        tracksActive: relevantDetections.filter((d: Detection) => d.trackId)
          .length,
        latency_ms: processingTime,
      });
    }
  }

  private async updateSessionState(
    detections: Detection[],
    frame: Frame
  ): Promise<void> {
    const now = Date.now();
    const hasRelevant = detections.length > 0;
    const openedAt = this.sessionState.openedAt ?? now;
    const elapsed = now - openedAt;
    const exceedMax = elapsed > this.sessionState.maxDurationMs;

    switch (this.sessionState.state) {
      case "IDLE":
        if (hasRelevant) {
          await this.openSession();
        }
        break;

      case "OPEN":
      case "ACTIVE":
        if (hasRelevant) {
          // Rollover if exceed max duration
          if (exceedMax) {
            await this.rolloverSession(now);
            // After rollover, mark active and update summary in the new session
            this.sessionState.state = "ACTIVE";
            this.sessionState.lastRelevantAt = now;
            await this.updateSessionSummary(detections, frame);
          } else {
            this.sessionState.state = "ACTIVE";
            this.sessionState.lastRelevantAt = now;
            await this.updateSessionSummary(detections, frame);
          }
        } else {
          this.sessionState.state = "CLOSING";
        }
        break;

      case "CLOSING":
        if (hasRelevant) {
          if (exceedMax) {
            await this.rolloverSession(now);
          }
          this.sessionState.state = "ACTIVE";
          this.sessionState.lastRelevantAt = now;
          await this.updateSessionSummary(detections, frame);
        } else {
          // Check if post-roll period has elapsed
          if (
            now - (this.sessionState.lastRelevantAt || 0) >
            this.sessionState.postRollMs
          ) {
            await this.closeSession();
          }
        }
        break;
    }
  }

  private formatChainBase(ts: number) {
    const d = new Date(ts);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const base = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
      d.getDate()
    )}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    // New convention: "sesion_<YYYYMMDD-HHMMSS>" (device id stored separately in devId column)
    return `sesion_${base}`;
  }

  private async rolloverSession(now: number) {
    // Close current session with tracks.json generation
    await this.closeSession();

    // Reset Python tracker state (new track IDs)
    this.logger.info("Resetting Python tracker for new session...");
    await this.detector.reset();

    // Open new session with correlated id
    const base = this.sessionState.chainBase ?? this.formatChainBase(now);
    const nextIndex = (this.sessionState.chainIndex ?? 1) + 1;
    await this.openSession(base, nextIndex);

    this.logger.info(
      {
        event: "session:rotate",
        from: `${base}_${nextIndex - 1}`,
        to: `${base}_${nextIndex}`,
      },
      "Session rotated"
    );
  }

  private async openSession(
    chainBase?: string,
    chainIndex?: number
  ): Promise<void> {
    const now = Date.now();

    // Correlated session name: sesion_YYYYMMDD-HHMMSS_<n>
    let base =
      chainBase ?? this.sessionState.chainBase ?? this.formatChainBase(now);

    // Always query the database for the next available segment index
    // to avoid collisions
    let idx: number;
    if (chainIndex !== undefined) {
      // Explicit index provided (from rollover)
      idx = chainIndex;
    } else {
      // Query for next available index
      idx = await this.sessionsRepo.nextSegmentIdx(this.config.camera.id, base);
    }

    const sessionName = `${base}_${idx}`;

    // Don't pass customId - let the repo generate a unique UUID
    const sessionData = await this.sessionsRepo.open(
      this.config.camera.id,
      sessionName,
      idx
    );

    // Start video recording
    try {
      await this.videoRecorder.startRecording(sessionName);
      this.logger.info({ sessionName }, "Video recording started");
    } catch (error) {
      this.logger.error(
        {
          sessionName,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to start video recording"
      );
      // Continue without video recording
    }

    this.sessionState = {
      state: "OPEN",
      sessionId: sessionData.sessionId,
      sessionName: sessionName,
      openedAt: now,
      lastRelevantAt: now,
      postRollMs: this.config.camera.postRollMs,
      classes: new Set(),
      tracksKeyframes: new Map(),
      chainBase: base,
      chainIndex: idx,
      maxDurationMs: this.sessionState.maxDurationMs,
    };

    this.logger.info(
      {
        sessionId: sessionData.sessionId,
        devId: this.config.camera.id,
      },
      "Session opened"
    );
  }

  private async closeSession(): Promise<void> {
    if (!this.sessionState.sessionId) return;

    const classesArray = Array.from(this.sessionState.classes);

    // Stop video recording
    try {
      const recordedPath = await this.videoRecorder.stopRecording();
      if (recordedPath) {
        this.logger.info(
          { sessionId: this.sessionState.sessionId, recordedPath },
          "Video recording stopped"
        );
      }
    } catch (error) {
      this.logger.error(
        {
          sessionId: this.sessionState.sessionId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to stop video recording"
      );
    }

    // Close session in DB
    await this.sessionsRepo.close(this.sessionState.sessionId, classesArray);

    // Get session data and detections for tracks.json generation
    const sessionData = await this.sessionsRepo.findById(
      this.sessionState.sessionId
    );
    const detections = await this.detectionsRepo.listBySession(
      this.sessionState.sessionId
    );

    // Generate tracks.json
    let metaUrl: string | undefined;
    if (sessionData && detections.length > 0) {
      try {
        metaUrl = await generateTracksJson(
          this.sessionState.sessionName!,
          sessionData,
          detections,
          this.config.storageDir
        );
        this.logger.info(
          {
            sessionId: this.sessionState.sessionId,
            metaUrl,
            trackCount: detections.length,
          },
          "Generated tracks.json"
        );
      } catch (error) {
        this.logger.error(
          { sessionId: this.sessionState.sessionId, error },
          "Failed to generate tracks.json"
        );
      }
    }

    // Save thumbnail if we have one
    if (this.sessionState.bestThumbnail) {
      const thumbPath = await this.saveThumbnail(
        this.sessionState.sessionId,
        this.sessionState.bestThumbnail.frameData
      );

      await this.sessionsRepo.updateSummary(
        this.sessionState.sessionId,
        classesArray,
        thumbPath,
        this.sessionState.bestThumbnail.timestamp,
        metaUrl
      );
    } else if (metaUrl) {
      // Update metaUrl even without thumbnail
      await this.sessionsRepo.updateSummary(
        this.sessionState.sessionId,
        classesArray,
        undefined,
        undefined,
        metaUrl
      );
    }

    this.logger.info(
      {
        sessionId: this.sessionState.sessionId,
        sessionName: this.sessionState.sessionName,
        classes: classesArray,
        duration: Date.now() - (this.sessionState.openedAt || 0),
        metaUrl,
      },
      "Session closed"
    );

    // Reset state completely - don't preserve chainBase/chainIndex
    // They will be recalculated on next session open
    this.sessionState = {
      state: "IDLE",
      postRollMs: this.config.camera.postRollMs,
      classes: new Set(),
      tracksKeyframes: new Map(),
      maxDurationMs: this.sessionState.maxDurationMs,
    };
  }

  private async updateSessionSummary(
    detections: Detection[],
    frame: Frame
  ): Promise<void> {
    // Track classes
    detections.forEach((det) => this.sessionState.classes.add(det.class));

    // Update best thumbnail
    const bestDetection = detections.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    if (
      !this.sessionState.bestThumbnail ||
      bestDetection.score > this.sessionState.bestThumbnail.score
    ) {
      this.sessionState.bestThumbnail = {
        frameData: frame.data,
        score: bestDetection.score,
        timestamp: frame.timestamp,
      };
    }
  }

  private async persistDetections(
    detections: Detection[],
    frame: Frame
  ): Promise<void> {
    if (!this.sessionState.sessionId) return;

    for (const detection of detections) {
      if (!detection.trackId) continue;

      // Check if this track already exists
      const existing = await this.detectionsRepo.findBySessionAndTrack(
        this.sessionState.sessionId,
        detection.trackId
      );

      // Normalize bbox to [0,1] for trackDetails
      const normBbox = this.normalizeBbox(
        detection.bbox,
        frame.width,
        frame.height
      );

      // Convert bbox to pixels for DB storage (as per requirements)
      const pixelBbox: BoundingBox = {
        x: detection.bbox.x,
        y: detection.bbox.y,
        w: detection.bbox.w,
        h: detection.bbox.h,
      };

      // Calculate relative time for keyframes
      const relativeTime =
        (frame.timestamp - (this.sessionState.openedAt || frame.timestamp)) /
        1000;

      // Accumulate keyframes in memory for tracks.json
      if (!this.sessionState.tracksKeyframes.has(detection.trackId)) {
        this.sessionState.tracksKeyframes.set(detection.trackId, {
          label: detection.class,
          kf: [],
        });
      }
      const trackData = this.sessionState.tracksKeyframes.get(
        detection.trackId
      )!;
      trackData.kf.push({
        t: relativeTime,
        bbox: normBbox,
        score: detection.score,
      });

      // Prepare trackDetails payload (append kf)
      const kfEntry = {
        t: relativeTime,
        bbox: normBbox,
        score: detection.score,
      };

      if (existing) {
        // Update existing detection
        await this.detectionsRepo.upsertByTrack(
          this.sessionState.sessionId,
          detection.trackId,
          {
            lastTs: frame.timestamp,
            score: Math.max(existing.score, detection.score),
            bb: pixelBbox, // Store in pixels as per requirements
            trackDetails: this.appendKeyframe(
              (existing as any)?.trackDetails,
              detection.class,
              detection.trackId,
              kfEntry
            ),
          }
        );
      } else {
        // Create new detection
        await this.detectionsRepo.upsertByTrack(
          this.sessionState.sessionId,
          detection.trackId,
          {
            firstTs: frame.timestamp,
            lastTs: frame.timestamp,
            class: detection.class,
            score: detection.score,
            bb: pixelBbox, // Store in pixels as per requirements
            trackDetails: {
              trackId: detection.trackId,
              label: detection.class,
              kf: [{ t: 0, bbox: normBbox, score: detection.score }],
            },
          }
        );
      }
    }
  }

  private normalizeBbox(bb: BoundingBox, w: number, h: number): BoundingBox {
    return {
      x: Math.max(0, Math.min(1, bb.x / w)),
      y: Math.max(0, Math.min(1, bb.y / h)),
      w: Math.max(0, Math.min(1, bb.w / w)),
      h: Math.max(0, Math.min(1, bb.h / h)),
    };
  }

  private appendKeyframe(
    existing:
      | {
          trackId: string;
          label: string;
          kf: { t: number; bbox: BoundingBox; score?: number }[];
        }
      | undefined,
    label: string,
    trackId: string,
    kf: { t: number; bbox: BoundingBox; score?: number }
  ) {
    if (!existing) {
      return { trackId, label, kf: [kf] };
    }
    // Avoid unbounded growth: keep last N keyframes (e.g., 100)
    const MAX_KF = 100;
    const kfList = [...(existing.kf || []), kf];
    if (kfList.length > MAX_KF) kfList.splice(0, kfList.length - MAX_KF);
    return { trackId, label: existing.label || label, kf: kfList };
  }

  private async saveThumbnail(
    sessionId: string,
    frameData: Buffer
  ): Promise<string> {
    const thumbDir = join(this.config.storageDir, "thumbs");
    await fs.mkdir(thumbDir, { recursive: true });

    const thumbPath = join(thumbDir, `${sessionId}.jpg`);

    try {
      // Convert RGB buffer to JPEG using sharp
      const sharp = await import("sharp");
      await sharp
        .default(frameData, {
          raw: {
            width: this.config.camera.input.width,
            height: this.config.camera.input.height,
            channels: 3,
          },
        })
        .jpeg({ quality: 85 })
        .toFile(thumbPath);

      // Return HTTP URL instead of filesystem path
      return `/thumbs/${sessionId}.jpg`;
    } catch (error) {
      this.logger.error({ error }, "Failed to save thumbnail");
      return "";
    }
  }

  // Status methods
  getStatus() {
    return {
      running: this.running,
      frameCount: this.frameCount,
      sessionState: {
        state: this.sessionState.state,
        sessionId: this.sessionState.sessionId,
        classes: Array.from(this.sessionState.classes),
        duration: this.sessionState.openedAt
          ? Date.now() - this.sessionState.openedAt
          : 0,
      },
      activeTracks: 0, // Tracking is now handled by PythonDetector
    };
  }
}
