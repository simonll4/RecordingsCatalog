import { spawn, ChildProcessWithoutNullStreams } from "child_process";

import { CONFIG } from "../infra/config.js";
import { emit } from "../infra/bus.js";

/**
 * Publisher - Pipeline de video GStreamer end-to-end con shared memory
 *
 * Flujo del pipeline (nueva arquitectura optimizada):
 * shmsrc → video/x-raw,format=I420 → videoconvert → [encoder adaptativo] → rtspclientsink
 *
 * Funcionalidades principales:
 * - Start: Inicia pipeline GStreamer end-to-end con detección automática de encoder
 * - Stop: Envía SIGINT para permitir un EOS (End of Stream) limpio en MediaMTX
 * - Detección automática del mejor encoder H.264 disponible
 *
 * Encoders soportados (por orden de preferencia):
 * 1. nvh264enc (NVIDIA NVENC) - GPU encoding, mejor rendimiento
 * 2. vaapih264enc (Intel VA-API) - iGPU encoding, buena eficiencia
 * 3. x264enc (software) - CPU encoding, máxima compatibilidad
 *
 * Beneficios de la nueva arquitectura:
 * - Shared memory transport: menor copia de memoria y carga del kernel
 * - GPU encoding automático: mejor rendimiento cuando hay hardware disponible
 * - Pipeline GStreamer nativo: más eficiente y robusto
 */
export class Publisher {
  // Proceso GStreamer para el pipeline completo
  private gstProc?: ChildProcessWithoutNullStreams;

  // Timeout de seguridad para el proceso de parada
  private stopTimeout?: NodeJS.Timeout;

  // Cache para el encoder detectado
  private detectedEncoder?: string;

  // Flag para indicar si ya se intentó fallback a x264enc
  private hasTriedFallback = false;

  /**
   * Detecta el mejor encoder H.264 disponible en el sistema
   *
   * Prioridad:
   * 1. nvh264enc (NVIDIA NVENC) - mejor rendimiento en GPUs NVIDIA
   * 2. vaapih264enc (Intel VA-API) - bueno para Intel iGPU
   * 3. x264enc (software fallback) - compatible con cualquier CPU
   */
  private async detectEncoder(): Promise<{
    element: string;
    extraArgs: string[];
  }> {
    if (this.detectedEncoder) {
      return this.getEncoderConfig(this.detectedEncoder);
    }

    // Probar encoders por orden de preferencia
    const encoders = ["nvh264enc", "vaapih264enc", "x264enc"];

    for (const encoder of encoders) {
      try {
        // Probar si el encoder está disponible creando un pipeline mínimo
        // Ajustamos el test según el encoder (VAAPI requiere NV12 explícito)
        const base = ["--gst-debug=0", "videotestsrc", "num-buffers=1", "!"];
        const testArgs =
          encoder === "vaapih264enc"
            ? [
                ...base,
                "video/x-raw,format=NV12,width=64,height=64",
                "!",
                "vaapih264enc",
                "bitrate=1000",
                "rate-control=cbr",
                "!",
                "fakesink",
              ]
            : [
                ...base,
                "video/x-raw,width=64,height=64",
                "!",
                encoder,
                "!",
                "fakesink",
              ];
        const testProcess = spawn("gst-launch-1.0", testArgs, {
          stdio: "pipe",
        });

        const exitCode = await new Promise<number>((resolve) => {
          testProcess.on("exit", (code) => resolve(code || 0));
          setTimeout(() => {
            testProcess.kill();
            resolve(1);
          }, 2000);
        });

        if (exitCode === 0) {
          console.log(`[publisher] Using H.264 encoder: ${encoder}`);
          this.detectedEncoder = encoder;
          return this.getEncoderConfig(encoder);
        }
      } catch (error) {
        // Continuar con el siguiente encoder
      }
    }

    // Fallback a x264enc si todo falla
    console.log("[publisher] Using fallback H.264 encoder: x264enc");
    this.detectedEncoder = "x264enc";
    return this.getEncoderConfig("x264enc");
  }

