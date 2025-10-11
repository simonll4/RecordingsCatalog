/**
 * Main - Edge Agent Bootstrap
 *
 * Composition root with NV12/I420 support:
 * - Camera Hub: Always-on capture → SHM (I420)
 * - NV12 Capture: SHM → NV12 frames
 * - AI Feeder: Frame coordination + backpressure
 * - AI Client TCP: Binary protocol
 * - Publisher: SHM → RTSP (on-demand)
 * - Session Store: Batch detections
 * - Orchestrator: FSM coordination
 */

// === Core ===
import { CONFIG } from "../config/index.js";
import { Bus } from "../core/bus/bus.js";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";

// === Modules ===
import { CameraHubGst } from "../modules/video/adapters/gstreamer/camera-hub-gst.js";
import { NV12CaptureGst } from "../modules/video/adapters/gstreamer/nv12-capture-gst.js";
import { AIFeeder } from "../modules/ai/ai-feeder.js";
import { AIClientTcp } from "../modules/ai/client/ai-client-tcp.js";
import { PublisherGst } from "../modules/streaming/adapters/gstreamer/publisher-gst.js";
import { SessionStoreHttp } from "../modules/store/adapters/http/session-store-http.js";
import { FrameIngester } from "../modules/ai/ingest/frame-ingester.js";

// === Shared ===
import { logger } from "../shared/logging.js";

