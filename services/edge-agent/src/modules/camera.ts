import fs from "node:fs";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { CONFIG } from "../infra/config.js";

/**
 * Camera - Hub de captura siempre-encendido con shared memory
 *
 * Emite I420 WxH@fpsHub → socketPath configurado
 */
export class Camera {
  private proc?: ChildProcessWithoutNullStreams;
  private readyResolve?: () => void;
  private isReady = false;
  private readyTimeout?: NodeJS.Timeout;
  private socketPoll?: NodeJS.Timeout;
  private tryRawFallback = false; // para v4l2: si MJPEG no sirve, cae a RAW
  private stoppedManually = false; // Para evitar auto-restart en stop explícito

  ready(): Promise<void> {
    if (this.isReady) return Promise.resolve();
    return new Promise((resolve) => (this.readyResolve = resolve));
  }

  start() {
    if (this.proc) {
      console.log("[camera] Already running");
      return;
    }

    const { tcpPort, width, height, fpsHub } = CONFIG.capture;

    // Limpia socket previo si quedó (aunque ya no usamos shmsink)
    try {
      fs.unlinkSync(CONFIG.capture.socketPath);
    } catch {}

    let args: string[];

    if (CONFIG.source.kind === "rtsp") {
      const rtspUrl = CONFIG.source.rtspUrl;
      args = [
        "-v",
        "rtspsrc",
        `location=${rtspUrl}`,
        "protocols=tcp",
        "latency=100",
        "!",
        "rtpjitterbuffer",
        "!",
        "rtph264depay",
        "!",
        "h264parse",
        "!",
        "avdec_h264",
        "!",
        "videoconvert",
        "!",
        "videoscale",
        "!",
        "videorate",
        "!",
        `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
        "!",
        "queue",
        "max-size-buffers=0",
        "max-size-time=0",
        "max-size-bytes=0",
        "!",
        "gdppay",
        "!",
        "tcpserversink",
        `host=127.0.0.1`,
        `port=${tcpPort}`,
        "sync=false",
        "recover-policy=latest",
        "resend-streamheader=true",
      ];
      console.log(`[camera] Starting RTSP hub: ${rtspUrl} → tcp:${tcpPort} (GDP)`);
    } else {
      const device = CONFIG.source.device;

      // v4l2: 1) intento MJPEG (rápido si la cam lo soporta), 2) fallback RAW (YUY2 → convert)
      const v4l2Head = ["-v", "v4l2src", `device=${device}`];
      const v4l2Tail = [
        "!",
        "videoconvert",
        "!",
        "videoscale",
        "!",
        "videorate",
        "!",
        `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
        "!",
        "queue",
        "max-size-buffers=0",
        "max-size-time=0",
        "max-size-bytes=0",
        "!",
        "gdppay",
        "!",
        "tcpserversink",
        `host=127.0.0.1`,
        `port=${tcpPort}`,
        "sync=false",
        "recover-policy=latest",
        "resend-streamheader=true",
      ];

      if (!this.tryRawFallback) {
        // Intento MJPEG
        args = [...v4l2Head, "!", "image/jpeg", "!", "jpegdec", ...v4l2Tail];
        console.log(
          `[camera] Starting V4L2 hub (MJPEG): ${device} → tcp:${tcpPort} (GDP)`
        );
      } else {
        // Fallback RAW (sin forzar image/jpeg)
        args = [...v4l2Head, ...v4l2Tail];
        console.log(
          `[camera] Starting V4L2 hub (RAW fallback): ${device} → tcp:${tcpPort} (GDP)`
        );
      }
    }

    this.proc = spawn("gst-launch-1.0", args, {
      env: { ...process.env, GST_DEBUG: process.env.GST_DEBUG ?? "2" },
    });

    const handleData = (buf: Buffer, src: "stdout" | "stderr") => {
      const msg = buf.toString();
      if (!msg) return;

      // log comprimido
      for (const line of msg.split(/\r?\n/)) {
        const l = line.trim();
        if (!l) continue;
        const tag = src === "stderr" ? "gste" : "gsto";
        // siempre mostramos algo de info; los errores en rojo
        if (/ERROR|WARN|ERROR:|CRITICAL/i.test(l))
          console.error(`[camera:${tag}]`, l);
        else if (!/^\(.*\)\s*$/i.test(l)) console.log(`[camera:${tag}]`, l); // evita spam de timestamps

        // Heurísticas de READY
        if (
          !this.isReady &&
          (l.includes("Setting pipeline to PLAYING") ||
            l.includes("FROM PAUSED to PLAYING") ||
            l.includes("from PAUSED to PLAYING") ||
            l.includes("Pipeline is PREROLLING") ||
            l.includes("Prerolling") ||
            l.includes("Prerolled"))
        ) {
          this.markReady("log");
        }

        // Si detectamos problemas típicos de caps con MJPEG, relanzamos en modo RAW
        if (
          !this.isReady &&
          CONFIG.source.kind === "v4l2" &&
          !this.tryRawFallback
        ) {
          if (
            /not negotiated|could not link|No supported formats|not accept/i.test(
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

    this.proc.stdout.on("data", (d) => handleData(d, "stdout"));
    this.proc.stderr.on("data", (d) => handleData(d, "stderr"));

    this.proc.on("spawn", () => {
      console.log(
        `[camera] Hub spawned: ${CONFIG.source.kind} → tcp:${CONFIG.capture.tcpPort}`
      );
      // Poll de existencia del socket como otra señal de READY
      this.socketPoll = setInterval(() => {
        try {
          if (!this.isReady && fs.existsSync(CONFIG.capture.socketPath)) {
            this.markReady("socket");
          }
        } catch {}
      }, 100);

      // Timeout de fallback (no cuelga el orquestador)
      this.readyTimeout = setTimeout(() => {
        if (!this.isReady) {
          console.warn(
            "[camera] ready() fallback by timeout; proceeding anyway"
          );
          this.markReady("timeout");
        }
      }, 2500);
    });

    this.proc.on("exit", (code, signal) => {
      const msg = `[camera] Hub stopped (code: ${code}, signal: ${signal})`;
      
      if (this.stoppedManually) {
        console.log(msg + " - manual stop");
        this.stoppedManually = false;
        return;
      }
      
      // SIGABRT generalmente ocurre cuando shmsink pierde sus consumers
      // En lugar de crashear, reiniciamos el hub
      if (signal === "SIGABRT") {
        console.warn(msg + " - likely lost all consumers, restarting in 2s");
      } else {
        console.warn(msg + " - restarting in 2s");
      }
      
      this.cleanupReadyWait();
      this.proc = undefined;
      this.isReady = false;
      this.readyResolve = undefined;
      
      setTimeout(() => {
        if (!this.stoppedManually) {
          this.start();
        }
      }, 2000);
    });
  }

  stop() {
    if (!this.proc) return;
    console.log("[camera] Stopping hub");
    this.stoppedManually = true;
    
    // Enviar SIGINT primero para shutdown limpio
    this.proc.kill("SIGINT");
    
    // Fallback a SIGKILL si no responde
    setTimeout(() => {
      if (this.proc) {
        this.proc.kill("SIGKILL");
      }
    }, 1500);
    
    this.cleanupReadyWait();
    this.proc = undefined;
    this.isReady = false;
    this.readyResolve = undefined;
  }

  getSocketPath(): string {
    return CONFIG.capture.socketPath;
  }

  // ————— helpers —————
  private markReady(reason: "log" | "socket" | "timeout") {
    if (this.isReady) return;
    this.isReady = true;
    console.log(`[camera] Hub ready (${reason})`);
    this.readyResolve?.();
    this.cleanupReadyWait();
  }

  private cleanupReadyWait() {
    if (this.readyTimeout) clearTimeout(this.readyTimeout);
    if (this.socketPoll) clearInterval(this.socketPoll);
    this.readyTimeout = undefined;
    this.socketPoll = undefined;
  }

  private restartWithRawFallback() {
    // matar proceso actual y relanzar sin "image/jpeg ! jpegdec"
    try {
      this.proc?.kill("SIGINT");
    } catch {}
    setTimeout(() => {
      this.tryRawFallback = true;
      this.start();
    }, 300);
  }
}

// import { spawn, ChildProcessWithoutNullStreams } from "child_process";

// import { CONFIG } from "../infra/config.js";

// /**
//  * Camera - Hub de captura siempre-encendido con shared memory
//  *
//  * Pipeline único que captura desde v4l2 o RTSP y distribuye vía shmsink.
//  * Otros módulos (IA, Publisher) se conectan con shmsrc independientemente.
//  *
//  * Emite I420 1280x720@15fps → socketPath configurado
//  */
// export class Camera {
//   private proc?: ChildProcessWithoutNullStreams;
//   private readyResolve?: () => void;
//   private isReady = false;

//   /**
//    * Promesa que resuelve cuando el pipeline alcanza PLAYING
//    */
//   ready(): Promise<void> {
//     if (this.isReady) return Promise.resolve();
//     return new Promise((resolve) => {
//       this.readyResolve = resolve;
//     });
//   }

//   start() {
//     if (this.proc) {
//       console.log("[camera] Already running");
//       return;
//     }

//     const { socketPath, width, height, fpsHub, shmSizeMB } = CONFIG.capture;
//     const shmSize = shmSizeMB * 1024 * 1024;

//     let args: string[];

//     if (CONFIG.source.kind === "rtsp") {
//       // Pipeline RTSP: rtspsrc → depay → decode → convert → shmsink
//       const rtspUrl = CONFIG.source.rtspUrl;
//       args = [
//         "-v",
//         "rtspsrc",
//         `location=${rtspUrl}`,
//         "protocols=tcp",
//         "latency=100",
//         "!",
//         "rtpjitterbuffer",
//         "!",
//         "rtph264depay",
//         "!",
//         "h264parse",
//         "!",
//         "avdec_h264",
//         "!",
//         "videoconvert",
//         "!",
//         "videoscale",
//         "!",
//         "videorate",
//         "!",
//         `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
//         "!",
//         "queue",
//         "max-size-buffers=0",
//         "max-size-time=0",
//         "max-size-bytes=0",
//         "!",
//         "shmsink",
//         `socket-path=${socketPath}`,
//         `shm-size=${shmSize}`,
//         "wait-for-connection=false",
//         "sync=true",
//       ];
//       console.log(`[camera] Starting RTSP hub: ${rtspUrl} → ${socketPath}`);
//     } else {
//       // Pipeline V4L2: v4l2src → jpegdec → convert → shmsink
//       const device = CONFIG.source.device;
//       args = [
//         "-v",
//         "v4l2src",
//         `device=${device}`,
//         "!",
//         "image/jpeg",
//         "!",
//         "jpegdec",
//         "!",
//         "videoconvert",
//         "!",
//         "videoscale",
//         "!",
//         "videorate",
//         "!",
//         `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
//         "!",
//         "queue",
//         "max-size-buffers=0",
//         "max-size-time=0",
//         "max-size-bytes=0",
//         "!",
//         "shmsink",
//         `socket-path=${socketPath}`,
//         `shm-size=${shmSize}`,
//         "wait-for-connection=false",
//         "sync=true",
//       ];
//       console.log(`[camera] Starting V4L2 hub: ${device} → ${socketPath}`);
//     }

//     this.proc = spawn("gst-launch-1.0", args);

//     this.proc.stderr.on("data", (d) => {
//       const msg = d.toString().trim();

//       // Detectar PLAYING para resolver ready()
//       if (msg.includes("Setting pipeline to PLAYING")) {
//         if (!this.isReady) {
//           this.isReady = true;
//           console.log("[camera] Hub ready and playing");
//           this.readyResolve?.();
//         }
//       } else if (
//         !msg.includes("0:00:0") &&
//         !msg.includes("Setting pipeline") &&
//         !msg.includes("Prerolling") &&
//         !msg.includes("Redistribute")
//       ) {
//         console.error("[camera]", msg);
//       }
//     });

//     this.proc.on("spawn", () => {
//       console.log(
//         `[camera] Hub spawned: ${CONFIG.source.kind} → ${socketPath}`
//       );
//     });

//     this.proc.on("exit", (code, signal) => {
//       console.warn(
//         `[camera] Hub stopped (code: ${code}, signal: ${signal}) - restarting in 2s`
//       );
//       this.proc = undefined;
//       this.isReady = false;
//       this.readyResolve = undefined;
//       // Auto-restart en producción (el hub debe estar siempre disponible)
//       setTimeout(() => this.start(), 2000);
//     });
//   }

//   stop() {
//     if (!this.proc) return;
//     console.log("[camera] Stopping hub");
//     this.proc.kill("SIGTERM");
//     this.proc = undefined;
//     this.isReady = false;
//     this.readyResolve = undefined;
//   }

//   getSocketPath(): string {
//     return CONFIG.capture.socketPath;
//   }
// }
