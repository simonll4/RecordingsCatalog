# Edge Agent

Sistema de captura y análisis de video basado en eventos, optimizado para baja latencia y resiliencia. Usa GStreamer + SHM (memoria compartida) como hub de video y una FSM (Orchestrator) para coordinar AI, streaming RTSP y persistencia de sesiones y detecciones.

## Tabla de Contenidos
- Visión General
- Arquitectura y Componentes
- Modelo de Eventos (Bus + FSM)
- Pipelines de GStreamer
- Configuración (Variables de Entorno)
- Puesta en Marcha (Local / Docker)
- Operación (Logging, Métricas)
- Solución de Problemas (Troubleshooting)
- Extensión (IA real, nuevos eventos)
- Referencias

## Visión General
- Estados: IDLE → DWELL → ACTIVE → CLOSING → IDLE (timers configurables)
- Bus de eventos tipado con backpressure por tópico
- Un único hub SHM I420 (WxH @ fpsHub) para múltiples consumidores
- Streaming RTSP bajo demanda hacia MediaMTX (encoder auto‑detectado)
- Motor de IA simulada listo para sustituir por IA real
- Batching + retry de detecciones hacia Session Store
- Logging estructurado y métricas simples integradas

## Arquitectura y Componentes
- Diagrama: `docs/GRAFICO.md`
- Diseño: `docs/ARCHITECTURE.md`
- Eventos: `docs/EVENTS.md`

Componentes principales:
- Camera Hub (`src/modules/camera-hub.ts`)
  - Ingesta desde `v4l2src` o `rtspsrc`, decodifica/convierte a `I420 @ WxH`, y publica en `shmsink`.
  - Criterio de readiness AND (pipeline PLAYING + socket SHM presente).
  - Auto‑fallback V4L2 MJPEG → RAW ante negociación fallida.
  - Auto‑restart con backoff, limpieza de socket y logs filtrados.

- AI Capture (`src/modules/ai-capture.ts`)
  - `shmsrc → videorate → videoconvert/videoscale → RGB @ AI_WxH → fdsink(stdout)`.
  - Modo dual‑rate (`idle/active`) controlado por Orchestrator.
  - Entrega frames a IA mediante callback `onFrame(frame, meta)`.
  - Limita buffer (máx. 3 frames) y auto‑restart con backoff.

- AI Engine (`src/modules/ai-engine-tcp.ts`)
  - Cliente TCP que se comunica con worker de IA (Python) via Protobuf.
  - Publica `ai.detection` (relevante/no relevante) y `ai.keepalive`.
  - Filtra detecciones por umbral de confianza y clases configuradas.
  - Interfaz estable: `setModel(opts)`, `run(frame, meta)`.
  - Sistema de backpressure para evitar saturar el worker.

- Publisher (`src/modules/publisher.ts`)
  - `shmsrc → encoder (auto) → rtspclientsink` hacia MediaMTX.
  - Detecta encoder disponible (CPU/GPU), start/stop idempotente.

- Session Store (`src/modules/session-store.ts`)
  - Abre/cierra sesión y persiste lotes de detecciones (batch + flush interval).

- Orchestrator + FSM (`src/core/orchestrator/*.ts`)
  - FSM pura genera comandos (side effects) y el Orchestrator los ejecuta.
  - Gestiona timers `dwell`, `silence` y `postroll` que reinyectan eventos.
  - Controla `SetAIFpsMode(idle/active)` y el ciclo de vida del publisher/sesiones.

