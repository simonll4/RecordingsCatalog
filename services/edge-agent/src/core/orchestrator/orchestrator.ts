/**
 * Orchestrator - Coordinador Central del Sistema (FSM)
 *
 * El Orchestrator es el "cerebro" del Edge Agent. Implementa una FSM
 * (Finite State Machine) pura que coordina todos los módulos.
 * - StartStream: Inicia RTSP hacia MediaMTX
 * - StopStream: Detiene RTSP
 * - OpenSession: Crea nueva sesión en store, retorna sessionId
 * - AppendDetections: Envía batch de detecciones a store
 * - CloseSession: Cierra sesión con endTs
 * - SetAIFpsMode: Cambia velocidad de AI (configurable vía CONFIG.ai.fps)basándose
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
 * - IDLE: Esperando detecciones (AI @ fps idle, sin stream)
 * - DWELL: Ventana de confirmación (configurable, AI @ fps idle)
 * - ACTIVE: Grabando (AI @ fps active, stream ON)
 * - CLOSING: Post-roll (configurable, AI @ fps active, stream ON)
 *
 * Flujo típico:
 *
 * ```
 * IDLE → (ai.detection con relevant=true) → DWELL
 *      → (dwell timer OK) → ACTIVE
 *      → (silence timer OK) → CLOSING
 *      → (postroll timer OK) → IDLE
 * ```
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
// Ports directo: Máxima claridad arquitectónica
import type { CameraHub } from "../../modules/video/ports/camera-hub.js";
import type { RGBCapture } from "../../modules/video/ports/rgb-capture.js";
import type { AIEngine } from "../../modules/ai/ports/ai-engine.js";
import type { Publisher } from "../../modules/streaming/ports/publisher.js";
import type { SessionStore } from "../../modules/store/ports/session-store.js";
import { CONFIG } from "../../config/index.js";
import { logger } from "../../shared/logging.js";
import { metrics } from "../../shared/metrics.js";
import { reduce } from "./fsm.js";
import type { FSMContext, Command, State } from "./types.js";
import type { AllEvents } from "../bus/events.js";

// Módulos que el Orchestrator controla (dependency injection)
type Adapters = {
  camera: CameraHub; // V4L2/RTSP → SHM
  capture: RGBCapture; // SHM → RGB frames (dual-rate)
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

  // ==================== PRIVATE ====================

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
   * - AppendDetections: Envía batch de detecciones a store
   * - CloseSession: Cierra sesión con endTs
   * - SetAIFpsMode: Cambia velocidad de AI (idle=5fps, active=12fps)
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
        this.bus.publish("session.open", {
          type: "session.open",
          sessionId,
          startTs: cmd.at ?? new Date().toISOString(),
        });
        break;

      case "AppendDetections":
        // Enviar batch de detecciones a store (HTTP POST /detections)
        await this.adapters.store.append(cmd.sessionId, cmd.payload);
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

  /**
   * Gestiona timers de la FSM según estado actual
   *
   * Timers son mecanismos de auto-transición (ej: DWELL → ACTIVE).
   * Emiten eventos que re-entran al FSM (fsm.t.*).
   *
   * Lógica por estado:
   *
   * - DWELL: Iniciar dwell timer SOLO en la transición de entrada (no resetear)
   * - ACTIVE: Resetear silence timer en ai.detection RELEVANTE o ai.keepalive
   * - CLOSING: Iniciar postroll timer tras fsm.t.silence.ok (grabación extra)
   *
   * ¿Por qué solo detecciones relevantes?
   *
   * Las detecciones no relevantes (ej: detecta "car" pero filtro es "person")
   * NO deben mantener la sesión activa. Solo las relevantes resetean el timer.
   * Si pasan silenceMs sin detecciones relevantes → CLOSING.
   *
   * @param event - Evento que acaba de procesarse
   * @param prevState - Estado anterior (antes de la transición)
   */
  private manageTimers(event: AllEvents, prevState: State) {
    const { state } = this.ctx;

    // Limpiar timers al salir de un estado
    if (prevState === "DWELL" && state !== "DWELL") {
      this.clearDwellTimer();
    }
    if (prevState === "ACTIVE" && state !== "ACTIVE") {
      this.clearSilenceTimer();
    }
    if (prevState === "CLOSING" && state !== "CLOSING") {
      this.clearPostRollTimer();
    }

    // === DWELL: Ventana de confirmación ===
    // Iniciar timer SOLO cuando se ENTRA al estado DWELL (no resetear)
    if (state === "DWELL" && prevState !== "DWELL") {
      this.dwellTimer = setTimeout(() => {
        this.bus.publish("fsm.t.dwell.ok", { type: "fsm.t.dwell.ok" });
      }, CONFIG.fsm.dwellMs);

      logger.debug("DWELL timer started", {
        module: "orchestrator",
        dwellMs: CONFIG.fsm.dwellMs,
      });
    }

    // === ACTIVE: Grabando sesión ===
    if (state === "ACTIVE") {
      // Iniciar silence timer cuando se ENTRA a ACTIVE
      if (prevState !== "ACTIVE") {
        this.silenceTimer = setTimeout(() => {
          this.bus.publish("fsm.t.silence.ok", { type: "fsm.t.silence.ok" });
        }, CONFIG.fsm.silenceMs);

        logger.debug("Silence timer started", {
          module: "orchestrator",
          silenceMs: CONFIG.fsm.silenceMs,
        });
      }

      // Resetear silence timer SOLO con detecciones relevantes
      // ai.keepalive NO debe resetear el timer (solo indica que AI está vivo)
      // Las detecciones no relevantes NO deben mantener la sesión viva
      if (event.type === "ai.detection" && event.relevant) {
        this.clearSilenceTimer();
        this.silenceTimer = setTimeout(() => {
          this.bus.publish("fsm.t.silence.ok", { type: "fsm.t.silence.ok" });
        }, CONFIG.fsm.silenceMs);

        logger.debug("Silence timer reset (relevant detection)", {
          module: "orchestrator",
          silenceMs: CONFIG.fsm.silenceMs,
        });
      }
    }

    // === CLOSING: Post-roll ===
    if (state === "CLOSING") {
      if (event.type === "fsm.t.silence.ok") {
        // Iniciar postroll (grabación extra después de última detección)
        this.postRollTimer = setTimeout(() => {
          this.bus.publish("fsm.t.postroll.ok", { type: "fsm.t.postroll.ok" });
        }, CONFIG.fsm.postRollMs);
      }
    }
  }

  /**
   * Limpia timer de DWELL (ventana de confirmación)
   *
   * Llamado cuando:
   * - Sale de DWELL (transición a ACTIVE)
   * - Nueva detección en DWELL (resetear timer)
   * - Shutdown completo
   */
  private clearDwellTimer() {
    if (this.dwellTimer) clearTimeout(this.dwellTimer);
  }

  /**
   * Limpia timer de SILENCE (timeout sin detecciones)
   *
   * Llamado cuando:
   * - Nueva detección en ACTIVE (resetear timer)
   * - Transición a CLOSING (ya no necesario)
   * - Shutdown completo
   */
  private clearSilenceTimer() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
  }

  /**
   * Limpia timer de POST-ROLL (grabación extra)
   *
   * Llamado cuando:
   * - Transición CLOSING → IDLE (completó post-roll)
   * - Shutdown completo (cancelar post-roll)
   */
  private clearPostRollTimer() {
    if (this.postRollTimer) clearTimeout(this.postRollTimer);
  }

  /**
   * Limpia todos los timers pendientes
   *
   * Usado en shutdown para evitar que timers emitan eventos
   * después de que módulos estén detenidos (edge case).
   */
  private clearAllTimers() {
    this.clearDwellTimer();
    this.clearSilenceTimer();
    this.clearPostRollTimer();
  }
}
