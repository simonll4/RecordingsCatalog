import { CONFIG } from "./infra/config.js";
import { Orchestrator } from "./core/orchestrator.js";
import { Camera } from "./modules/camera.js";
import { Publisher } from "./modules/publisher.js";
import { SessionIO } from "./modules/sessionio.js";
import { AIModule } from "./modules/ai.js";
import { AICapture } from "./modules/capture.js";

async function main() {
  console.log("=== Edge Agent Starting ===");
  console.log("Config:", JSON.stringify(CONFIG, null, 2));

  const camera = new Camera();
  const publisher = new Publisher();
  const io = new SessionIO();
  const ai = new AIModule();

  // Inicializa el módulo de IA con la config requerida
  ai.setOnnxModel(
    CONFIG.ai.modelName,
    CONFIG.ai.umbral,
    CONFIG.ai.height,
    CONFIG.ai.width,
    CONFIG.ai.classNames
  );

  // El callback recibe 1 solo argumento: Buffer
  const onFrame = (frame: Buffer): void => {
    void ai.run(frame, CONFIG.ai.classesFilter);
  };

  // AICapture ahora solo acepta (onFrame)
  const capture = new AICapture(onFrame);

  // Inyectar capture al Orchestrator (ai se usa solo en main.ts)
  const orch = new Orchestrator(capture, camera, publisher, io);

  // init() ahora es async y espera a camera.ready()
  await orch.init();

  console.log("=== Edge Agent Ready ===");

  // Manejo de señales para shutdown limpio
  const shutdown = async () => {
    console.log("\n[Main] Shutdown signal received, cleaning up...");
    
    try {
      // 1. Detener publisher (RTSP)
      console.log("[Main] Stopping publisher...");
      await publisher.stop();
      
      // 2. Detener captura de IA
      console.log("[Main] Stopping AI capture...");
      await capture.stop();
      
      // 3. Detener hub de cámara
      console.log("[Main] Stopping camera hub...");
      camera.stop();
      
      // 4. Flush final de detecciones pendientes
      console.log("[Main] Flushing pending data...");
      // El flush se hace en orchestrator.toIdle()
      
      console.log("[Main] Shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("[Main] Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
