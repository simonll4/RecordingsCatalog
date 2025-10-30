/**
 * Event Types - Definition of All System Events
 *
 * This file defines ALL events that flow through the event bus.
 * Events are the ONLY communication mechanism between modules (total decoupling).
 *
 * Event Categories:
 * =================
 *
 * 1. AI Events: Emitted by AI engine
 *    - ai.detection: Object detection (with `relevant` flag)
 *    - ai.keepalive: Confirms object presence (maintains active session)
 *
 * 2. Stream Events: RTSP publisher lifecycle
 *    - stream.start: Publisher started streaming
 *    - stream.stop: Publisher stopped streaming
 *    - stream.error: Error in publisher
 *
 * 3. Session Events: Recording session lifecycle
 *    - session.open: Session started in Session Store
 *    - session.close: Session closed
 *
 * 4. FSM Timer Events: Internal timer expirations (orchestrator only)
 *    - fsm.t.dwell.ok: Confirmation window complete
 *    - fsm.t.silence.ok: Silence period complete
 *    - fsm.t.postroll.ok: Post-roll period complete
 *
 * Usage Patterns:
 * ===============
 *
 * Publishing Events:
 * ```typescript
 * // Type-safe event publishing
 * bus.publish("ai.detection", {
 *   type: "ai.detection",
 *   relevant: true,
 *   score: 0.9,
 *   detections: [...],
 *   meta: { ts: "...", seqNo: 123 }
 * });
 * ```
 *
 * Subscribing to Events:
 * ```typescript
 * // Type-safe subscription with inferred event type
 * bus.subscribe("ai.detection", (event) => {
 *   // `event` is automatically typed as AIDetectionEvent
 *   if (event.relevant) {
 *     console.log("Relevant object detected!");
 *   }
 * });
 * ```
 *
 * Type Safety Guarantees:
 * =======================
 *
 * - Each topic has a specific event type (EventOf<T>)
 * - TypeScript guarantees publish/subscribe type matching
 * - Cannot publish wrong event type to a topic
 * - Compile-time error if topic doesn't exist
 * - Auto-completion for event properties
 *
 * Architecture:
 * =============
 *
 * Event-Driven Design:
 *   - Modules communicate ONLY via events (no direct calls)
 *   - Loose coupling: senders don't know receivers
 *   - Easy to add new subscribers without modifying publishers
 *   - Audit trail: all events can be logged centrally
 *
 * Benefits:
 *   - Testability: Mock event bus to test modules in isolation
 *   - Observability: Central point to monitor all system activity
 *   - Debuggability: Replay events to reproduce bugs
 *   - Extensibility: Add new features by subscribing to existing events
 */

import { Detection, FrameMeta } from "../../types/detections.js";

// ==================== AI Events ====================
// Events emitted by AI engine (AIEngine)

/**
 * ai.detection - Object Detection in Frame
 *
 * Emitted when AI engine detects objects in a frame.
 * The `relevant` flag indicates if it contains filtered classes (CONFIG.ai.classesFilter).
 *
 * Flow:
 *   1. AI worker processes frame, returns detections via protobuf
 *   2. AIClient parses detections, filters by classesFilter
 *   3. AIClient publishes this event to bus
 *   4. Orchestrator receives event, updates FSM
 *
 * Relevant Detection Logic:
 *   - Filtered classes: CONFIG.ai.classesFilter (e.g., ["person", "helmet"])
 *   - relevant=true if ANY detection matches filter
 *   - relevant=false if no matches (background objects only)
 *
 * FSM Impact:
 *   - relevant=true: Resets silence timer, extends session
 *   - relevant=false: Ignored by FSM (no state change)
 *
 * @property relevant - Contains classes of interest? (person, helmet, etc.)
 * @property score - Global confidence score (0-1, max of all detections)
 * @property detections - Array of detected objects with bboxes
 * @property meta - Frame metadata (timestamp, sequence number)
 *
 * Consumed by:
 *   - Orchestrator (FSM transitions)
 *   - FrameIngester (sends to Session Store)
 *   - Metrics (detection rate tracking)
 */
export type AIDetectionEvent = {
  type: "ai.detection";
  relevant: boolean;
  score: number;
  detections: Detection[];
  meta: FrameMeta;
};

/**
 * ai.keepalive - AI Worker Liveness Signal
 *
 * Emitted when AI processes frame but finds NO relevant detections.
 * Confirms AI is alive and processing (not crashed or stuck).
 *
 * Purpose:
 *   - Heartbeat mechanism (AI is responding)
 *   - Distinguish "no detections" from "AI dead"
 *   - Prevents false timeout errors
 *
 * FSM Impact:
 *   - Does NOT reset silence timer (indicates absence of detections)
 *   - Does NOT trigger state transitions
 *   - Just confirms AI is alive
 *
 * Alternative Design:
 *   Could omit this and only send ai.detection with relevant=false,
 *   but explicit keepalive is clearer for monitoring.
 *
 * @property score - Always 0 (no detections)
 * @property detections - Always empty array
 * @property meta - Frame metadata (timestamp, sequence number)
 *
 * Consumed by:
 *   - Orchestrator (accepts but ignores)
 *   - Metrics (AI processing rate)
 *   - Health checks (AI liveness)
 */
