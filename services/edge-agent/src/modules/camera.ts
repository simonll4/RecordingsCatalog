import fs from "node:fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

import { CONFIG } from "../infra/config.js";

/**
 * Camera - Hub de captura de video siempre-encendido
 *
 * Funcionalidad:
 * - Captura video desde fuentes RTSP o V4L2 (cámaras USB/integradas)
 * - Convierte y normaliza el stream a formato I420 (YUV 4:2:0)
 * - Publica via shared memory para menor carga de kernel y latencia
 * - Auto-reinicio en caso de fallos o pérdida de conexión
 * - Fallback automático de MJPEG a RAW para cámaras V4L2
 *
 * Flujo:
 * Fuente (RTSP/V4L2) → GStreamer pipeline → I420 WxH@fpsHub → Shared Memory
 *
 * Estados:
 * - READY: Pipeline iniciado y funcionando
 * - STOPPED: Pipeline detenido manualmente
 * - ERROR: Reinicio automático en 2 segundos
 */
export class Camera {
  // Proceso GStreamer del pipeline de captura
  private proc?: ChildProcessWithoutNullStreams;

  // Resolver para la promesa de ready()
  private readyResolve?: () => void;

  // Estado de disponibilidad del hub
  private isReady = false;

  // Flags para criterio AND de READY (PLAYING + socket existe)
  private sawPlaying = false;
  private sawSocket = false;

  // Timeout para advertencia (no para marcar ready)
  private readyTimeout?: NodeJS.Timeout;

  // Polling para detectar socket file
  private socketPoll?: NodeJS.Timeout;

  // Flag para V4L2: indica si debe usar RAW en lugar de MJPEG
  private tryRawFallback = false;

  // Flag para evitar auto-restart cuando se detiene manualmente
  private stoppedManually = false;

  // Contador de reintentos para backoff exponencial
  private restartAttempts = 0;

  /**
   * Retorna una promesa que se resuelve cuando el hub está listo
   *
   * El hub está "ready" cuando:
   * - El pipeline GStreamer está en estado PLAYING
   * - El socket SHM existe y está disponible
   * - O cuando expira el timeout de seguridad (2.5s)
   */
  ready(): Promise<void> {
    if (this.isReady) return Promise.resolve();
    return new Promise((resolve) => (this.readyResolve = resolve));
  }

