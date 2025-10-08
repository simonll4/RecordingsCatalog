/**
 * GStreamer pipeline builder unificado
 * Fuente única de verdad para todos los pipelines del agente
 */

import { SourceConfig, AIConfig, MediaMTXConfig } from "../config/schema.js";
import { EncoderConfig } from "./encoder.js";

/**
 * Construye pipeline de ingesta (Hub siempre-on)
 * Fuente (RTSP/V4L2) → I420 @ WxH → shmsink
 */
export function buildIngest(
  source: SourceConfig,
  tryRawFallback: boolean = false
): string[] {
  const { kind, uri, width, height, fpsHub, socketPath, shmSizeMB } = source;
  const shmSizeBytes = shmSizeMB * 1024 * 1024;

  const base = [
    "--gst-debug-no-color",
    `--gst-debug=shmsink:4`,
    "-e", // Send EOS on SIGINT
  ];

  if (kind === "rtsp") {
    return [
      ...base,
      "rtspsrc",
      `location=${uri}`,
      "latency=50",
      "!",
      "queue",
      "max-size-buffers=1",
      "leaky=downstream",
      "!",
      "rtph264depay",
      "!",
      "h264parse",
      "!",
      "avdec_h264",
      "max-threads=2",
      "!",
      "videoconvert",
      "!",
      "videoscale",
      "!",
      `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
      "!",
      "queue",
      "max-size-buffers=1",
      "leaky=downstream",
      "!",
      "shmsink",
      `socket-path=${socketPath}`,
      `shm-size=${shmSizeBytes}`,
      "wait-for-connection=false",
      "sync=true", // Mantiene timestamps reales, evita drift
    ];
  }

  // V4L2 (USB/integrated cameras)
  if (kind === "v4l2") {
    // For RAW fallback, use lower resolution (640x480) since YUYV doesn't support 1280x720
    const fallbackWidth = 640;
    const fallbackHeight = 480;

    const formatCaps = tryRawFallback
      ? `video/x-raw,width=${fallbackWidth},height=${fallbackHeight}`
      : `image/jpeg,width=${width},height=${height}`;

    const decoder = tryRawFallback ? [] : ["jpegdec", "!"];

    return [
      ...base,
      "v4l2src",
      `device=${uri}`,
      "!",
      formatCaps,
      "!",
      ...decoder,
      "videoconvert",
      "!",
      "videoscale",
      "!",
      `video/x-raw,format=I420,width=${width},height=${height}`,
      "!",
      "videorate",
      "!",
      `video/x-raw,framerate=${fpsHub}/1`,
      "!",
      "queue",
      "max-size-buffers=1",
      "leaky=downstream",
      "!",
      "shmsink",
      `socket-path=${socketPath}`,
      `shm-size=${shmSizeBytes}`,
      "wait-for-connection=false",
      "sync=true", // Mantiene timestamps reales, evita drift
    ];
  }

  throw new Error(`Unknown source kind: ${kind}`);
}

/**
 * Construye pipeline de captura para AI
 * shmsrc → videorate → scale/convert → RGB @ AI_WxH → fdsink (stdout)
 */
export function buildCapture(
  sourceSock: string,
  sourceWidth: number,
  sourceHeight: number,
  sourceFpsHub: number,
  aiCfg: AIConfig,
  fps: number
): string[] {
  const { width, height } = aiCfg;

  return [
    "--gst-debug-no-color",
    "--gst-debug=shmsrc:3",
    "shmsrc",
    `socket-path=${sourceSock}`,
    "is-live=true",
    "do-timestamp=true",
    "!",
    `video/x-raw,format=I420,width=${sourceWidth},height=${sourceHeight},framerate=${sourceFpsHub}/1`,
    "!",
    "queue",
    "max-size-buffers=1",
    "leaky=downstream",
    "!",
    // Aplicar videorate ANTES de conversiones pesadas para reducir CPU
    "videorate",
    "!",
    `video/x-raw,framerate=${fps}/1`,
    "!",
    "videoconvert",
    "!",
    "videoscale",
    "!",
    `video/x-raw,format=RGB,width=${width},height=${height}`,
    "!",
    "queue",
    "max-size-buffers=2",
    "leaky=downstream",
    "!",
    "fdsink",
    `fd=1`,
    "sync=false",
  ];
}

/**
 * Construye pipeline de publicación RTSP
 * shmsrc → encoder → rtspclientsink
 */
export function buildPublish(
  sourceSock: string,
  sourceWidth: number,
  sourceHeight: number,
  sourceFpsHub: number, // FPS del hub (no hardcodear)
  mediamtx: MediaMTXConfig,
  encoder: EncoderConfig
): string[] {
  const rtspUrl = `rtsp://${mediamtx.host}:${mediamtx.port}/${mediamtx.path}`;

  const base = [
    "--gst-debug-no-color",
    "--gst-debug=shmsrc:3,rtspclientsink:4",
    "-e", // Send EOS on SIGINT
    "shmsrc",
    `socket-path=${sourceSock}`,
    "is-live=true",
    "do-timestamp=true",
    "!",
    `video/x-raw,format=I420,width=${sourceWidth},height=${sourceHeight},framerate=${sourceFpsHub}/1`,
    "!",
    "queue",
    "max-size-buffers=1",
    "leaky=downstream",
    "!",
    "videoconvert",
    "!",
  ];

  // Encoder específico
  const encoderElement = [encoder.element, ...encoder.extraArgs, "!"];

  const sink = [
    "h264parse",
    "!",
    "video/x-h264,stream-format=byte-stream",
    "!",
    "rtspclientsink",
    `location=${rtspUrl}`,
    "protocols=tcp",
    "latency=50",
  ];

  return [...base, ...encoderElement, ...sink];
}
