/**
 * Types - Definiciones de tipos para FSM y Commands
 * 
 * Este archivo define los tipos TypeScript para:
 * 
 * 1. State: Estados válidos de la FSM
 * 2. Command: Side effects que la FSM puede generar
 * 3. FSMContext: Contexto persistente entre transiciones
 * 
 * ¿Por qué tipos explícitos?
 * 
 * - Type safety: TypeScript valida que solo se usen estados/commands válidos
 * - Autocomplete: IDE sugiere opciones válidas
 * - Refactoring: Cambiar nombre de estado → error de compilación en todos los usos
 * - Documentación: Tipos son documentación ejecutable
 */

import { Detection } from "../../types/detections.js";

/**
 * State - Estados válidos de la FSM
 * 
 * Transiciones permitidas:
 * 
 * ```
 * IDLE → DWELL → ACTIVE → CLOSING → IDLE
 *          ↑                  │
 *          └──────────────────┘  (re-armar si detecta en post-roll)
 * ```
 * 
 * Invariantes:
 * 
 * - IDLE: sessionId === undefined
 * - DWELL: sessionId === undefined (sesión se abre en ACTIVE)
 * - ACTIVE: sessionId !== undefined (después de session.open)
 * - CLOSING: sessionId !== undefined (hasta cerrar)
 */
export type State = "IDLE" | "DWELL" | "ACTIVE" | "CLOSING";

/**
 * Command - Side effects que la FSM puede ordenar
 * 
 * Cada comando es ejecutado por el orchestrator (fuera de reduce).
 * Son declarativos (qué hacer, no cómo hacerlo).
 * 
 * Comandos disponibles:
 * 
 * - StartStream: Inicia publisher (SHM → RTSP MediaMTX)
 * - StopStream: Detiene publisher
 * - OpenSession: Crea nueva sesión en store (async → event session.open)
 * - AppendDetections: Envía batch de detecciones a sesión activa
 * - CloseSession: Cierra sesión con endTs (flush final)
 * - SetAIFpsMode: Cambia velocidad de AI capture (configurable vía CONFIG.ai.fps)
 * 
 * Ejemplo:
 * 
 * ```typescript
 * const commands: Command[] = [
 *   { type: "StartStream" },
 *   { type: "OpenSession" },
 *   { type: "SetAIFpsMode", mode: "active" },
 * ];
 * // orchestrator ejecuta estos commands en orden
 * ```
 */
export type Command =
  | { type: "StartStream" }
  | { type: "StopStream"; reason?: string }
  | { type: "OpenSession"; at?: string }
  | { 
      type: "AppendDetections"; 
      sessionId: string; 
      payload: { 
        devId: string;          // ID del dispositivo edge
        ts: string;             // Timestamp ISO8601 de detección
        detects: Detection[];   // Objetos detectados por AI
      } 
    }
  | { type: "CloseSession"; sessionId: string; at?: string }
  | { type: "SetAIFpsMode"; mode: "idle" | "active" };

/**
 * FSMContext - Contexto persistente de la FSM
 * 
 * Contiene datos que sobreviven entre transiciones.
 * Es el "estado interno" de la FSM (state + datos auxiliares).
 * 
 * Campos:
 * 
 * - state: Estado actual de la FSM
 * - sessionId: ID de sesión activa (undefined si no hay sesión)
 * 
 * ¿Por qué sessionId en contexto?
 * 
 * OpenSession es async (HTTP POST). Store retorna sessionId en evento
 * session.open. Necesitamos guardarlo en contexto para usar en
 * AppendDetections y CloseSession.
 * 
 * Flujo:
 * 
 * ```
 * DWELL → ACTIVE: ctx.sessionId = undefined
 *              ↓
 *         Command: OpenSession
 *              ↓
 *         Event: session.open { sessionId: "abc123" }
 *              ↓
 *         ctx.sessionId = "abc123"
 *              ↓
 *         Command: AppendDetections { sessionId: "abc123", ... }
 * ```
 */
export type FSMContext = {
  state: State;
  sessionId?: string;
};
