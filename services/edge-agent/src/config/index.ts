/**
 * Configuration - Centralized Edge Agent Configuration
 *
 * This module is the SINGLE SOURCE OF TRUTH for configuration.
 * It reads from config.toml file and exports a CONFIG singleton.
 *
 * Responsibilities:
 * =================
 *
 * 1. Read config.toml file
 * 2. Parse and validate TOML structure
 * 3. Validate values (e.g., width/height must be even for I420/NV12)
 * 4. Fail fast on startup if required fields are missing
 *
 * Usage:
 * ======
 *
 * ```typescript
 * import { CONFIG } from "./config/index.js";
 *
 * console.log(CONFIG.deviceId);        // "cam-local"
 * console.log(CONFIG.source.uri);      // "/dev/video0"
 * console.log(CONFIG.fsm.dwellMs);     // 500
 * ```
 *
 * Configuration Loading:
 * ======================
 *
 * 1. Read config.toml from project root
 * 2. Parse TOML structure
 * 3. Validation checks ensure consistency
 * 4. CONFIG singleton is exported
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import TOML from "@iarna/toml";
import { AppConfig } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "..", "..", "config.toml");

/**
 * Load TOML Configuration
 *
 * Reads and parses the config.toml file.
 *
 * @returns Parsed TOML object
 * @throws Error if file doesn't exist or is malformed
 */
function loadTomlConfig(): any {
  try {
    const configFile = readFileSync(configPath, "utf-8");
    return TOML.parse(configFile);
  } catch (error: any) {
    throw new Error(`Failed to load config.toml: ${error.message}`);
  }
}

const tomlConfig = loadTomlConfig();

const normalizeList = (value: string | undefined | null) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

const envStatusPort = process.env.EDGE_AGENT_STATUS_PORT;
const statusPortOverride =
  typeof envStatusPort === "string" && envStatusPort.trim().length > 0
    ? Number.parseInt(envStatusPort.trim(), 10)
    : undefined;

// Optional runtime override: comma-separated classes list for quick testing
const envClassesFilter = process.env.EDGE_AGENT_CLASSES_FILTER;
const classesFilterOverride = normalizeList(envClassesFilter);

/**
 * CONFIG Singleton - Application Configuration
 *
 * Immutable object with all Edge Agent configuration.
 * Built at startup from config.toml file.
 */
export const CONFIG: AppConfig = {
  deviceId: tomlConfig.device.id,
  logLevel: tomlConfig.logging.level as "debug" | "info" | "warn" | "error",

  source: {
    kind: tomlConfig.source.kind as "rtsp",
    uri: tomlConfig.source.uri,
    width: tomlConfig.source.width,
    height: tomlConfig.source.height,
    fpsHub: tomlConfig.source.fps_hub,
    socketPath: tomlConfig.source.socket_path,
    shmSizeMB: tomlConfig.source.shm_size_mb,
  },

  ai: {
    modelName: tomlConfig.ai.model_name,
    umbral: tomlConfig.ai.umbral,
    width: tomlConfig.ai.width,
    height: tomlConfig.ai.height,
    classesFilter:
      classesFilterOverride.length > 0
        ? classesFilterOverride
        : normalizeList(tomlConfig.ai.classes_filter),
    fps: {
      idle: tomlConfig.ai.fps_idle,
      active: tomlConfig.ai.fps_active,
    },
    worker: {
      host: tomlConfig.ai.worker_host,
      port: tomlConfig.ai.worker_port,
    },
    frameCacheTtlMs: 2000, // Fixed value, not configurable
  },

  mediamtx: {
    host: tomlConfig.mediamtx.host,
    port: tomlConfig.mediamtx.port,
    recordPath: tomlConfig.mediamtx.record_path ?? tomlConfig.mediamtx.path,
    livePath:
      tomlConfig.mediamtx.live_path ??
      tomlConfig.mediamtx.path ??
      tomlConfig.mediamtx.record_path,
  },

  fsm: {
    dwellMs: tomlConfig.fsm.dwell_ms,
    silenceMs: tomlConfig.fsm.silence_ms,
    postRollMs: tomlConfig.fsm.postroll_ms,
  },

  store: {
    baseUrl: tomlConfig.store.base_url,
    apiKey: undefined, // Not used
  },

  status: {
    // status.port can be overridden by EDGE_AGENT_STATUS_PORT when running standalone
    port:
      typeof statusPortOverride === "number" && !Number.isNaN(statusPortOverride)
        ? statusPortOverride
        : typeof tomlConfig.status?.port === "number"
        ? tomlConfig.status.port
        : 7080,
  },

  bus: {
    maxQueueSize: 1024, // Fixed value, not configurable
  },
};

// ==================== VALIDATION ====================

/**
 * Startup Validation
 *
 * Fail fast if configuration is invalid.
 * Better to crash on startup than at runtime with corrupted frames.
 *
 * Validation Rules:
 * =================
 *
 * YUV420 Format Requirements (I420/NV12)
 *   - GStreamer YUV420 formats require even dimensions
 *   - Width and height must be divisible by 2
 *   - Applies to both source and AI resolution
 *
 * FPS Consistency
 *   - Source FPS must be >= AI active FPS
 *   - Otherwise AI worker can't process frames fast enough
 *   - Would cause frame drops and lag
 *
 * Why These Constraints?
 *   - I420: YUV 4:2:0 subsampling requires even dimensions
 *   - FPS: AI can't process faster than frames are produced
 */

// GStreamer YUV420 formats (I420/NV12) require even dimensions
if (CONFIG.source.width % 2 !== 0 || CONFIG.source.height % 2 !== 0) {
  throw new Error("Source width/height must be even for YUV420 (I420/NV12)");
}

// AI target resolution must be even (YUV420 formats)
if (CONFIG.ai.width % 2 !== 0 || CONFIG.ai.height % 2 !== 0) {
  throw new Error("AI width/height must be even");
}

// Source FPS must be >= AI active FPS (otherwise AI can't keep up)
if (CONFIG.source.fpsHub < CONFIG.ai.fps.active) {
  throw new Error("Source FPS hub must be >= AI active FPS");
}

if (!CONFIG.mediamtx.recordPath) {
  throw new Error("mediamtx.record_path must be configured");
}

if (!CONFIG.mediamtx.livePath) {
  throw new Error("mediamtx.live_path must be configured");
}

if (
  !Number.isInteger(CONFIG.status.port) ||
  CONFIG.status.port < 1024 ||
  CONFIG.status.port > 65535
) {
  throw new Error("status.port must be an integer between 1024 and 65535");
}