  /**
   * Inicia el hub de captura de video
   *
   * Proceso:
   * 1. Construye pipeline GStreamer según el tipo de fuente (RTSP/V4L2)
   * 2. Configura manejo de logs y detección de estados
   * 3. Inicia proceso con auto-restart en caso de fallos
   * 4. Establece mecanismos de detección de ready
   */
  start() {
    // Verificar si ya está ejecutándose
    if (this.proc) {
      console.log("[camera] Already running");
      return;
    }

    // Validar configuración antes de arrancar
    this.validateConfig();

    // Obtener configuración de captura
    const { width, height, fpsHub, socketPath, shmSizeMB } = CONFIG.capture;

    // Limpiar socket previo si quedó de ejecuciones anteriores
    try {
      fs.unlinkSync(socketPath);
    } catch {}

    // Calcular tamaño de buffer SHM
    const shmSizeBytes = shmSizeMB * 1024 * 1024;

    let args: string[];

    // ===== CONFIGURACIÓN PIPELINE RTSP =====
    if (CONFIG.source.kind === "rtsp") {
      const rtspUrl = CONFIG.source.rtspUrl;

      // Pipeline RTSP: rtspsrc → H.264 decode → normalize → SHM hub
      // Optimizado para latencia baja (70ms) y reconexión automática
      args = [
        "-v", // Verbose output
        "rtspsrc", // Elemento fuente RTSP
        `location=${rtspUrl}`, // URL de la cámara RTSP
        "protocols=tcp", // Usar TCP (más confiable que UDP)
        "latency=70", // Latencia mínima optimizada para LAN (70ms)
        "!",
        "rtpjitterbuffer", // Buffer para compensar jitter de red
        "!",
        "rtph264depay", // Extraer H.264 de paquetes RTP
        "!",
        "h264parse", // Parsear stream H.264
        "!",
        "avdec_h264", // Decodificar H.264 a raw video
        "!",
        "videoconvert", // Conversión de formato de color
        "!",
        "videoscale", // Escalado de resolución
        "!",
        "videorate", // Control de frame rate
        "!",
        // Caps filter: Normalizar a I420 con resolución y FPS específicos
        `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
        "!",
        "queue", // Buffer de cola con backpressure controlado
        "leaky=downstream", // Descartar frames antiguos si hay congestión
        "max-size-buffers=1", // Cota 1 para mínima latencia
        "max-size-time=0", // Sin límite de tiempo
        "max-size-bytes=0", // Sin límite de bytes
        "!",
        "shmsink", // Shared memory sink para menor carga de kernel
        `socket-path=${socketPath}`, // Socket de shared memory
        `shm-size=${shmSizeBytes}`, // Tamaño buffer SHM
        "wait-for-connection=false", // No esperar conexiones para iniciar
        "sync=false", // Sin sincronización (mejor rendimiento)
      ];
      console.log(`[camera] Starting RTSP hub: ${rtspUrl} → shm:${socketPath}`);
    }
    // ===== CONFIGURACIÓN PIPELINE V4L2 =====
    else {
      const device = CONFIG.source.device;

      // Estrategia V4L2:
      // 1. Intento MJPEG (eficiente si la cámara lo soporta nativamente)
      // 2. Fallback a RAW (YUY2/YUYV → videoconvert) si MJPEG falla

      // Elementos comunes del inicio del pipeline V4L2
      const v4l2Head = ["-v", "v4l2src", `device=${device}`];

      // Elementos comunes del final del pipeline V4L2
      const v4l2Tail = [
        "!",
        "videoconvert", // Conversión de formato (YUY2→I420, etc.)
        "!",
        "videoscale", // Escalado de resolución
        "!",
        "videorate", // Control de frame rate
        "!",
        // Caps filter: Normalizar a I420 con resolución y FPS específicos
        `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
        "!",
        "queue", // Buffer de cola con backpressure controlado
        "leaky=downstream", // Descartar frames antiguos si hay congestión
        "max-size-buffers=1", // Cota 1 para mínima latencia
        "max-size-time=0", // Sin límite de tiempo
        "max-size-bytes=0", // Sin límite de bytes
        "!",
        "shmsink", // Shared memory sink para menor carga de kernel
        `socket-path=${socketPath}`, // Socket de shared memory
        `shm-size=${shmSizeBytes}`, // Tamaño buffer SHM
        "wait-for-connection=false", // No esperar conexiones para iniciar
        "sync=false", // Sin sincronización (mejor rendimiento)
      ];

      if (!this.tryRawFallback) {
        // MODO MJPEG: Intenta usar compresión JPEG nativa de la cámara
        // Ventajas: Menor uso de ancho de banda USB, mejor rendimiento
        // Desventajas: No todas las cámaras lo soportan
        args = [
          ...v4l2Head,
          "!",
          `image/jpeg,framerate=${fpsHub}/1`, // Fijar framerate para negociación
          "!",
          "jpegdec",
          ...v4l2Tail,
        ];
        console.log(
          `[camera] Starting V4L2 hub (MJPEG): ${device} → shm:${socketPath}`
        );
      } else {
        // MODO RAW FALLBACK: Usa formato nativo de la cámara (típicamente YUY2)
        // Se activa automáticamente si MJPEG falla en la negociación de caps
        args = [...v4l2Head, ...v4l2Tail];
        console.log(
          `[camera] Starting V4L2 hub (RAW fallback): ${device} → shm:${socketPath}`
        );
      }
    }

    // Crear proceso GStreamer con configuración de debug
    this.proc = spawn("gst-launch-1.0", args, {
      env: {
        ...process.env,
        // Nivel de debug GStreamer: 2 = WARNING (balance entre info y spam)
        GST_DEBUG: process.env.GST_DEBUG ?? "2",
        GST_DEBUG_NO_COLOR: "1", // Sin colores para mejor parsing de logs
      },
    });

    /**
     * Maneja la salida de logs del proceso GStreamer
     *
     * Funciones:
     * - Filtra spam de timestamps y mensajes repetitivos
     * - Detecta estados del pipeline para marcar como "ready"
     * - Identifica errores de negociación para activar fallback RAW
     * - Proporciona logs útiles para debugging
     */
    const handleData = (buf: Buffer, src: "stdout" | "stderr") => {
      const msg = buf.toString();
      if (!msg) return;

      // Procesar cada línea del log
      for (const line of msg.split(/\r?\n/)) {
        const l = line.trim();
        if (!l) continue;

        const tag = src === "stderr" ? "gste" : "gsto";

        // Mostrar errores y warnings siempre
        if (/ERROR|WARN|ERROR:|CRITICAL/i.test(l)) {
          console.error(`[camera:${tag}]`, l);
        }
        // Filtrar spam de timestamps tipo "(gst-launch-1.0:1234): ..."
        else if (!/^\(.*\)\s*$/i.test(l)) {
          console.log(`[camera:${tag}]`, l);
        }

        // ===== DETECCIÓN DE ESTADO READY =====
        // Detectar cuando el pipeline está en PLAYING
        if (
          !this.sawPlaying &&
          (l.includes("Setting pipeline to PLAYING") ||
            l.includes("FROM PAUSED to PLAYING") ||
            l.includes("from PAUSED to PLAYING") ||
            l.includes("Pipeline is PREROLLING") ||
            l.includes("Prerolling") ||
            l.includes("Prerolled"))
        ) {
          this.sawPlaying = true;
          this.tryMarkReady();
        }

        // ===== AUTO-FALLBACK MJPEG → RAW =====
        // Si detectamos problemas de negociación de caps con MJPEG,
        // reinicia automáticamente en modo RAW (más compatible)
        if (CONFIG.source.kind === "v4l2" && !this.tryRawFallback) {
          if (
            /not negotiated|not-negotiated|could not link|No supported formats|not accept/i.test(
              l
            )
          ) {
            console.warn(
              "[camera] Caps negotiation failed on MJPEG path → retrying RAW fallback"
            );
            this.restartWithRawFallback();
          }
        }
      }
    };

    // Conectar handlers de salida del proceso
    this.proc.stdout.on("data", (d) => handleData(d, "stdout"));
    this.proc.stderr.on("data", (d) => handleData(d, "stderr"));

    // ===== CONFIGURACIÓN POST-SPAWN =====
    this.proc.on("spawn", () => {
      console.log(
        `[camera] Hub spawned: ${CONFIG.source.kind} → shm:${socketPath}`
      );

      // MECANISMO 1: Polling del socket file
      // shmsink crea el archivo de socket cuando está listo
      this.socketPoll = setInterval(() => {
        try {
          if (!this.sawSocket && fs.existsSync(socketPath)) {
            this.sawSocket = true;
            this.tryMarkReady();
          }
        } catch {}
      }, 100); // Check cada 100ms

      // MECANISMO 2: Timeout de advertencia (NO marca ready)
      // Si después de 2.5s no hay READY, advertir pero seguir esperando
      this.readyTimeout = setTimeout(() => {
        if (!this.isReady) {
          console.warn(
            "[camera] Not ready after 2.5s (sawPlaying:",
            this.sawPlaying,
            "sawSocket:",
            this.sawSocket,
            "). Will keep waiting."
          );
        }
      }, 2500);
    }); // ===== MANEJO DE TERMINACIÓN Y AUTO-RESTART =====
    this.proc.on("exit", (code, signal) => {
      const msg = `[camera] Hub stopped (code: ${code}, signal: ${signal})`;

      // Si fue detenido manualmente, no hacer auto-restart
      if (this.stoppedManually) {
        console.log(msg + " - manual stop");
        this.stoppedManually = false;
        // Limpiar socket SHM
        try {
          fs.unlinkSync(socketPath);
        } catch {}
        return;
      }

      // Si this.proc ya fue limpiado, significa que estamos en medio de un fallback
      // No hacer nada aquí, el fallback ya maneja el restart
      if (!this.proc) {
        console.log(msg + " - handled by fallback");
        return;
      }

      // Clasificar tipo de salida para mejor diagnóstico
      if (signal === "SIGABRT") {
        console.warn(msg + " - likely lost all consumers");
      } else {
        console.warn(msg);
      }

      // Limpiar estado y preparar para reinicio
      this.cleanupReadyWait();
      this.proc = undefined;
      this.isReady = false;
      this.readyResolve = undefined;
      this.sawPlaying = false;
      this.sawSocket = false;

      // Limpiar socket SHM stale
      try {
        fs.unlinkSync(socketPath);
      } catch {}

      // Auto-restart con backoff exponencial
      const delay = Math.min(
        2000 * Math.pow(1.5, this.restartAttempts++),
        15000
      );
      console.warn(
        `[camera] Restarting in ${delay}ms (attempt ${this.restartAttempts})`
      );

      setTimeout(() => {
        if (!this.stoppedManually) {
          this.start();
        }
      }, delay);
    });
  }

