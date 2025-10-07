import type { Detection, Frame } from "@edge-agent/common";
import { PythonYOLOTracker, PythonTrackerConfig } from "./python-tracker";

export interface PythonDetectorConfig {
  modelPath: string;
  classesOfInterest: string[];
  threshold: number;
  tracker: {
    type: "bytetrack" | "botsort";
    trackHighThresh: number;
    trackLowThresh: number;
    newTrackThresh: number;
    trackBuffer: number;
    matchThresh: number;
  };
  pythonPath?: string;
}

export class PythonDetector {
  private config: PythonDetectorConfig;
  private tracker: PythonYOLOTracker;

  constructor(config: PythonDetectorConfig) {
    this.config = config;

    const trackerConfig: PythonTrackerConfig = {
      modelPath: config.modelPath,
      trackerType: config.tracker.type,
      trackHighThresh: config.tracker.trackHighThresh,
      trackLowThresh: config.tracker.trackLowThresh,
      newTrackThresh: config.tracker.newTrackThresh,
      trackBuffer: config.tracker.trackBuffer,
      matchThresh: config.tracker.matchThresh,
      pythonPath: config.pythonPath,
    };

    this.tracker = new PythonYOLOTracker(trackerConfig);
  }

  async load(): Promise<void> {
    console.log("Starting Python YOLOv8 + ByteTrack service...");
    await this.tracker.start();
    console.log("Python YOLOv8 + ByteTrack service started successfully");
  }

  async reset(): Promise<void> {
    console.log("Resetting Python tracker state...");
    await this.tracker.reset();
    console.log("Python tracker state reset");
  }

  async infer(frame: Frame): Promise<Detection[]> {
    try {
      // Get detections with tracking from Python
      const allDetections = await this.tracker.detect(frame);

      // Filter by classes of interest and threshold
      const filteredDetections = allDetections.filter(
        (detection) =>
          this.config.classesOfInterest.includes(detection.class) &&
          detection.score >= this.config.threshold
      );

      return filteredDetections;
    } catch (error) {
      console.error("Python detection failed:", error);
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.tracker) {
      await this.tracker.stop();
    }
  }

  isReady(): boolean {
    return this.tracker.isRunning();
  }

  getStats() {
    return {
      pythonTracker: this.tracker.getStats(),
      config: {
        modelPath: this.config.modelPath,
        classesOfInterest: this.config.classesOfInterest,
        threshold: this.config.threshold,
      },
    };
  }
}
