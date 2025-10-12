/**
 * Configuration - Centralized Edge Agent Configuration
 *
 * This module is the SINGLE SOURCE OF TRUTH for configuration.
 * It reads environment variables, validates types, and exports a CONFIG singleton.
 *
 * Responsibilities:
 * =================
 *
 * 1. Read .env file and process.env variables
 * 2. Parse strings → correct types (numbers, arrays, enums)
 * 3. Validate values (e.g., width/height must be even for I420/NV12)
 * 4. Provide sensible defaults for development
 * 5. Fail fast on startup if required variables are missing
 *
 * Usage:
 * ======
 *
 * ```typescript
 * import { CONFIG } from "./config/index.js";
 *
 * console.log(CONFIG.deviceId);        // "edge-dev"
 * console.log(CONFIG.source.uri);      // "/dev/video0"
 * console.log(CONFIG.fsm.dwellMs);     // 500
 * ```
 *
 * Why Singleton?
 * ==============
 *
 * Immutability
 *   - Configuration is global and immutable (doesn't change at runtime)
 *   - Avoids passing CONFIG everywhere as parameter
 *
 * Type Safety
 *   - AppConfig type guarantees correct structure
 *   - Compile-time checks for configuration access
 *
 * Testability
 *   - Easy to mock (set process.env before import)
 *   - Isolated configuration for unit tests
 *
 * Environment Variables:
 * ======================
 *
 * See .env.example for complete list of variables.
 * All variables have reasonable defaults for local development.
 *
 * Required Variables:
 *   - DEVICE_ID (defaults to "edge-dev")
 *   - SOURCE_URI (defaults to "/dev/video0")
 *
 * Optional Variables (with defaults):
 *   - LOG_LEVEL (default: "info")
 *   - SOURCE_WIDTH, SOURCE_HEIGHT (default: 640×480)
 *   - AI_FPS_IDLE, AI_FPS_ACTIVE (default: 5, 8)
 *   - FSM_DWELL_MS, FSM_SILENCE_MS, FSM_POSTROLL_MS (default: 500, 2000, 2000)
 *   - etc.
 *
 * Configuration Loading:
 * ======================
 *
 * 1. dotenv.config() loads .env file (development only)
 * 2. Docker passes env vars directly (production)
 * 3. getEnv() reads from process.env with fallbacks
 * 4. Validation checks ensure consistency
 * 5. CONFIG singleton is exported
 */

import dotenv from "dotenv";
import { AppConfig } from "./schema.js";

// Load .env file into process.env (development only, production uses Docker env)
dotenv.config();

/**
 * Get Environment Variable (String)
 *
 * Reads a string environment variable with optional fallback.
 *
 * @param key - Variable name (e.g., "DEVICE_ID")
 * @param fallback - Default value (optional)
 * @returns Variable value
 * @throws Error if variable doesn't exist and no fallback provided
 */
function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

/**
 * Get Environment Variable (Number)
 *
 * Reads a numeric environment variable with optional fallback.
 * Validates that the value is a valid number.
 *
 * @param key - Variable name (e.g., "SOURCE_WIDTH")
 * @param fallback - Default value (optional)
 * @returns Parsed numeric value
 * @throws Error if variable is not a valid number
 */
function getEnvNum(key: string, fallback?: number): number {
  const val = process.env[key];
  if (!val) {
    if (fallback === undefined) throw new Error(`Missing env var: ${key}`);
    return fallback;
  }
  const num = Number(val);
  if (isNaN(num)) throw new Error(`Invalid number for ${key}: ${val}`);
  return num;
}

/**
 * Get Environment Variable (Array)
 *
 * Reads a comma-separated string and parses it as an array.
 *
 * Example:
 *   "person,car,truck" → ["person", "car", "truck"]
 *
 * @param key - Variable name (e.g., "AI_CLASSES_FILTER")
 * @param fallback - Default array (optional)
 * @returns Array of trimmed strings
 * @throws Error if variable doesn't exist and no fallback provided
 */