  /**
   * Detiene el hub de captura de forma ordenada
   *
   * Proceso:
   * 1. Marca como detenido manualmente (evita auto-restart)
   * 2. Envía SIGINT para shutdown limpio del pipeline
   * 3. Fallback a SIGKILL si no responde en 1.5s
   * 4. Limpia estado y recursos (incluyendo socket SHM)
   */
  stop() {
    if (!this.proc) return;

    console.log("[camera] Stopping hub");
    this.stoppedManually = true;

    // SIGINT permite que GStreamer haga EOS (End of Stream) limpio
    // Esto es importante para cerrar archivos, liberar hardware, etc.
    this.proc.kill("SIGINT");

    // Timeout de seguridad: Si no responde en 1.5s, forzar terminación
    setTimeout(() => {
      if (this.proc) {
        console.warn(
          "[camera] Process didn't respond to SIGINT, using SIGKILL"
        );
        this.proc.kill("SIGKILL");
      }
      // Limpiar socket SHM después de que el proceso termine
      try {
        fs.unlinkSync(CONFIG.capture.socketPath);
        console.log("[camera] Cleaned up SHM socket");
      } catch {}
    }, 1500);

    // Limpiar estado inmediatamente
    this.cleanupReadyWait();
    this.proc = undefined;
    this.isReady = false;
    this.readyResolve = undefined;
    this.sawPlaying = false;
    this.sawSocket = false;
  }

