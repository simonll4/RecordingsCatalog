import dotenv from "dotenv";

dotenv.config();

const env = (key: string, fallback?: string): string => {
  const value = process.env[key];
  if (value === undefined || value === "") {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

const parseNumber = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const deviceId = env("EDGE_DEVICE_ID", "cam-local");

export const CONFIG = {
  sessionStoreUrl: env("SESSION_STORE_URL", "http://localhost:8080"),
  mediamtxHost: env("MEDIAMTX_HOST", "localhost"),
  mediamtxRtspPort: parseNumber(env("MEDIAMTX_RTSP_PORT", "8554"), 8554),
  deviceId,
  streamPath: env("EDGE_STREAM_PATH", deviceId),
  sessionReason: env("EDGE_SESSION_REASON", "relevancia: agent/manual"),
  cameraDevice: env("CAMERA_DEVICE", "/dev/video0"),
  cameraFallback: env("CAMERA_FALLBACK", "testsrc"),
  sessionDurationSeconds: parseNumber(env("SESSION_DURATION_SECONDS", "0"), 0),
  postRollSeconds: parseNumber(env("SESSION_POST_ROLL_SECONDS", "5"), 5),
};
