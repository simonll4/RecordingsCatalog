import { spawn, ChildProcess } from "child_process";
import type { Detection, Frame } from "@edge-agent/common";
import { Readable, Writable } from "stream";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";

export interface PythonTrackerConfig {
  modelPath: string;
  trackerType: "bytetrack" | "botsort";
  trackHighThresh: number;
  trackLowThresh: number;
  newTrackThresh: number;
  trackBuffer: number;
  matchThresh: number;
  pythonPath?: string;
  scriptPath?: string;
}

interface PythonResponse {
  success: boolean;
  detections: Detection[];
  timestamp: number;
  error?: string;
  frame_info?: {
    width: number;
    height: number;
  };
}

export class PythonYOLOTracker extends EventEmitter {
  private process: ChildProcess | null = null;
  private config: PythonTrackerConfig;
  private isReady: boolean = false;
  private pendingRequests: Map<
    string,
    { resolve: Function; reject: Function; timeout: NodeJS.Timeout }
  > = new Map();
  private requestCounter: number = 0;

  constructor(config: PythonTrackerConfig) {
    super();

    // Find the root directory (where python/ folder is located)
    const rootDir = this.findRootDirectory();

    this.config = {
      pythonPath: "python3",
      scriptPath: path.join(rootDir, "python", "yolo_tracker.py"),
      ...config,
    };
  }

  private findRootDirectory(): string {
    let currentDir = process.cwd();

    // Look for python/yolo_tracker.py starting from current directory and going up
    while (currentDir !== path.dirname(currentDir)) {
      const pythonScript = path.join(currentDir, "python", "yolo_tracker.py");
      try {
        // Check if the python script exists
        if (fs.existsSync(pythonScript)) {
          return currentDir;
        }
      } catch (e) {
        // Continue searching
      }
      currentDir = path.dirname(currentDir);
    }

    // Fallback to current directory if not found
    return process.cwd();
  }

