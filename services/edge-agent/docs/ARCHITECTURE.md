# Edge Agent - Arquitectura

Este documento resume el diseño actual del servicio y cómo interactúan sus módulos. El objetivo es ser preciso y breve.

## Estructura del Proyecto

```
src/
├── app/
│   └── main.ts                 # Composition root y wiring
├── config/
│   ├── schema.ts               # Tipos de configuración
│   └── index.ts                # Carga/validación de CONFIG
├── core/
│   ├── bus/                    # Event Bus tipado + backpressure
│   │   ├── events.ts
│   │   └── bus.ts
│   └── orchestrator/           # FSM pura + ejecución de comandos
│       ├── types.ts
│       ├── fsm.ts
│       └── orchestrator.ts
├── modules/
│   ├── video/
│   │   ├── ports/camera-hub.ts
│   │   └── adapters/gstreamer/
│   │       ├── camera-hub-gst.ts       # RTSP/V4L2 → I420 → SHM
│   │       └── nv12-capture-gst.ts     # SHM → NV12/I420 frames
│   ├── ai/
│   │   ├── ports/ai-engine.ts          # Contrato de IA (setModel, setSessionId)
│   │   ├── client/ai-client-tcp.ts     # TCP + Protobuf (worker externo)
│   │   ├── feeder/ai-feeder.ts         # Coordinación de frames + backpressure
│   │   └── ingest/frame-ingester.ts    # POST /ingest al Session Store
│   ├── streaming/
│   │   ├── ports/publisher.ts
│   │   └── adapters/gstreamer/media-mtx-on-demand-publisher-gst.ts
│   └── store/
│       ├── ports/session-store.ts
│       └── adapters/http/session-store-http.ts
├── media/
│   ├── gstreamer.ts            # Builders de pipelines
│   └── encoder.ts              # Selección de encoder H.264
├── shared/
│   ├── logging.ts              # Logger estructurado
│   └── metrics.ts              # Métricas en memoria
└── types/
    └── detections.ts           # Tipos comunes de detección
```

## Principios Clave

- FSM pura y testeable: `reduce(ctx, event) -> { ctx, commands }` sin side-effects.
- Commands explícitos y mínimos: `StartStream`, `StopStream`, `OpenSession`, `CloseSession`, `SetAIFpsMode`.
- Event Bus tipado con backpressure por tópico (1024 eventos en vuelo).
- Un único hub de video (SHM I420) para múltiples consumidores (Publisher y Captura AI).
- Ingesta de detecciones fuera del Orchestrator vía `FrameIngester` en `main.ts`.

## Máquina de Estados (FSM)

Estados:
- IDLE → DWELL → ACTIVE → CLOSING → IDLE

Eventos relevantes:
- `ai.detection` (relevant=true)
- `ai.keepalive` (sin detecciones relevantes)
- Timers internos: `fsm.t.dwell.ok`, `fsm.t.silence.ok`, `fsm.t.postroll.ok`
- `session.open` y `session.close`

Transiciones clave:
- IDLE → DWELL con `ai.detection` relevante
- DWELL → ACTIVE con `fsm.t.dwell.ok` (ventana fija, no se resetea)
- ACTIVE → CLOSING con `fsm.t.silence.ok` (inactividad)
- CLOSING → IDLE con `fsm.t.postroll.ok`
- Re-activación: CLOSING → ACTIVE ante `ai.detection` relevante (misma sesión)

Commands por transición:
- DWELL → ACTIVE: `StartStream`, `OpenSession`, `SetAIFpsMode('active')`
- ACTIVE → CLOSING: `SetAIFpsMode('idle')`
- CLOSING → IDLE: `StopStream`, `CloseSession`

Notas de timers:
- DWELL: periodo fijo; no se resetea con nuevas detecciones.
- ACTIVE: el timer de silencio se resetea solo con `ai.detection` relevante (no con `ai.keepalive`).

## Flujo de Datos

Video:
- CameraHubGst publica I420 en SHM (`/dev/shm/...`).
- NV12CaptureGst lee de SHM y entrega frames NV12/I420 al `AIFeeder`.
- PublisherGst lee de SHM y publica RTSP a MediaMTX bajo demanda (ACTIVE/CLOSING).

IA y Ingesta:
- `AIFeeder` aplica backpressure (ventana + latest-wins) y envía frames al worker vía `AIClientTcp`.
- `main.ts` recibe resultados, filtra por clases configuradas y publica al Bus:
  - `ai.detection` si hay clases relevantes
  - `ai.keepalive` si no hay detecciones relevantes
- Si existe `sessionId` activo, `main.ts` usa `FrameIngester` para enviar NV12 + detecciones al Session Store.

## Configuración Principal

Ver `config.toml` en el root del servicio. Secciones principales:
- **video**: `source_kind`, `source_uri`, `width/height`, `fps_hub`, `socket_path`, `shm_size_mb`
- **ai**: `worker_host/port`, `model_name`, `width/height`, `classes_filter`, `fps_idle/active`, `frame_cache_ttl_ms`
- **fsm**: `dwell_ms`, `silence_ms`, `postroll_ms`
- **mediamtx**: `host/port/path`
- **store**: `base_url`, `batch_max`, `flush_interval_ms`
- **logging**: `level` (debug|info|warn|error)

## Desarrollo rápido

```bash
cd services/edge-agent
npm install
npm run dev   # LOG_LEVEL=info recomendado
```

## Protocolo v1

- Implementación y detalles: [PROTOCOL_V1_IMPLEMENTATION.md](PROTOCOL_V1_IMPLEMENTATION.md)
- Guía rápida de puesta en marcha: [PROTOCOL_V1_QUICKSTART.md](PROTOCOL_V1_QUICKSTART.md)