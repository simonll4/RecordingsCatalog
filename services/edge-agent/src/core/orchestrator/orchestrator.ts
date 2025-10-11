/**
 * Orchestrator - Coordinador Central del Sistema (FSM)
 *
 * El Orchestrator es el "cerebro" del Edge Agent. Implementa una FSM
 * (Finite State Machine) pura que coordina todos los módulos basándose
 * en eventos.
 *
 * Responsabilidades:
 *
 * 1. Escuchar eventos del bus (ai.detection, ai.keepalive, timers, etc.)
 * 2. Ejecutar FSM pura (función reduce) que retorna:
 *    - Nuevo contexto (state + sessionId + otros datos)
 *    - Comandos a ejecutar (side effects)
 * 3. Traducir comandos a llamadas de módulos (adapters)
 * 4. Gestionar timers (dwell/silence/postroll)
 *
 * Estados de la FSM:
 *
 * - IDLE: Esperando detecciones (AI @ fps idle, sin stream, sin sesión)
 * - DWELL: Ventana de confirmación FIJA (CONFIG.fsm.dwellMs, evita falsos positivos)
 * - ACTIVE: Grabando (AI @ fps active, stream ON, sesión abierta)
 * - CLOSING: Post-roll (CONFIG.fsm.postRollMs, grabación extra tras última detección)
 *
 * Flujo típico:
 *
 * ```
 * IDLE → (ai.detection relevante) → DWELL
 *      → (dwell timer OK) → ACTIVE
 *      → (silence timer OK) → CLOSING
 *      → (postroll timer OK) → IDLE
 *
 * Re-activación durante post-roll:
 * CLOSING → (ai.detection relevante) → ACTIVE (mantiene misma sesión)
 * ```
 *
 * Comandos que puede ejecutar:
 *
 * - StartStream: Inicia pipeline GStreamer
 * - StopStream: Detiene pipeline
 * - OpenSession: Crea sesión en store
 * - CloseSession: Cierra sesión con endTs
 * - SetAIFpsMode: Cambia tasa de captura AI
 *
 * Nota: Las detecciones se envían automáticamente vía FrameIngester
 * (AI Engine → Session Store /ingest). El orchestrator solo maneja
 * el ciclo de vida de las sesiones.
 *
 * Arquitectura:
 *
 * - FSM Pura: reduce(ctx, event) → {ctx, commands}
 * - Side Effects: Ejecutados DESPUÉS del reduce (idempotentes)
 * - Timers: Emiten eventos fsm.t.* que re-entran al FSM
 * - Adapters: Abstracciones de módulos (camera, publisher, store, etc.)
 *
 * ¿Por qué FSM pura?
 *
 * - Testeable: reduce() es función pura (fácil de testear)
 * - Debuggable: Toda la lógica en un solo lugar
 * - Predecible: Mismo evento + mismo state → mismo resultado
 * - Auditeable: Commands son explícitos (qué side effects se ejecutan)
 */

import { Bus } from "../bus/bus.js";
import type { CameraHub } from "../../modules/video/ports/camera-hub.js";
import type { AIEngine } from "../../modules/ai/ports/ai-engine.js";
import type { Publisher } from "../../modules/streaming/ports/publisher.js";
import type { SessionStore } from "../../modules/store/ports/session-store.js";
import { CONFIG } from "../../config/index.js";
import { logger } from "../../shared/logging.js";
import { metrics } from "../../shared/metrics.js";
import { reduce } from "./fsm.js";
import type { FSMContext, Command, State } from "./types.js";
import type { AllEvents } from "../bus/events.js";

/**
 * Adapters - Módulos que el Orchestrator controla (dependency injection)
 */
type Adapters = {
  camera: CameraHub; // V4L2/RTSP → SHM
  capture: any; // NV12 capture (Protocol v1)
  ai: AIEngine; // Detección de objetos
  publisher: Publisher; // SHM → RTSP MediaMTX
  store: SessionStore; // API sessions + detections
};

export class Orchestrator {
  private bus: Bus;
  private adapters: Adapters;

  // Contexto de la FSM (state + datos)
  private ctx: FSMContext = { state: "IDLE" };

