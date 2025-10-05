import dotenv from "dotenv";
dotenv.config();

const arr = (v?: string) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

export const CONFIG = {
  deviceId: process.env.EDGE_DEVICE_ID || "cam-local",
  source: {
    kind: (process.env.SOURCE_KIND || "v4l2") as "v4l2" | "rtsp",
    device: process.env.CAMERA_DEVICE || "/dev/video0",
    rtspUrl: process.env.SOURCE_RTSP || "rtsp://user:pass@camera/stream",
  },
  capture: {
    socketPath: process.env.CAPTURE_SOCKET_PATH || "/dev/shm/cam_raw.sock",
    width: Number(process.env.CAPTURE_WIDTH || 1280),
    height: Number(process.env.CAPTURE_HEIGHT || 720),
    fpsHub: Number(process.env.CAPTURE_FPS || 15),
    shmSizeMB: Number(process.env.CAPTURE_SHM_SIZE_MB || 128), // Aumentado para 1280x720
  },
  mediamtx: {
    host: process.env.MEDIAMTX_HOST || "localhost",
    port: Number(process.env.MEDIAMTX_RTSP_PORT || 8554),
    path: process.env.EDGE_STREAM_PATH || "cam-local",
  },
  fsm: {
    dwellMs: Number(process.env.DWELL_MS || 500),
    silenceMs: Number(process.env.SILENCE_MS || 3000),
    postRollSec: Number(process.env.POST_ROLL_SEC || 5),
  },
  ai: {
    modelName: process.env.AI_MODEL_NAME || "yolov8n.onnx",
    umbral: Number(process.env.AI_UMBRAL || 0.4),
    width: Number(process.env.AI_WIDTH || 640),
    height: Number(process.env.AI_HEIGHT || 640),
    classNames: arr(process.env.AI_CLASS_NAMES),
    classesFilter: arr(process.env.AI_CLASSES_FILTER),
    fps: {
      idle: Number(process.env.AI_FPS_IDLE || 5),
      active: Number(process.env.AI_FPS_ACTIVE || 8),
    },
  },
  store: {
    url: process.env.SESSION_STORE_URL!,
    batchMs: Number(process.env.SINK_BATCH_MS || 500),
    maxItems: Number(process.env.SINK_MAX_ITEMS || 50),
  },
} as const;
