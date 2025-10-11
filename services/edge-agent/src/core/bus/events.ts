/**
 * Event Types - Definición de Todos los Eventos del Sistema
 *
 * Este archivo define TODOS los eventos que fluyen por el bus.
 * Son la única forma de comunicación entre módulos (desacoplamiento total).
 *
 * Categorías de eventos:
 *
 * 1. AI Events: Emitidos por el motor de IA
 *    - ai.detection: Detección de objetos (con flag `relevant`)
 *    - ai.keepalive: Confirma presencia de objetos (mantiene sesión activa)
 *
 * 2. Stream Events: Lifecycle del publisher RTSP
 *    - stream.start: Publisher inició streaming
 *    - stream.stop: Publisher detuvo streaming
 *    - stream.error: Error en publisher
 *
 * 3. Session Events: Lifecycle de sesiones de grabación
 *    - session.open: Sesión iniciada en Session Store
 *    - session.close: Sesión cerrada
 *
 * Patrones de uso:
 *
 * ```typescript
 * // Publicar evento con tipo inferido
 * bus.publish("ai.detection", {
 *   type: "ai.detection",
 *   relevant: true,
 *   score: 0.9,
 *   detections: [...],
 *   meta: { ts: "...", seqNo: 123 }
 * });
 *
 * // Suscribir con tipo inferido del handler
 * bus.subscribe("ai.detection", (event) => {
 *   // `event` es tipo AIDetectionEvent automáticamente
 *   if (event.relevant) {
 *     console.log("Objeto relevante detectado!");
 *   }
 * });
 * ```
 *
 * Type Safety:
 * - Cada topic tiene un tipo de evento específico (EventOf<T>)
 * - TypeScript garantiza que publish/subscribe matchean
 * - No se pueden publicar eventos de tipo incorrecto en un topic
 */

import { Detection, FrameMeta } from "../../types/detections.js";

// ==================== AI Events ====================
// Eventos emitidos por el motor de IA (AIEngine)

/**
 * ai.detection - Detección de objetos en frame
 *
 * Emitido cuando el motor de IA detecta objetos en un frame.
 * Flag `relevant` indica si contiene clases filtradas (CONFIG.ai.classesFilter).
 *
 * Consumido por: Orchestrator (para transiciones FSM)
 */
export type AIDetectionEvent = {
  type: "ai.detection";
  relevant: boolean; // ¿Contiene clases de interés? (person, helmet, etc.)
  score: number; // Score de confianza global (0-1)
  detections: Detection[]; // Lista de objetos detectados con bbox
  meta: FrameMeta; // Timestamp y sequence number del frame
};

/**
 * ai.keepalive - Liveness del AI worker
 *
 * Emitido cuando AI procesa frame pero NO hay detecciones relevantes.
 * Sirve para confirmar que AI está activo (no crasheado).
 *
 * Consumido por: Orchestrator (NO resetea timer - indica ausencia de detecciones)
 */
export type AIKeepaliveEvent = {
  type: "ai.keepalive";
  score: number; // Siempre 0 (sin detecciones)
  detections: Detection[]; // Siempre array vacío
  meta: FrameMeta;
};

export type AIEvents = AIDetectionEvent | AIKeepaliveEvent;

// ==================== Stream Events ====================
// Eventos del lifecycle del Publisher (streaming RTSP)

// ==================== Stream Events ====================
// Eventos del Publisher (RTSP → MediaMTX)
// NOTA: Estos eventos están RESERVADOS para implementación futura.

/**
 * stream.start - Publisher inició streaming (RESERVADO)
 *
 * Estado actual: NO IMPLEMENTADO - Publisher no emite este evento.
 *
 * Propósito futuro:
 * Emitir cuando el publisher RTSP arranca exitosamente (pipeline PLAYING).
 * Indica que el stream está disponible en MediaMTX.
 *
 * TODO: Agregar bus.publish("stream.start") en Publisher.start()
 *
 * Consumidores futuros: Orchestrator (logging), Metrics, Health checks
 */
export type StreamStartEvent = {
  type: "stream.start";
  reason?: string; // Motivo del inicio (ej: "session_active")
};

/**
 * stream.stop - Publisher detuvo streaming (RESERVADO)
 *
 * Estado actual: NO IMPLEMENTADO - Publisher no emite este evento.
 *
 * Propósito futuro:
 * Emitir cuando el publisher cierra el stream RTSP (normal shutdown).
 *
 * TODO: Agregar bus.publish("stream.stop") en Publisher.stop()
 *
 * Consumidores futuros: Orchestrator (logging), Metrics
 */
export type StreamStopEvent = {
  type: "stream.stop";
  reason?: string; // Motivo del stop (ej: "session_ended", "shutdown")
};

/**
 * stream.error - Error en el publisher (RESERVADO)
 *
 * Estado actual: NO IMPLEMENTADO - Publisher no emite este evento.
 *
 * Propósito futuro:
 * Emitir cuando hay un error fatal en el pipeline de streaming.
 * Permite retry logic o notificación de alertas.
 *
 * TODO: Agregar bus.publish("stream.error") en Publisher.handleExit()
 *
 * Consumidores futuros: Orchestrator (retry), Metrics (alertas)
 */
export type StreamErrorEvent = {
  type: "stream.error";
  module: string; // Módulo que generó el error
  error: string; // Mensaje de error
};

export type StreamEvents =
  | StreamStartEvent
  | StreamStopEvent
  | StreamErrorEvent;

// ==================== Session Events ====================
// Eventos del lifecycle de sesiones (Session Store API)

/**
 * session.open - Sesión iniciada
 *
 * Emitido cuando se abre una nueva sesión en Session Store.
 */
export type SessionOpenEvent = {
  type: "session.open";
  sessionId: string; // ID único de sesión (ej: sess_1728123456_1)
  startTs: string; // Timestamp ISO inicio (ej: "2025-10-05T12:00:00.000Z")
};

export type SessionCloseEvent = {
  type: "session.close";
  sessionId: string;
  endTs: string;
};

export type SessionEvents = SessionOpenEvent | SessionCloseEvent;

// ==================== FSM Timer Events (internos) ====================
export type FSMTimerDwellEvent = {
  type: "fsm.t.dwell.ok";
};

export type FSMTimerSilenceEvent = {
  type: "fsm.t.silence.ok";
};

export type FSMTimerPostRollEvent = {
  type: "fsm.t.postroll.ok";
};

export type FSMTimerEvents =
  | FSMTimerDwellEvent
  | FSMTimerSilenceEvent
  | FSMTimerPostRollEvent;

// ==================== Union de todos los eventos ====================
export type AllEvents =
  | AIEvents
  | StreamEvents
  | SessionEvents
  | FSMTimerEvents;

// ==================== Topic Registry ====================
export type TopicMap = {
  "ai.detection": AIDetectionEvent;
  "ai.keepalive": AIKeepaliveEvent;
  "stream.start": StreamStartEvent;
  "stream.stop": StreamStopEvent;
  "stream.error": StreamErrorEvent;
  "session.open": SessionOpenEvent;
  "session.close": SessionCloseEvent;
  "fsm.t.dwell.ok": FSMTimerDwellEvent;
  "fsm.t.silence.ok": FSMTimerSilenceEvent;
  "fsm.t.postroll.ok": FSMTimerPostRollEvent;
};

export type KnownTopic = keyof TopicMap;
export type EventOf<T extends KnownTopic> = TopicMap[T];
