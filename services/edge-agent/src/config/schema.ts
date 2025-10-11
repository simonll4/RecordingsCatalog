/**
 * Schema - Esquema de Configuración del Edge Agent
 *
 * Define tipos TypeScript para toda la configuración del sistema.
 * Estos tipos son usados por config/index.ts para validar env vars.
 *
 * Estructura:
 *
 * - AppConfig: Raíz del árbol de configuración
 *   - deviceId: ID único del dispositivo edge
 *   - logLevel: Nivel de logging (debug/info/warn/error)
 *   - source: Configuración de fuente de video (V4L2/RTSP)
 *   - ai: Configuración de modelo AI (YOLO)
 *   - mediamtx: Configuración de servidor RTSP (MediaMTX)
 *   - fsm: Timers de la máquina de estados
 *   - store: API de sesiones y detecciones
 *
 * ¿Por qué tipos explícitos?
 *
 * - Validación: CONFIG debe cumplir AppConfig (type-safe)
 * - Autocomplete: IDE sugiere campos válidos
 * - Documentación: Tipos documentan qué configuración existe
 * - Refactoring: Cambiar campo → error de compilación
 */

/**
 * SourceKind - Tipo de fuente de video
 *
 * - rtsp: Cámara IP (ej: rtsp://192.168.1.100:554/stream)
 * - v4l2: Cámara USB (ej: /dev/video0)
 */
export type SourceKind = "rtsp" | "v4l2";

/**
 * SourceConfig - Configuración de fuente de video
 *
 * Define cómo CameraHub debe capturar video.
 *
 * Campos:
 *
 * - kind: Tipo de fuente (rtsp/v4l2)
 * - uri: Path o URL (ej: /dev/video0 o rtsp://...)
 * - width/height: Resolución de captura (ej: 640x480)
 * - fpsHub: FPS de captura constante (ej: 12)
 * - socketPath: Path del socket SHM compartido (ej: /tmp/camera_shm)
 * - shmSizeMB: Tamaño del buffer SHM en MB (ej: 50)
 *
 * GStreamer pipeline:
 *
 * - V4L2: v4l2src → videoconvert → shmsink
 * - RTSP: rtspsrc → decodebin → videoconvert → shmsink
 */
export type SourceConfig = {
  kind: SourceKind;
  uri: string;
  width: number;
  height: number;
  fpsHub: number;
  socketPath: string;
  shmSizeMB: number;
};

/**
 * AIConfig - Configuración del modelo AI (YOLO)
 *
 * Define parámetros del modelo de detección de objetos.
 *
 * Campos:
 *
 * - modelName: Nombre del modelo YOLO (ej: yolov8n)
 * - umbral: Confianza mínima para detección (ej: 0.5 = 50%)
 * - width/height: Resolución de frames AI (ej: 640x480)
 * - classesFilter: Clases a reportar como relevantes (ej: ["person", "car"])
 * - fps.idle: FPS en estado IDLE (ej: 5)
 * - fps.active: FPS en estado ACTIVE (ej: 12)
 * - worker.host: Hostname del worker de IA (ej: worker-ai)
 * - worker.port: Puerto TCP del worker (ej: 7001)
 *
 * ¿Por qué dual-rate FPS?
 *
 * En IDLE no necesitamos detección rápida (ahorrar CPU).
 * En ACTIVE queremos máxima precisión (detectar todo).
 */
export type AIConfig = {
  modelName: string;
  umbral: number;
  width: number;
  height: number;
  classesFilter: string[];
  fps: {
    idle: number;
    active: number;
  };
  worker: {
    host: string;
    port: number;
  };
  frameCacheTtlMs: number;
};

/**
 * MediaMTXConfig - Configuración de servidor RTSP
 *
 * Define endpoint de MediaMTX para publishing de stream.
 *
 * Campos:
 *
 * - host: Hostname del servidor MediaMTX (ej: mediamtx)
 * - port: Puerto RTSP (ej: 8554)
 * - path: Path del stream (ej: live)
 *
 * Publisher conecta a: rtsp://{host}:{port}/{path}
 */
export type MediaMTXConfig = {
  host: string;
  port: number;
  path: string;
};

/**
 * FSMConfig - Timers de la máquina de estados
 *
 * Define duraciones de ventanas temporales en la FSM.
 *
 * Campos:
 *
 * - dwellMs: Ventana de confirmación en DWELL (ej: 500ms)
 * - silenceMs: Timeout sin detecciones en ACTIVE (ej: 3000ms)
 * - postRollMs: Grabación extra en CLOSING (ej: 5000ms)
 *
 * ¿Por qué estos valores?
 *
 * - dwellMs: Evitar falsos positivos (esperar confirmación)
 * - silenceMs: No cerrar sesión por frame perdido (dar margen)
 * - postRollMs: Capturar contexto después de detección (ej: persona saliendo)
 */
export type FSMConfig = {
  dwellMs: number;
  silenceMs: number;
  postRollMs: number;
};

/**
 * StoreConfig - Configuración de API de sesiones
 *
 * Define conexión a session-store service.
 *
 * Campos:
 *
 * - baseUrl: URL base del API (ej: http://session-store:3001)
 * - apiKey: API key para autenticación (opcional)
 * - batchMax: Máximo de detecciones por batch (ej: 50)
 * - flushIntervalMs: Intervalo de flush automático (ej: 2000ms)
 *
 * ¿Por qué batching?
 *
 * Enviar detecciones de a 1 es ineficiente (muchos HTTP requests).
 * SessionStore acumula detecciones y las envía en batches.
 */
export type StoreConfig = {
  baseUrl: string;
  apiKey?: string;
  batchMax?: number;
  flushIntervalMs?: number;
};

/**
 * AppConfig - Configuración completa de la aplicación
 *
 * Raíz del árbol de configuración. Todos los módulos acceden
 * a CONFIG (singleton) que implementa este tipo.
 *
 * Campos:
 *
 * - deviceId: ID único del dispositivo edge (ej: edge-dev-001)
 * - logLevel: Nivel de logging (debug/info/warn/error)
 * - source: Configuración de cámara (V4L2/RTSP)
 * - ai: Configuración de modelo YOLO
 * - mediamtx: Configuración de servidor RTSP
 * - fsm: Timers de máquina de estados
 * - store: Configuración de API de sesiones
 *
 * Uso:
 *
 * ```typescript
 * import { CONFIG } from "./config/index.js";
 *
 * console.log(CONFIG.deviceId); // "edge-dev-001"
 * console.log(CONFIG.fsm.dwellMs); // 500
 * ```
 */
export type AppConfig = {
  deviceId: string;
  logLevel: "debug" | "info" | "warn" | "error";
  source: SourceConfig;
  ai: AIConfig;
  mediamtx: MediaMTXConfig;
  fsm: FSMConfig;
  store: StoreConfig;
};