  /**
   * Retorna la configuración específica para cada encoder
   */
  private getEncoderConfig(encoder: string): {
    element: string;
    extraArgs: string[];
  } {
    const gop = Math.round(CONFIG.capture.fpsHub * 2); // GOP de 2 segundos

    switch (encoder) {
      case "nvh264enc":
        return {
          element: "nvh264enc",
          extraArgs: [
            "nvh264enc", // Encoder NVENC
            "preset=llhp", // Low Latency High Performance
            "rc-mode=cbr", // Constant bitrate
            "bitrate=2000", // 2 Mbps
            `iframeinterval=${gop}`, // GOP size
            "zerolatency=true", // Zero latency mode
            "!",
            "h264parse", // Parser para compatibilidad RTSP
            "config-interval=1", // Enviar SPS/PPS periódicamente
            "!",
            "video/x-h264,stream-format=byte-stream,alignment=au", // Caps para RTSP
            // NOTA: NO incluir rtph264pay, rtspclientsink lo hace automáticamente
          ],
        };
      case "vaapih264enc":
        return {
          element: "vaapih264enc",
          extraArgs: [
            // CRÍTICO: VAAPI requiere NV12, agregar conversión antes del encoder
            "videoconvert", // Convertir I420 → NV12
            "!",
            "video/x-raw,format=NV12", // Fijar formato NV12 para VAAPI
            "!",
            "vaapih264enc", // Encoder VAAPI
            "rate-control=cbr", // Constant bitrate
            "bitrate=2000", // 2 Mbps en kbps
            `keyframe-period=${gop}`, // Keyframe period
            "!",
            "h264parse", // Parser para compatibilidad RTSP
            "config-interval=1", // SPS/PPS periódicos
            "!",
            "video/x-h264,stream-format=byte-stream,alignment=au", // Caps obligatorias para RTSP
            // NOTA: NO incluir rtph264pay, rtspclientsink lo hace automáticamente
          ],
        };
      case "x264enc":
      default:
        return {
          element: "x264enc",
          extraArgs: [
            "x264enc", // Encoder software x264
            "tune=zerolatency", // Optimización para latencia mínima
            "speed-preset=veryfast", // Preset de velocidad
            "bitrate=2000", // Bitrate de video: 2 Mbps
            `key-int-max=${gop}`, // Keyframe cada GOP frames
            "bframes=0", // Sin B-frames para menor latencia
            "!",
            "h264parse", // Parser para compatibilidad RTSP
            "config-interval=1", // SPS/PPS periódicos
            "!",
            "video/x-h264,stream-format=byte-stream,alignment=au", // Caps esperadas por RTSP
            // NOTA: NO incluir rtph264pay, rtspclientsink lo hace automáticamente
          ],
        };
    }
  }

