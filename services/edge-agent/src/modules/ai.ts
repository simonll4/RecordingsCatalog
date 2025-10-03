import { emit } from "../infra/bus.js";

type OnnxSetup = { modelName: string; umbral: number; height: number; width: number; classNames: string[] };

export class AIModule {
  private setup!: OnnxSetup;
  private lastActive = 0;
  private sessionCount = 0;
  private maxSessions = 2;
  private sessionStartTime = 0;
  private sessionDuration = 20000; // 20 segundos por sesión
  private inSession = false;
  private finished = false;
  private waiting = false;
  private waitUntil = 0;

  setOnnxModel(modelName: string, umbral: number, height: number, width: number, classNames: string[]) {
    this.setup = { modelName, umbral, height, width, classNames };
    console.log("[AI] Model configured:", this.setup);
    console.log(`[AI] Simulation mode: ${this.maxSessions} sessions of ${this.sessionDuration/1000}s each`);
  }

  // frame: RGB width*height*3; classesFilter: nombres a considerar para relevancia
  async run(frame: Buffer, classesFilter: string[]): Promise<void> {
    // Si ya terminamos las 2 sesiones, no hacer nada
    if (this.finished) {
      return;
    }

    const now = Date.now();

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
    if (!this.inSession && !this.waiting && this.sessionCount < this.maxSessions) {
      // Iniciar nueva sesión
      this.inSession = true;
      this.sessionCount++;
      this.sessionStartTime = now;
      this.lastActive = now;
      
      console.log(`[AI] Starting session ${this.sessionCount}/${this.maxSessions}`);
      emit({ type: "ai.relevant-start", ts: new Date().toISOString() });
    }

    // Si estamos en sesión
    if (this.inSession) {
      const elapsed = now - this.sessionStartTime;
      
      if (elapsed < this.sessionDuration) {
        // Continuar enviando detecciones
        emit({ type: "ai.keepalive", ts: new Date().toISOString() });
        this.lastActive = now;

        // Detección ejemplo (simular persona detectada)
        const items = [{ 
          cls: classesFilter[0] || "person", 
          conf: 0.7 + Math.random() * 0.25, // confianza entre 0.7 y 0.95
          bbox: [
            0.2 + Math.random() * 0.3, 
            0.2 + Math.random() * 0.3, 
            0.3, 
            0.4
          ] as [number, number, number, number]
        }];
        emit({ type: "ai.detections", ts: new Date().toISOString(), items });
      } else {
        // Terminar esta sesión
        console.log(`[AI] Session ${this.sessionCount}/${this.maxSessions} completed (${elapsed}ms)`);
        this.inSession = false;
        
        // Emitir evento explícito de parada
        emit({ type: "ai.relevant-stop", ts: new Date().toISOString() });
        
        // Si ya completamos todas las sesiones
        if (this.sessionCount >= this.maxSessions) {
          // NO marcar finished aquí, el FSM necesita frames durante post-roll
          console.log(`[AI] All sessions completed, will mark finished after post-roll`);
          // Dar tiempo para que el FSM complete el ciclo CLOSING→IDLE (post-roll)
          setTimeout(() => {
            this.finished = true;
            console.log(`[AI] Simulation finished: ${this.sessionCount} sessions completed`);
          }, 10000); // 10s para post-roll + limpieza
        } else {
          // Configurar espera antes de la próxima sesión
          const waitTime = 15000;
          this.waiting = true;
          this.waitUntil = now + waitTime;
          console.log(`[AI] Waiting ${waitTime/1000}s before next session (for FSM to complete cycle)...`);
        }
      }
    }
  }
}