  // Timers para transiciones automáticas
  private dwellTimer?: NodeJS.Timeout; // Ventana de confirmación (500ms)
  private silenceTimer?: NodeJS.Timeout; // Timeout sin detecciones (3s)
  private postRollTimer?: NodeJS.Timeout; // Grabación post-detección (5s)

  constructor(bus: Bus, adapters: Adapters) {
    this.bus = bus;
    this.adapters = adapters;
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================

  /**
   * Inicializa el Orchestrator
   *
   * - Espera a que camera esté ready (puede tardar en abrir V4L2/RTSP)
   * - Suscribe a todos los eventos relevantes del bus
   * - Queda en estado IDLE esperando primera detección
   */
  async init(): Promise<void> {
    logger.info("Orchestrator initializing", { module: "orchestrator" });

    // Esperar a que camera hub termine de inicializar
    // (puede tardar si source RTSP tiene latencia)
    await this.adapters.camera.ready();
    logger.info("Camera ready, starting capture", { module: "orchestrator" });

    // Suscribirse a eventos del bus que afectan la FSM
    this.bus.subscribe("ai.detection", (e) => this.handleEvent(e));
    this.bus.subscribe("ai.keepalive", (e) => this.handleEvent(e));
    this.bus.subscribe("session.open", (e) => this.handleEvent(e));
    this.bus.subscribe("session.close", (e) => this.handleEvent(e));
    this.bus.subscribe("fsm.t.dwell.ok", (e) => this.handleEvent(e));
    this.bus.subscribe("fsm.t.silence.ok", (e) => this.handleEvent(e));
    this.bus.subscribe("fsm.t.postroll.ok", (e) => this.handleEvent(e));

    logger.info("Orchestrator ready", {
      module: "orchestrator",
      state: this.ctx.state,
    });
  }

  /**
   * Apaga el Orchestrator de forma ordenada
   *
   * - Limpia todos los timers pendientes
   * - Detiene módulos en orden específico
   * - Cierra sesión activa si existe
   */
  async shutdown(): Promise<void> {
    logger.info("Orchestrator shutting down", { module: "orchestrator" });

    // Limpiar timers para evitar eventos post-shutdown
    this.clearAllTimers();

    // Detener módulos (publisher ya debería estar stopped en IDLE)
    await this.adapters.publisher.stop();
    await this.adapters.capture.stop();
    await this.adapters.camera.stop();

    // Cerrar sesión activa si quedó abierta (edge case)
    if (this.ctx.sessionId) {
      await this.adapters.store.close(this.ctx.sessionId);
    }
  }

  // ============================================================
  // EVENT HANDLING & FSM
  // ============================================================

  /**
   * Handler principal de eventos
   *
   * Ejecuta FSM pura (reduce) y procesa comandos resultantes.
   * Log a INFO solo cuando cambia de estado (evita spam).
   */
  private handleEvent(event: AllEvents) {
    logger.debug("Event received", {
      module: "orchestrator",
      event: event.type,
      state: this.ctx.state,
    });

    // Guardar estado anterior para detectar cambios
    const prevState = this.ctx.state;

    // Ejecutar FSM pura: ctx + event → nuevo ctx + comandos
    const { ctx, commands } = reduce(this.ctx, event);
    this.ctx = ctx;

    // Log a INFO solo cuando cambia de estado (reduce spam en logs)
    if (ctx.state !== prevState) {
      logger.info("FSM state change", {
        module: "orchestrator",
        from: prevState,
        to: ctx.state,
        commands: commands.length,
      });
    } else {
      logger.debug("FSM no state change", {
        module: "orchestrator",
        state: ctx.state,
        commands: commands.length,
      });
    }

    // Ejecutar side effects (commands) retornados por FSM pura
    commands.forEach((cmd) => void this.executeCommand(cmd));

    // Manejar timers según estado actual (después de transición)
    this.manageTimers(event, prevState);
  }

  /**
   * Ejecuta un comando (side effect)
   *
   * Traduce Command abstracto a llamada concreta de módulo.
   * Los commands son generados por la FSM pura (reduce).
   *
   * Comandos disponibles:
   *
   * - StartStream: Inicia RTSP hacia MediaMTX
   * - StopStream: Detiene RTSP
   * - OpenSession: Crea nueva sesión en store, retorna sessionId
   * - CloseSession: Cierra sesión con endTs
   * - SetAIFpsMode: Cambia velocidad de AI (idle=5fps, active=12fps)
   *
   * Nota: Las detecciones se envían automáticamente vía FrameIngester
   *
   * @param cmd - Comando a ejecutar (inmutable)
   */
  private async executeCommand(cmd: Command) {
    logger.debug("Executing command", {
      module: "orchestrator",
      command: cmd.type,
    });

    switch (cmd.type) {
      case "StartStream":
        // Iniciar publisher (SHM → RTSP MediaMTX)
        await this.adapters.publisher.start();
        break;

      case "StopStream":
        // Detener publisher (libera socket RTSP)
        await this.adapters.publisher.stop();
        break;

      case "OpenSession":
        // Crear nueva sesión en store, emitir evento con sessionId
        const sessionId = await this.adapters.store.open(cmd.at);

        // Establecer sessionId en el AI Engine para envío de frames
        this.adapters.ai.setSessionId(sessionId);

        this.bus.publish("session.open", {
          type: "session.open",
          sessionId,
          startTs: cmd.at ?? new Date().toISOString(),
        });
        break;

      case "CloseSession":
        // Cerrar sesión (flush final + endTs)
        if (cmd.sessionId) {
          await this.adapters.store.close(cmd.sessionId, cmd.at);
          this.bus.publish("session.close", {
            type: "session.close",
            sessionId: cmd.sessionId,
            endTs: cmd.at ?? new Date().toISOString(),
          });
        }
        break;

      case "SetAIFpsMode":
        // Cambiar tasa de frames AI (CONFIG.ai.fps.idle / CONFIG.ai.fps.active)
        this.adapters.capture.setMode(cmd.mode);
        break;
    }
  }

  // ============================================================
  // TIMER MANAGEMENT
  // ============================================================

  /**
   * Gestiona timers de la FSM según estado actual
   *
   * Timers son mecanismos de auto-transición que emiten eventos fsm.t.*
   *
   * Estrategia:
   * 1. Limpiar timers del estado anterior (al salir)
   * 2. Iniciar timers del nuevo estado (al entrar)
   * 3. Resetear timers si es necesario (durante el estado)
   *
   * @param event - Evento que acaba de procesarse
   * @param prevState - Estado anterior (antes de la transición)
   */
  private manageTimers(event: AllEvents, prevState: State) {
    const { state } = this.ctx;

    // ==================== CLEANUP ====================
    // Limpiar timers cuando salimos de un estado
    this.cleanupTimersOnStateExit(prevState, state);

    // ==================== STATE-SPECIFIC LOGIC ====================
    // Iniciar/resetear timers según estado actual
    if (state === "DWELL") {
      this.manageDwellTimer(event, prevState);
    } else if (state === "ACTIVE") {
      this.manageActiveTimer(event, prevState);
    } else if (state === "CLOSING") {
      this.manageClosingTimer(event, prevState);
    }
  }

  /**
   * Limpia timers al salir de un estado
   */
  private cleanupTimersOnStateExit(prevState: State, currentState: State) {
    if (prevState === "DWELL" && currentState !== "DWELL") {
      this.clearDwellTimer();
    }
    if (prevState === "ACTIVE" && currentState !== "ACTIVE") {
      this.clearSilenceTimer();
    }
    if (prevState === "CLOSING" && currentState !== "CLOSING") {
      this.clearPostRollTimer();
    }
  }

  /**
   * DWELL: Inicia timer de confirmación (período FIJO, no reseteable)
   * 
   * CRÍTICO: El timer NO se resetea con nuevas detecciones.
   * Propósito: Confirmar presencia SOSTENIDA durante CONFIG.fsm.dwellMs.
   * 
   * Si se reseteara, nunca expiraría mientras haya detecciones continuas,
   * causando que la sesión solo abra cuando NO hay nadie (comportamiento invertido).
   * 
   * Ejemplo con dwellMs=500ms:
   * - t=0ms: Primera detección → IDLE → DWELL (timer inicia)
   * - t=100ms: Otra detección → timer NO se resetea (sigue corriendo)
   * - t=500ms: Timer expira → DWELL → ACTIVE (abre sesión)
   */
  private manageDwellTimer(event: AllEvents, prevState: State) {
    const isEnteringDwell = prevState !== "DWELL";
    
    // Iniciar timer SOLO al entrar (período fijo de confirmación)
    if (isEnteringDwell) {
      this.clearDwellTimer();
      this.dwellTimer = setTimeout(() => {
        this.bus.publish("fsm.t.dwell.ok", { type: "fsm.t.dwell.ok" });
      }, CONFIG.fsm.dwellMs);

      logger.debug("DWELL timer started", {
        module: "orchestrator",
        dwellMs: CONFIG.fsm.dwellMs,
      });
    }
  }

  /**
   * ACTIVE: Inicia/resetea silence timer
   *
   * - Al entrar: inicia timer (desde DWELL o desde CLOSING)
   * - Con ai.detection relevante: resetea timer (persona detectada, mantener sesión)
   * - Con ai.keepalive: NO resetea timer (sin detecciones relevantes, dejar expirar)
   * - Sin detecciones relevantes por CONFIG.fsm.silenceMs: timer expira → CLOSING
   */
  private manageActiveTimer(event: AllEvents, prevState: State) {
    // Iniciar timer cuando entramos a ACTIVE (desde cualquier estado)
    const isEnteringActive = prevState !== "ACTIVE";

    // Resetear timer SOLO con detecciones relevantes (personas que pasan el filtro)
    const isRelevantDetection = event.type === "ai.detection" && event.relevant;
    const shouldResetTimer = isRelevantDetection && !isEnteringActive;

    if (isEnteringActive || shouldResetTimer) {
      this.clearSilenceTimer();
      this.silenceTimer = setTimeout(() => {
        this.bus.publish("fsm.t.silence.ok", { type: "fsm.t.silence.ok" });
      }, CONFIG.fsm.silenceMs);

      const reason = isEnteringActive
        ? "entering ACTIVE state"
        : "relevant detection received";

      logger.debug(`Silence timer ${isEnteringActive ? "started" : "reset"}`, {
        module: "orchestrator",
        silenceMs: CONFIG.fsm.silenceMs,
        reason,
      });
    }
  }

  /**
   * CLOSING: Inicia post-roll timer (solo cuando viene de ACTIVE)
   */
  private manageClosingTimer(event: AllEvents, prevState: State) {
    // Iniciar postroll SOLO cuando viene de ACTIVE
    // Si vuelve de ACTIVE (re-activación), no reiniciar timer
    if (event.type === "fsm.t.silence.ok" && prevState === "ACTIVE") {
      this.postRollTimer = setTimeout(() => {
        this.bus.publish("fsm.t.postroll.ok", { type: "fsm.t.postroll.ok" });
      }, CONFIG.fsm.postRollMs);

      logger.debug("Post-roll timer started", {
        module: "orchestrator",
        postRollMs: CONFIG.fsm.postRollMs,
      });
    }
  }

  // --- Timer Cleanup ---

  /**
   * Limpia timer de DWELL
   */
  private clearDwellTimer() {
    if (this.dwellTimer) {
      clearTimeout(this.dwellTimer);
      this.dwellTimer = undefined;
    }
  }

  /**
   * Limpia timer de SILENCE
   */
  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = undefined;
    }
  }

  /**
   * Limpia timer de POST-ROLL
   */
  private clearPostRollTimer() {
    if (this.postRollTimer) {
      clearTimeout(this.postRollTimer);
      this.postRollTimer = undefined;
    }
  }

  /**
   * Limpia todos los timers pendientes
   * Usado en shutdown para evitar eventos post-shutdown
   */
  private clearAllTimers() {
    this.clearDwellTimer();
    this.clearSilenceTimer();
    this.clearPostRollTimer();
  }
}