## Modelo de Eventos (Bus + FSM)
- Bus: `src/core/bus/bus.ts`, tipos en `src/core/bus/events.ts`.
- Tópicos inter‑módulo: `ai.detection`, `ai.keepalive`, `session.open`, `session.close` (y futuros `stream.*`).
- Tópicos internos de FSM: `fsm.t.dwell.ok`, `fsm.t.silence.ok`, `fsm.t.postroll.ok` (solo Orchestrator).
- Flujo resumido:
  1) `ai.detection` relevante → IDLE → DWELL (arma dwell timer)
  2) `fsm.t.dwell.ok` → DWELL → ACTIVE + comandos: `StartStream`, `OpenSession`, `SetAIFpsMode('active')`
  3) En ACTIVE: `ai.*` resetea silencio y hace `AppendDetections` si hay `sessionId`
  4) `fsm.t.silence.ok` → ACTIVE → CLOSING + `SetAIFpsMode('idle')`
  5) `fsm.t.postroll.ok` → CLOSING → IDLE + `StopStream` + `CloseSession`
- Detalle completo: `docs/EVENTS.md`.

## Pipelines de GStreamer
- Ingesta (hub SHM): `src/media/gstreamer.ts:buildIngest()`
  - RTSP: `rtspsrc ! depay ! parse ! avdec_h264 ! videoconvert ! videoscale ! video/x-raw,format=I420,width=WxH,framerate=fpsHub/1 ! shmsink`
  - V4L2: `v4l2src ! (mjpeg|raw) ! jpegdec? ! videoconvert ! videoscale ! videorate ! video/x-raw,format=I420,width=WxH,framerate=fpsHub/1 ! shmsink`
  - Notas: `sync=true` en `shmsink` para mantener timestamps; `queue` leaky para backpressure.

- Captura IA: `src/media/gstreamer.ts:buildCapture()`
  - `shmsrc ! caps I420 WxH @ fpsHub ! queue(leaky) ! videorate → fps AI ! videoconvert/videoscale → RGB @ AI_WxH ! fdsink(fd=1)`
  - Notas: videorate antes de conversiones para ahorrar CPU; frames RGB salen por stdout del proceso gst.

- Publicación RTSP: `src/media/gstreamer.ts:buildPublish()`
  - `shmsrc ! caps I420 WxH @ fpsHub ! videoconvert ! encoder(h264) ! parse ! rtspclientsink(location=rtsp://... path)`
  - Encoder auto‑detectado (`src/media/encoder.ts`).

Requisitos I420: `SOURCE_WIDTH` y `SOURCE_HEIGHT` deben ser pares (YUV420 planar). El tamaño de SHM debe considerar al menos ~50 frames de I420 para fluidez.

## Configuración (Variables de Entorno)

Ver `.env.example` para configuración completa con comentarios detallados.

**Variables principales:**

```bash
# ============================================================================
# LOGGING
# ============================================================================
LOG_LEVEL=info              # debug | info | warn | error

# ============================================================================
# DEVICE IDENTIFICATION
# ============================================================================
DEVICE_ID=cam-local

# ============================================================================
# VIDEO SOURCE (Camera)
# ============================================================================
SOURCE_KIND=v4l2            # v4l2 | rtsp
SOURCE_URI=/dev/video0      # /dev/videoN | rtsp://ip:port/path
SOURCE_WIDTH=1280           # Debe ser par (I420)
SOURCE_HEIGHT=720           # Debe ser par (I420)
SOURCE_FPS_HUB=15
SOURCE_SOCKET_PATH=/dev/shm/cam_raw.sock
SOURCE_SHM_SIZE_MB=128

# ============================================================================
# AI WORKER
# ============================================================================
AI_WORKER_HOST=localhost    # worker-ai para Docker
AI_WORKER_PORT=7001
AI_MODEL_NAME=yolov8n.onnx
AI_UMBRAL=0.8               # 0.0 - 1.0
AI_WIDTH=640
AI_HEIGHT=640
AI_CLASSES_FILTER=person    # Clases COCO, separadas por comas
AI_FPS_IDLE=5
AI_FPS_ACTIVE=12

# ============================================================================
# MEDIAMTX (RTSP Server)
# ============================================================================
MEDIAMTX_HOST=localhost
MEDIAMTX_PORT=8554
MEDIAMTX_PATH=cam-local

# ============================================================================
# FSM (Timers en ms)
# ============================================================================
FSM_DWELL_MS=500            # Ventana de confirmación
FSM_SILENCE_MS=3000         # Timeout sin detecciones
FSM_POSTROLL_MS=5000        # Grabación post-detección

# ============================================================================
# SESSION STORE
# ============================================================================
STORE_BASE_URL=http://localhost:8080
STORE_BATCH_MAX=50
STORE_FLUSH_INTERVAL_MS=250
```