  /**
   * Retorna la ruta del socket SHM
   * Útil para debugging y verificación de estado
   */
  getSocketPath(): string {
    return CONFIG.capture.socketPath;
  }

  // ===== MÉTODOS HELPER PRIVADOS =====

  /**
   * Intenta marcar el hub como ready usando criterio AND
   * READY = sawPlaying AND sawSocket
   */
  private tryMarkReady() {
    if (!this.isReady && this.sawPlaying && this.sawSocket) {
      this.isReady = true;
      this.restartAttempts = 0; // Reset contador de reintentos al lograr READY
      console.log("[camera] Hub ready (shm + playing)");

      // Resolver promesa pendiente de ready()
      this.readyResolve?.();

      // Limpiar mecanismos de detección ya que ya estamos ready
      this.cleanupReadyWait();
    }
  }

  /**
   * Valida la configuración antes de iniciar el pipeline
   * Fail-fast para detectar problemas de configuración
   */
  private validateConfig() {
    const { width, height, fpsHub, shmSizeMB } = CONFIG.capture;

    // Validar que width y height sean pares (I420 lo requiere)
    if (width % 2 !== 0 || height % 2 !== 0) {
      throw new Error(
        `[camera] width and height must be even numbers for I420 (got ${width}x${height})`
      );
    }

    // Validar FPS mínimo
    if (fpsHub < 1) {
      throw new Error(`[camera] fpsHub must be >= 1 (got ${fpsHub})`);
    }

    // Validar tamaño de buffer SHM
    const frameBytes = width * height * 1.5; // I420: 1.5 bytes per pixel
    const minMB = Math.ceil((frameBytes * 50) / (1024 * 1024)); // 50 buffers
    if (shmSizeMB < minMB) {
      console.warn(
        `[camera] shmSizeMB may be too small: need >= ${minMB} MB (configured: ${shmSizeMB} MB)`
      );
      console.warn(
        `[camera] Calculation: ${width}x${height} I420 = ${frameBytes.toFixed(
          0
        )} bytes/frame × 50 buffers = ${minMB} MB`
      );
    }

    console.log(
      `[camera] Config validated: ${width}x${height}@${fpsHub}fps, SHM=${shmSizeMB}MB`
    );
  }

  /**
   * Limpia timeouts e intervalos de detección de ready
   * Previene memory leaks y ejecuciones innecesarias
   */
  private cleanupReadyWait() {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = undefined;
    }
    if (this.socketPoll) {
      clearInterval(this.socketPoll);
      this.socketPoll = undefined;
    }
  }

  /**
   * Reinicia el hub en modo RAW fallback para V4L2
   *
   * Se ejecuta cuando la negociación MJPEG falla.
   * Mata el proceso actual y lo reinicia sin forzar MJPEG,
   * permitiendo que use el formato nativo de la cámara.
   */
  private restartWithRawFallback() {
    console.log("[camera] Initiating RAW fallback restart");

    this.tryRawFallback = true;
    this.restartAttempts = 0;

    // NO limpiar readyResolve - mantener la promesa pendiente
    this.cleanupReadyWait();
    this.isReady = false;
    this.sawPlaying = false;
    this.sawSocket = false;

    // Terminar proceso actual
    const proc = this.proc;
    this.proc = undefined;

    try {
      proc?.kill("SIGINT");
    } catch {}

    // Esperar y reiniciar
    setTimeout(() => {
      this.start();
    }, 500);
  }
}
