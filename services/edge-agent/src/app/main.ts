/**
 * Main - Composition Root & Bootstrap
 *
 * Este es el punto de entrada del Edge Agent. Se encarga de:
 *
 * 1. Cargar configuración desde variables de entorno (.env)
 * 2. Inicializar el bus de eventos (comunicación entre módulos)
 * 3. Crear e interconectar todos los módulos:
 *    - Camera Hub: Captura always-on → SHM
 *    - AI Capture: SHM → Frames RGB para análisis
 *    - AI Engine: Detección de objetos (simulado)
 *    - Publisher: SHM → Stream RTSP (on-demand)
 *    - Session Store: Gestión de sesiones y detecciones
 *    - Orchestrator: FSM que coordina todo
 *
 * 4. Ejecutar secuencia de startup:
 *    Camera → AI Capture → Orchestrator
 *
 * 5. Manejar shutdown ordenado (SIGINT/SIGTERM):
 *    Orchestrator → AI Capture → Camera → Store flush
 *    con timeout de 2s para evitar hangs
 *
 * Arquitectura:
 * - Bus de eventos: Comunicación desacoplada entre módulos
 * - FSM (Orchestrator): Coordina transiciones de estado
 * - Módulos independientes: Cada uno hace UNA cosa bien
 */

import { CONFIG } from "../config/index.js";
import { Bus } from "../core/bus/bus.js";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";
import { CameraHubGst } from "../modules/video/adapters/gstreamer/camera-hub-gst.js";
import { RGBCaptureGst } from "../modules/video/adapters/gstreamer/rgb-capture-gst.js";
import { AIEngineTcp } from "../modules/ai/engine/ai-engine-tcp.js";
import { AIClientTcp } from "../modules/ai/client/ai-client-tcp.js";
import { PublisherGst } from "../modules/streaming/adapters/gstreamer/publisher-gst.js";
import { SessionStoreHttp } from "../modules/store/adapters/http/session-store-http.js";
import { logger } from "../shared/logging.js";
import { FrameMeta } from "../types/detections.js";

async function main() {
  // === 1. Configuración ===
  // Nivel de logging configurable: debug | info | warn | error
  logger.setLevel(CONFIG.logLevel);

  logger.info("=== Edge Agent Starting ===", { module: "main" });
  logger.info("Configuration loaded", { module: "main", config: CONFIG });

  // === 2. Bus de Eventos ===
  // Canal central de comunicación con backpressure (evita memory leaks)
  const bus = new Bus();

  // === 3. Crear Módulos ===
  // Cada módulo es independiente y se comunica vía el bus
  const camera = new CameraHubGst(); // V4L2/RTSP → SHM (always-on)
  const aiClient = new AIClientTcp(CONFIG.ai.worker.host, CONFIG.ai.worker.port); // Cliente TCP
  const ai = new AIEngineTcp(bus, aiClient); // Motor de IA (TCP)
  const publisher = new PublisherGst(); // SHM → RTSP MediaMTX (on-demand)
  const store = new SessionStoreHttp(); // API sessions + detections batch

  // Configurar motor de IA con parámetros del modelo
  await ai.setModel({
    modelName: CONFIG.ai.modelName,
    umbral: CONFIG.ai.umbral,
    width: CONFIG.ai.width,
    height: CONFIG.ai.height,
    classesFilter: CONFIG.ai.classesFilter, // Filtro de clases
  });

  // AI Capture: Extrae frames del SHM y los pasa al motor IA
  // Callback ejecutado por cada frame RGB procesado
  const onFrame = (frame: Buffer, meta: FrameMeta): void => {
    void ai.run(frame, meta); // Async sin await (fire-and-forget)
  };

  const capture = new RGBCaptureGst(); // SHM → RGB frames (dual-rate FPS)

  // === 4. Orchestrator (FSM) ===
  // Coordina todo el sistema basado en eventos del bus
  // Estados: IDLE → DWELL → ACTIVE → CLOSING → IDLE
  const orch = new Orchestrator(bus, { camera, capture, ai, publisher, store });

  // === 5. Startup Secuencial ===
  await camera.start(); // 1. Camera hub (siempre activo)
  await capture.start(onFrame); // 2. AI capture (dual-rate FPS)
  await orch.init(); // 3. Orchestrator FSM ready

  logger.info("=== Edge Agent Ready ===", { module: "main" });

  // === 6. Shutdown Ordenado ===
  // Manejo de señales con timeout de 2s (evita hangs)
  const shutdown = async () => {
    logger.info("Shutdown signal received", { module: "main" });

    // Timeout de seguridad: si no termina en 2s, forzar exit
    const timeout = setTimeout(() => {
      logger.error("Shutdown timeout (2s), forcing exit", { module: "main" });
      process.exit(1);
    }, 2000);

    try {
      // Orden específico para evitar pérdida de datos:
      await orch.shutdown(); // 1. FSM + stop publisher (cierra session si hay)
      await capture.stop(); // 2. Stop AI capture (libera pipeline)
      await camera.stop(); // 3. Stop camera hub (libera SHM)
      await store.flushAll(); // 4. Flush pending detections (último batch)

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
