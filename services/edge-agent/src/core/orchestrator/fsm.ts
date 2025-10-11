/**
 * FSM Pura - Máquina de Estados Finita (Finite State Machine)
 *
 * Esta es la LÓGICA CENTRAL del Edge Agent. Implementa el patrón
 * Reducer Puro: reduce(state, event) → {newState, commands}
 *
 * Características:
 *
 * - Función pura: NO side effects, NO async, NO I/O
 * - Testeable: Fácil de testear (input/output determinístico)
 * - Debuggable: Toda la lógica en un solo lugar
 * - Auditeable: Genera comandos explícitos (side effects externalizados)
 *
 * Estados:
 *
 * - IDLE: Esperando detecciones (AI @ fps idle, sin stream, sin sesión)
 * - DWELL: Ventana de confirmación FIJA (CONFIG.fsm.dwellMs, evita falsos positivos)
 * - ACTIVE: Grabando sesión (AI @ fps active, stream ON, sesión abierta)
 * - CLOSING: Post-roll (CONFIG.fsm.postRollMs, grabación extra tras última detección)
 *
 * Diagrama de Estados:
 *
 * ```
 *                     ai.detection (relevant=true)
 *           IDLE ────────────────────────────────────> DWELL
 *            ↑                                           │
 *            │                                           │ fsm.t.dwell.ok
 *            │                                           ↓
 *            │                                        ACTIVE ←──────┐
 *            │                                           │          │
 *            │                                           │          │ ai.detection
 *            │                  fsm.t.silence.ok         │          │ (relevant=true)
 *            │                 (sin detecciones)         │          │
 *            │                                           ↓          │
 *            │                                        CLOSING ──────┘
 *            │                                           │
 *            │                          fsm.t.postroll.ok
 *            │                      (completó post-roll)
 *            └───────────────────────────────────────────┘
 * ```
 *
 * Eventos Procesados:
 *
 * - ai.detection: Detección de AI (con flag `relevant`)
 * - ai.keepalive: AI procesando pero sin detecciones (NO resetea timers)
 * - fsm.t.dwell.ok: Timer de confirmación expiró (ventana anti-falsos-positivos)
 * - fsm.t.silence.ok: Timer de silencio expiró (sin detecciones relevantes)
 * - fsm.t.postroll.ok: Timer de post-roll expiró (grabación extra completa)
 * - session.open: Store retornó sessionId (respuesta async de OpenSession)
 *
 * Comandos Generados:
 *
 * - StartStream: Inicia pipeline GStreamer (SHM → RTSP MediaMTX)
 * - StopStream: Detiene pipeline RTSP
 * - OpenSession: Crea sesión en store (async, retorna sessionId vía evento)
 * - CloseSession: Cierra sesión con endTs (marca fin de grabación)
 * - SetAIFpsMode: Cambia velocidad de AI capture (idle vs active fps)
 *
 * Nota: Las detecciones se envían automáticamente vía FrameIngester
 * (AI Engine → Session Store /ingest), no requieren comandos del orchestrator.
 *
 * ¿Por qué FSM Pura?
 *
 * - Separación de concerns: Lógica (aquí) vs Side Effects (orchestrator)
 * - Testing: Testear reduce() es trivial (no mocks, no async)
 * - Time-travel debugging: Replay de eventos para reproducir bugs
 * - Auditabilidad: Commands son log completo de qué hizo el sistema
 */

import { Command, FSMContext } from "./types.js";
import { AllEvents } from "../bus/events.js";
import { metrics } from "../../shared/metrics.js";

// ==================== HELPERS ====================

/**
 * Crea una transición de estado con métricas
 */
function transition(
  from: string,
  to: string,
  ctx: Partial<FSMContext>,
  commands: Command[]
): { ctx: FSMContext; commands: Command[] } {
  metrics.inc("fsm_transitions_total", { from, to });
  return {
    ctx: { state: to as any, ...ctx },
    commands,
  };
}

/**
 * Sin cambios: retorna el mismo contexto sin comandos
 */
function noChange(ctx: FSMContext): { ctx: FSMContext; commands: Command[] } {
  return { ctx, commands: [] };
}

/**
 * Reduce - Función reductora pura de la FSM
 *
 * Toma estado actual + evento y retorna nuevo estado + comandos.
 * NO ejecuta side effects (eso es responsabilidad del orchestrator).
 *
 * Pattern:
 *
 * ```typescript
 * const {ctx, commands} = reduce(currentCtx, event);
 * // orchestrator ejecuta commands y actualiza ctx
 * ```
 *
 * @param ctx - Contexto actual (state + sessionId)
 * @param event - Evento a procesar (del bus)
 * @returns Nuevo contexto + comandos a ejecutar
 */
