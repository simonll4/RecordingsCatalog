import { spawn } from "child_process";

import { CONFIG } from "../infra/config.js";

// Callback que recibe frames RGB procesados para análisis de IA
type OnFrameFn = (rgbFrame: Buffer) => void;

/**
 * AICapture - Captura y procesamiento de frames para análisis de IA
 *
 * Funcionalidad:
 * - Se conecta al hub de cámara vía SHM para recibir stream I420
 * - Convierte y redimensiona frames a RGB para procesamiento de IA
 * - Controla FPS de captura con dual-rate (idle/active)
 * - Maneja buffering de frames y entrega ordenada
 * - Auto-recovery con backoff exponencial en caso de fallos
 *
 * Flujo de datos:
 * Hub SHM (I420) → shmsrc → videoconvert → videoscale →
 * RGB resize → videorate → fdsink → Buffer parsing → onFrame callback
 *
 * Características:
 * - Dual-rate FPS para eficiencia (idle: 5fps, active: 15fps)
 * - Buffering inteligente para frames completos con cota de seguridad
 * - Tolerancia a fallos con reintentos automáticos
 * - Separación limpia entre captura y procesamiento
 */
export class AICapture {
  // Proceso GStreamer para captura y conversión
  private proc?: ReturnType<typeof spawn>;

  // Callback para entregar frames procesados
  private onFrame: OnFrameFn;

  // Buffer acumulativo para ensamblar frames completos
  private acc: Buffer = Buffer.alloc(0);

  // ID único para identificar procesos y evitar race conditions
  private childId = 0;

  // Contador de fallos consecutivos para control de reintentos
  private consecutiveFailures = 0;

  // Límite máximo de reintentos antes de abandonar
  private maxConsecutiveFailures = 5;

  // FPS actual (puede cambiar entre idle y active)
  private currentFps = CONFIG.ai.fps.idle;

  // Flag para indicar si está detenido manualmente
  private stoppedManually = false;

  constructor(onFrame: OnFrameFn) {
    this.onFrame = onFrame;
  }

  /**
   * Inicia la captura de frames para análisis de IA
   *
   * Proceso:
   * 1. Resetea contador de fallos
   * 2. Lanza pipeline GStreamer optimizado para IA
   * 3. Configura buffering y procesamiento de frames
   */
  async start(): Promise<void> {
    this.stoppedManually = false;
    this.consecutiveFailures = 0;
    await this.launch(this.currentFps);
    console.log(
      `[ai-capture] Started at ${this.currentFps}fps (${CONFIG.ai.width}x${CONFIG.ai.height} RGB)`
    );
  }

  /**
   * Detiene la captura de frames de forma ordenada
   *
   * Proceso:
   * 1. Desconecta event listeners para evitar callbacks inesperados
   * 2. Envía SIGINT para shutdown limpio del pipeline GStreamer
   * 3. Fallback a SIGKILL si no responde
   * 4. Limpia buffers y referencias
   */
  async stop(): Promise<void> {
    if (!this.proc) return;

    console.log("[ai-capture] Stopping gracefully");
    this.stoppedManually = true;

    // CRÍTICO: Desconectar handlers ANTES de terminar proceso
    // Previene callbacks con datos corruptos durante la terminación
    this.proc.stdout?.removeAllListeners();
    this.proc.stderr?.removeAllListeners();
    this.proc.removeAllListeners();

    try {
      // SIGINT permite que GStreamer haga cleanup ordenado
      this.proc.kill("SIGINT");
    } catch {}

    // Dar tiempo para que el proceso termine limpiamente
    await new Promise((res) => setTimeout(res, 200));

    // Fallback de seguridad: SIGKILL si no respondió a SIGINT
    try {
      this.proc?.kill("SIGKILL");
    } catch {}

    // Tiempo adicional para que el sistema libere recursos
    await new Promise((res) => setTimeout(res, 100));

    // Limpiar estado interno
    this.proc = undefined;
    this.acc = Buffer.alloc(0); // Liberar buffer acumulativo
  }

