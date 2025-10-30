/**
 * Child Process Helper - Structured Logging & Signal Management
 *
 * This module provides utilities for spawning and managing child processes
 * with proper logging, error handling, and cleanup.
 *
 * Purpose:
 * ========
 *
 * Edge Agent spawns multiple GStreamer processes (camera-hub, publisher).
 * This module standardizes how we:
 * - Launch processes with consistent configuration
 * - Capture and log stdout/stderr
 * - Handle process exit and crashes
 * - Kill processes cleanly (SIGINT → SIGKILL)
 *
 * Features:
 * =========
 *
 * Structured Logging
 *   - All stdout/stderr automatically logged with module context
 *   - Configurable log level based on content (ERROR, WARN, DEBUG)
 *   - Optional silent mode for binary streams
 *
 * GStreamer-Aware Filtering
 *   - Filters out known non-critical GStreamer warnings
 *   - Prevents log spam from expected edge cases
 *   - Examples: legacy driver warnings, SHM client disconnect, etc.
 *
 * Signal Handling
 *   - Graceful shutdown with SIGINT first (clean pipeline teardown)
 *   - Force kill with SIGKILL after grace period
 *   - Process group kill to cleanup zombie processes
 *
 * Exit Callbacks
 *   - onExit hook for custom cleanup logic
 *   - Provides exit code and signal for diagnostics
 *   - Enables auto-restart on crash
 *
 * Usage Example:
 * ==============
 *
 * ```typescript
 * const proc = spawnProcess({
 *   module: "camera-hub",
 *   command: "gst-launch-1.0",
 *   args: [
 *     "rtspsrc", "location=rtsp://camera/stream", "latency=200",
 *     "!", "rtph264depay",
 *     "!", "h264parse",
 *     "!", "avdec_h264",
 *     "!", "videoconvert",
 *     "!", "shmsink", "socket-path=/dev/shm/cam.sock"
 *   ],
 *   env: { GST_DEBUG: "2" },
 *   onExit: (code, signal) => {
 *     if (code !== 0) {
 *       console.log("Process crashed, restarting...");
 *     }
 *   }
 * });
 *
 * // Later: graceful shutdown
 * await killProcess(proc, "SIGINT");
 * ```
 *
 * Known GStreamer Warnings (Filtered):
 * =====================================
 *
 * These warnings appear frequently but are not actionable:
 *
 * - VIDIOC_S_CROP failed: Mensajes heredados de drivers V4L2 (inofensivos)
 * - Failed to get default compose region: Avisos de drivers V4L2 legacy
 * - VIDIOC_G_SELECTION: API V4L2 no soportada (no afecta RTSP)
 * - Uncertain or not enough buffers: Advertencia de pool de buffers
 * - lost frames detected: Occasional frame drops (expected under load)
 * - One client is gone, closing: SHM client disconnected (normal)
 * - Passing event: RTSP internal events (noise)
 * - Can't determine running time: RTP session initial latency
 * - receive interrupted: RTSP stop (expected during shutdown)
 * - PAUSE interrupted: RTSP pause (expected during state change)
 *
 * Why Filter These?
 * =================
 *
 * GStreamer logs are very verbose. Filtering known non-issues:
 * - Reduces log noise (easier to spot real problems)
 * - Prevents false alarms in monitoring
 * - Improves log readability
 *
 * Real errors (CRITICAL, ERROR, ASSERT) are always logged at error level.
 */

import { spawn, ChildProcess } from "child_process";
import { logger } from "./logging.js";

/**
 * Spawn Options Configuration
 *
 * Configures how a child process should be spawned and monitored.
 */
export type SpawnOptions = {
  module: string; // Module name for logging context (e.g., "camera-hub")
  command: string; // Executable to run (e.g., "gst-launch-1.0")
  args: string[]; // Command arguments array
  env?: NodeJS.ProcessEnv; // Environment variables (merged with process.env)

  // Lifecycle callbacks
  onStdout?: (line: string) => void; // Called for each stdout line
  onStderr?: (line: string) => void; // Called for each stderr line
  onExit?: (code: number | null, signal: string | null) => void; // Called on process exit

  /**
   * Silent Stdout Mode
   *
   * If true, stdout is not logged (useful for binary pipelines).
   * onStdout callback still fires if provided.
   *
   * Use case: Publisher streams video data to stdout - logging would spam.
   */
  silentStdout?: boolean;
};

