import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { CONFIG } from "../infra/config.js";

type OnFrameFn = (rgbFrame: Buffer) => void;

export class AICapture {
  private proc?: ReturnType<typeof spawn>;
  private onFrame: OnFrameFn;
  private acc: Buffer = Buffer.alloc(0);
  private childId = 0;
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;
  // FPS fijo, sin cambios dinámicos para evitar crashes del hub
  private readonly fps = CONFIG.ai.fps.active;

  constructor(onFrame: OnFrameFn) {
    this.onFrame = onFrame;
  }

  async start(fps?: number): Promise<void> {
    // Ignorar fps param, siempre usar fps fijo
    this.consecutiveFailures = 0;
    await this.launch(this.fps);
    console.log(
      `[ai-capture] Started at ${this.fps}fps (${CONFIG.ai.width}x${CONFIG.ai.height} RGB)`
    );
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    
    console.log("[ai-capture] Stopping gracefully");
    
    // Desconectar handlers ANTES de matar
    this.proc.stdout?.removeAllListeners();
    this.proc.stderr?.removeAllListeners();
    this.proc.removeAllListeners();
    
    try {
      // Intentar shutdown limpio primero
      this.proc.kill("SIGINT");
    } catch {}
    
    // Esperar un poco para que cierre limpiamente
    await new Promise((res) => setTimeout(res, 200));
    
    // Fallback a SIGKILL si todavía está corriendo
    try {
      this.proc?.kill("SIGKILL");
    } catch {}
    
    await new Promise((res) => setTimeout(res, 100));
    
    this.proc = undefined;
    this.acc = Buffer.alloc(0);
  }

  /**
   * NO-OP: FPS es fijo, no se cambia dinámicamente
   */
  setFps(next: number): void {
    // No hacer nada, FPS es constante
    console.log(`[ai-capture] FPS change ignored (fixed at ${this.fps}fps)`);
  }

  // —————————————————— internos ——————————————————

