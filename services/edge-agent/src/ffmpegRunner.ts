import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export interface FfmpegRunOptions {
  rtspUrl: string;
  durationSeconds: number;
  cameraDevice: string;
  fallbackSource: string;
}

const isCameraAvailable = (devicePath: string): boolean => {
  try {
    return existsSync(devicePath);
  } catch {
    return false;
  }
};

const encodingArgs = (rtspUrl: string): string[] => [
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-tune",
  "zerolatency",
  "-profile:v",
  "baseline",
  "-level",
  "3.1",
  "-g",
  "60",
  "-keyint_min",
  "60",
  "-sc_threshold",
  "0",
  "-bf",
  "0",
  "-pix_fmt",
  "yuv420p",
  "-an",
  "-f",
  "rtsp",
  "-rtsp_transport",
  "tcp",
  rtspUrl,
];

const buildArgs = (options: FfmpegRunOptions): string[] => {
  const { rtspUrl, durationSeconds, cameraDevice, fallbackSource } = options;
  const durationArg =
    durationSeconds > 0 ? ["-t", String(durationSeconds)] : [];

  if (isCameraAvailable(cameraDevice)) {
    return [
      "-loglevel",
      "info",
      "-f",
      "v4l2",
      "-thread_queue_size",
      "2048",
      "-i",
      cameraDevice,
      ...durationArg,
      ...encodingArgs(rtspUrl),
    ];
  }

  const source =
    fallbackSource === "testsrc"
      ? "testsrc=size=1280x720:rate=25"
      : fallbackSource;
  return [
    "-loglevel",
    "info",
    "-re",
    "-f",
    "lavfi",
    "-i",
    source,
    ...durationArg,
    ...encodingArgs(rtspUrl),
  ];
};

export const runFfmpeg = (options: FfmpegRunOptions): Promise<void> => {
  return new Promise((resolve, reject) => {
    const args = buildArgs(options);
    console.log(JSON.stringify({ event: "ffmpeg_start", args }));

    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    child.stdout.on("data", (data) => {
      process.stdout.write(`[ffmpeg] ${data}`);
    });

    child.stderr.on("data", (data) => {
      process.stderr.write(`[ffmpeg] ${data}`);
    });

    child.on("error", (error) => {
      console.error("Failed to spawn ffmpeg", error);
      reject(error);
    });

    child.on("exit", (code) => {
      console.log(JSON.stringify({ event: "ffmpeg_exit", code }));
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
};
