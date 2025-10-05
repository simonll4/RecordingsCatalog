import fs from "node:fs";
import path from "node:path";
import { emit } from "../infra/bus.js";

type OnnxSetup = {
  modelName: string;
  umbral: number;
  height: number;
  width: number;
  classNames: string[];
};

export class AIModule {
  private setup!: OnnxSetup;
  private sessionCount = 0;
  private maxSessions = 2;
  private sessionStartTime = 0;
  private sessionDuration = 20000; // 20 segundos por sesión
  private inSession = false;
  private finished = false;
  private waiting = false;
  private waitUntil = 0;

  // ===== MONITOREO DE FRAMES =====
  private frameCount = 0;
  private lastFrameTime = 0;
  private frameStatsInterval?: NodeJS.Timeout;
  private expectedFrameSize = 0;
  private invalidFrames = 0;
  private fpsHistory: number[] = [];
  private maxFpsHistory = 10;

  // ===== LOGGING A ARCHIVO =====
  private logFilePath = "";
  private logStream?: fs.WriteStream;
  private monitoringStartTime = Date.now();

  setOnnxModel(
    modelName: string,
    umbral: number,
    height: number,
    width: number,
    classNames: string[]
  ) {
    this.setup = { modelName, umbral, height, width, classNames };

    // Calcular tamaño esperado del frame (RGB = 3 bytes por píxel)
    this.expectedFrameSize = width * height * 3;

    console.log("[AI] Model configured:", this.setup);
    console.log(
      `[AI] Expected frame size: ${this.expectedFrameSize} bytes (${width}x${height} RGB)`
    );
    console.log(
      `[AI] Simulation mode: ${this.maxSessions} sessions of ${
        this.sessionDuration / 1000
      }s each`
    );

    // Iniciar monitoreo de estadísticas de frames
    this.startFrameMonitoring();
  }

  // frame: RGB width*height*3; classesFilter: nombres a considerar para relevancia
  async run(frame: Buffer, classesFilter: string[]): Promise<void> {
    // ===== VALIDACIÓN Y MONITOREO DE FRAMES =====
    const now = Date.now();

    // Validar que el frame tiene el tamaño esperado
    if (!this.validateFrame(frame)) {
      return; // Frame inválido, no procesar
    }

    // Actualizar estadísticas de recepción de frames
    this.updateFrameStats(now);

    // Si ya terminamos las 2 sesiones, no hacer nada
    if (this.finished) {
      return;
    }

    // Si estamos esperando entre sesiones
    if (this.waiting) {
      if (now < this.waitUntil) {
        return; // Todavía esperando
      }
      // Terminó la espera
      this.waiting = false;
      console.log(`[AI] Wait complete, ready for next session`);
    }

    // Si no estamos en sesión y aún tenemos sesiones pendientes
    if (
      !this.inSession &&
      !this.waiting &&
      this.sessionCount < this.maxSessions
    ) {
      // Iniciar nueva sesión
      this.inSession = true;
      this.sessionCount++;
      this.sessionStartTime = now;

      console.log(
        `[AI] Starting session ${this.sessionCount}/${this.maxSessions}`
      );
      emit({ type: "ai.relevant-start", ts: new Date().toISOString() });
    }

    // Si estamos en sesión
    if (this.inSession) {
      const elapsed = now - this.sessionStartTime;

      if (elapsed < this.sessionDuration) {
        // Continuar enviando detecciones
        emit({ type: "ai.keepalive", ts: new Date().toISOString() });

        // Detección ejemplo (simular persona detectada)
        const items = [
          {
            cls: classesFilter[0] || "person",
            conf: 0.7 + Math.random() * 0.25, // confianza entre 0.7 y 0.95
            bbox: [
              0.2 + Math.random() * 0.3,
              0.2 + Math.random() * 0.3,
              0.3,
              0.4,
            ] as [number, number, number, number],
          },
        ];
        emit({ type: "ai.detections", ts: new Date().toISOString(), items });
      } else {
        // Terminar esta sesión
        console.log(
          `[AI] Session ${this.sessionCount}/${this.maxSessions} completed (${elapsed}ms)`
        );
        this.inSession = false;

        // Emitir evento explícito de parada
        emit({ type: "ai.relevant-stop", ts: new Date().toISOString() });

        // Si ya completamos todas las sesiones
        if (this.sessionCount >= this.maxSessions) {
          // NO marcar finished aquí, el FSM necesita frames durante post-roll
          console.log(
            `[AI] All sessions completed, will mark finished after post-roll`
          );
          // Dar tiempo para que el FSM complete el ciclo CLOSING→IDLE (post-roll)
          setTimeout(() => {
            this.finished = true;
            console.log(
              `[AI] Simulation finished: ${this.sessionCount} sessions completed`
            );
          }, 10000); // 10s para post-roll + limpieza
        } else {
          // Configurar espera antes de la próxima sesión
          const waitTime = 15000;
          this.waiting = true;
          this.waitUntil = now + waitTime;
          console.log(
            `[AI] Waiting ${
              waitTime / 1000
            }s before next session (for FSM to complete cycle)...`
          );
        }
      }
    }
  }

