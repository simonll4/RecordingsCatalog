import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { CONFIG } from "../infra/config.js";
import { emit } from "../infra/bus.js";

/**
 * Publisher - Pipeline on-demand por sesión desde shared memory
 *
 * shmsrc → fdsink (I420 1280x720@15) | FFmpeg → x264 → RTSP
 *
 * Start: al entrar en ACTIVE
 * Stop: SIGINT + timeout → EOS limpio en MediaMTX
 */
export class Publisher {
  private ffmpegProc?: ChildProcessWithoutNullStreams;
  private shmProc?: ChildProcessWithoutNullStreams;
  private stopTimeout?: NodeJS.Timeout;

  start() {
    if (this.ffmpegProc || this.shmProc) {
      console.log("[publisher] Already running");
      return;
    }

    const { tcpPort, width, height, fpsHub } = CONFIG.capture;
    const rtspUrl = `rtsp://${CONFIG.mediamtx.host}:${CONFIG.mediamtx.port}/${CONFIG.mediamtx.path}`;

    // GStreamer: tcpclientsrc → gdpdepay → fdsink (I420 raw para FFmpeg)
    const shmArgs = [
      "-v",
      "tcpclientsrc",
      `host=127.0.0.1`,
      `port=${tcpPort}`,
      "!",
      "gdpdepay",
      "!",
      "queue",
      "max-size-buffers=30",
      "!",
      "fdsink",
      "fd=1",
      "sync=false",
    ];

    // FFmpeg: rawvideo I420 → x264 → RTSP
    const ffmpegArgs = [
      "-f",
      "rawvideo",
      "-pix_fmt",
      "yuv420p",
      "-s",
      `${width}x${height}`,
      "-r",
      `${fpsHub}`,
      "-i",
      "pipe:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "zerolatency",
      "-g",
      "30",
      "-b:v",
      "2000k",
      "-f",
      "rtsp",
      "-rtsp_transport",
      "tcp",
      rtspUrl,
    ];

    console.log(`[publisher] Starting pipeline: tcp → FFmpeg → ${rtspUrl}`);

    this.shmProc = spawn("gst-launch-1.0", shmArgs);
    this.ffmpegProc = spawn("ffmpeg", ffmpegArgs);

    // Pipe shmsrc stdout → ffmpeg stdin
    if (this.shmProc.stdout && this.ffmpegProc.stdin) {
      this.shmProc.stdout.pipe(this.ffmpegProc.stdin);
    }

    this.shmProc.stderr.on("data", (d) => {
      const msg = d.toString().trim();
      // Mostrar todos los mensajes importantes, incluyendo errores de conexión
      if (msg && !msg.includes("0:00:0")) {
        if (/ERROR|WARN|error|warning/i.test(msg)) {
          console.error("[publisher:gst]", msg);
        } else if (
          msg.includes("Setting pipeline") ||
          msg.includes("PLAYING") ||
          msg.includes("connected") ||
          msg.includes("Prerolled")
        ) {
          console.log("[publisher:gst]", msg);
        }
      }
    });

    this.ffmpegProc.stderr.on("data", (d) => {
      const msg = d.toString().trim();
      if (
        !msg.includes("frame=") &&
        !msg.includes("fps=") &&
        !msg.includes("bitrate=")
      ) {
        console.error("[publisher:ffmpeg]", msg);
      }
    });

    this.ffmpegProc.on("spawn", () => {
      console.log(`[publisher] Pipeline started → ${rtspUrl}`);
      emit({ type: "stream.started", ts: new Date().toISOString() });
    });

    this.ffmpegProc.on("exit", (code, signal) => {
      console.log(
        `[publisher] FFmpeg stopped (code: ${code}, signal: ${signal})`
      );
      // No llamar cleanup aquí, lo hace stop() explícitamente
      emit({
        type: "stream.stopped",
        ts: new Date().toISOString(),
        reason: signal ? `signal:${signal}` : `exit:${code}`,
      });
    });

    this.shmProc.on("exit", (code, signal) => {
      console.log(`[publisher] tcpclientsrc stopped (code: ${code}, signal: ${signal})`);
      // No llamar cleanup aquí
    });
  }

  async stop() {
    if (!this.ffmpegProc && !this.shmProc) return;

    console.log("[publisher] Stopping pipeline (SIGINT for EOS)");
    
    // Crear promesas para esperar que los procesos terminen
    const ffmpegExit = this.ffmpegProc 
      ? new Promise<void>((resolve) => {
          const proc = this.ffmpegProc!;
          const onExit = () => {
            proc.removeListener('exit', onExit);
            resolve();
          };
          proc.once('exit', onExit);
          
          // Timeout de seguridad
          setTimeout(() => {
            proc.removeListener('exit', onExit);
            resolve();
          }, 2000);
        })
      : Promise.resolve();
    
    const gstExit = this.shmProc
      ? new Promise<void>((resolve) => {
          const proc = this.shmProc!;
          const onExit = () => {
            proc.removeListener('exit', onExit);
            resolve();
          };
          proc.once('exit', onExit);
          
          // Timeout de seguridad
          setTimeout(() => {
            proc.removeListener('exit', onExit);
            resolve();
          }, 2000);
        })
      : Promise.resolve();
    
    // SIGINT para FFmpeg (permite EOS limpio)
    try {
      this.ffmpegProc?.kill("SIGINT");
    } catch (e) {
      console.warn("[publisher] Error killing FFmpeg (SIGINT):", e);
    }
    
    try {
      this.shmProc?.kill("SIGINT");
    } catch (e) {
      console.warn("[publisher] Error killing GStreamer (SIGINT):", e);
    }

    // Esperar a que ambos procesos terminen
    await Promise.all([ffmpegExit, gstExit]);
    
    console.log("[publisher] Processes exited, cleaning up");

    this.cleanup();
    console.log("[publisher] Pipeline stopped and cleaned");
  }

  private cleanup() {
    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = undefined;
    }
    this.ffmpegProc = undefined;
    this.shmProc = undefined;
  }
}
