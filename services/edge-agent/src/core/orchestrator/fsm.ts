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
 * - IDLE: Esperando detecciones (AI @ fps idle, sin stream)
 * - DWELL: Ventana de confirmación (CONFIG.fsm.dwellMs, evitar falsos positivos)
 * - ACTIVE: Grabando sesión (AI @ fps active, stream ON, session abierta)
 * - CLOSING: Post-roll (CONFIG.fsm.postRollMs, grabación extra después de última detección)
 * 
 * Diagrama de Estados:
 * 
 * ```
 *                    ai.detection (relevant=true)
 *           IDLE ───────────────────────────────────> DWELL
 *            ↑                                           │
 *            │                                           │ fsm.t.dwell.ok (CONFIG.fsm.dwellMs)
 *            │                                           ↓
 *            │                                        ACTIVE
 *            │                                           │
 *            │                                           │ fsm.t.silence.ok (CONFIG.fsm.silenceMs)
 *            │                                           ↓
 *            │                                        CLOSING
 *            │                                           │
 *            │                     fsm.t.postroll.ok (CONFIG.fsm.postRollMs)
 *            └───────────────────────────────────────────┘
 * 
 *            │ CLOSING ─(ai.detection relevante)─> DWELL
 *            │         (re-armar sesión si detecta algo en post-roll)
 * ```
 * 
 * Eventos Procesados:
 * 
 * - ai.detection: Detección de AI (con flag `relevant`)
 * - ai.keepalive: Sin detecciones pero AI sigue procesando
 * - fsm.t.dwell.ok: Timer de confirmación expiró
 * - fsm.t.silence.ok: Timer de silencio expiró (sin detecciones)
 * - fsm.t.postroll.ok: Timer de post-roll expiró
 * - session.open: Store retornó sessionId (async)
 * 
 * Comandos Generados:
 * 
 * - StartStream: Inicia RTSP → MediaMTX
 * - StopStream: Detiene RTSP
 * - OpenSession: Crea nueva sesión en store
 * - AppendDetections: Envía batch de detecciones
 * - CloseSession: Cierra sesión con endTs
 * - SetAIFpsMode: Cambia velocidad AI (configurable vía CONFIG.ai.fps)
 * 
 * ¿Por qué FSM Pura?
 * 
 * - Separación de concerns: Lógica (aquí) vs Side Effects (orchestrator)
 * - Testing: Testear reduce() es trivial (no mocks, no async)
 * - Time-travel debugging: Replay de eventos para reproducir bugs
 * - Auditabilidad: Commands son log completo de qué hizo el sistema
 */

import { State, Command, FSMContext } from "./types.js";
import { AllEvents } from "../bus/events.js";
import { metrics } from "../../shared/metrics.js";

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
export function reduce(ctx: FSMContext, event: AllEvents): { ctx: FSMContext; commands: Command[] } {
  const { state, sessionId } = ctx;

  // ==================== IDLE ====================
  // Esperando primera detección relevante
  switch (state) {
    case "IDLE":
      if (event.type === "ai.detection" && event.relevant) {
        // Transición: IDLE → DWELL
        // Iniciar ventana de confirmación (evitar falsos positivos)
        metrics.inc("fsm_transitions_total", { from: "IDLE", to: "DWELL" });
        return {
          ctx: { state: "DWELL", sessionId: undefined },
          commands: [],
        };
      }
      break;

    // ==================== DWELL ====================
    // Ventana de confirmación (500ms)
    case "DWELL":
      if (event.type === "fsm.t.dwell.ok") {
        // Transición: DWELL → ACTIVE
        // Timer expiró sin falsos positivos → iniciar grabación
        metrics.inc("fsm_transitions_total", { from: "DWELL", to: "ACTIVE" });
        return {
          ctx: { state: "ACTIVE", sessionId: undefined },
          commands: [
            { type: "StartStream" },              // Iniciar RTSP
            { type: "OpenSession" },              // Crear sesión (async → event session.open)
            { type: "SetAIFpsMode", mode: "active" }, // Subir a fps active
          ],
        };
      }
      if (event.type === "ai.detection" && event.relevant) {
        // Resetear timer (orchestrator lo maneja, no generamos comando)
        // Seguir en DWELL esperando ventana sin detecciones
        return { ctx, commands: [] };
      }
      break;

    // ==================== ACTIVE ====================
    // Grabando sesión activa
    case "ACTIVE":
      if (event.type === "ai.detection" || event.type === "ai.keepalive") {
        // Append detecciones a sesión + resetear silence timer (orchestrator)
        if (sessionId) {
          return {
            ctx,
            commands: [
              {
                type: "AppendDetections",
                sessionId,
                payload: {
                  devId: "edge-dev",        // TODO: CONFIG.deviceId
                  ts: event.meta.ts,        // Timestamp de detección
                  detects: event.detections, // Objetos detectados
                },
              },
            ],
          };
        }
      }
      if (event.type === "fsm.t.silence.ok") {
        // Transición: ACTIVE → CLOSING
        // CONFIG.fsm.silenceMs sin detecciones → iniciar post-roll
        metrics.inc("fsm_transitions_total", { from: "ACTIVE", to: "CLOSING" });
        return {
          ctx: { state: "CLOSING", sessionId },
          commands: [{ type: "SetAIFpsMode", mode: "idle" }], // Bajar a fps idle
        };
      }
      if (event.type === "session.open") {
        // Store retornó sessionId (evento async de OpenSession)
        // Guardar en contexto para AppendDetections
        return {
          ctx: { ...ctx, sessionId: event.sessionId },
          commands: [],
        };
      }
      break;

    // ==================== CLOSING ====================
    // Post-roll (5s extra después de última detección)
    case "CLOSING":
      if (event.type === "fsm.t.postroll.ok") {
        // Transición: CLOSING → IDLE
        // Post-roll completado → cerrar sesión y volver a reposo
        metrics.inc("fsm_transitions_total", { from: "CLOSING", to: "IDLE" });
        return {
          ctx: { state: "IDLE", sessionId: undefined },
          commands: [
            { type: "StopStream" },                         // Detener RTSP
            { type: "CloseSession", sessionId: sessionId ?? "" }, // Cerrar sesión en store
          ],
        };
      }
      if (event.type === "ai.detection" && event.relevant) {
        // Re-armar: CLOSING → DWELL
        // Detectó algo durante post-roll → cerrar sesión vieja e iniciar nueva
        metrics.inc("fsm_transitions_total", { from: "CLOSING", to: "DWELL" });
        return {
          ctx: { state: "DWELL", sessionId: undefined },
          commands: [
            { type: "CloseSession", sessionId: sessionId ?? "" }, // Cerrar sesión anterior
            // No abrimos nueva aquí (esperar dwell.ok en DWELL)
          ],
        };
      }
      break;
  }

  // Default: sin transición (ignorar evento)
  return { ctx, commands: [] };
}