  // ===== MÉTODOS DE MONITOREO Y VALIDACIÓN =====

  /**
   * Valida que el frame recibido tiene el formato y tamaño correcto
   */
  private validateFrame(frame: Buffer): boolean {
    // Verificar que el frame existe
    if (!frame || !Buffer.isBuffer(frame)) {
      const errorMsg = "Invalid frame: not a buffer";
      console.error("[AI]", errorMsg);
      this.logToFile("ERROR", errorMsg, { frameNumber: this.frameCount + 1 });
      this.invalidFrames++;
      return false;
    }

    // Verificar tamaño esperado
    if (frame.length !== this.expectedFrameSize) {
      const errorMsg = `Invalid frame size: expected ${this.expectedFrameSize}, got ${frame.length}`;
      console.error("[AI]", errorMsg);
      this.logToFile("ERROR", errorMsg, {
        frameNumber: this.frameCount + 1,
        expectedSize: this.expectedFrameSize,
        actualSize: frame.length,
      });
      this.invalidFrames++;
      return false;
    }

    // Verificar que no está completamente negro (posible indicador de problema)
    const sampleSize = Math.min(1000, frame.length);
    let nonZeroBytes = 0;
    for (let i = 0; i < sampleSize; i += 10) {
      if (frame[i] !== 0) nonZeroBytes++;
    }

    const nonZeroPercentage = (nonZeroBytes / (sampleSize / 10)) * 100;

    // Si menos del 5% de la muestra tiene datos no-cero, posible frame corrupto
    if (nonZeroPercentage < 5) {
      const warnMsg = `Potentially corrupted frame: mostly black pixels (${nonZeroPercentage.toFixed(
        1
      )}% non-zero)`;
      console.warn("[AI]", warnMsg);
      this.logToFile("WARN", warnMsg, {
        frameNumber: this.frameCount + 1,
        nonZeroPercentage: nonZeroPercentage.toFixed(1),
      });
      // No marcar como inválido, solo advertir
    }

    // Log frame válido (solo cada 100 frames para no saturar el log)
    if (this.frameCount % 100 === 0) {
      this.logToFile("INFO", "Frame validation passed", {
        frameNumber: this.frameCount + 1,
        size: frame.length,
        nonZeroPercentage: nonZeroPercentage.toFixed(1),
      });
    }

    return true;
  }

  /**
   * Actualiza estadísticas de recepción de frames
   */
  private updateFrameStats(now: number): void {
    this.frameCount++;

    // Calcular FPS si tenemos frame anterior
    if (this.lastFrameTime > 0) {
      const deltaMs = now - this.lastFrameTime;
      if (deltaMs > 0) {
        const currentFps = 1000 / deltaMs;

        // Mantener historial de FPS para promedios
        this.fpsHistory.push(currentFps);
        if (this.fpsHistory.length > this.maxFpsHistory) {
          this.fpsHistory.shift();
        }
      }
    }

    this.lastFrameTime = now;
  }

  /**
   * Inicia el monitoreo periódico de estadísticas de frames
   */
  private startFrameMonitoring(): void {
    // Configurar archivo de log
    this.setupLogFile();

    // Limpiar interval anterior si existe
    if (this.frameStatsInterval) {
      clearInterval(this.frameStatsInterval);
    }

    // Reportar estadísticas cada 10 segundos
    this.frameStatsInterval = setInterval(() => {
      this.reportFrameStats();
    }, 10000);

    console.log("[AI] Frame monitoring started");
    this.logToFile("INFO", "Frame monitoring started", {
      expectedFrameSize: this.expectedFrameSize,
      modelConfig: this.setup,
    });
  }

