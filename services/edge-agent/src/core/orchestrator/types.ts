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

/**
 * State - Estados válidos de la FSM
 *
 * Ciclo de vida de una grabación:
 *
 * ```
 * IDLE → DWELL → ACTIVE → CLOSING → IDLE
 *                   ↑         │
 *                   └─────────┘  (re-activación en post-roll)
 * ```
 *
 * Invariantes de sessionId:
 *
 * - IDLE: sessionId === undefined (sin sesión activa)
 * - DWELL: sessionId === undefined (sesión se abre al pasar a ACTIVE)
 * - ACTIVE: sessionId !== undefined (después de recibir session.open)
 * - CLOSING: sessionId !== undefined (hasta ejecutar CloseSession)
 */
export type State = "IDLE" | "DWELL" | "ACTIVE" | "CLOSING";

/**
 * Command - Side effects que la FSM puede ordenar
 *
 * Cada comando es ejecutado por el orchestrator (fuera de la FSM pura).
 * Son declarativos: especifican QUÉ hacer, no CÓMO hacerlo.
 *
 * Comandos disponibles:
 *
 * - StartStream: Inicia publisher (SHM → RTSP MediaMTX)
 * - StopStream: Detiene publisher (libera recursos RTSP)
 * - OpenSession: Crea nueva sesión en store (async → emite session.open)
 * - CloseSession: Cierra sesión con endTs (marca fin de grabación)
 * - SetAIFpsMode: Cambia velocidad de AI capture (idle vs active fps)
 *
 * Nota: Las detecciones se envían automáticamente vía FrameIngester
 * (AI Engine → Session Store /ingest), no requieren comandos.
 *
 * Ejemplo de uso:
 *
 * ```typescript
 * // FSM genera comandos (reduce pura)
 * const commands: Command[] = [
 *   { type: "StartStream" },
 *   { type: "OpenSession" },
 *   { type: "SetAIFpsMode", mode: "active" },
 * ];
 *
 * // Orchestrator ejecuta comandos (side effects)
 * commands.forEach(cmd => executeCommand(cmd));
 * ```
 */
export type Command =
  | { type: "StartStream" }
  | { type: "StopStream"; reason?: string }
  | { type: "OpenSession"; at?: string }
  | { type: "CloseSession"; sessionId: string; at?: string }
  | { type: "SetAIFpsMode"; mode: "idle" | "active" };

/**
 * FSMContext - Contexto persistente de la FSM
 *
 * Contiene el estado interno que sobrevive entre transiciones.
 * Es inmutable: cada transición crea un nuevo contexto.
 *
 * Campos:
 *
 * - state: Estado actual de la FSM (IDLE | DWELL | ACTIVE | CLOSING)
 * - sessionId: ID de sesión activa (undefined si no hay sesión)
 *
 * ¿Por qué sessionId en el contexto?
 *
 * OpenSession es async (HTTP POST al store). El store retorna sessionId
 * en un evento session.open. Necesitamos guardarlo en el contexto para
 * usarlo después en CloseSession.
 *
 * Flujo de sessionId:
 *
 * ```
 * DWELL → ACTIVE:
 *   ctx.sessionId = undefined
 *   Command: OpenSession
 *       ↓ (async)
 *   Event: session.open { sessionId: "sess_cam-01_1234567890_1" }
 *       ↓
 *   ctx.sessionId = "sess_cam-01_1234567890_1"
 *       ↓
 *   AI Engine envía frames con sessionId vía FrameIngester
 *       ↓
 * ACTIVE → CLOSING → IDLE:
 *   Command: CloseSession { sessionId: "sess_cam-01_1234567890_1" }
 *   ctx.sessionId = undefined
 * ```
 */
export interface FSMContext {
  state: State;
  sessionId?: string;
}
