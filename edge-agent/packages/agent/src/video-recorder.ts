import { spawn, ChildProcess } from "child_process";
import { promises as fs } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import pino from "pino";

const logger = pino({ name: "video-recorder" });

/**
 * Check if FFmpeg is installed
 */
function checkFFmpegInstalled(): boolean {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export interface VideoRecorderConfig {
  storageDir: string;
  deviceId: string;
  videoSource: string; // e.g., "/dev/video0" or "0" for webcam index
  fps?: number;
  width?: number;
  height?: number;
}

export class VideoRecorder {
  private config: VideoRecorderConfig;
  private ffmpegProcess: ChildProcess | null = null;
  private currentOutputPath: string | null = null;
  private isRecording: boolean = false;

  constructor(config: VideoRecorderConfig) {
    this.config = {
      fps: 30,
      width: 640,
      height: 480,
      ...config,
    };
  }

  /**
   * Start recording video to a file
   * @param sessionName Session name (e.g., "sesion_20251007-143000_1")
   * @returns Output file path
   */
  async startRecording(sessionName: string): Promise<string> {
    if (this.isRecording) {
      throw new Error("Already recording");
    }

    // Check FFmpeg is installed
    if (!checkFFmpegInstalled()) {
      throw new Error(
        "FFmpeg not found. Please install FFmpeg: sudo apt-get install ffmpeg"
      );
    }

    try {
      // Create device directory if it doesn't exist
      const deviceDir = join(
        this.config.storageDir,
        "clips",
        this.config.deviceId
      );
      await fs.mkdir(deviceDir, { recursive: true });

      // Output file path
      const outputPath = join(deviceDir, `${sessionName}.mp4`);
      this.currentOutputPath = outputPath;

      // Detect platform and build FFmpeg command
      const platform = process.platform;
      let ffmpegArgs: string[];

      // Normalize video source for platform
      let videoSource = this.config.videoSource;
      if (platform === "linux" && /^\d+$/.test(videoSource)) {
        // Convert numeric device (e.g., "0") to /dev/videoN
        videoSource = `/dev/video${videoSource}`;
      }

      if (platform === "linux") {
        // Linux: use v4l2
        ffmpegArgs = [
          "-f",
          "v4l2",
          "-framerate",
          String(this.config.fps),
          "-video_size",
          `${this.config.width}x${this.config.height}`,
          "-i",
          videoSource,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-y", // Overwrite output file
          outputPath,
        ];
      } else if (platform === "darwin") {
        // macOS: use avfoundation
        ffmpegArgs = [
          "-f",
          "avfoundation",
          "-framerate",
          String(this.config.fps),
          "-video_size",
          `${this.config.width}x${this.config.height}`,
          "-i",
          videoSource,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-y",
          outputPath,
        ];
      } else if (platform === "win32") {
        // Windows: use dshow
        ffmpegArgs = [
          "-f",
          "dshow",
          "-framerate",
          String(this.config.fps),
          "-video_size",
          `${this.config.width}x${this.config.height}`,
          "-i",
          `video=${this.config.videoSource}`,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-y",
          outputPath,
        ];
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      logger.info(
        {
          sessionName,
          outputPath,
          videoSource: videoSource,
          videoSourceOriginal: this.config.videoSource,
          platform,
          command: `ffmpeg ${ffmpegArgs.join(" ")}`,
        },
        "Starting video recording"
      );

      // Spawn FFmpeg process
      this.ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

      this.ffmpegProcess.stderr?.on("data", (data) => {
        const message = data.toString();
        // Only log non-routine FFmpeg messages (errors, warnings, not progress)
        if (
          !message.includes("frame=") &&
          !message.includes("fps=") &&
          !message.includes("speed=") &&
          !message.includes("time=") &&
          !message.includes("bitrate=")
        ) {
          const level =
            message.includes("error") || message.includes("Error")
              ? "error"
              : "debug";
          logger[level]({ message: message.trim() }, "FFmpeg output");
        }
      });

      this.ffmpegProcess.on("error", (error) => {
        logger.error(
          { error: error.message, sessionName },
          "FFmpeg process error"
        );
        this.isRecording = false;
      });

      this.ffmpegProcess.on("exit", (code, signal) => {
        logger.info({ code, signal, sessionName }, "FFmpeg process exited");
        this.isRecording = false;
      });

      this.isRecording = true;

      return outputPath;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          sessionName,
        },
        "Failed to start recording"
      );
      throw error;
    }
  }

  /**
   * Stop current recording
   * @returns Path to the recorded file, or null if no recording was active
   */
  async stopRecording(): Promise<string | null> {
    if (!this.isRecording || !this.ffmpegProcess) {
      logger.warn("No active recording to stop");
      return null;
    }

    return new Promise((resolve) => {
      const outputPath = this.currentOutputPath;

      // Send 'q' to FFmpeg to gracefully stop (if stdin is available)
      if (this.ffmpegProcess!.stdin) {
        this.ffmpegProcess!.stdin.write("q");
      } else {
        // If stdin not available, send SIGINT
        this.ffmpegProcess!.kill("SIGINT");
      }

      // Wait for process to exit
      const timeout = setTimeout(() => {
        logger.warn("FFmpeg did not exit gracefully, sending SIGTERM");
        this.ffmpegProcess?.kill("SIGTERM");
      }, 5000);

      this.ffmpegProcess!.once("exit", () => {
        clearTimeout(timeout);
        logger.info({ outputPath }, "Recording stopped");
        this.isRecording = false;
        this.ffmpegProcess = null;
        this.currentOutputPath = null;
        resolve(outputPath);
      });
    });
  }

  /**
   * Check if currently recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get current output path
   */
  getCurrentOutputPath(): string | null {
    return this.currentOutputPath;
  }
}