  private async launch(fps: number) {
    const { tcpPort, width, height, fpsHub } = CONFIG.capture;
    const w = CONFIG.ai.width;
    const h = CONFIG.ai.height;
    const frameBytes = w * h * 3; // RGB

    const args = [
      "-v",
      // tcpclientsrc → gdpdepay → convert/scale a RGB WxH → videorate fps → fdsink(1)
      "tcpclientsrc",
      `host=127.0.0.1`,
      `port=${tcpPort}`,
      "!",
      "gdpdepay",
      "!",
      "queue",
      "max-size-buffers=5",
      "!",
      "videoconvert",
      "!",
      "videoscale",
      "!",
      `video/x-raw,format=RGB,width=${w},height=${h}`,
      "!",
      "videorate",
      "!",
      `video/x-raw,format=RGB,framerate=${fps}/1`,
      "!",
      "fdsink",
      "fd=1",
      "sync=true",
    ];

    const child = spawn("gst-launch-1.0", args, {
      env: { ...process.env, GST_DEBUG: process.env.GST_DEBUG ?? "2" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = child;
    const myId = ++this.childId;
    this.acc = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      // Ignorar data si ya no es el child vigente
      if (myId !== this.childId) return;
      
      // Reset failure counter en data exitoso
      this.consecutiveFailures = 0;
      
      this.acc = Buffer.concat([this.acc, chunk]);
      while (this.acc.length >= frameBytes) {
        const frame = this.acc.subarray(0, frameBytes);
        this.acc = this.acc.subarray(frameBytes);
        try {
          this.onFrame(frame); // no bloquear
        } catch (e) {
          console.error("[ai-capture] onFrame error:", e);
        }
      }
    };

    child.stdout.on("data", onData);

    child.stderr.on("data", (d) => {
      const s = d.toString().trim();
      if (/ERROR|WARN|CRITICAL|not negotiated|could not link/i.test(s)) {
        console.error("[ai-capture:gste]", s);
      } else if (s) {
        // reduce spam de timestamps puros
        if (!/^\(.*\)\s*$/.test(s)) console.log("[ai-capture:gste]", s);
      }
    });

    child.on("exit", (code, sig) => {
      console.warn("[ai-capture] exit", code, sig);
      if (myId !== this.childId) return; // viejo
      this.proc = undefined;
      this.acc = Buffer.alloc(0);
      
      // Auto-recover en caso de crash inesperado
      this.consecutiveFailures++;
      
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.error(
          `[ai-capture] Max consecutive failures (${this.maxConsecutiveFailures}) reached, stopping auto-restart`
        );
        return;
      }
      
      const delay = Math.min(250 * this.consecutiveFailures, 2000);
      console.warn(`[ai-capture] Will retry in ${delay}ms (attempt ${this.consecutiveFailures}/${this.maxConsecutiveFailures})`);
      
      setTimeout(() => {
        if (myId === this.childId && !this.proc) {
          console.warn("[ai-capture] Attempting restart after failure");
          this.launch(this.fps).catch((err) =>
            console.error("[ai-capture] Relaunch failed", err)
          );
        }
      }, delay);
    });
  }
}

// import { spawn, ChildProcessWithoutNullStreams } from "child_process";
// import { CONFIG } from "../infra/config.js";

// /**
//  * AICapture - Consumidor del hub para IA
//  *
//  * shmsrc → RGB conversion → videorate (fps idle/active) → fdsink
//  *
//  * Backpressure: lee exactamente frameBytes. Si stdout.read() devuelve null, dropea frame.
//  */
// const frameBytes = CONFIG.ai.width * CONFIG.ai.height * 3;

// export class AICapture {
//   private proc?: ChildProcessWithoutNullStreams;
//   private fps = CONFIG.ai.fps.idle;
//   private onFrameCallback?: (rgbFrame: Buffer) => void;

//   start(fps: number, onFrame: (rgbFrame: Buffer) => void) {
//     this.stop();
//     this.fps = fps;
//     this.onFrameCallback = onFrame;

//     const { socketPath, width, height, fpsHub } = CONFIG.capture;

//     const args = [
//       "shmsrc",
//       `socket-path=${socketPath}`,
//       "do-timestamp=true",
//       "is-live=true",
//       "!",
//       `video/x-raw,format=I420,width=${width},height=${height},framerate=${fpsHub}/1`,
//       "!",
//       "videoconvert",
//       "!",
//       "videoscale",
//       "!",
//       `video/x-raw,format=RGB,width=${CONFIG.ai.width},height=${CONFIG.ai.height}`,
//       "!",
//       "videorate",
//       "!",
//       `video/x-raw,framerate=${fps}/1`,
//       "!",
//       "fdsink",
//       "fd=1",
//       "sync=false",
//     ];

//     this.proc = spawn("gst-launch-1.0", args);

//     // Backpressure: leer exactamente frameBytes, dropear si no disponible
//     this.proc.stdout.on("readable", () => {
//       let chunk: Buffer | null;
//       while ((chunk = this.proc!.stdout.read(frameBytes)) !== null) {
//         if (chunk.length === frameBytes) {
//           this.onFrameCallback?.(chunk);
//         }
//       }
//     });

//     this.proc.stderr.on("data", (d) => {
//       const msg = d.toString().trim();
//       if (
//         !msg.includes("0:00:0") &&
//         !msg.includes("Setting pipeline") &&
//         !msg.includes("Prerolling")
//       ) {
//         console.error("[ai-capture]", msg);
//       }
//     });

//     this.proc.on("exit", (code) => {
//       console.warn("[ai-capture] exit", code);
//       this.proc = undefined;
//     });

//     console.log(
//       `[ai-capture] Started at ${fps}fps (${CONFIG.ai.width}x${CONFIG.ai.height} RGB)`
//     );
//   }

//   stop() {
//     if (!this.proc) return;
//     this.proc.kill("SIGTERM");
//     this.proc = undefined;
//     this.onFrameCallback = undefined;
//   }

//   setFps(fps: number, onFrame: (rgb: Buffer) => void) {
//     if (fps === this.fps) return;
//     console.log(`[ai-capture] Changing FPS: ${this.fps} → ${fps}`);
//     this.start(fps, onFrame);
//   }
// }