  /**
   * Cambia el FPS de captura dinámicamente (dual-rate)
   *
   * Reinicia el proceso con el nuevo FPS para cambio limpio.
   * Útil para optimizar recursos: idle=5fps, active=15fps
   */
  async setFps(nextFps: number): Promise<void> {
    if (nextFps === this.currentFps) {
      console.log(`[ai-capture] FPS already at ${nextFps}fps, skipping`);
      return;
    }

    console.log(
      `[ai-capture] Changing FPS: ${this.currentFps}fps → ${nextFps}fps`
    );
    this.currentFps = nextFps;

    // Si no hay proceso corriendo, solo actualizar el valor
    if (!this.proc) {
      return;
    }

    // Reiniciar el proceso con el nuevo FPS
    const wasManual = this.stoppedManually;
    await this.stop();
    await new Promise((res) => setTimeout(res, 300)); // Pausa para estabilidad
    this.stoppedManually = wasManual; // Restaurar flag
    if (!this.stoppedManually) {
      await this.launch(this.currentFps);
    }
  }

  // ===== MÉTODOS INTERNOS =====

  /**
   * Lanza el pipeline GStreamer para captura de frames de IA
   *
   * Pipeline: SHM source → I420 → convert to RGB → scale → rate control → output
   *
   * @param fps - Frame rate objetivo para la captura
   */
  private async launch(fps: number) {
    // Obtener configuraciones
    const { socketPath, width, height, fpsHub } = CONFIG.capture;
    const w = CONFIG.ai.width; // Ancho para IA (típicamente menor que hub)
    const h = CONFIG.ai.height; // Alto para IA (típicamente menor que hub)
    const frameBytes = w * h * 3; // RGB: 3 bytes por píxel

    // Pipeline GStreamer optimizado para procesamiento de IA
    // Recibe I420 del hub vía shared memory y convierte a RGB con resolución específica para IA
    const args = [
      "-v", // Verbose output
      // ===== RECEPCIÓN DEL HUB VÍA SHARED MEMORY =====
      "shmsrc", // Shared memory source para conectar al hub
      `socket-path=${socketPath}`, // Path al socket de shared memory
      "is-live=true", // Marcar como fuente en vivo
      "do-timestamp=true", // Generar timestamps para sincronización
      "!",
      // CRÍTICO: Fijar caps completas con capsfilter (no como propiedad del elemento)
      `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
      "!",
      "queue", // Buffer con leak downstream para mejor latencia
      "leaky=downstream", // Descartar frames viejos si hay atraso
      "max-size-buffers=1", // Cota 1 para mínima latencia
      "max-size-time=0", // Sin límite de tiempo
      "max-size-bytes=0", // Sin límite de bytes
      "!",
      // ===== CONVERSIÓN PARA IA =====
      "videoconvert", // I420 → RGB conversion
      "!",
      "videoscale", // Redimensionar para IA
      "!",
      "videorate", // Control de frame rate ANTES del caps filter
      "!",
      // Caps filter: RGB con resolución y FPS específicos para IA
      `video/x-raw,format=RGB,width=${w},height=${h},framerate=${fps}/1`,
      "!",
      // ===== SALIDA =====
      "fdsink", // Salida a file descriptor
      "fd=1", // stdout para captura en Node.js
      "sync=false", // Sin sincronización para mejor rendimiento
    ];

    // Crear proceso GStreamer con configuración optimizada
    const child = spawn("gst-launch-1.0", args, {
      env: {
        ...process.env,
        // Nivel de debug GStreamer: 2 = WARNING
        GST_DEBUG: process.env.GST_DEBUG ?? "2",
      },
      stdio: ["ignore", "pipe", "pipe"], // stdin ignorado, stdout/stderr capturados
    });

    this.proc = child;
    const myId = ++this.childId; // ID único para evitar race conditions
    this.acc = Buffer.alloc(0); // Reset buffer acumulativo

    /**
     * Handler para datos de frames RGB del proceso GStreamer
     *
     * Funcionalidad:
     * - Acumula chunks hasta formar frames completos
     * - Valida que el proceso sigue siendo vigente (evita race conditions)
     * - Entrega frames completos al callback de IA
     * - Maneja errores sin crashear el pipeline
     */
    const onData = (chunk: Buffer) => {
      // Verificar que este proceso sigue siendo el vigente
      // Evita procesar datos de procesos ya terminados/reemplazados
      if (myId !== this.childId) return;

      // Resetear contador de fallos en recepción exitosa de datos
      this.consecutiveFailures = 0;

      // Acumular chunk en buffer
      this.acc = Buffer.concat([this.acc, chunk]);

      // Limitar tamaño del acumulador para evitar OOM
      // Mantener máximo 3 frames completos
      const maxAccSize = frameBytes * 3;
      if (this.acc.length > maxAccSize) {
        console.warn(
          `[ai-capture] Buffer overflow (${this.acc.length}/${maxAccSize} bytes), discarding old data`
        );
        // Descartar frames antiguos, mantener solo los últimos 3
        this.acc = this.acc.subarray(this.acc.length - maxAccSize);
      }

      // Extraer frames completos del buffer acumulativo
      while (this.acc.length >= frameBytes) {
        const frame = this.acc.subarray(0, frameBytes);
        this.acc = this.acc.subarray(frameBytes);

        try {
          // Entregar frame al callback de IA (non-blocking)
          this.onFrame(frame);
        } catch (e) {
          console.error("[ai-capture] onFrame error:", e);
          // No propagar error para mantener pipeline estable
        }
      }
    };

    // Conectar handler de datos RGB
    child.stdout.on("data", onData);

    // Handler de logs del proceso GStreamer
    // Filtra spam innecesario y resalta errores importantes
    child.stderr.on("data", (d) => {
      const s = d.toString().trim();

      // Mostrar errores críticos y warnings siempre
      if (/ERROR|WARN|CRITICAL|not negotiated|could not link/i.test(s)) {
        console.error("[ai-capture:gste]", s);
      } else if (s) {
        // Filtrar spam de timestamps puros tipo "(gst-launch-1.0:1234): ..."
        if (!/^\(.*\)\s*$/.test(s)) {
          console.log("[ai-capture:gste]", s);
        }
      }
    });

    // ===== MANEJO DE TERMINACIÓN Y AUTO-RECOVERY =====
    child.on("exit", (code, sig) => {
      console.warn("[ai-capture] Process exited:", code, sig);

      // Verificar que este proceso sigue siendo el vigente
      if (myId !== this.childId) return; // Proceso ya reemplazado, ignorar

      // Limpiar estado del proceso terminado
      this.proc = undefined;
      this.acc = Buffer.alloc(0);

      // ===== SISTEMA DE AUTO-RECOVERY =====
      // Incrementar contador de fallos consecutivos
      this.consecutiveFailures++;

      // Verificar límite máximo de reintentos
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.error(
          `[ai-capture] Max consecutive failures (${this.maxConsecutiveFailures}) reached, stopping auto-restart`
        );
        return;
      }

      // Calcular delay con backoff exponencial (250ms, 500ms, 750ms, max 2s)
      const delay = Math.min(250 * this.consecutiveFailures, 2000);
      console.warn(
        `[ai-capture] Will retry in ${delay}ms (attempt ${this.consecutiveFailures}/${this.maxConsecutiveFailures})`
      );

      // Programar reintento después del delay
      setTimeout(() => {
        // Verificar condiciones antes del reintento:
        // 1. Este proceso sigue siendo el vigente (no reemplazado)
        // 2. No hay otro proceso ya ejecutándose
        // 3. No fue detenido manualmente
        if (myId === this.childId && !this.proc && !this.stoppedManually) {
          console.warn("[ai-capture] Attempting restart after failure");
          this.launch(this.currentFps).catch((err) =>
            console.error("[ai-capture] Relaunch failed:", err)
          );
        }
      }, delay);
    });
  }
}
