#!/usr/bin/env node

import { config } from "dotenv";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CamerasConfigSchema } from "../../../packages/common/dist/index.js";
import { EdgeAgent } from "../../../packages/agent/dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Load environment variables
  config();

  console.log("🚀 Starting Edge Agent CLI");

  try {
    // Load camera configuration - buscar desde la raíz del proyecto
    const configPath = join(
      __dirname,
      "..",
      "..",
      "..",
      "configs",
      "cameras.json"
    );
    const configFile = await readFile(configPath, "utf-8");
    const camerasConfig = CamerasConfigSchema.parse(JSON.parse(configFile));

    // For now, use the first camera
    const cameraConfig = camerasConfig.cameras[0];
    if (!cameraConfig) {
      throw new Error("No camera configuration found");
    }

    console.log(`📹 Using camera: ${cameraConfig.id}`);
    console.log(`🤖 Detector: ${process.env.DETECTOR || "python"}`);
    console.log(
      `📸 Capture: ${
        process.env.CAPTURE_PROVIDER || cameraConfig.captureProvider
      }`
    );

    // Fix model path to be absolute from project root
    const projectRoot = join(__dirname, "..", "..", "..");
    const modelPath = join(projectRoot, "models", "yolov8s.pt");

    // Create storage directory - absolute path in apps/cli/storage
    const storageDir = join(__dirname, "..", "storage");

    // Create and start edge agent
    const agent = new EdgeAgent({
      camera: {
        ...cameraConfig,
        modelPath, // Use absolute path
        captureProvider:
          (process.env.CAPTURE_PROVIDER as any) || cameraConfig.captureProvider,
      },
      detector: (process.env.DETECTOR as "python") || "python",
      storageDir,
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("🛑 Shutting down...");
      await agent.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Start agent
    await agent.start();

    // Log status periodically
    setInterval(() => {
      const status = agent.getStatus();
      console.log("📊 Status:", {
        state: status.sessionState.state,
        frames: status.frameCount,
        tracks: status.activeTracks,
        session: status.sessionState.sessionId
          ? {
              id: status.sessionState.sessionId.slice(0, 8) + "...",
              classes: status.sessionState.classes,
              duration: Math.round(status.sessionState.duration / 1000) + "s",
            }
          : null,
      });
    }, 10000);

    console.log("✅ Edge Agent started successfully");
    console.log("Press Ctrl+C to stop");
  } catch (error) {
    console.error("❌ Failed to start Edge Agent:", error);
    process.exit(1);
  }
}

// Error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

main().catch(console.error);
