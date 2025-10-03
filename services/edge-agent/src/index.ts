import { setTimeout as sleep } from "node:timers/promises";
import { spawnSync } from "node:child_process";
import { CONFIG } from "./config.js";
import { openSession, closeSession } from "./sessionStoreClient.js";
import { runFfmpeg } from "./ffmpegRunner.js";
import { measureRtspOffset } from "./rtspTimeSync.js";

const ensureFfmpegAvailable = (): void => {
  const check = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (check.error) {
    throw new Error("ffmpeg command not found in PATH");
  }
};

const randomSuffix = (): string => Math.random().toString(36).slice(-4);

const generateSessionId = (deviceId: string): string => {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(".", "");
  return `sess_${deviceId}_${timestamp}_${randomSuffix()}`;
};

const buildRtspUrl = (host: string, port: number, path: string): string =>
  `rtsp://${host}:${port}/${path}`;

interface RunOpts {
  duration?: number;
  postRoll?: number;
}

const parseCliOptions = (): RunOpts => {
  const opts: RunOpts = {};
  for (const arg of process.argv.slice(3)) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.substring(2).split("=");
    if (!value) continue;
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric)) continue;
    if (key === "duration") {
      opts.duration = numeric;
    } else if (key === "postRoll") {
      opts.postRoll = numeric;
    }
  }
  return opts;
};

/**
 * Genera timestamp ISO8601 con offset ajustado
 */
const adjustedTimestamp = (offsetSeconds: number): string => {
  const now = new Date();
  const adjusted = new Date(now.getTime() + offsetSeconds * 1000);
  return adjusted.toISOString();
};

const runSession = async (options: RunOpts = {}): Promise<void> => {
  ensureFfmpegAvailable();

  const duration = options.duration ?? CONFIG.sessionDurationSeconds;
  const postRoll = options.postRoll ?? CONFIG.postRollSeconds;

  const sessionId = generateSessionId(CONFIG.deviceId);
  const streamPath = CONFIG.streamPath;
  const rtspUrl = buildRtspUrl(
    CONFIG.mediamtxHost,
    CONFIG.mediamtxRtspPort,
    streamPath
  );

  // Nota: No se mide offset RTSP. Confiamos en sincronización de TZ del sistema (UTC)
  const offsetSeconds = await measureRtspOffset({
    host: CONFIG.mediamtxHost,
    port: CONFIG.mediamtxRtspPort,
    path: `/${streamPath}`,
    samples: 5,
    maxRttMs: 100,
  });

  // Timestamp de inicio (UTC sincronizado)
  const startTs = adjustedTimestamp(offsetSeconds);

  console.log(
    JSON.stringify({
      event: "session_open",
      sessionId,
      deviceId: CONFIG.deviceId,
      streamPath,
      rtspUrl,
      startTs,
    })
  );

  await openSession(CONFIG.sessionStoreUrl, {
    sessionId,
    devId: CONFIG.deviceId,
    startTs,
    path: streamPath,
    reason: CONFIG.sessionReason,
  });

  let streamError: unknown = null;

  try {
    await runFfmpeg({
      rtspUrl,
      durationSeconds: duration,
      cameraDevice: CONFIG.cameraDevice,
      fallbackSource: CONFIG.cameraFallback,
    });
  } catch (error) {
    streamError = error;
    console.error("Streaming failed", error);
  } finally {
    if (postRoll > 0) {
      console.log(
        JSON.stringify({ event: "post_roll_wait", seconds: postRoll })
      );
      await sleep(postRoll * 1000);
    }
  }

  // PASO 3: Timestamp de cierre ajustado (con el mismo offset)
  const endTs = adjustedTimestamp(offsetSeconds);

  await closeSession(CONFIG.sessionStoreUrl, {
    sessionId,
    endTs,
    postrollSec: postRoll,
  });

  console.log(
    JSON.stringify({
      event: "session_closed",
      sessionId,
      deviceId: CONFIG.deviceId,
      startTs,
      endTs,
      durationSeconds:
        (new Date(endTs).getTime() - new Date(startTs).getTime()) / 1000,
      success: streamError === null,
    })
  );

  if (streamError) {
    throw streamError;
  }
};

const command = process.argv[2];

if (command === "simulate") {
  const options = parseCliOptions();
  runSession(options).catch((error) => {
    console.error("Simulation failed", error);
    process.exit(1);
  });
} else if (command === undefined) {
  console.log(
    "Usage: node dist/index.js simulate [--duration=SECONDS] [--postRoll=SECONDS]"
  );
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
