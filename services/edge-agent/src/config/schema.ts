/**
 * Configuration Schema - Type Definitions for Edge Agent Configuration
 *
 * This module defines TypeScript types for all configuration parameters.
 * These types are used by config/index.ts to validate environment variables
 * and provide type safety throughout the codebase.
 *
 * Structure:
 * ==========
 *
 * AppConfig (Root)
 *   ├── deviceId: Unique edge device identifier
 *   ├── logLevel: Log verbosity level (debug/info/warn/error)
 *   ├── source: Video source configuration (RTSP)
 *   ├── ai: AI model configuration (YOLO)
 *   ├── mediamtx: RTSP server configuration (MediaMTX)
 *   ├── fsm: State machine timers
 *   ├── store: Session/detection API endpoints
 *   └── bus: Event bus settings
 *
 * Why Explicit Types?
 * ===================
 *
 * Validation
 *   - CONFIG must satisfy AppConfig (compile-time type checking)
 *   - Invalid configuration caught at build time
 *
 * Autocomplete
 *   - IDE suggests valid configuration fields
 *   - Reduces typos and errors
 *
 * Documentation
 *   - Types serve as living documentation
 *   - Clear contracts for configuration structure
 *
 * Refactoring Safety
 *   - Changing a field name → compilation errors
 *   - Ensures all usages are updated
 *
 * Configuration Sources:
 * ======================
 *
 * config.toml (single source of truth)
 *   - TOML format for clarity and structure
 *   - Validated and parsed in config/index.ts
 *   - No environment variables used (config.toml only)
 */

/**
 * Source Kind - Video Input Type
 *
 * rtsp: Network camera (IP camera)
 *   - URL format: rtsp://host:port/path
 *   - Example: rtsp://192.168.1.100:554/stream
 *   - Supports H.264, MJPEG, etc.
 */
export type SourceKind = "rtsp";

/**
 * Source Configuration - Video Capture Settings
 *
 * Defines how CameraHub captures video from the source.
 *
 * Fields:
 * =======
 *
 * kind: Source type (rtsp only)
 *   - Determines which GStreamer elements to use
 *
 * uri: RTSP stream URL
 *   - Format: rtsp://host:port/path
 *   - Example: rtsp://192.168.1.82:554/Streaming/Channels/1
 *
 * width/height: Capture resolution
 *   - Must be supported by source
 *   - Common: 640x480, 1280x720, 1920x1080
 *   - Affects CPU usage and bandwidth
 *
 * fpsHub: Constant capture framerate
 *   - Frames per second written to SHM
 *   - Typical: 12-30 FPS
 *   - Independent of AI processing rate
 *
 * socketPath: Shared memory socket path
 *   - Unix domain socket for inter-process communication
 *   - Multiple readers supported (NV12Capture, Publisher)
 *   - Example: /tmp/camera_shm
 *
 * shmSizeMB: Shared memory buffer size
 *   - Total memory allocated for frame buffers
 *   - Must accommodate multiple frames
 *   - Typical: 50-100 MB
 *   - Formula: (width × height × 1.5) × num_buffers
 *
 * GStreamer Pipeline:
 * ===================
 *
 * RTSP (H.264):
 *   rtspsrc location=rtsp://... protocols=tcp
 *   ! rtph264depay ! h264parse ! avdec_h264
 *   ! videoconvert ! videoscale
 *   ! video/x-raw,format=I420,width=640,height=480,framerate=12/1
 *   ! shmsink socket-path=/tmp/camera_shm
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
 * AI Configuration - Object Detection Model Settings
 *
 * Defines parameters for YOLO-based object detection.
 *
 * Fields:
 * =======
 *
 * modelName: YOLO model identifier
 *   - yolov8n: Nano (fastest, least accurate)
 *   - yolov8s: Small
 *   - yolov8m: Medium
 *   - yolov8l: Large
 *   - yolov8x: Extra large (slowest, most accurate)
 *
 * umbral: Minimum confidence threshold
 *   - Range: 0.0 to 1.0
 *   - Example: 0.5 = 50% confidence minimum
 *   - Lower = more detections (more false positives)
 *   - Higher = fewer detections (more false negatives)
 *
 * width/height: Inference resolution
 *   - Frames resized to this before inference
 *   - Affects accuracy and speed
 *   - Common: 640×480, 640×640 (YOLO default)
 *   - Higher = better accuracy, slower processing
 *
 * classesFilter: Relevant object classes
 *   - Array of COCO class names
 *   - Only these classes trigger recording
 *   - Example: ["person", "car", "dog"]
 *   - Full COCO list: person, bicycle, car, motorbike, etc.
 *
 * fps.idle: Processing rate when IDLE
 *   - Low rate to save CPU/GPU
 *   - Typical: 3-5 FPS
 *   - Just monitoring for activity
 *
 * fps.active: Processing rate when ACTIVE
 *   - Higher rate for accurate tracking
 *   - Typical: 10-15 FPS
 *   - Smooth object tracking during recording
 *
 * frameCacheTtlMs: Frame cache TTL
 *   - How long to keep frames in memory
 *   - Allows correlation between detection and original frame
 *   - Typical: 2000ms (2 seconds)
 *
 * worker.host: AI worker hostname
 *   - Docker service name or IP
 *   - Example: "worker-ai" or "localhost"
 *
 * worker.port: AI worker TCP port
 *   - Protocol v1 binary communication
 *   - Default: 7001
 *
 * Why Dual-Rate FPS?
 * ===================
 *
 * Power Efficiency
 *   - Low FPS when idle saves CPU/GPU/battery
 *   - Only ramp up when needed
 *
 * Detection Quality
 *   - High FPS during recording ensures smooth tracking
 *   - Better temporal resolution for fast-moving objects
 *
 * Cost Optimization
 *   - Cloud/edge inference often billed per frame
 *   - Minimize processing when nothing is happening
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
 * MediaMTX Configuration - RTSP Server Settings
 *
 * Defines MediaMTX endpoint for stream publishing.
 *
 * Fields:
 * =======
 *
 * host: MediaMTX server hostname
 *   - Docker service name: "mediamtx"
 *   - IP address: "192.168.1.100"
 *   - Localhost: "localhost" (for testing)
 *
 * port: RTSP port
 *   - Default: 8554 (standard RTSP)
 *   - Alternative: 554 (privileged port)
 *
 * path: Stream path
 *   - Example: "live" → rtsp://host:8554/live
 *   - Can include device ID: "camera/{deviceId}"
 *
 * Full URL:
 *   rtsp://{host}:{port}/{path}
 *
 * Publisher Connection:
 *   MediaMtxOnDemandPublisherGst connects to this URL when ACTIVE.
 *   Streams H.264 video using rtspclientsink element.
 */
