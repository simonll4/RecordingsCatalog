import type { Frame } from "@edge-agent/common";
import { spawn, ChildProcess } from "child_process";

export interface CaptureConfig {
  device: number | string;
  fps: number;
  width?: number;
  height?: number;
}

export interface CaptureProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  getFrame(): Promise<Frame | null>;
  isRunning(): boolean;
}

export class OpenCVCapture implements CaptureProvider {
  private cap: any = null;
  private cv: any = null;
  private config: CaptureConfig;
  private running = false;

  constructor(config: CaptureConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    try {
      // Check if opencv4nodejs is available
      let cv;
      try {
        cv = await import("opencv4nodejs");
      } catch (importError) {
        throw new Error(
          "OpenCV not available or failed to compile. Please use FFmpeg capture provider."
        );
      }

      this.cv = cv;
      this.cap = new this.cv.VideoCapture(this.config.device);

      if (this.config.width && this.config.height) {
        this.cap.set(this.cv.CAP_PROP_FRAME_WIDTH, this.config.width);
        this.cap.set(this.cv.CAP_PROP_FRAME_HEIGHT, this.config.height);
      }

      this.cap.set(this.cv.CAP_PROP_FPS, this.config.fps);

      this.running = true;
      console.log("OpenCV capture started");
    } catch (error) {
      console.error("Failed to start OpenCV capture:", error);
      throw new Error(
        "OpenCV not available. Try using FFmpeg capture provider."
      );
    }
  }

  async stop(): Promise<void> {
    if (this.cap) {
      this.cap.release();
      this.cap = null;
    }
    this.running = false;
    console.log("OpenCV capture stopped");
  }

  async getFrame(): Promise<Frame | null> {
    if (!this.cap || !this.running) {
      return null;
    }

    try {
      const mat = this.cap.read();
      if (mat.empty) {
        return null;
      }

      // Convert BGR to RGB
      const rgbMat = mat.cvtColor(this.cv.COLOR_BGR2RGB);

      return {
        data: Buffer.from(rgbMat.getData()),
        width: rgbMat.cols,
        height: rgbMat.rows,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("Failed to capture frame:", error);
      return null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

export class FFmpegCapture implements CaptureProvider {
  private process: ChildProcess | null = null;
  private config: CaptureConfig;
  private running = false;
  private frameBuffer: Buffer[] = [];
  private frameQueue: Frame[] = [];
  private isProcessingFrame = false;

  constructor(config: CaptureConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    try {
      // Reduce FFmpeg verbosity unless explicitly enabled via env
      const logLevel = process.env.FFMPEG_LOGLEVEL || "error"; // options: quiet|panic|fatal|error|warning|info|verbose|debug|trace

      const args = [
        "-hide_banner",
        "-loglevel",
        logLevel,
        "-f",
        "v4l2",
        "-i",
        `/dev/video${this.config.device}`,
        "-vf",
        `fps=${this.config.fps}`,
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-",
      ];

      if (this.config.width && this.config.height) {
        args.splice(-3, 0, "-s", `${this.config.width}x${this.config.height}`);
      }

      this.process = spawn("ffmpeg", args);

      this.process.stdout?.on("data", (chunk: Buffer) => {
        this.handleFrameData(chunk);
      });

      this.process.stderr?.on("data", (data: Buffer) => {
        // Suppress FFmpeg noise by default; show only when explicitly debugging
        if (process.env.FFMPEG_DEBUG === "1") {
          const msg = data.toString().trim();
          if (msg.length > 0) console.debug("[FFmpeg]", msg);
        }
      });

      this.process.on("error", (error) => {
        // Keep critical error but avoid spamming
        console.error("FFmpeg process error:", error);
        this.running = false;
      });

      this.process.on("exit", (code) => {
        if (process.env.FFMPEG_DEBUG === "1") {
          console.log("FFmpeg process exited with code:", code);
        }
        this.running = false;
      });

      this.running = true;
      if (process.env.FFMPEG_DEBUG === "1") {
        console.log("FFmpeg capture started");
      }
    } catch (error) {
      console.error("Failed to start FFmpeg capture:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this.running = false;
    this.frameQueue = [];
    this.frameBuffer = [];
    if (process.env.FFMPEG_DEBUG === "1") {
      console.log("FFmpeg capture stopped");
    }
  }

  async getFrame(): Promise<Frame | null> {
    if (!this.running) {
      return null;
    }

    // Return queued frame if available
    if (this.frameQueue.length > 0) {
      return this.frameQueue.shift()!;
    }

    // Wait a bit for new frames
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (this.frameQueue.length > 0) {
      return this.frameQueue.shift()!;
    }

    return null;
  }

  isRunning(): boolean {
    return this.running;
  }

  private handleFrameData(chunk: Buffer): void {
    if (this.isProcessingFrame) return;

    this.frameBuffer.push(chunk);

    // Look for JPEG markers to extract complete frames
    const fullBuffer = Buffer.concat(this.frameBuffer);
    let startIndex = 0;

    while (true) {
      const jpegStart = fullBuffer.indexOf(
        Buffer.from([0xff, 0xd8]),
        startIndex
      );
      if (jpegStart === -1) break;

      const jpegEnd = fullBuffer.indexOf(
        Buffer.from([0xff, 0xd9]),
        jpegStart + 2
      );
      if (jpegEnd === -1) break;

      // Extract complete JPEG frame
      const jpegFrame = fullBuffer.subarray(jpegStart, jpegEnd + 2);
      this.processJPEGFrame(jpegFrame);

      startIndex = jpegEnd + 2;
    }

    // Keep remaining partial data
    if (startIndex < fullBuffer.length) {
      this.frameBuffer = [fullBuffer.subarray(startIndex)];
    } else {
      this.frameBuffer = [];
    }
  }

  private async processJPEGFrame(jpegData: Buffer): Promise<void> {
    if (this.isProcessingFrame) return;

    // Skip invalid or incomplete JPEG frames
    if (!this.isValidJPEG(jpegData)) {
      return;
    }

    this.isProcessingFrame = true;

    try {
      // Dynamic import to handle optional dependency
      const sharp = await import("sharp");

      const { data, info } = await sharp
        .default(jpegData)
        .raw()
        .toBuffer({ resolveWithObject: true });

      const frame: Frame = {
        data,
        width: info.width,
        height: info.height,
        timestamp: Date.now(),
      };

      // Keep only latest frames (avoid memory buildup)
      if (this.frameQueue.length > 5) {
        this.frameQueue.shift();
      }

      this.frameQueue.push(frame);
    } catch (error) {
      // Only log non-JPEG corruption errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        !errorMessage.includes("Corrupt JPEG") &&
        !errorMessage.includes("premature end") &&
        !errorMessage.includes("Invalid component")
      ) {
        console.error("Failed to process JPEG frame:", error);
      }
    } finally {
      this.isProcessingFrame = false;
    }
  }

  private isValidJPEG(buffer: Buffer): boolean {
    // Check minimum size and JPEG magic bytes
    return (
      buffer.length > 10 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 && // SOI (Start of Image)
      buffer[buffer.length - 2] === 0xff &&
      buffer[buffer.length - 1] === 0xd9
    ); // EOI (End of Image)
  }
}

export function createCaptureProvider(
  provider: "opencv" | "ffmpeg",
  config: CaptureConfig
): CaptureProvider {
  switch (provider) {
    case "opencv":
      return new OpenCVCapture(config);
    case "ffmpeg":
      return new FFmpegCapture(config);
    default:
      throw new Error(`Unknown capture provider: ${provider}`);
  }
}