function getEnvArray(key: string, fallback?: string[]): string[] {
  const val = process.env[key];
  if (!val) {
    if (!fallback) throw new Error(`Missing env var: ${key}`);
    return fallback;
  }
  return val.split(",").map((s) => s.trim());
}

/**
 * CONFIG Singleton - Application Configuration
 *
 * Immutable object with all Edge Agent configuration.
 * Built at startup (import time) and validates all environment variables.
 *
 * Sections:
 * =========
 *
 * deviceId: Unique edge device identifier
 *   - Example: "edge-dev-001"
 *   - Used in session metadata
 *
 * logLevel: Log verbosity level
 *   - Values: "debug", "info", "warn", "error"
 *   - Default: "info"
 *
 * source: Video source configuration
 *   - Camera type (V4L2/RTSP)
 *   - Resolution, FPS, shared memory settings
 *
 * ai: AI model configuration
 *   - YOLO model name, threshold, resolution
 *   - Worker connection, FPS settings
 *
 * mediamtx: RTSP server configuration
 *   - MediaMTX host, port, stream path
 *
 * fsm: State machine timers
 *   - Dwell, silence, post-roll durations
 *
 * store: Session store API configuration
 *   - HTTP endpoint, batching parameters
 *
 * bus: Event bus configuration
 *   - Queue size limits
 */
export const CONFIG: AppConfig = {
  deviceId: getEnv("DEVICE_ID", "edge-dev"),
  logLevel: getEnv("LOG_LEVEL", "info") as "debug" | "info" | "warn" | "error",

  source: {
    kind: getEnv("SOURCE_KIND", "v4l2") as "v4l2" | "rtsp",
    uri: getEnv("SOURCE_URI", "/dev/video0"),
    width: getEnvNum("SOURCE_WIDTH", 640),
    height: getEnvNum("SOURCE_HEIGHT", 480),
    fpsHub: getEnvNum("SOURCE_FPS_HUB", 15),
    socketPath: getEnv("SOURCE_SOCKET_PATH", "/dev/shm/cam_raw.sock"),
    shmSizeMB: getEnvNum("SOURCE_SHM_SIZE_MB", 50), // Increased from 12 to 50 MB to prevent SHM buffer overflow
  },

  ai: {
    modelName: getEnv("AI_MODEL_NAME", "models/yolov8n.onnx"),
    umbral: getEnvNum("AI_UMBRAL", 0.4),
    width: getEnvNum("AI_WIDTH", 640),
    height: getEnvNum("AI_HEIGHT", 640),
    classesFilter: getEnvArray("AI_CLASSES_FILTER", ["person"]),
    fps: {
      idle: getEnvNum("AI_FPS_IDLE", 5),
      active: getEnvNum("AI_FPS_ACTIVE", 12),
    },
    worker: {
      host: getEnv("AI_WORKER_HOST", "worker-ai"),
      port: getEnvNum("AI_WORKER_PORT", 7001),
    },
    frameCacheTtlMs: getEnvNum("FRAME_CACHE_TTL_MS", 2000),
  },

  mediamtx: {
    host: getEnv("MEDIAMTX_HOST", "localhost"),
    port: getEnvNum("MEDIAMTX_PORT", 8554),
    path: getEnv("MEDIAMTX_PATH", "live"),
  },

  fsm: {
    dwellMs: getEnvNum("FSM_DWELL_MS", 500), // 0.5s - quick confirmation
    silenceMs: getEnvNum("FSM_SILENCE_MS", 2000), // 2s - inactivity detection
    postRollMs: getEnvNum("FSM_POSTROLL_MS", 2000), // 2s - post-roll recording
  },

  store: {
    baseUrl: getEnv("STORE_BASE_URL", "http://localhost:4001"),
    apiKey: process.env.STORE_API_KEY,
    batchMax: getEnvNum("STORE_BATCH_MAX", 50),
    flushIntervalMs: getEnvNum("STORE_FLUSH_INTERVAL_MS", 2000),
  },

  bus: {
    maxQueueSize: getEnvNum("BUS_MAX_QUEUE_SIZE", 1024), // 1024 events per topic
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
