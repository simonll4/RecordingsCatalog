import { on } from "../infra/bus.js";
import { CONFIG } from "../infra/config.js";
import { Camera } from "../modules/camera.js";
import { AICapture } from "../modules/capture.js";
import { Publisher } from "../modules/publisher.js";
import { SessionIO } from "../modules/sessionio.js";
import { AIModule } from "../modules/ai.js";

type State = "IDLE" | "DWELL" | "ACTIVE" | "CLOSING";

export class Orchestrator {
  private state: State = "IDLE";
  private silenceTimer?: NodeJS.Timeout;
  private postTimer?: NodeJS.Timeout;
  private dwellTimer?: NodeJS.Timeout;
  private sessionId?: string;
  private dwellKeepaliveCount = 0;
  private onFrame: (frame: Buffer) => void;

  constructor(
    private ai: AIModule,
    private capture: AICapture,
    private camera: Camera,
    private publisher: Publisher,
    private io: SessionIO
  ) {
    // Callback tipado para frames
    this.onFrame = (frame: Buffer): void => {
      // No bloquear el loop; ignoramos el promise
      void this.ai.run(frame, CONFIG.ai.classesFilter);
    };
  }

  async init(): Promise<void> {
    // Inicia el hub de captura (siempre-encendido)
    this.camera.start();

    // Espera a que el hub esté listo (detecta PLAYING)
    console.log("[Orchestrator] Waiting for camera hub to be ready...");
    await this.camera.ready();
    console.log("[Orchestrator] Camera hub is ready");

    // Inicia captura de frames para IA (FPS fijo)
    console.log("[Orchestrator] Starting AI capture from shared memory");
    await this.capture.start();

    on("ai.relevant-start", () => this.armDwellWindow());
    on("ai.keepalive", () => this.onKeepalive());
    on("ai.relevant-stop", () => this.toClosing("explicit"));
    on("ai.detections", (e) => this.io.pushDetections(this.sessionId, e));
    on("stream.stopped", () => {
      if (this.state !== "IDLE") this.toIdle();
    });

    console.log("[Orchestrator] Initialized in IDLE state");
  }

  private armDwellWindow() {
    if (this.state !== "IDLE") {
      console.log(`[Orchestrator] Ignoring ai.relevant-start (state: ${this.state})`);
      return;
    }

    console.log("[Orchestrator] IDLE → DWELL (arming window)");
    this.state = "DWELL";
    this.dwellKeepaliveCount = 0;

    // Ventana de dwellMs: si recibimos keepalives suficientes, pasamos a ACTIVE
    this.dwellTimer = setTimeout(() => {
      if (this.state === "DWELL") {
        if (this.dwellKeepaliveCount > 0) {
          console.log(
            `[Orchestrator] Dwell satisfied (${this.dwellKeepaliveCount} keepalives) → ACTIVE`
          );
          this.toActive();
        } else {
          console.log(
            `[Orchestrator] Dwell failed (no keepalives) → back to IDLE`
          );
          this.state = "IDLE";
        }
      }
      this.dwellTimer = undefined;
    }, CONFIG.fsm.dwellMs);
  }

  private onKeepalive() {
    if (this.state === "DWELL") {
      this.dwellKeepaliveCount++;
    } else if (this.state === "ACTIVE") {
      this.bumpSilence();
    }
  }

  private async toActive() {
    if (this.state === "ACTIVE") return;
    console.log("[Orchestrator] → ACTIVE");
    this.state = "ACTIVE";

    this.sessionId = await this.io.openSession();
    console.log("[Orchestrator] Session opened:", this.sessionId);

    // FPS ya es fijo, no cambiar
    
    // Iniciar stream RTSP solo cuando hay sesión activa
    this.publisher.start();
    this.bumpSilence();
  }

  private bumpSilence() {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(
      () => this.toClosing("silence"),
      CONFIG.fsm.silenceMs
    );
  }

  private toClosing(reason: "explicit" | "silence") {
    if (this.state !== "ACTIVE") return;
    console.log(`[Orchestrator] ACTIVE → CLOSING (${reason})`);
    this.state = "CLOSING";
    clearTimeout(this.silenceTimer);
    clearTimeout(this.postTimer);
    this.postTimer = setTimeout(
      () => this.toIdle(),
      CONFIG.fsm.postRollSec * 1000
    );
  }

  private async toIdle() {
    console.log("[Orchestrator] → IDLE");
    this.state = "IDLE";

    // FPS ya es fijo, no cambiar
    
    // Detener stream RTSP y esperar a que termine
    await this.publisher.stop();
    
    // Esperar un poco más para que el socket TCP se libere completamente
    await new Promise((res) => setTimeout(res, 500));

    await this.io.closeSession(this.sessionId, CONFIG.fsm.postRollSec);
    console.log("[Orchestrator] Session closed:", this.sessionId);
    this.sessionId = undefined;
    clearTimeout(this.silenceTimer);
    clearTimeout(this.postTimer);
    clearTimeout(this.dwellTimer);
    this.dwellKeepaliveCount = 0;
  }
}