export function reduce(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  const { state } = ctx;

  switch (state) {
    // ==================== IDLE ====================
    // Esperando primera detección relevante
    case "IDLE":
      return handleIdleState(ctx, event);

    // ==================== DWELL ====================
    // Ventana de confirmación anti-falsos-positivos
    case "DWELL":
      return handleDwellState(ctx, event);

    // ==================== ACTIVE ====================
    // Grabando sesión activa
    case "ACTIVE":
      return handleActiveState(ctx, event);

    // ==================== CLOSING ====================
    // Post-roll: grabación extra tras última detección
    case "CLOSING":
      return handleClosingState(ctx, event);

    default:
      // Estado no reconocido (no debería pasar con TypeScript)
      return noChange(ctx);
  }
}

// ==================== STATE HANDLERS ====================

/**
 * IDLE: Esperando primera detección relevante
 *
 * Transiciones:
 * - ai.detection (relevant=true) → DWELL
 */
function handleIdleState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  if (event.type === "ai.detection" && event.relevant) {
    return transition("IDLE", "DWELL", { sessionId: undefined }, []);
  }
  return noChange(ctx);
}

/**
 * DWELL: Ventana de confirmación (CONFIG.fsm.dwellMs)
 *
 * Período FIJO de confirmación anti-falsos-positivos.
 * Timer NO se resetea - debe mantener detecciones durante todo el período.
 *
 * Comportamiento:
 * - Entra con primera detección relevante
 * - Timer corre por CONFIG.fsm.dwellMs (ej: 500ms)
 * - Si se mantienen detecciones durante ese tiempo → ACTIVE (abre sesión)
 * - Si desaparecen las detecciones antes → queda en DWELL hasta que expire
 *
 * IMPORTANTE: NO resetear timer con nuevas detecciones o nunca expirará
 * mientras haya actividad continua (comportamiento invertido).
 *
 * Transiciones:
 * - fsm.t.dwell.ok → ACTIVE (período de confirmación completado)
 * - ai.detection (relevant=true) → DWELL (se acepta pero NO resetea timer)
 * - ai.keepalive → DWELL (se acepta, sin efecto)
 */
function handleDwellState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  if (event.type === "fsm.t.dwell.ok") {
    // Ventana de confirmación OK → iniciar grabación
    return transition("DWELL", "ACTIVE", { sessionId: undefined }, [
      { type: "StartStream" },
      { type: "OpenSession" },
      { type: "SetAIFpsMode", mode: "active" },
    ]);
  }

  if (event.type === "ai.detection" && event.relevant) {
    // Detección durante DWELL → se acepta pero timer NO se resetea
    return noChange(ctx);
  }

  if (event.type === "ai.keepalive") {
    // Keepalive durante DWELL → se acepta sin efecto
    return noChange(ctx);
  }

  return noChange(ctx);
}

/**
 * ACTIVE: Grabando sesión activa
 *
 * Transiciones:
 * - fsm.t.silence.ok → CLOSING (sin detecciones relevantes por CONFIG.fsm.silenceMs)
 * - session.open → ACTIVE (guarda sessionId del store)
 * - ai.detection (relevant=true) → ACTIVE (resetea silence timer)
 * - ai.keepalive → ACTIVE (NO resetea timer - sin detecciones)
 */
function handleActiveState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  const { sessionId } = ctx;

  if (event.type === "fsm.t.silence.ok") {
    // Sin detecciones relevantes → iniciar post-roll
    return transition("ACTIVE", "CLOSING", { sessionId }, [
      { type: "SetAIFpsMode", mode: "idle" },
    ]);
  }

  if (event.type === "session.open") {
    // Store retornó sessionId → guardarlo en contexto
    return noChange({ ...ctx, sessionId: event.sessionId });
  }

  if (event.type === "ai.detection" || event.type === "ai.keepalive") {
    // Detecciones se envían automáticamente vía FrameIngester
    // Silence timer se resetea SOLO con ai.detection relevante (orchestrator)
    return noChange(ctx);
  }

  return noChange(ctx);
}

/**
 * CLOSING: Post-roll (CONFIG.fsm.postRollMs)
 *
 * Grabación extra después de última detección para capturar contexto completo.
 *
 * Transiciones:
 * - fsm.t.postroll.ok → IDLE (post-roll completo, cerrar sesión)
 * - ai.detection (relevant=true) → ACTIVE (re-activar sesión, extenderla)
 */
function handleClosingState(
  ctx: FSMContext,
  event: AllEvents
): { ctx: FSMContext; commands: Command[] } {
  const { sessionId } = ctx;

  if (event.type === "fsm.t.postroll.ok") {
    // Post-roll completo → cerrar sesión y volver a IDLE
    return transition("CLOSING", "IDLE", { sessionId: undefined }, [
      { type: "StopStream" },
      { type: "CloseSession", sessionId: sessionId ?? "" },
    ]);
  }

  // Re-activación: detectó algo durante post-roll
  if (event.type === "ai.detection" && event.relevant) {
    // Extender sesión actual, volver a ACTIVE
    // NO cerrar/reabrir sesión, mantener la misma sessionId
    return transition("CLOSING", "ACTIVE", { sessionId }, [
      { type: "SetAIFpsMode", mode: "active" },
    ]);
  }

  return noChange(ctx);
}