export type AIKeepaliveEvent = {
  type: "ai.keepalive";
  score: number;
  detections: Detection[];
  meta: FrameMeta;
};

export type AIEvents = AIDetectionEvent | AIKeepaliveEvent;

// ==================== Stream Events ====================
// Publisher lifecycle events (RTSP → MediaMTX)
// NOTE: These events are RESERVED for future implementation.

/**
 * stream.start - Publisher Started Streaming (RESERVED)
 *
 * Current Status: NOT IMPLEMENTED - Publisher does not emit this event yet.
 *
 * Future Purpose:
 *   Emit when RTSP publisher successfully starts (pipeline state=PLAYING).
 *   Indicates stream is available on MediaMTX.
 *
 * Reservado para versiones futuras.
 *
 * @property reason - Start reason (e.g., "session_active", "manual_start")
 */
export type StreamStartEvent = {
  type: "stream.start";
  reason?: string;
};

/**
 * stream.stop - Publisher Stopped Streaming (RESERVED)
 *
 * Current Status: NOT IMPLEMENTED - Publisher does not emit this event yet.
 *
 * Future Purpose:
 *   Emit when RTSP publisher stops stream (normal shutdown).
 *
 * Reservado para versiones futuras.
 *
 * @property reason - Stop reason (e.g., "session_ended", "shutdown", "error")
 */
export type StreamStopEvent = {
  type: "stream.stop";
  reason?: string;
};

/**
 * stream.error - Publisher Error (RESERVED)
 *
 * Current Status: NOT IMPLEMENTED - Publisher does not emit this event yet.
 *
 * Future Purpose:
 *   Emit when fatal error occurs in RTSP streaming pipeline.
 *   Enables retry logic or alert notifications.
 *
 * Reservado para versiones futuras.
 *
 * @property module - Module that generated error (e.g., "publisher", "gstreamer")
 * @property error - Error message or description
 */
export type StreamErrorEvent = {
  type: "stream.error";
  module: string;
  error: string;
};

export type StreamEvents =
  | StreamStartEvent
  | StreamStopEvent
  | StreamErrorEvent;

// ==================== Session Events ====================
// Recording session lifecycle events (Session Store API)

/**
 * session.open - Session Started
 *
 * Emitted when new recording session is created in Session Store.
 *
 * Flow:
 *   1. FSM transitions to ACTIVE state
 *   2. Orchestrator executes OpenSession command
 *   3. SessionStore HTTP client POSTs to /sessions
 *   4. Store returns { sessionId, startTs }
 *   5. SessionStore client emits bus.publish("session.open", { ... })
 *   6. Orchestrator receives event, saves sessionId in FSM context
 *
 * Why Async Event?
 *   - OpenSession is HTTP call (async operation)
 *   - FSM is pure (can't wait for response)
 *   - Command triggers async operation
 *   - Event delivers result back to FSM
 *
 * @property sessionId - Unique session ID (e.g., "sess_1728123456_1")
 * @property startTs - ISO timestamp when session started (e.g., "2025-10-05T12:00:00.000Z")
 *
 * Consumed by:
 *   - Orchestrator (saves sessionId in FSM context)
 *   - Logging (session lifecycle tracking)
 */
export type SessionOpenEvent = {
  type: "session.open";
  sessionId: string;
  startTs: string;
};

/**
 * session.close - Session Closed
 *
 * Emitted when recording session is closed in Session Store.
 *
 * Flow:
 *   1. FSM transitions to IDLE state (from CLOSING)
 *   2. Orchestrator executes CloseSession command
 *   3. SessionStore HTTP client PATCHes /sessions/:id
 *   4. Store marks session as closed with endTs
 *   5. SessionStore client emits bus.publish("session.close", { ... })
 *
 * Note: Unlike session.open, sessionId is already known (from FSM context).
 *
 * @property sessionId - Session ID that was closed
 * @property endTs - ISO timestamp when session ended
 *
 * Consumed by:
 *   - Logging (session lifecycle tracking)
 *   - Metrics (session duration)
 */
export type SessionCloseEvent = {
  type: "session.close";
  sessionId: string;
  endTs: string;
};

export type SessionEvents = SessionOpenEvent | SessionCloseEvent;

// ==================== FSM Timer Events (Internal) ====================
// Timer expiration events (emitted by Orchestrator timer management)

