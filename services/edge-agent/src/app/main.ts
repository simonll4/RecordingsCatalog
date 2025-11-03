/**
 * Main - Edge Agent Bootstrap & Dependency Injection Root
 *
 * This is the composition root that wires all modules together and manages
 * the complete lifecycle of the Edge Agent application.
 *
 * Architecture Overview:
 * =====================
 *
 * Video Pipeline:
 * - CameraHub: Always-on video capture (RTSP) → Shared Memory (I420 format)
 * - NV12Capture: Reads from SHM and converts I420 → NV12 frames for AI processing
 * - RecordPublisher: On-demand RTSP streaming (SHM → MediaMTX) coordinated by FSM
 * - LivePublisher: Continuous RTSP stream (SHM → MediaMTX → WebRTC) for live monitoring
 *
 * AI Pipeline:
 * - AIFeeder: Frame coordinator with backpressure control and sliding window
 * - AIClientTcp: Binary protocol communication with AI worker (protobuf over TCP)
 * - FrameCache: In-memory cache for correlating detections with original frames
 *
 * State Management:
 * - Bus: Event-driven pub/sub system for decoupled communication
 * - Orchestrator: Finite State Machine (FSM) that coordinates system behavior
 * - SessionManager: Tracks active recording sessions and frame ingestion
 *
 * Storage:
 * - SessionStore: HTTP API client for persisting sessions and detections
 * - FrameIngester: Uploads frames with detection metadata (con retry automático)
 *
 * Flow:
 * =====
 * 1. CameraHub captures video continuously to SHM
 * 2. NV12Capture reads frames when AI is ready
 * 3. AIFeeder sends frames to worker, receives detections
 * 4. Detections trigger FSM state changes (IDLE→DWELL→ACTIVE→CLOSING)
 * 5. During ACTIVE, frames+detections are ingested to session-store
 * 6. Record publisher streams on-demand when sessions are ACTIVE
 * 7. Live publisher keeps a continuous low-latency feed for the UI
 */

// === Core ===
import type { Server as HttpServer } from "node:http";
import { CONFIG } from "../config/index.js";
import { Bus } from "../core/bus/bus.js";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";

// === Modules ===
import { CameraHubGst, NV12CaptureGst } from "../modules/video/index.js";
import { AIFeeder, AIClientTcp, FrameIngester } from "../modules/ai/index.js";
import { MediaMtxOnDemandPublisherGst } from "../modules/streaming/index.js";
import { SessionStoreHttp } from "../modules/store/index.js";

// === App ===
import { SessionManager } from "./session.js";
import { AgentStatusService, startStatusServer } from "./status.js";

// === Shared ===
import { logger } from "../shared/logging.js";

/**
 * Bootstraps the Edge Agent runtime.
 *
 * Contract:
 * - Reads CONFIG (already validated)
 * - Wires modules (Bus, Video, AI, Store, FSM)
 * - Starts status HTTP server and orchestrates lifecycle
 * - Handles transient failures with bounded retries and backoff
 *
 * Returns when process receives termination signal; otherwise runs forever.
 */