**Notas de configuración:**
- `SOURCE_WIDTH/HEIGHT` deben ser pares para I420
- I420 frame bytes ≈ `W*H*1.5`
- SHM recomendado: `~50*frameBytes` en MB
- `AI_CLASSES_FILTER`: Ver lista completa de 80 clases COCO en `.env.example`
- Para Docker: usar hostnames de servicios (ej: `worker-ai`, `mediamtx`)

## Puesta en Marcha
Prerrequisitos: Node.js 20+, GStreamer 1.0+ (plugins base/good/bad/libav). MediaMTX y Session Store disponibles (ver Docker Compose).

Local (dev):
```
cd services/edge-agent
npm install
npm run dev
```

Producción (local):
```
npm run build
npm start
```

Docker Compose (stack completo):
```
# En la raíz del repo
docker compose up -d postgres mediamtx session-store
docker compose --profile edge up --build edge-agent
```

Ver stream:
```
vlc rtsp://localhost:8554/cam-local
# o
ffplay rtsp://localhost:8554/cam-local
```

Uso con cámara física (Docker): montar `/dev/video*` y otorgar grupo `video` (ver `docker-compose.yml`, sección `edge-agent`).

## Operación
- Logging: nivel configurable `LOG_LEVEL`. Filtra warnings ruidosos de GStreamer conocidos.
- Métricas: contadores en memoria (Prometheus‑style) accesibles desde código (`src/shared/metrics.ts`).
- Backpressure: el Bus limita 1024 eventos en vuelo por tópico (drop controlado + métricas).

## Solución de Problemas
- Caps negotiation failed (V4L2): se auto‑intenta fallback RAW; si persiste, ajustar `SOURCE_WIDTH/HEIGHT` o plugins de GStreamer.
- SHM insuficiente: incrementar `SOURCE_SHM_SIZE_MB` (cálculo arriba).
- RTSP no disponible: verificar MediaMTX en `:8554` y `MEDIAMTX_*`.
- Permisos de cámara: asegurar acceso a `/dev/video0` y grupo `video` en Docker.
- Falta de plugins: instalar `gstreamer1.0-plugins-{base,good,bad,ugly}` y `libav` según distro.

## Extensión

### Nuevos eventos
- Definir tipos en `src/core/bus/events.ts`
- Publicar con `bus.emit('topic', event)`
- Si afecta FSM, manejar en `src/core/orchestrator/fsm.ts`

### Encoder GPU
- Ampliar `src/media/encoder.ts` con detección de:
  - `nvh264enc` (NVIDIA)
  - `vaapih264enc` (Intel/AMD)
  - `v4l2h264enc` (hardware genérico)

### Nuevos módulos
- Implementar interfaz correspondiente (ver módulos existentes)
- Registrar en `Orchestrator` adapters
- Comunicar vía Bus de eventos

## Referencias
- Diagrama: `services/edge-agent/docs/GRAFICO.md`
- Arquitectura: `services/edge-agent/docs/ARCHITECTURE.md`
- Eventos: `services/edge-agent/docs/EVENTS.md`
- Pipelines: `services/edge-agent/src/media/gstreamer.ts`
- FSM: `services/edge-agent/src/core/orchestrator/fsm.ts`
- Orchestrator: `services/edge-agent/src/core/orchestrator/orchestrator.ts`
- Bus: `services/edge-agent/src/core/bus/bus.ts` y `services/edge-agent/src/core/bus/events.ts`
- Módulos: `services/edge-agent/src/modules/*`