  /**
   * Reporta estadísticas actuales de frames
   */
  private reportFrameStats(): void {
    const avgFps =
      this.fpsHistory.length > 0
        ? (
            this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
          ).toFixed(1)
        : "N/A";

    const uptime = this.lastFrameTime > 0 ? Date.now() - this.lastFrameTime : 0;
    const lastFrameAgo =
      uptime > 0 ? `${(uptime / 1000).toFixed(1)}s ago` : "never";

    const statsMsg =
      `Frame Stats - Total: ${this.frameCount}, Invalid: ${this.invalidFrames}, ` +
      `Avg FPS: ${avgFps}, Last frame: ${lastFrameAgo}`;

    console.log("[AI]", statsMsg);

    // Log estadísticas al archivo
    this.logToFile("INFO", "Periodic frame statistics", {
      totalFrames: this.frameCount,
      invalidFrames: this.invalidFrames,
      avgFps: avgFps,
      lastFrameAgo: lastFrameAgo,
      uptimeMs: uptime,
    });

    // Advertir si no hemos recibido frames recientemente
    if (uptime > 2000) {
      // Más de 2 segundos sin frames
      const warnMsg = `WARNING: No frames received for ${(
        uptime / 1000
      ).toFixed(1)}s`;
      console.warn("[AI]", warnMsg);
      this.logToFile("WARN", warnMsg, { uptimeMs: uptime });
    }

    // Advertir si hay muchos frames inválidos
    if (this.invalidFrames > 0 && this.frameCount > 0) {
      const invalidRate = (
        (this.invalidFrames / this.frameCount) *
        100
      ).toFixed(1);
      if (parseFloat(invalidRate) > 5) {
        // Más del 5% inválidos
        const warnMsg = `WARNING: High invalid frame rate: ${invalidRate}%`;
        console.warn("[AI]", warnMsg);
        this.logToFile("WARN", warnMsg, {
          invalidFrames: this.invalidFrames,
          totalFrames: this.frameCount,
          invalidRate: invalidRate,
        });
      }
    }
  }

  /**
   * Detiene el monitoreo y limpia recursos
   */
  public stopMonitoring(): void {
    if (this.frameStatsInterval) {
      clearInterval(this.frameStatsInterval);
      this.frameStatsInterval = undefined;
    }

    // Reporte final
    const finalMsg = `Final frame stats - Total: ${this.frameCount}, Invalid: ${this.invalidFrames}`;
    console.log("[AI]", finalMsg);

    // Log final y cerrar archivo
    this.logToFile("INFO", "Frame monitoring stopped", {
      totalFrames: this.frameCount,
      invalidFrames: this.invalidFrames,
      sessionDurationMs: Date.now() - this.monitoringStartTime,
    });

    this.closeLogFile();
  }

  /**
   * Obtiene estadísticas actuales (para debugging externo)
   */
  public getFrameStats(): {
    total: number;
    invalid: number;
    avgFps: number;
    lastFrameAgo: number;
  } {
    const avgFps =
      this.fpsHistory.length > 0
        ? this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
        : 0;

    const lastFrameAgo =
      this.lastFrameTime > 0 ? Date.now() - this.lastFrameTime : -1;

    return {
      total: this.frameCount,
      invalid: this.invalidFrames,
      avgFps: Math.round(avgFps * 10) / 10,
      lastFrameAgo,
    };
  }

  // ===== MÉTODOS DE LOGGING A ARCHIVO =====

  /**
   * Configura el archivo de log para verificación de frames
   */
  private setupLogFile(): void {
    try {
      // Crear directorio de logs si no existe
      const logsDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // Generar nombre de archivo con timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `ai-frame-verification-${timestamp}.log`;
      this.logFilePath = path.join(logsDir, filename);

      // Crear stream de escritura
      this.logStream = fs.createWriteStream(this.logFilePath, { flags: "a" });

      // Log inicial
      this.logToFile("INFO", "Frame verification log started", {
        timestamp: new Date().toISOString(),
        logFile: this.logFilePath,
        processId: process.pid,
      });

      console.log(`[AI] Frame verification log: ${this.logFilePath}`);
    } catch (error) {
      console.error("[AI] Failed to setup log file:", error);
    }
  }

  /**
   * Escribe un mensaje al archivo de log
   */
  private logToFile(
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    data?: any
  ): void {
    if (!this.logStream) return;

    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        data: data || {},
        uptime: Date.now() - this.monitoringStartTime,
      };

      const logLine = JSON.stringify(logEntry) + "\n";
      this.logStream.write(logLine);
    } catch (error) {
      console.error("[AI] Failed to write to log file:", error);
    }
  }

  /**
   * Cierra el archivo de log
   */
  private closeLogFile(): void {
    if (this.logStream) {
      try {
        this.logStream.end();
        this.logStream = undefined;
        console.log(`[AI] Frame verification log closed: ${this.logFilePath}`);
      } catch (error) {
        console.error("[AI] Failed to close log file:", error);
      }
    }
  }

  /**
   * Obtiene la ruta del archivo de log actual
   */
  public getLogFilePath(): string {
    return this.logFilePath;
  }
}
