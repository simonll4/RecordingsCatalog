/**
 * Config - Configuración Centralizada del Edge Agent
 *
 * Este módulo es el PUNTO ÚNICO de acceso a configuración.
 * Lee variables de entorno, valida tipos, y exporta CONFIG singleton.
 *
 * Responsabilidades:
 *
 * 1. Leer .env y process.env
 * 2. Parsear strings → tipos correctos (numbers, arrays, enums)
 * 3. Validar valores (ej: width/height pares para I420)
 * 4. Proveer defaults sensatos
 * 5. Fallar rápido en startup si falta variable requerida
 *
 * Uso:
 *
 * ```typescript
 * import { CONFIG } from "./config/index.js";
 *
 * console.log(CONFIG.deviceId);        // "edge-dev"
 * console.log(CONFIG.source.uri);      // "/dev/video0"
 * console.log(CONFIG.fsm.dwellMs);     // 500
 * ```
 *
 * ¿Por qué singleton?
 *
 * - Configuración es global e inmutable (no cambia en runtime)
 * - Evita pasar CONFIG por parámetros en todos lados
 * - Type-safe (AppConfig garantiza estructura correcta)
 * - Fácil de testear (mock process.env antes de import)
 *
 * Variables de Entorno:
 *
 * Ver .env.example para lista completa de variables.
 * Todas tienen defaults razonables para desarrollo local.
 */

import dotenv from "dotenv";
import { AppConfig } from "./schema.js";

// Cargar .env al process.env (solo desarrollo, en prod usar docker env)
dotenv.config();

/**
 * getEnv - Lee string de env var con fallback
 *
 * @param key - Nombre de la variable (ej: "DEVICE_ID")
 * @param fallback - Valor por defecto (opcional)
 * @returns Valor de la variable
 * @throws Error si variable no existe y no hay fallback
 */
function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

/**
 * getEnvNum - Lee number de env var con fallback
 *
 * @param key - Nombre de la variable (ej: "SOURCE_WIDTH")
 * @param fallback - Valor por defecto (opcional)
 * @returns Valor numérico parseado
 * @throws Error si variable no es número válido
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
 * getEnvArray - Lee array de strings (CSV) de env var
 *
 * Ejemplo: "person,car,truck" → ["person", "car", "truck"]
 *
 * @param key - Nombre de la variable (ej: "AI_CLASS_NAMES")
 * @param fallback - Array por defecto (opcional)
 * @returns Array de strings parseado
 * @throws Error si variable no existe y no hay fallback
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
 * CONFIG - Singleton de configuración
 *
 * Objeto inmutable con toda la configuración del Edge Agent.
 * Se construye en startup (import time) y valida todas las env vars.
 *
 * Secciones:
 *
 * - deviceId: ID único del edge (ej: "edge-dev-001")
 * - logLevel: Nivel de logging (debug/info/warn/error)
 * - source: Configuración de cámara (V4L2/RTSP)
 * - ai: Configuración de modelo YOLO
 * - mediamtx: Configuración de servidor RTSP
 * - fsm: Timers de máquina de estados
 * - store: Configuración de API de sesiones
 */
export const CONFIG: AppConfig = {
  deviceId: getEnv("DEVICE_ID", "edge-dev"),
  logLevel: getEnv("LOG_LEVEL", "info") as "debug" | "info" | "warn" | "error",

  source: {
    kind: getEnv("SOURCE_KIND", "v4l2") as "rtsp" | "v4l2",
    uri: getEnv("SOURCE_URI", "/dev/video0"),
    width: getEnvNum("SOURCE_WIDTH", 640),
    height: getEnvNum("SOURCE_HEIGHT", 480),
    fpsHub: getEnvNum("SOURCE_FPS_HUB", 8),
    socketPath: getEnv("SOURCE_SOCKET_PATH", "/dev/shm/cam_raw.sock"),
    shmSizeMB: getEnvNum("SOURCE_SHM_SIZE_MB", 12),
  },

  ai: {
    modelName: getEnv("AI_MODEL_NAME", "yolov8n.onnx"),
    umbral: getEnvNum("AI_UMBRAL", 0.5),
    width: getEnvNum("AI_WIDTH", 640),
    height: getEnvNum("AI_HEIGHT", 480),
    classesFilter: getEnvArray("AI_CLASSES_FILTER", ["person"]),
    fps: {
      idle: getEnvNum("AI_FPS_IDLE", 5),
      active: getEnvNum("AI_FPS_ACTIVE", 8),
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
    dwellMs: getEnvNum("FSM_DWELL_MS", 500), // 0.5 seg - confirmación rápida
    silenceMs: getEnvNum("FSM_SILENCE_MS", 2000), // 2 seg - detección de ausencia
    postRollMs: getEnvNum("FSM_POSTROLL_MS", 2000), // 2 seg - post-roll
  },

  store: {
    baseUrl: getEnv("STORE_BASE_URL", "http://localhost:4001"),
    apiKey: process.env.STORE_API_KEY,
    batchMax: getEnvNum("STORE_BATCH_MAX", 50),
    flushIntervalMs: getEnvNum("STORE_FLUSH_INTERVAL_MS", 2000),
  },
};

// ==================== VALIDACIÓN ====================

/**
 * Validaciones de startup
 *
 * Fallan rápido si configuración es inválida.
 * Mejor crashear en startup que en runtime con frames corruptos.
 */

// GStreamer I420 requiere dimensiones pares (YUV420 planar)
if (CONFIG.source.width % 2 !== 0 || CONFIG.source.height % 2 !== 0) {
  throw new Error("Source width/height must be even for I420 format");
}

// AI también necesita dimensiones pares (RGB → YUV conversions)
if (CONFIG.ai.width % 2 !== 0 || CONFIG.ai.height % 2 !== 0) {
  throw new Error("AI width/height must be even");
}

// Source FPS debe ser >= AI active FPS (sino AI no puede procesar a tiempo)
if (CONFIG.source.fpsHub < CONFIG.ai.fps.active) {
  throw new Error("Source FPS hub must be >= AI active FPS");
}
