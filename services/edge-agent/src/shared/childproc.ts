/**
 * Child process helper con logging estructurado
 * Manejo de señales y kill group
 */

import { spawn, ChildProcess } from "child_process";
import { logger } from "./logging.js";

export type SpawnOptions = {
  module: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
  onExit?: (code: number | null, signal: string | null) => void;
};

export function spawnProcess(opts: SpawnOptions): ChildProcess {
  const { module, command, args, env, onStdout, onStderr, onExit } = opts;

  logger.debug(`Spawning process`, { module, command, args: args.join(" ") });

  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Logging estructurado de stdout
  if (proc.stdout) {
    proc.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter((l: string) => l.trim());
      lines.forEach((line: string) => {
        logger.debug(`[${module}] ${line}`);
        onStdout?.(line);
      });
    });
  }

  // Logging estructurado de stderr
  if (proc.stderr) {
    proc.stderr.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter((l: string) => l.trim());
      lines.forEach((line: string) => {
        // Filtrar warnings conocidos de GStreamer que no son críticos
        const ignoredWarnings = [
          "VIDIOC_S_CROP failed",                    // V4L2 crop no soportado
          "Failed to get default compose region",     // V4L2 compose region
          "VIDIOC_G_SELECTION",                       // V4L2 selection no soportado
          "Uncertain or not enough buffers",          // V4L2 buffer pool
          "lost frames detected",                     // Frames perdidos ocasionales
          "One client is gone, closing",              // SHM cliente desconectado (esperado)
          "Passing event",                            // RTSP stream eventos internos
          "Can't determine running time",             // RTP session latency inicial
          "receive interrupted",                      // RTSP stop esperado
          "PAUSE interrupted",                        // RTSP pause esperado
        ];

        const shouldIgnore = ignoredWarnings.some(pattern => line.includes(pattern));
        if (shouldIgnore) {
          logger.debug(`stderr: ${line}`, { module });
          return;
        }

        // Log errors and warnings at appropriate level
        if (line.includes("ERROR") || line.includes("CRITICAL") || line.includes("ASSERT")) {
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
export function killProcess(proc: ChildProcess | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
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