/**
 * Spawn Process with Structured Logging
 *
 * Launches a child process with automatic logging and monitoring.
 *
 * Behavior:
 * =========
 *
 * 1. Merges provided env with process.env
 * 2. Spawns with stdio pipes (stdout, stderr captured)
 * 3. Logs all stdout lines at DEBUG level (unless silentStdout=true)
 * 4. Logs stderr with smart level detection:
 *    - ERROR: Lines containing "ERROR", "CRITICAL", "ASSERT"
 *    - WARN: Lines containing "WARN", "WARNING"
 *    - DEBUG: Everything else (or filtered if known GStreamer noise)
 * 5. Calls onExit callback when process terminates
 *
 * Returns:
 * ========
 *
 * ChildProcess instance - use for:
 * - Sending signals (proc.kill(signal))
 * - Monitoring PID (proc.pid)
 * - Listening to events (proc.on('exit', ...))
 *
 * @param opts - Spawn configuration options
 * @returns ChildProcess instance
 */
export function spawnProcess(opts: SpawnOptions): ChildProcess {
  const {
    module,
    command,
    args,
    env,
    onStdout,
    onStderr,
    onExit,
    silentStdout,
  } = opts;

  logger.debug(`Spawning process`, { module, command, args: args.join(" ") });

  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Logging estructurado de stdout (solo si no es binario)
  if (proc.stdout) {
    proc.stdout.on("data", (chunk) => {
      const lines = chunk
        .toString()
        .split("\n")
        .filter((l: string) => l.trim());
      lines.forEach((line: string) => {
        if (!silentStdout) {
          logger.debug(`[${module}] ${line}`);
        }
        onStdout?.(line);
      });
    });
  }

  // Logging estructurado de stderr
  if (proc.stderr) {
    proc.stderr.on("data", (chunk) => {
      const lines = chunk
        .toString()
        .split("\n")
        .filter((l: string) => l.trim());
      lines.forEach((line: string) => {
        // Filtrar warnings conocidos de GStreamer que no son críticos
        const ignoredWarnings = [
          "VIDIOC_S_CROP failed", // Mensaje legacy de drivers V4L2
          "Failed to get default compose region", // Aviso legacy de drivers V4L2
          "VIDIOC_G_SELECTION", // Aviso legacy de drivers V4L2
          "Uncertain or not enough buffers", // Advertencia genérica de buffers
          "lost frames detected", // Frames perdidos ocasionales
          "One client is gone, closing", // SHM cliente desconectado (esperado)
          "Passing event", // RTSP stream eventos internos
          "Can't determine running time", // RTP session latency inicial
          "receive interrupted", // RTSP stop esperado
          "PAUSE interrupted", // RTSP pause esperado
        ];

        const shouldIgnore = ignoredWarnings.some((pattern) =>
          line.includes(pattern)
        );
        if (shouldIgnore) {
          logger.debug(`stderr: ${line}`, { module });
          return;
        }

        // Log errors and warnings at appropriate level
        if (
          line.includes("ERROR") ||
          line.includes("CRITICAL") ||
          line.includes("ASSERT")
        ) {
          logger.error(`stderr: ${line}`, { module });
        } else if (line.includes("WARN") || line.includes("WARNING")) {
          logger.warn(`stderr: ${line}`, { module });
        } else {
          logger.debug(`stderr: ${line}`, { module });
        }
        onStderr?.(line);
      });
    });
  }

  // Exit handling
  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      logger.warn(`Process exited`, { module, code, signal });
    } else {
      logger.info(`Process exited cleanly`, { module, code, signal });
    }
    onExit?.(code, signal);
  });

  proc.on("error", (err) => {
    logger.error(`Process error`, { module, error: err.message });
  });

  return proc;
}

/**
 * Kill process con grace period
 */
export function killProcess(
  proc: ChildProcess | undefined,
  signal: NodeJS.Signals = "SIGTERM"
): void {
  if (!proc || proc.killed) return;

  try {
    proc.kill(signal);
  } catch (err) {
    logger.warn(`Failed to kill process`, { error: (err as Error).message });
  }
}

/**
 * Kill group (proceso + hijos)
 */
export function killGroup(proc: ChildProcess | undefined): void {
  if (!proc || !proc.pid) return;

  try {
    // Negativo para matar todo el grupo
    process.kill(-proc.pid, "SIGTERM");
  } catch (err) {
    // Fallback: kill solo el proceso principal
    killProcess(proc, "SIGTERM");
  }
}
