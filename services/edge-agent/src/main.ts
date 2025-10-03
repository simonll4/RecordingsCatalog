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

  // Inyectar capture y ai al Orchestrator
  const orch = new Orchestrator(ai, capture, camera, publisher, io);

  // init() ahora es async y espera a camera.ready()
  await orch.init();

  console.log("=== Edge Agent Ready ===");

  // Manejo de señales para shutdown limpio
  process.on("SIGINT", () => {
    console.log("\n[Main] SIGINT received, shutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n[Main] SIGTERM received, shutting down...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