async function main() {
  logger.setLevel(CONFIG.logLevel);

  logger.info("=== Edge Agent Starting ===", { module: "main" });
  logger.info("Configuration loaded", { module: "main", config: CONFIG });

  // ============================================================
  // INITIALIZATION
  // ============================================================

  const bus = new Bus();

  // --- Video Pipeline ---
  const camera = new CameraHubGst();      // V4L2/RTSP → SHM (I420)
  const nv12Capture = new NV12CaptureGst(); // SHM → NV12 frames
  const publisher = new PublisherGst();    // SHM → RTSP (on-demand)

  // --- AI Pipeline ---
  const aiClient = new AIClientTcp(CONFIG.ai.worker.host, CONFIG.ai.worker.port);
  const aiFeeder = new AIFeeder(nv12Capture, CONFIG.ai.frameCacheTtlMs);

  // --- Storage ---
  const store = new SessionStoreHttp();
  const frameIngester = new FrameIngester(CONFIG.store.baseUrl);

  // ============================================================
  // CONFIGURATION
  // ============================================================

  // Configure AI Feeder with model settings
  aiFeeder.init({
    model: CONFIG.ai.modelName,
    width: CONFIG.ai.width,
    height: CONFIG.ai.height,
    maxInflight: 4,
    policy: "LATEST_WINS",
    preferredFormat: "NV12",
  });

  // Wire AI Client + Feeder
  aiClient.setFeeder(aiFeeder);

  // ============================================================
  // SESSION TRACKING & EVENT HANDLING
  // ============================================================

  // Session state for detection ingestion
  let currentSessionId: string | null = null;
  let frameSeqNo = 0;

  // Frame cache for metadata (timestamps, dimensions)
  const frameCache = aiFeeder.getFrameCache();

  // Synchronization flags to prevent race conditions during startup
  let orchestratorReady = false;
  let feederStarted = false;

  // --- Session Lifecycle Events ---

  bus.subscribe("session.open", (event: any) => {
    currentSessionId = event.sessionId;
    frameSeqNo = 0;
    logger.info("Session opened", {
      module: "main",
      sessionId: event.sessionId,
    });
  });

  bus.subscribe("session.close", (event: any) => {
    currentSessionId = null;
    frameSeqNo = 0;
    logger.info("Session closed", {
      module: "main",
      sessionId: event.sessionId,
    });
  });

  // --- AI Callbacks ---

  aiFeeder.setCallbacks({
    onReady: () => {
      // Only start feeder once, not on every reconnect
      if (feederStarted) {
        logger.info("AI reconnected, feeder already running", {
          module: "main",
        });
        return;
      }

      logger.info("AI connection ready, waiting for orchestrator", {
        module: "main",
      });

      // Wait for orchestrator to initialize before starting frame capture
      // This prevents events from being published before FSM is subscribed
      const startWhenReady = () => {
        if (orchestratorReady) {
          logger.info("Orchestrator ready, starting frame capture", {
            module: "main",
          });
          void aiFeeder.start();
          feederStarted = true;
        } else {
          logger.debug("Waiting for orchestrator initialization...", {
            module: "main",
          });
          setTimeout(startWhenReady, 100);
        }
      };
      startWhenReady();
    },

    /**
     * onResult - AI detection callback
     * 
     * Responsibilities:
     * 1. Filter detections by configured classes
     * 2. Ingest frames + detections to session store (if session active)
     * 3. Publish events to bus for orchestrator FSM
     */
    onResult: (result) => {
      const detections = result.detections?.items || [];

      logger.debug("Received detection result", {
        module: "main",
        frameId: result.frameId?.toString(),
        totalDetections: detections.length,
      });

      // --- 1. Filter Detections ---
      const relevantDetections = detections.filter((det) =>
        CONFIG.ai.classesFilter.includes(det.cls || "")
      );

      const hasRelevant = relevantDetections.length > 0;

      logger.debug("Filtered detections", {
        module: "main",
        total: detections.length,
        relevant: relevantDetections.length,
        hasRelevant,
      });

      // --- 2. Ingest Frames + Detections (if session active) ---
      if (currentSessionId && hasRelevant) {
        // Map detections to ingest format
        const ingestDetections = relevantDetections.map((det, idx) => ({
          trackId: det.trackId || `track_${Date.now()}_${idx}`,
          cls: det.cls || "",
          conf: det.conf || 0,
          bbox: {
            x: det.bbox?.x1 || 0,
            y: det.bbox?.y1 || 0,
            w: (det.bbox?.x2 || 0) - (det.bbox?.x1 || 0),
            h: (det.bbox?.y2 || 0) - (det.bbox?.y1 || 0),
          },
        }));

        // Try to get NV12 frame from cache
        const frameId = result.frameId?.toString() ?? null;

        if (frameId !== null) {
          const cachedFrame = frameCache.get(frameId);

          if (cachedFrame) {
            const payload = {
              sessionId: currentSessionId!,
              seqNo: frameSeqNo++,
              captureTs: cachedFrame.captureTs,
              detections: ingestDetections,
            };

            // Send NV12 frame + detections to /ingest endpoint
            void frameIngester
              .ingestNV12(payload, cachedFrame.data, cachedFrame.meta)
              .then((success: boolean) => {
                if (success) {
                  logger.debug("Frame + detections ingested", {
                    module: "main",
                    sessionId: currentSessionId || undefined,
                    seqNo: payload.seqNo,
                    frameId,
                    detections: ingestDetections.length,
                  });
                }
              })
              .catch((err: Error) => {
                logger.error("Failed to ingest frame", {
                  module: "main",
                  frameId,
                  error: err.message,
                });
              });
          } else {
            logger.warn("No cached NV12 frame available for ingestion", {
              module: "main",
              requestedFrameId: frameId,
            });
          }
        }
      }

      // --- 3. Publish Events to Bus (FSM) ---
      if (hasRelevant) {
        // Map protobuf detections to bus event format
        const eventDetections = relevantDetections.map((det) => ({
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
        const frameId = result.frameId?.toString() ?? null;
        const cachedFrame = frameId ? frameCache.get(frameId) : null;

        const frameMeta = cachedFrame
          ? {
              ts: cachedFrame.captureTs,
              width: cachedFrame.meta.width,
              height: cachedFrame.meta.height,
              pixFmt: "NV12" as const,
            }
          : {
              ts: new Date().toISOString(),
              width: CONFIG.ai.width,
              height: CONFIG.ai.height,
              pixFmt: "NV12" as const,
            };

        // Publish ai.detection event (triggers FSM: IDLE→DWELL, DWELL→ACTIVE, resets ACTIVE silence)
        bus.publish("ai.detection", {
          type: "ai.detection",
          relevant: true,
          score: Math.max(...eventDetections.map((d) => d.conf), 0),
          detections: eventDetections,
          meta: frameMeta,
        });
      } else {
        // Publish ai.keepalive (liveness only - does NOT reset silence timer)
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
    onError: (err) => {
      logger.error("AI error", { module: "main", error: err.message });
    },
  });

  // ============================================================
  // ORCHESTRATOR (FSM)
  // ============================================================

  // AI Adapter - Compatibility interface for orchestrator
  const aiAdapter = {
    async setModel(cfg: any) {
      logger.info("Model config set", { module: "main", config: cfg });
    },
    async run(frame: Buffer, meta: any) {
      // Not used - AI Feeder handles frame submission directly
    },
    setSessionId(sessionId: string) {
      // Propagate to feeder (single source of truth)
      aiFeeder.setSessionId(sessionId);
      logger.debug("AI adapter session ID set", { module: "main", sessionId });
    },
  };

  const orch = new Orchestrator(bus, {
    camera,
    capture: aiFeeder as any,
    ai: aiAdapter as any,
    publisher,
    store,
  });

  // ============================================================
  // STARTUP SEQUENCE
  // ============================================================
  // Critical order to prevent race conditions:
  // 1. Camera hub starts (always-on I420 stream)
  // 2. AI client connects (triggers onReady callback, but waits for orchestrator)
  // 3. Orchestrator initializes (subscribes to bus events)
  // 4. Set orchestratorReady flag (allows AI feeder to start)

  await camera.start();
  await aiClient.connect();
  await orch.init();

  orchestratorReady = true; // Signal AI feeder can start

  logger.info("=== Edge Agent Ready ===", { module: "main" });

  // ============================================================
  // SHUTDOWN HANDLER
  // ============================================================

  const shutdown = async () => {
    logger.info("Shutdown signal received", { module: "main" });

    const timeout = setTimeout(() => {
      logger.error("Shutdown timeout (2s), forcing exit", { module: "main" });
      process.exit(1);
    }, 2000);

    try {
      await orch.shutdown();
      await aiFeeder.stop();
      await aiClient.shutdown();
      await camera.stop();

      clearTimeout(timeout);
      logger.info("Shutdown complete", { module: "main" });
      process.exit(0);
    } catch (err) {
      clearTimeout(timeout);
      logger.error("Shutdown error", {
        module: "main",
        error: (err as Error).message,
      });
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("Fatal error", { module: "main", error: err.message });
  process.exit(1);
});