  async start(): Promise<void> {
    if (this.process) {
      throw new Error("Python tracker already started");
    }

    const args = [
      this.config.scriptPath!,
      "--model",
      this.config.modelPath,
      "--tracker-type",
      this.config.trackerType,
      "--track-high-thresh",
      this.config.trackHighThresh.toString(),
      "--track-low-thresh",
      this.config.trackLowThresh.toString(),
      "--new-track-thresh",
      this.config.newTrackThresh.toString(),
      "--track-buffer",
      this.config.trackBuffer.toString(),
      "--match-thresh",
      this.config.matchThresh.toString(),
    ];

    const rootDir = this.findRootDirectory();
    const pythonVenvPath = path.join(
      rootDir,
      "python",
      ".venv",
      "bin",
      "python"
    );

    // Use virtual environment python if it exists, otherwise fall back to system python
    const pythonExecutable = fs.existsSync(pythonVenvPath)
      ? pythonVenvPath
      : this.config.pythonPath!;

    return new Promise((resolve, reject) => {
      this.process = spawn(pythonExecutable, args, {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: rootDir, // Set working directory to project root
      });

      let stderrBuffer = "";
      let stdoutBuffer = "";
      let startupComplete = false;

      // Handle stderr (logs)
      this.process.stderr?.on("data", (data: Buffer) => {
        stderrBuffer += data.toString();
        const lines = stderrBuffer.split("\n");
        stderrBuffer = lines.pop() || ""; // Keep incomplete line

        lines.forEach((line) => {
          if (line.trim()) {
            console.log(`[Python Tracker] ${line}`);

            // Check for ready signal
            if (line.includes("service started") && !startupComplete) {
              startupComplete = true;
              this.isReady = true;
              resolve();
            }
          }
        });
      });

      // Handle stdout (responses)
      this.process.stdout?.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() || ""; // Keep incomplete line

        lines.forEach((line) => {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              this.handleResponse(response);
            } catch (e) {
              console.error("[Python Tracker] Failed to parse response:", line);
            }
          }
        });
      });

      // Handle process events
      this.process.on("error", (error) => {
        console.error("[Python Tracker] Process error:", error);
        this.isReady = false;
        this.emit("error", error);
        if (!startupComplete) {
          reject(error);
        }
      });

      this.process.on("exit", (code, signal) => {
        console.log(
          `[Python Tracker] Process exited with code ${code}, signal ${signal}`
        );
        this.isReady = false;
        this.process = null;
        this.emit("exit", code, signal);

        // Reject all pending requests
        this.pendingRequests.forEach(({ reject, timeout }) => {
          clearTimeout(timeout);
          reject(new Error("Python process exited"));
        });
        this.pendingRequests.clear();
      });

      // Timeout for startup
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error("Python tracker startup timeout"));
        }
      }, 30000); // 30 second timeout
    });
  }

  async init(
    cameraId: string,
    threshold: number,
    classesOfInterest: string[]
  ): Promise<void> {
    if (!this.isReady || !this.process) {
      throw new Error("Python tracker not ready");
    }

    const initCommand = {
      cmd: "init",
      cameraId,
      threshold,
      classesOfInterest,
      input: { width: 640, height: 640 },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Init command timeout"));
      }, 5000);

      const requestId = "init_" + (++this.requestCounter).toString();
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const commandLine = JSON.stringify(initCommand) + "\n";
      this.process?.stdin?.write(commandLine);
    });
  }

  async reset(): Promise<void> {
    if (!this.isReady || !this.process) {
      throw new Error("Python tracker not ready");
    }

    const resetCommand = {
      cmd: "reset",
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Reset command timeout"));
      }, 5000);

      const requestId = "reset_" + (++this.requestCounter).toString();
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      const commandLine = JSON.stringify(resetCommand) + "\n";
      this.process?.stdin?.write(commandLine);
    });
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    return new Promise((resolve) => {
      const process = this.process!;

      process.on("exit", () => {
        resolve();
      });

      // Try graceful shutdown first
      process.stdin?.end();

      // Force kill after timeout
      setTimeout(() => {
        if (process.killed === false) {
          process.kill("SIGKILL");
        }
      }, 5000);

      process.kill("SIGTERM");
    });
  }

  async detect(frame: Frame): Promise<Detection[]> {
    if (!this.isReady || !this.process) {
      throw new Error("Python tracker not ready");
    }

    // Prepare image payload: if raw RGB, convert to PNG first; otherwise assume already-encoded image
    let imageBuffer: Buffer = frame.data;
    try {
      const expectedRawSize = frame.width * frame.height * 3; // RGB
      const looksRawRGB = frame.data.length === expectedRawSize;
      if (looksRawRGB) {
        const sharp = await import("sharp");
        imageBuffer = await sharp
          .default(frame.data, {
            raw: {
              width: frame.width,
              height: frame.height,
              channels: 3,
            },
          })
          .png()
          .toBuffer();
      }
    } catch (e) {
      // If conversion fails, fall back to sending original buffer
      // Python side will log an error if it cannot decode
      imageBuffer = frame.data;
    }

    const frameBase64 = imageBuffer.toString("base64");

    const request = {
      data: frameBase64,
      width: frame.width,
      height: frame.height,
      timestamp: frame.timestamp,
    };

    const requestId = (++this.requestCounter).toString();

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("Python tracker request timeout"));
      }, 10000); // 10 second timeout

      // Store request
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Send request
      const requestLine = JSON.stringify(request) + "\n";

      try {
        const writeResult = this.process?.stdin?.write(requestLine);

        // If write returns false, it means buffer is full but data will be written
        // This is not an error - the 'drain' event will fire when ready
        if (writeResult === false) {
          // Wait for drain event
          this.process?.stdin?.once("drain", () => {
            console.log("[Python Tracker] Buffer drained, ready for more data");
          });
        }
      } catch (writeError) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(new Error(`Failed to write to Python process: ${writeError}`));
      }
    });
  }

  private handleResponse(response: any): void {
    // Handle different response types
    if (response.cmd === "init" || response.cmd === "reset") {
      // Command response
      const requestEntries = Array.from(this.pendingRequests.entries());
      const matchingRequest = requestEntries.find(([id]) =>
        id.startsWith(response.cmd)
      );

      if (matchingRequest) {
        const [requestId, request] = matchingRequest;
        this.pendingRequests.delete(requestId);
        clearTimeout(request.timeout);

        if (response.ok) {
          request.resolve();
        } else {
          request.reject(new Error(response.error || "Command failed"));
        }
      }
    } else {
      // Frame detection response
      const requestEntries = Array.from(this.pendingRequests.entries());

      if (requestEntries.length > 0) {
        const [requestId, request] = requestEntries[0];
        this.pendingRequests.delete(requestId);

        clearTimeout(request.timeout);

        if (response.success) {
          request.resolve(response.detections);
        } else {
          request.reject(new Error(response.error || "Unknown Python error"));
        }
      }
    }
  }

  isRunning(): boolean {
    return this.isReady && this.process !== null;
  }

  getStats() {
    return {
      isReady: this.isReady,
      pendingRequests: this.pendingRequests.size,
      processId: this.process?.pid || null,
    };
  }
}