  /**
   * Inicia el pipeline de streaming GStreamer end-to-end
   *
   * Pipeline adaptativo:
   * shmsrc → video/x-raw,format=I420 → videoconvert → [encoder] → rtspclientsink
   *
   * Encoders soportados (por prioridad):
   * - nvh264enc (NVIDIA NVENC)
   * - vaapih264enc (Intel VA-API)
   * - x264enc (software fallback)
   */
  async start() {
    // Verificar si ya está ejecutándose
    if (this.gstProc) {
      console.log("[publisher] Already running");
      return;
    }

    // Resetear flag de fallback al iniciar manualmente
    // (permite reintentar VAAPI en futuras sesiones)
    if (!this.gstProc) {
      this.hasTriedFallback = false;
    }

    // Detectar el mejor encoder disponible
    const { element: encoder, extraArgs: encoderArgs } =
      await this.detectEncoder();

    // Obtener configuración y construir URL RTSP de destino
    const { socketPath, width, height, fpsHub } = CONFIG.capture;
    const rtspUrl = `rtsp://${CONFIG.mediamtx.host}:${CONFIG.mediamtx.port}/${CONFIG.mediamtx.path}`;

    // Pipeline GStreamer end-to-end optimizado para baja latencia
    const args = [
      "-v", // Verbose output
      "shmsrc", // Shared memory source
      `socket-path=${socketPath}`, // Path al socket de shared memory
      "is-live=true", // Marcar como fuente en vivo
      "do-timestamp=true", // Generar timestamps
      "!",
      // CRÍTICO: Fijar caps completas con capsfilter (no como propiedad del elemento)
      `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
      "!",
      "queue", // Buffer de cola con leak downstream para mejor latencia
      "leaky=downstream", // Descartar frames viejos si hay atraso
      "max-size-buffers=1", // Cota 1 para mínima latencia
      "max-size-time=0", // Sin límite de tiempo
      "max-size-bytes=0", // Sin límite de bytes
      "!",
      // Encoder y sus argumentos (incluye h264parse, rtspclientsink hace el RTP payload automático)
      ...encoderArgs, // videoconvert ! NV12 ! vaapih264enc ! h264parse (sin rtph264pay)
      "!",
      "rtspclientsink", // Cliente RTSP para streaming (hace RTP payload automáticamente)
      `location=${rtspUrl}`, // URL de destino RTSP
      "protocols=tcp", // Usar TCP para mayor confiabilidad
      "latency=0", // Latencia mínima
    ];

    console.log(
      `[publisher] Starting GStreamer end-to-end: shm → ${encoder} → RTSP → ${rtspUrl}`
    );

    // Crear proceso GStreamer con logging mejorado para diagnosticar problemas de RTSP
    this.gstProc = spawn("gst-launch-1.0", args, {
      env: {
        ...process.env,
        // Elevar debug de rtspclientsink para ver qué está fallando exactamente
        GST_DEBUG:
          process.env.GST_DEBUG ?? "rtspclientsink:5,rtspconnection:4,2",
      },
    });

    // Manejo de logs del proceso GStreamer
    // Filtra mensajes de progreso y solo muestra eventos importantes
    this.gstProc.stderr.on("data", (d: Buffer) => {
      const msg = d.toString().trim();
      // Filtrar mensajes de tiempo (0:00:0x) para evitar spam
      if (msg && !msg.includes("0:00:0")) {
        // Mostrar errores y warnings (especialmente de VAAPI y RTSP)
        if (
          /ERROR|WARN|error|warning|failed.*VA|not-negotiated|could not link/i.test(
            msg
          )
        ) {
          console.error("[publisher:gst]", msg);

          // Detectar errores específicos de VAAPI para mejor diagnóstico
          if (
            /failed.*create.*VA.*context|VA.*driver.*failed|VAAPI.*not available/i.test(
              msg
            )
          ) {
            console.error(
              "[publisher] VAAPI error detected - driver/permissions issue"
            );
          }

          // Detectar errores RTSP (conexión, autenticación, path)
          if (
            /rtsp.*connection.*failed|401.*Unauthorized|404.*Not Found|RECORD.*failed/i.test(
              msg
            )
          ) {
            console.error(
              "[publisher] RTSP connection/auth error - check MediaMTX config and URL"
            );
          }
        }
        // Mostrar eventos de estado importantes del pipeline
        else if (
          msg.includes("Setting pipeline") ||
          msg.includes("PLAYING") ||
          msg.includes("connected") ||
          msg.includes("Prerolled") ||
          msg.includes("negotiated") ||
          msg.includes("RECORD") || // RTSP RECORD command
          msg.includes("SETUP") || // RTSP SETUP
          msg.includes("ANNOUNCE") // RTSP ANNOUNCE
        ) {
          console.log("[publisher:gst]", msg);
        }
      }
    });

    // Evento cuando GStreamer se inicia correctamente
    // Emite evento de stream iniciado al bus de eventos
    this.gstProc.on("spawn", () => {
      console.log(`[publisher] GStreamer pipeline started → ${rtspUrl}`);
      emit({ type: "stream.started", ts: new Date().toISOString() });
    });

    // Evento cuando GStreamer termina (normal o por error)
    // Emite evento de stream detenido con la razón de terminación
    this.gstProc.on("exit", (code: number | null, signal: string | null) => {
      console.log(
        `[publisher] GStreamer stopped (code: ${code}, signal: ${signal})`
      );

      // Auto-fallback: Si falla con VAAPI/NVENC y no es parada manual, reintentar con x264enc
      // IMPORTANTE: Solo intentar fallback UNA VEZ. Si x264enc también falla, es un problema
      // de conectividad RTSP (MediaMTX caído, auth, firewall), no del encoder.
      if (
        code !== 0 &&
        code !== null &&
        !this.hasTriedFallback &&
        encoder !== "x264enc"
      ) {
        console.warn(
          `[publisher] ${encoder} failed with code ${code}, falling back to x264enc`
        );
        this.hasTriedFallback = true;
        this.detectedEncoder = "x264enc"; // Forzar x264enc para el próximo intento

        // IMPORTANTE: limpiar la referencia del proceso terminado para habilitar el reintento
        // Sin esto, la condición `if (!this.gstProc)` impedía relanzar el pipeline
        this.gstProc = undefined;

        // Dar un momento antes de reintentar
        setTimeout(() => {
          if (!this.gstProc) {
            // Solo si no hay otro proceso ya ejecutándose
            console.log("[publisher] Retrying with software encoder...");
            this.start().catch((err) =>
              console.error("[publisher] Fallback start failed:", err)
            );
          }
        }, 500);

        // No emitir evento de stopped aún, esperar al reintento
        return;
      }

      // Si x264enc también falla, es un problema de RTSP sink (no de encoder)
      if (code !== 0 && code !== null && encoder === "x264enc") {
        console.error(
          "[publisher] ❌ Software encoder (x264enc) also failed with code",
          code
        );
        console.error(
          "[publisher] 🔍 This indicates an RTSP sink problem, not an encoding issue."
        );
        console.error("[publisher] 💡 Possible causes:");
        console.error(
          "   - MediaMTX not running or not listening on",
          `${CONFIG.mediamtx.host}:${CONFIG.mediamtx.port}`
        );
        console.error(
          "   - Path '${CONFIG.mediamtx.path}' not allowed for publishing in MediaMTX config"
        );
        console.error(
          "   - Authentication required (add credentials to RTSP URL)"
        );
        console.error("   - Firewall blocking port", CONFIG.mediamtx.port);
      }

      // NOTA: No llamar cleanup aquí, lo maneja stop() explícitamente
      // para evitar condiciones de carrera
      emit({
        type: "stream.stopped",
        ts: new Date().toISOString(),
        reason: signal ? `signal:${signal}` : `exit:${code}`,
      });
    });
  }

  /**
   * Detiene el pipeline de streaming de forma ordenada
   *
   * Proceso:
   * 1. Envía SIGINT al proceso GStreamer para permitir EOS (End of Stream) limpio
   * 2. Espera a que termine con timeout de seguridad
   * 3. Limpia referencias de procesos
   */
  async stop() {
    // Si no hay proceso ejecutándose, no hacer nada
    if (!this.gstProc) return;

    console.log("[publisher] Stopping GStreamer pipeline (SIGINT for EOS)");

    // Crear promesa para esperar que GStreamer termine
    // Incluye timeout de seguridad para evitar cuelgues indefinidos
    const gstExit = new Promise<void>((resolve) => {
      const proc = this.gstProc!;
      const onExit = () => {
        proc.removeListener("exit", onExit);
        resolve();
      };
      proc.once("exit", onExit);

      // Timeout de seguridad: 2 segundos máximo de espera
      setTimeout(() => {
        proc.removeListener("exit", onExit);
        resolve();
      }, 2000);
    });

    // Enviar SIGINT a GStreamer para permitir EOS (End of Stream) limpio
    // SIGINT es preferible a SIGKILL porque permite que el proceso termine ordenadamente
    try {
      this.gstProc.kill("SIGINT");
    } catch (e) {
      console.warn("[publisher] Error killing GStreamer (SIGINT):", e);
    }

    // Esperar a que el proceso termine antes de continuar
    // Esto garantiza una parada ordenada del pipeline completo
    await gstExit;

    console.log("[publisher] Process exited, cleaning up");

    // Limpiar referencias y timeouts
    this.cleanup();
    console.log("[publisher] Pipeline stopped and cleaned");
  }

  /**
   * Limpia las referencias de procesos y timeouts
   *
   * Se ejecuta después de que el proceso haya terminado
   * para evitar memory leaks y permitir reinicios limpios
   */
  private cleanup() {
    // Limpiar timeout de seguridad si existe
    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = undefined;
    }

    // Limpiar referencia al proceso
    // Esto permite al garbage collector liberar memoria
    this.gstProc = undefined;

    // Mantener cache del encoder detectado para próximos starts
    // (no limpiar this.detectedEncoder para evitar re-detección innecesaria)
  }
}