/**
 * fsm.t.dwell.ok - Confirmation Window Timer Expired
 *
 * Emitted when dwell timer expires (CONFIG.fsm.dwellMs).
 *
 * Purpose:
 *   - Confirms detections persisted during confirmation window
 *   - Prevents false positives from brief detections
 *   - Fixed duration (does NOT reset with new detections)
 *
 * Flow:
 *   1. FSM enters DWELL state
 *   2. Orchestrator starts dwell timer (CONFIG.fsm.dwellMs)
 *   3. Timer expires after fixed duration
 *   4. Orchestrator emits bus.publish("fsm.t.dwell.ok")
 *   5. FSM receives event, transitions DWELL → ACTIVE
 *
 * Consumed by: FSM (state transition trigger)
 */
export type FSMTimerDwellEvent = {
  type: "fsm.t.dwell.ok";
};

/**
 * fsm.t.silence.ok - Silence Timer Expired
 *
 * Emitted when silence timer expires (CONFIG.fsm.silenceMs).
 *
 * Purpose:
 *   - Detects end of activity (no relevant detections)
 *   - Triggers transition to post-roll
 *   - Timer resets with each relevant detection
 *
 * Flow:
 *   1. FSM in ACTIVE state
 *   2. Orchestrator maintains silence timer
 *   3. ai.detection (relevant=true) → reset timer
 *   4. ai.keepalive → timer continues (no reset)
 *   5. Timer expires after CONFIG.fsm.silenceMs without relevant detection
 *   6. Orchestrator emits bus.publish("fsm.t.silence.ok")
 *   7. FSM receives event, transitions ACTIVE → CLOSING
 *
 * Consumed by: FSM (state transition trigger)
 */
export type FSMTimerSilenceEvent = {
  type: "fsm.t.silence.ok";
};

/**
 * fsm.t.postroll.ok - Post-Roll Timer Expired
 *
 * Emitted when post-roll timer expires (CONFIG.fsm.postRollMs).
 *
 * Purpose:
 *   - Ends extra recording after last detection
 *   - Captures complete event context (e.g., car exiting frame)
 *   - Fixed duration (does NOT reset)
 *
 * Flow:
 *   1. FSM in CLOSING state
 *   2. Orchestrator starts post-roll timer (CONFIG.fsm.postRollMs)
 *   3. Timer expires after fixed duration
 *   4. Orchestrator emits bus.publish("fsm.t.postroll.ok")
 *   5. FSM receives event, transitions CLOSING → IDLE
 *   6. Session closes, stream stops
 *
 * Reactivation:
 *   - If ai.detection (relevant=true) during CLOSING → cancel timer
 *   - FSM transitions CLOSING → ACTIVE (extends session)
 *
 * Consumed by: FSM (state transition trigger)
 */
export type FSMTimerPostRollEvent = {
  type: "fsm.t.postroll.ok";
};

export type FSMTimerEvents =
  | FSMTimerDwellEvent
  | FSMTimerSilenceEvent
  | FSMTimerPostRollEvent;

// ==================== Union of All Events ====================

/**
 * AllEvents - Union Type of All System Events
 *
 * Used by:
 *   - FSM reduce() function (accepts any event)
 *   - Event bus subscribe(topic, handler) for wildcard subscriptions
 *   - Logging/metrics that track all events
 */
export type AllEvents =
  | AIEvents
  | StreamEvents
  | SessionEvents
  | FSMTimerEvents;

// ==================== Topic Registry ====================

/**
 * TopicMap - Maps Topic Names to Event Types
 *
 * Enables type-safe publish/subscribe:
 *
 * ```typescript
 * // TypeScript infers AIDetectionEvent from topic name
 * bus.publish("ai.detection", { ... }); // Type-checked!
 *
 * // TypeScript infers event parameter type
 * bus.subscribe("ai.detection", (event) => {
 *   // event is AIDetectionEvent
 * });
 * ```
 *
 * How it works:
 *   - EventOf<T> extracts event type from topic name
 *   - Bus implementation uses this for type safety
 *   - Compile error if topic doesn't exist
 *   - Compile error if event shape doesn't match
 */
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

/**
 * KnownTopic - All Valid Topic Names
 *
 * Type alias for topic name autocomplete.
 */
export type KnownTopic = keyof TopicMap;

/**
 * EventOf<T> - Extract Event Type from Topic Name
 *
 * Type utility for type-safe event bus operations.
 *
 * @example
 * ```typescript
 * type DetectionEvent = EventOf<"ai.detection">; // AIDetectionEvent
 * type KeepaliveEvent = EventOf<"ai.keepalive">; // AIKeepaliveEvent
 * ```
 */
export type EventOf<T extends KnownTopic> = TopicMap[T];
