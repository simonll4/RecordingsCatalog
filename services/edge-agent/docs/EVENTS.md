# Bus de Eventos y Tópicos

Resumen de los tópicos del Bus, quién los emite/consume y su efecto en la FSM.

## Objetivos del Bus
- Desacoplar módulos usando pub/sub tipado.
- Controlar backpressure (límite por tópico) para evitar OOM.
- Proveer métricas simples de tráfico.

Implementación: `src/core/bus/bus.ts`. Tipos: `src/core/bus/events.ts`.

## Tópicos

AI
- `ai.detection`
  - Emite: `main.ts` tras filtrar por clases configuradas.
  - Consume: Orchestrator (FSM).
  - Semántica: “Frame con detecciones relevantes”. Incluye `relevant=true`, `score`, `detections[]`, `meta`.

- `ai.keepalive`
  - Emite: `main.ts` cuando no hay detecciones relevantes.
  - Consume: Orchestrator (FSM).
  - Semántica: “AI vivo pero sin detecciones relevantes”. No resetea el timer de silencio.

FSM (internos)
- `fsm.t.dwell.ok` – Emite Orchestrator al expirar ventana de confirmación (DWELL → ACTIVE)
- `fsm.t.silence.ok` – Emite Orchestrator al expirar silencio (ACTIVE → CLOSING)
- `fsm.t.postroll.ok` – Emite Orchestrator al finalizar post-roll (CLOSING → IDLE)

Sesiones
- `session.open` – Emite Orchestrator tras abrir en Session Store. FSM guarda `sessionId`.
- `session.close` – Emite Orchestrator tras cerrar en Session Store.

Stream (reservado)
- `stream.start|stop|error` – Reservados para Publisher futuro (no implementados).

## Flujo FSM resumido

1) `ai.detection` relevante → IDLE → DWELL (arranca dwell fijo)
2) `fsm.t.dwell.ok` → DWELL → ACTIVE + comandos: `StartStream`, `OpenSession`, `SetAIFpsMode('active')`
3) En ACTIVE:
   - `ai.detection` relevante mantiene sesión (resetea silencio desde Orchestrator)
   - `ai.keepalive` no resetea silencio
   - La ingesta de frames + detecciones la realiza `FrameIngester` en `main.ts` si hay `sessionId`
4) `fsm.t.silence.ok` → ACTIVE → CLOSING + `SetAIFpsMode('idle')`
5) `fsm.t.postroll.ok` → CLOSING → IDLE + `StopStream` + `CloseSession`
6) Re-activación: detección relevante durante CLOSING → CLOSING → ACTIVE (misma sesión)

## Convenciones
- Prefijos por dominio: `ai.*`, `session.*`, `stream.*`, `fsm.t.*`.
- `fsm.t.*`: la `t` denota “timer”; sufijo `.ok` indica expiración.
- Tipos definidos en `src/core/bus/events.ts` son la fuente única de verdad.

## Backpressure y métricas
- Límite: 1024 eventos en vuelo por tópico. `publish()` devuelve `false` si se droppea.
- Métricas: `bus_publish_total{topic=...}`, `bus_drops_total{topic=...}`, `fsm_transitions_total{from,to}`.

## Extender
1) Agregar tipos en `src/core/bus/events.ts` (TopicMap).
2) Publicar con `bus.publish(topic, event)` y suscribir con `bus.subscribe(topic, handler)`.
3) Si afecta la FSM, actualizar `src/core/orchestrator/fsm.ts` y `orchestrator.ts`.