export type MediaMTXConfig = {
  host: string;
  port: number;
  path: string;
};

/**
 * FSM Configuration - State Machine Timers
 *
 * Defines temporal windows for finite state machine transitions.
 *
 * Fields:
 * =======
 *
 * dwellMs: Confirmation window in DWELL state
 *   - How long to wait for second detection before returning to IDLE
 *   - Prevents false positives from single spurious detections
 *   - Typical: 500-2000ms
 *   - Too short: Random noise triggers recording
 *   - Too long: Slow response to real activity
 *
 * silenceMs: Inactivity timeout in ACTIVE state
 *   - How long without detections before transitioning to CLOSING
 *   - Grace period for temporary occlusion or frame drops
 *   - Typical: 2000-5000ms
 *   - Too short: Session closes if object briefly hidden
 *   - Too long: Recording continues unnecessarily
 *
 * postRollMs: Post-roll recording in CLOSING state
 *   - Extra recording time after last detection
 *   - Captures context after activity (e.g., person exiting frame)
 *   - Typical: 3000-10000ms
 *   - Too short: May miss important exit context
 *   - Too long: Wastes storage on empty frames
 *
 * Why These Timers?
 * =================
 *
 * False Positive Prevention
 *   - dwellMs filters out noise and single misdetections
 *   - Requires sustained activity to trigger recording
 *
 * Robustness to Occlusion
 *   - silenceMs prevents premature session close
 *   - Tolerates brief periods where object is hidden
 *
 * Context Capture
 *   - postRollMs ensures complete event capture
 *   - Important for forensic review and analytics
 *
 * State Diagram:
 *   IDLE --detection--> DWELL
 *   DWELL --dwellMs timeout--> IDLE
 *   DWELL --second detection--> ACTIVE
 *   ACTIVE --silenceMs timeout--> CLOSING
 *   CLOSING --postRollMs timeout--> IDLE
 */
export type FSMConfig = {
  dwellMs: number;
  silenceMs: number;
  postRollMs: number;
};