async function main() {
  logger.setLevel(CONFIG.logLevel);

  logger.info("=== Edge Agent Starting ===", { module: "main" });
  logger.info("Configuration loaded", { module: "main", config: CONFIG });

  // ============================================================
  // MODULE INITIALIZATION
  // ============================================================
  // All modules are instantiated here following Dependency Injection pattern.
  // This makes the codebase testable and dependencies explicit.

  // Event Bus - Central communication hub for all modules
  const bus = new Bus();

  // --- Video Pipeline Components ---
  // CameraHub: Captures from RTSP source → writes I420 to shared memory
  const camera = new CameraHubGst();

  // NV12Capture: Reads from shared memory → provides NV12 frames to AI pipeline
  const nv12Capture = new NV12CaptureGst();

  // Publishers:
  // - recordPublisher: On-demand (FSM-controlled) stream tied to recording sessions
  // - livePublisher: Continuous stream for live view (starts at boot)
  const recordPublisher = new MediaMtxOnDemandPublisherGst({
    streamPath: CONFIG.mediamtx.recordPath,
    label: "record",
  });
  const livePublisher = new MediaMtxOnDemandPublisherGst({
    streamPath: CONFIG.mediamtx.livePath,
    label: "live",
  });

  // --- AI Pipeline Components ---
  // TCP client for binary communication with AI worker process
  const aiClient = new AIClientTcp(
    CONFIG.ai.worker.host,
    CONFIG.ai.worker.port
  );

  // Frame coordinator with flow control, caching, and backpressure management
  const aiFeeder = new AIFeeder(nv12Capture, CONFIG.ai.frameCacheTtlMs);

  // --- Storage Components ---
  // HTTP client for session-store service (sessions + detections API)
  const store = new SessionStoreHttp();

  // Frame ingestion coordinator (uploads frames with detection metadata)
  const frameIngester = new FrameIngester(CONFIG.store.baseUrl);

  // --- Session Management ---
  // Frame cache is shared between AIFeeder and SessionManager
  // This allows SessionManager to retrieve original frames when detections arrive
  const frameCache = aiFeeder.getFrameCache();
  const sessionManager = new SessionManager(frameCache, frameIngester);
  const statusService = new AgentStatusService();
  let statusServer: HttpServer | null = null;

  const recordPublisherAdapter = {
    start: async () => {
      await recordPublisher.start();
      statusService.setRecordStreamRunning(true);
    },
    stop: async () => {
      try {
        await recordPublisher.stop();
      } finally {
        statusService.setRecordStreamRunning(false);
      }
    },
  };

  // ============================================================
  // MODULE CONFIGURATION
  // ============================================================
  // Configure modules with runtime settings before starting them

  // Configure AI Feeder with model parameters and flow control policy
  aiFeeder.init({
  // Path or identifier of the ONNX model to load in the worker. When running the
  // worker inside Docker, this must be a container path (e.g. /models/*.onnx).
  // When the worker runs on the host, use an absolute host path.
  model: CONFIG.ai.modelName,
    width: CONFIG.ai.width, // Frame width for inference
    height: CONFIG.ai.height, // Frame height for inference
    maxInflight: 4, // Max frames in-flight (sliding window size)
  // Selected classes and confidence threshold. Can be overridden at runtime with
  // EDGE_AGENT_CLASSES_FILTER env var when running standalone.
  classesFilter: CONFIG.ai.classesFilter,
  confidenceThreshold: CONFIG.ai.umbral,
    policy: "LATEST_WINS", // Drop old pending frames when window is full
    preferredFormat: "NV12", // Pixel format for AI worker
  });

  // Wire AI Client to Feeder (bidirectional dependency)
  // Client calls feeder methods, feeder uses client's send function
  aiClient.setFeeder(aiFeeder);

  // ============================================================
  // EVENT SUBSCRIPTIONS & CALLBACKS
  // ============================================================
  // Wire up event handlers for session lifecycle and AI results

  // Synchronization flag to prevent race conditions during startup
  // orchestratorReady: Ensures FSM is subscribed to bus before enabling frame forwarding
  let orchestratorReady = false;
  let frameMonitorTimer: NodeJS.Timeout | null = null;
  let frameMonitorAttempts = 0;
  let frameMonitorHadStall = false;
  let frameMonitorExhaustedLogged = false;
  let frameMonitorStartedAt = 0;
  const FRAME_MONITOR_INTERVAL_MS = 500;
  const FRAME_STALL_THRESHOLD_MS = 1200;
  const FRAME_MONITOR_MAX_ATTEMPTS = 2;
  const FRAME_MONITOR_GRACE_MS = 500;
  const FRAME_MONITOR_FIRST_FRAME_MS = 1500;
  let cameraRestarting = false;
  let liveRestarting = false;
  let liveRestartAfterFirstFrame = false;

  // Forwarding safety net: if orchestratorReady signal races with InitOk, make sure we open the gate anyway
  const FORWARDING_SAFETY_TIMEOUT_MS = 3000;
  let forwardingSafetyTimer: NodeJS.Timeout | null = null;

  const clearForwardingSafetyTimer = () => {
    if (forwardingSafetyTimer) {
      clearTimeout(forwardingSafetyTimer);
      forwardingSafetyTimer = null;
    }
  };

  const scheduleForwardingSafety = (trigger: string) => {
    clearForwardingSafetyTimer();
    forwardingSafetyTimer = setTimeout(() => {
      forwardingSafetyTimer = null;
      if (aiFeeder.isForwardingEnabled()) {
        return;
      }

      const captureRunningNow = nv12Capture.isRunning();

      logger.warn("Forwarding safety timeout reached, forcing enable", {
        module: "main",
        trigger,
        orchestratorReady,
        captureRunning: captureRunningNow,
      });

      aiFeeder.setForwardingEnabled(true);
    }, FORWARDING_SAFETY_TIMEOUT_MS);
  };

  const enableForwardingWhenOrchestratorReady = (source: string) => {
    if (aiFeeder.isForwardingEnabled()) {
      clearForwardingSafetyTimer();
      return;
    }

    if (!orchestratorReady) {
      logger.debug("Orchestrator not ready yet, delaying forwarding", {
        module: "main",
        source,
      });
      setTimeout(() => enableForwardingWhenOrchestratorReady(source), 100);
      return;
    }

    logger.info("Enabling frame forwarding", {
      module: "main",
      source,
      captureRunning: nv12Capture.isRunning(),
    });
    aiFeeder.setForwardingEnabled(true);
    clearForwardingSafetyTimer();
  };

  // Force a full stop/start cycle on the live publisher so the UI stream recovers after capture hiccups.
  const restartLivePublisher = async (reason: string): Promise<void> => {
    if (liveRestarting) {
      logger.warn("Live publisher restart already in progress", {
        module: "main",
        reason,
      });
      return;
    }

    liveRestarting = true;

    try {
      logger.warn("Restarting live publisher", {
        module: "main",
        reason,
      });

      statusService.setLiveStreamRunning(false);

      try {
        await livePublisher.stop(1000);
      } catch (error) {
        logger.error("Live publisher stop before restart failed", {
          module: "main",
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await livePublisher.start();
      statusService.setLiveStreamRunning(true);

      logger.info("Live publisher restart complete", {
        module: "main",
        reason,
      });
    } catch (error) {
      logger.error("Live publisher restart failed", {
        module: "main",
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      liveRestarting = false;
    }
  };

  const restartCameraHub = async (reason: string): Promise<void> => {
    if (cameraRestarting) {
      logger.warn("Camera hub restart already in progress", {
        module: "main",
        reason,
      });
      return;
    }

    cameraRestarting = true;

    try {
      logger.warn("Restarting camera hub due to stalled frames", {
        module: "main",
        reason,
      });

      await camera.stop();

      logger.info("Camera hub stopped, starting again", {
        module: "main",
        reason,
      });

      await camera.start();

      logger.info("Waiting for camera hub ready after restart", {
        module: "main",
        reason,
      });

      await camera.ready();

      logger.info("Camera hub restart complete", {
        module: "main",
        reason,
      });

      await restartLivePublisher(`${reason}-camera`);

      if (nv12Capture.isRunning()) {
        void aiFeeder.restartCapture(`${reason}-camera-restart`);
      }
    } catch (error) {
      logger.error("Camera hub restart failed", {
        module: "main",
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      cameraRestarting = false;
    }
  };

  let frameMonitorWaitingFirstFrameLogged = false;

  const stopFrameMonitor = () => {
    if (frameMonitorTimer) {
      clearInterval(frameMonitorTimer);
      frameMonitorTimer = null;
    }
    frameMonitorAttempts = 0;
    frameMonitorHadStall = false;
    frameMonitorExhaustedLogged = false;
    frameMonitorStartedAt = 0;
    frameMonitorWaitingFirstFrameLogged = false;
    liveRestartAfterFirstFrame = false;
  };

  const startFrameMonitor = (source: string) => {
    stopFrameMonitor();
    frameMonitorStartedAt = Date.now();
    frameMonitorTimer = setInterval(() => {
      const stats = aiFeeder.getDiagnostics();
      const now = Date.now();
      const sinceStart = frameMonitorStartedAt
        ? now - frameMonitorStartedAt
        : 0;
      const withinStallGrace = sinceStart < FRAME_MONITOR_GRACE_MS;
      const captureDown = !stats.captureRunning;
      const noFramesYet = stats.framesReceived === 0;
      const lastFrameAgeMs = Math.max(0, now - stats.lastFrameTs);
      const waitingFirstFrame = noFramesYet;
      const withinFirstFrameGrace =
        waitingFirstFrame && sinceStart < FRAME_MONITOR_FIRST_FRAME_MS;

      if (!liveRestartAfterFirstFrame && stats.framesReceived > 0) {
        liveRestartAfterFirstFrame = true;
        void restartLivePublisher(`${source}-first-frame`);
      }

      if (waitingFirstFrame && withinFirstFrameGrace) {
        if (!frameMonitorWaitingFirstFrameLogged) {
          frameMonitorWaitingFirstFrameLogged = true;
          logger.info("Frame monitor waiting for first frame", {
            module: "main",
            source,
            elapsedMs: sinceStart,
          });
        }
        return;
      }

      frameMonitorWaitingFirstFrameLogged = false;

      const stalled =
        captureDown ||
        (!withinStallGrace &&
          (waitingFirstFrame
            ? !withinFirstFrameGrace
            : lastFrameAgeMs > FRAME_STALL_THRESHOLD_MS));

      if (stalled) {
        frameMonitorHadStall = true;
        if (frameMonitorAttempts < FRAME_MONITOR_MAX_ATTEMPTS) {
          frameMonitorAttempts += 1;
          frameMonitorExhaustedLogged = false;
          logger.warn("Frame monitor detected stalled capture", {
            module: "main",
            source,
            attempt: frameMonitorAttempts,
            captureRunning: stats.captureRunning,
            framesReceived: stats.framesReceived,
            lastFrameAgeMs,
            withinStallGrace,
            waitingFirstFrame,
            withinFirstFrameGrace,
            monitorElapsedMs: sinceStart,
          });
          void aiFeeder.restartCapture(`${source}-monitor-restart-${frameMonitorAttempts}`);
        } else if (!frameMonitorExhaustedLogged) {
          frameMonitorExhaustedLogged = true;
          logger.error("Frame monitor exhausted restart attempts", {
            module: "main",
            source,
            captureRunning: stats.captureRunning,
            framesReceived: stats.framesReceived,
            lastFrameAgeMs,
            withinStallGrace,
            waitingFirstFrame,
            withinFirstFrameGrace,
            monitorElapsedMs: sinceStart,
          });
          frameMonitorAttempts = 0;
          frameMonitorStartedAt = Date.now();
          frameMonitorWaitingFirstFrameLogged = false;
          void restartCameraHub(`${source}-monitor-exhausted`);
        }
        return;
      }

      if (frameMonitorHadStall) {
        logger.info("Frame flow recovered", {
          module: "main",
          source,
          framesReceived: stats.framesReceived,
          lastFrameAgeMs,
        });
      }

      frameMonitorHadStall = false;
      frameMonitorAttempts = 0;
      frameMonitorExhaustedLogged = false;
    }, FRAME_MONITOR_INTERVAL_MS);
  };

  const parseEventTimestamp = (value: unknown): Date => {
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  };

  // --- Session Lifecycle Event Handlers ---
  // These events are published by the Orchestrator FSM when state transitions occur

  // Handle session.open event (FSM enters ACTIVE state)
  bus.subscribe("session.open", (event) => {
    sessionManager.openSession(event.sessionId);
    statusService.setSessionActive(true, event.sessionId ?? null);
  });

  // Handle session.close event (FSM exits CLOSING state back to IDLE)
  bus.subscribe("session.close", (event) => {
    sessionManager.closeSession(event.sessionId);
    statusService.setSessionActive(false, event.sessionId ?? null);
  });

  // Track AI activity for status reporting
  bus.subscribe("ai.detection", (event: any) => {
    const ts = parseEventTimestamp(event?.meta?.ts);
    statusService.setDetection(ts);
  });

  bus.subscribe("ai.keepalive", (event: any) => {
    const ts = parseEventTimestamp(event?.meta?.ts);
    statusService.setHeartbeat(ts);
  });

  // --- AI Worker Callbacks ---
  // These callbacks are invoked by AIFeeder when AI worker state changes

  aiFeeder.setCallbacks({
    /**
     * onReady - Called when AI worker handshake completes successfully
     *
     * This callback fires:
     * - On initial connection after Init/InitOk handshake
     * - On reconnection after worker crash/restart
     *
     * Flow Control:
     * - Keeps NV12 capture running so SHM never loses consumers
     * - Enables frame forwarding only after orchestrator initialization
     * - Re-enables forwarding automatically after reconnections
     */
    onReady: () => {
      const captureRunning = nv12Capture.isRunning();
      const forwardingEnabled = aiFeeder.isForwardingEnabled();

      logger.info("AI connection ready (InitOk received)", {
        module: "main",
        captureRunning,
        forwardingEnabled,
        orchestratorReady,
      });

      if (!captureRunning) {
        logger.warn("NV12 capture not running, re-priming", {
          module: "main",
        });
        void aiFeeder.start();
      }

      scheduleForwardingSafety("ai-feeder-onReady");
      enableForwardingWhenOrchestratorReady("ai-feeder-onReady");
      startFrameMonitor("ai-feeder-onReady");
    },

    /**
     * onResult - AI Detection Result Handler
     *
     * This is the core callback that processes every detection result from the AI worker.
     * It's called for EVERY frame processed, regardless of whether detections were found.
     *
     * Three Main Responsibilities:
     * ============================
     *
     * 1. Filter Detections by Configured Classes
     *    - Only classes in CONFIG.ai.classesFilter are considered "relevant"
     *    - Example: ["person", "car"] ignores cats, dogs, etc.
     *
     * 2. Ingest Frames + Detections to Session Store
     *    - Only happens when session is ACTIVE and relevant detections exist
     *    - Retrieves original NV12 frame from cache by frameId
     *    - Uploads frame with detection metadata via FrameIngester
     *
     * 3. Publish Events to Event Bus for Orchestrator FSM
     *    - ai.detection: When relevant detections found (triggers state transitions)
     *    - ai.keepalive: When no relevant detections (proves AI is alive, doesn't affect state)
     *
     * FSM State Transitions Triggered:
     * ================================
     * - IDLE → DWELL: First ai.detection event
     * - DWELL → ACTIVE: ai.detection during dwell window
     * - ACTIVE: Each ai.detection resets silence timer
     * - CLOSING → ACTIVE: ai.detection during post-roll re-activates session
     *
     * @param result - Protobuf Result message from AI worker
     */
    onResult: (result: any) => {
      const detections = result.detections?.items || [];

      logger.debug("Received detection result", {
        module: "main",
        frameId: result.frameId?.toString(),
        totalDetections: detections.length,
      });

      // =========================================================
      // STEP 1: Filter Detections by Configured Classes
      // =========================================================
      // Only detections matching CONFIG.ai.classesFilter are "relevant"
      // This prevents false positives from triggering recordings
      const relevantDetections = detections.filter((det: any) =>
        CONFIG.ai.classesFilter.includes(det.cls || "")
      );

      const hasRelevant = relevantDetections.length > 0;
      const stableTrackDetections = relevantDetections.filter((det: any) => {
        const trackId = det.trackId?.trim();
        const isPlaceholder = !trackId || trackId.startsWith("det-");

        if (isPlaceholder) {
          logger.debug("Skipping detection without stable trackId", {
            module: "main",
            frameId: result.frameId?.toString(),
            rawTrackId: det.trackId,
          });
        }

        return !isPlaceholder;
      });
      const hasStableTracks = stableTrackDetections.length > 0;

      logger.debug("Filtered detections", {
        module: "main",
        total: detections.length,
        relevant: relevantDetections.length,
        stableTracks: stableTrackDetections.length,
        hasRelevant,
        hasStableTracks,
      });

      // =========================================================
      // STEP 2: Ingest Frames + Detections (if session active)
      // =========================================================
      // Only ingest when:
      // - Session is ACTIVE (orchestrator opened a session)
      // - Relevant detections exist (matching configured classes)
      if (sessionManager.hasActiveSession() && hasStableTracks) {
        // Transform protobuf detections to ingest API format
        const ingestDetections = stableTrackDetections.map((det: any) => {
          const trackId = det.trackId?.trim();
          const x1 = det.bbox?.x1 ?? 0;
          const y1 = det.bbox?.y1 ?? 0;
          const x2 = det.bbox?.x2 ?? x1;
          const y2 = det.bbox?.y2 ?? y1;

          return {
            trackId: trackId ?? "",
            cls: det.cls || "",
            conf: det.conf || 0,
            bbox: {
              x: x1,
              y: y1,
              w: Math.max(0, x2 - x1),
              h: Math.max(0, y2 - y1),
            },
          };
        });

        // Retrieve original NV12 frame from cache using frameId correlation
        const frameId = result.frameId?.toString() ?? null;

        if (frameId !== null) {
          // Ingest frame + detections via SessionManager
          // FrameIngester gestiona la subida y aplica reintentos
          void sessionManager.ingestFrame(frameId, ingestDetections);
        }
      } else if (sessionManager.hasActiveSession() && hasRelevant) {
        logger.debug("Session active but detections lack stable track IDs, skipping ingestion", {
          module: "main",
          frameId: result.frameId?.toString(),
          detections: relevantDetections.length,
        });
      }

      // =========================================================
      // STEP 3: Publish Events to Bus (FSM State Management)
      // =========================================================
      if (hasRelevant) {
        // Transform protobuf detections to bus event format
        const eventDetections = relevantDetections.map((det: any) => ({
          cls: det.cls || "",
          conf: det.conf || 0,
          bbox: [
            det.bbox?.x1 || 0,
            det.bbox?.y1 || 0,
            (det.bbox?.x2 || 0) - (det.bbox?.x1 || 0),
            (det.bbox?.y2 || 0) - (det.bbox?.y1 || 0),
          ] as [number, number, number, number],
          trackId: det.trackId || undefined,
        }));

        // Try to get frame metadata from cache for accurate timestamps
        // Fallback to current time if frame not in cache (shouldn't happen)
        const frameId = result.frameId?.toString() ?? null;
        const cachedFrame = frameId ? frameCache.get(frameId) : null;

        const frameMeta = cachedFrame
          ? {
              ts: cachedFrame.captureTs, // Original capture timestamp
              width: cachedFrame.meta.width,
              height: cachedFrame.meta.height,
              pixFmt: "NV12" as const,
            }
          : {
              ts: new Date().toISOString(), // Fallback to current time
              width: CONFIG.ai.width,
              height: CONFIG.ai.height,
              pixFmt: "NV12" as const,
            };

        // Publish ai.detection event to bus
        // This triggers FSM transitions:
        // - IDLE → DWELL (first detection)
        // - DWELL → ACTIVE (confirmation)
        // - ACTIVE: Resets silence timer
        // - CLOSING → ACTIVE (re-activation during post-roll)
        bus.publish("ai.detection", {
          type: "ai.detection",
          relevant: true,
          score: Math.max(...eventDetections.map((d: any) => d.conf), 0), // Highest confidence
          detections: eventDetections,
          meta: frameMeta,
        });
      } else {
        // No relevant detections found
        // Publish ai.keepalive event to prove AI worker is alive
        // NOTE: This does NOT reset silence timer in ACTIVE state
        const frameMeta = {
          ts: new Date().toISOString(),
          width: CONFIG.ai.width,
          height: CONFIG.ai.height,
          pixFmt: "NV12" as const,
        };

        bus.publish("ai.keepalive", {
          type: "ai.keepalive",
          score: 0,
          detections: [],
          meta: frameMeta,
        });
      }
    },

    /**
     * onError - AI Worker Error Handler
     *
     * Called when:
     * - TCP connection fails
     * - Protobuf parsing errors
     * - Worker crashes
     *
     * AIClientTcp handles reconnection automatically with exponential backoff
     */
    onError: (err) => {
      logger.error("AI error", { module: "main", error: err.message });
      stopFrameMonitor();
    },
  });

  // ============================================================
  // ORCHESTRATOR (FINITE STATE MACHINE)
  // ============================================================
  // The Orchestrator is the brain of the system - it coordinates all modules
  // based on events and manages the recording lifecycle FSM

  /**
   * AI Adapter - Compatibility Layer for Orchestrator
   *
   * The orchestrator expects an AIEngine interface, but we use AIFeeder directly.
   * This adapter bridges the gap and propagates session IDs to the feeder.
   */
  let activeSessionId: string | null = null;

  const aiAdapter = {
    /**
     * Set session ID for frame correlation
     *
     * Propagates sessionId from orchestrator to feeder so frames can be
     * tagged with the correct session before sending to AI worker.
     */
    setSessionId(sessionId: string) {
      // Propagate to feeder (single source of truth for sessionId)
      const normalized = sessionId.trim();
      aiFeeder.setSessionId(normalized);
      activeSessionId = normalized;
      logger.debug("AI adapter session ID set", {
        module: "main",
        sessionId: normalized,
      });
    },

    async closeSession(sessionId: string) {
      const normalized = sessionId.trim();

      if (!activeSessionId) {
        logger.info("Closing AI session without activeSessionId", {
          module: "main",
          sessionId: normalized,
        });
      } else if (activeSessionId !== normalized) {
        logger.warn("Session ID mismatch on close", {
          module: "main",
          expected: activeSessionId,
          received: normalized,
        });
      }

      aiFeeder.setSessionId(null);
      aiClient.sendEnd();
      logger.info("AI adapter session close signal sent", {
        module: "main",
        sessionId: normalized,
      });
      activeSessionId = null;
    },
  };

  // Create orchestrator with all module adapters
  // Orchestrator will coordinate state transitions and call adapter methods
  const orch = new Orchestrator(bus, {
    camera, // Video capture control
    capture: aiFeeder as any, // Frame rate control (setFps method)
    ai: aiAdapter as any, // AI session correlation
    publisher: recordPublisherAdapter as any, // RTSP streaming control (recording path)
    store, // Session lifecycle API
  });

  // ============================================================
  // STARTUP SEQUENCE
  // ============================================================
  // Critical initialization order to prevent race conditions:
  //
  // 1. Camera hub starts first
  //    - Begins continuous I420 capture to shared memory
  //    - Must be ready before any module tries to read from SHM
  //
  // 2. AI client connects to worker
  //    - Performs Init/InitOk handshake
  //    - Triggers onReady callback, but waits for orchestrator
  //    - Sets up bidirectional communication channel
  //
  // 3. Orchestrator initializes
  //    - Subscribes to all bus events
  //    - FSM enters IDLE state
  //    - Ready to process ai.detection events
  //
  // 4. Set orchestratorReady flag
  //    - Signals AI feeder it's safe to start publishing events
  //    - Prevents race where events are published before FSM subscribes
  //    - AIFeeder.start() is called from onReady callback after this

  logger.info("Starting camera hub", { module: "main" });
  statusServer = await startStatusServer(statusService, CONFIG.status.port);
  await camera.start();

  logger.info("Waiting for camera hub ready", { module: "main" });
  await camera.ready();

  logger.info("Priming AI feeder capture before AI handshake", {
    module: "main",
  });
  await aiFeeder.start();

  logger.info("Starting continuous live publisher", {
    module: "main",
    streamPath: CONFIG.mediamtx.livePath,
  });
  await livePublisher.start();
  statusService.setLiveStreamRunning(true);

  logger.info("Connecting to AI worker", { module: "main" });
  await aiClient.connect();

  logger.info("Initializing orchestrator FSM", { module: "main" });
  await orch.init();

  // Signal that orchestrator is ready (allows AI feeder to start)
  // This unblocks the polling loop in onReady callback
  orchestratorReady = true;
  if (!aiFeeder.isForwardingEnabled()) {
    logger.debug("Orchestrator ready signal received, checking forwarding gate", {
      module: "main",
    });
    scheduleForwardingSafety("orchestrator-ready");
    enableForwardingWhenOrchestratorReady("orchestrator-ready");
  }

  logger.info("=== Edge Agent Ready ===", { module: "main" });

  // ============================================================
  // GRACEFUL SHUTDOWN HANDLER
  // ============================================================
  // Handles SIGINT (Ctrl+C) and SIGTERM (Docker stop, systemd, etc.)
  //
  // Shutdown Order (reverse of startup):
  // 1. Orchestrator: Close active session, stop timers, unsubscribe from bus
  // 2. AI Feeder: Stop frame capture, clear cache
  // 3. AI Client: Close TCP connection gracefully
  // 4. Camera Hub: Stop GStreamer pipeline, cleanup SHM
  //
  // Timeout: 10 seconds max (prevents hanging on unresponsive modules)

  const SHUTDOWN_TIMEOUT_MS = 10000;
  const SHUTDOWN_TIMEOUT_SECS = Math.round(SHUTDOWN_TIMEOUT_MS / 1000);

  const shutdown = async () => {
    logger.info("Shutdown signal received", { module: "main" });
    stopFrameMonitor();
    clearForwardingSafetyTimer();

    // Force exit if graceful shutdown takes too long
    const timeout = setTimeout(() => {
      logger.error(
        `Shutdown timeout (${SHUTDOWN_TIMEOUT_SECS}s), forcing exit`,
        {
          module: "main",
        }
      );
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      // Stop modules in reverse dependency order
      logger.debug("Shutting down orchestrator", { module: "main" });
      await orch.shutdown();

      logger.debug("Stopping AI feeder", { module: "main" });
      await aiFeeder.stop();
      aiFeeder.destroy(); // Clean up frame cache

      logger.debug("Disconnecting AI client", { module: "main" });
      await aiClient.shutdown();

      logger.debug("Stopping live publisher", { module: "main" });
      try {
        await livePublisher.stop();
      } finally {
        statusService.setLiveStreamRunning(false);
      }

      logger.debug("Stopping camera hub", { module: "main" });
      await camera.stop();

      if (statusServer) {
        logger.debug("Stopping status server", { module: "main" });
        await new Promise<void>((resolve) =>
          statusServer!.close(() => resolve())
        );
        statusServer = null;
      }

      // Success - clear timeout and exit cleanly
      clearTimeout(timeout);
      logger.info("Shutdown complete", { module: "main" });
      process.exit(0);
    } catch (err) {
      // Shutdown error - log and exit with error code
      clearTimeout(timeout);
      logger.error("Shutdown error", {
        module: "main",
        error: (err as Error).message,
      });
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on("SIGINT", shutdown); // Ctrl+C
  process.on("SIGTERM", shutdown); // Docker/systemd stop
}

main().catch((err) => {
  logger.error("Fatal error", { module: "main", error: err.message });
  process.exit(1);
});