/**
 * Store Configuration - Session Store API Settings
 *
 * Defines connection to session-store service (HTTP API).
 *
 * Fields:
 * =======
 *
 * baseUrl: API base URL
 *   - Docker: http://session-store:3001
 *   - Local: http://localhost:3001
 *   - Includes protocol and port
 *
 * apiKey: Authentication key (optional)
 *   - If provided, sent in Authorization header
 *   - Format: "Bearer {apiKey}"
 *   - Leave empty if API is unauthenticated
 *
 * Nota: La ingesta de detecciones/frames se realiza con FrameIngester (/ingest),
 * por lo que no hay parámetros adicionales de batching en esta sección.
 *
 * API Endpoints:
 * ==============
 *
 * POST /sessions/open
 *   - Create new recording session
 *   - Returns sessionId
 *
 * POST /sessions/:sessionId/close
 *   - Mark session as complete
 *
 * POST /ingest
 *   - Upload frame image
 *   - Multipart form data
 *   - Returns frameId
 */
export type StoreConfig = {
  baseUrl: string;
  apiKey?: string;
};

/**
 * Bus Configuration - Event Bus Queue Limits
 *
 * Defines backpressure limits for the event system.
 *
 * Fields:
 * =======
 *
 * maxQueueSize: Maximum queue size per topic
 *   - Limit on pending events per topic
 *   - Typical: 1024 events
 *   - When exceeded, new events are dropped
 *   - Prevents memory exhaustion under load
 *
 * Why Configurable?
 * =================
 *
 * Load Adaptation
 *   - Adjust backpressure threshold based on system capacity
 *   - Higher limit = more buffering (more memory usage)
 *   - Lower limit = stricter backpressure (more drops)
 *
 * Event Priority
 *   - Critical events should complete quickly (not queue up)
 *   - If queue fills, it indicates consumer can't keep up
 *
 * Failure Mode
 *   - When bus is full, publish() logs warning and drops event
 *   - Better to drop event than crash from OOM
 *   - Monitoring can alert on dropped events
 *
 * Typical Values:
 *   - Low-frequency events (state changes): 256
 *   - High-frequency events (detections): 1024-4096
 *   - Memory impact: ~1KB per queued event (depends on payload)
 */
export type BusConfig = {
  maxQueueSize: number;
};

/**
 * App Configuration - Complete Application Configuration
 *
 * Root of the configuration tree. All modules access the CONFIG singleton
 * which implements this type.
 *
 * Fields:
 * =======
 *
 * deviceId: Unique edge device identifier
 *   - Example: "edge-dev-001", "camera-front-door"
 *   - Used in session metadata and logs
 *   - Helps identify source in multi-device deployments
 *
 * logLevel: Log verbosity level
 *   - debug: All logs (verbose, for development)
 *   - info: Important events (default for production)
 *   - warn: Abnormal situations only
 *   - error: Critical errors only
 *
 * source: Video source configuration
 *   - See SourceConfig for details
 *   - Defines camera type, resolution, FPS
 *
 * ai: AI model configuration
 *   - See AIConfig for details
 *   - Defines YOLO model, thresholds, worker connection
 *
 * mediamtx: RTSP server configuration
 *   - See MediaMTXConfig for details
 *   - Defines streaming endpoint
 *
 * fsm: State machine timers
 *   - See FSMConfig for details
 *   - Defines dwell, silence, post-roll durations
 *
 * store: Session store API configuration
 *   - See StoreConfig for details
 *   - Defines HTTP endpoint
 *
 * bus: Event bus configuration
 *   - See BusConfig for details
 *   - Defines queue limits
 *
 * Usage Example:
 * ==============
 *
 * ```typescript
 * import { CONFIG } from "./config/index.js";
 *
 * console.log(CONFIG.deviceId); // "edge-dev-001"
 * console.log(CONFIG.fsm.dwellMs); // 500
 * console.log(CONFIG.ai.classesFilter); // ["person", "car"]
 * ```
 *
 * Configuration Source:
 * =====================
 *
 * CONFIG is loaded from config.toml in config/index.ts.
 * See that file for:
 * - TOML section names (e.g., [device], [video], [ai])
 * - Default values for optional parameters
 * - Validation logic
 */
export type AppConfig = {
  deviceId: string;
  logLevel: "debug" | "info" | "warn" | "error";
  source: SourceConfig;
  ai: AIConfig;
  mediamtx: MediaMTXConfig;
  fsm: FSMConfig;
  store: StoreConfig;
  bus: BusConfig;
};
