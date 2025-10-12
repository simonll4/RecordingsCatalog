# Edge Agent

Sistema de captura y análisis de video basado en eventos, optimizado para baja latencia y resiliencia. Usa GStreamer + SHM (memoria compartida) como hub de video y una FSM (Orchestrator) para coordinar AI, streaming RTSP y persistencia de sesiones y detecciones.

## 📚 Documentación Rápida

### Guías de Desarrollo
| Documento | Descripción |
|-----------|-------------|
| [STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | 🎨 Convenciones de estilo y mejores prácticas |
| [CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) | 📋 Organización del código |

### Arquitectura y Sistema
| Documento | Descripción |
|-----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 🏗️ Arquitectura del sistema |
| [EVENTS.md](docs/EVENTS.md) | 📡 Sistema de eventos |
| [ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md) | 📊 Diagrama visual |

### Implementación Técnica
| Documento | Descripción |
|-----------|-------------|
| [PROTOCOL_V1_IMPLEMENTATION.md](docs/PROTOCOL_V1_IMPLEMENTATION.md) | 🔌 Protocolo binario v1 (AI worker) |
| [PROTOCOL_V1_QUICKSTART.md](docs/PROTOCOL_V1_QUICKSTART.md) | 🚀 Guía rápida del protocolo v1 |

### Troubleshooting y Planificación
| Documento | Descripción |
|-----------|-------------|
| [LOGGING.md](docs/LOGGING.md) | 🪵 Sistema de logging |
| [FUTURE_FEATURES.md](docs/FUTURE_FEATURES.md) | 🔮 Funcionalidades planificadas |

---

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
- Motor de IA externo (worker-ai) vía Protocolo v1 (NV12/I420), sin simulación
- Batching + retry de detecciones hacia Session Store
- Logging estructurado y métricas simples integradas

## Arquitectura y Componentes
- Diseño: `docs/ARCHITECTURE.md`
- Eventos: `docs/EVENTS.md`

Componentes principales (implementación actual):
- Camera Hub (`src/modules/video/adapters/gstreamer/camera-hub-gst.ts`)
  - RTSP/V4L2 → I420 @ WxH → `shmsink` (socket SHM)
  - Criterio de readiness AND (pipeline PLAYING + socket presente)
  - Fallback V4L2 MJPEG → RAW si negoc. falla; auto‑restart con backoff

- NV12 Capture (`src/modules/video/adapters/gstreamer/nv12-capture-gst.ts`)
  - `shmsrc → videorate → scale/convert → NV12/I420 @ AI_WxH → fdsink(stdout)`
  - Entrega frames + metadatos de planos para protocolo v1 (AIFeeder)

- AI Client + Feeder
  - `AIClientTcp` (`src/modules/ai/client/ai-client-tcp.ts`): TCP + Protobuf
  - `AIFeeder` (`src/modules/ai/feeder/ai-feeder.ts`): sliding window + latest‑wins; frame cache

- Publisher (`src/modules/streaming/adapters/gstreamer/publisher-gst.ts`)
  - `shmsrc → encoder(H.264) → rtspclientsink` hacia MediaMTX
  - Encoder auto‑detectado (`src/media/encoder.ts`)

- Session Store (`src/modules/store/adapters/http/session-store-http.ts`)
  - Abre/cierra sesiones; la ingesta de detecciones la realiza `FrameIngester`

- Orchestrator + FSM (`src/core/orchestrator/*.ts`)
  - FSM pura genera comandos; Orchestrator ejecuta side effects
  - Timers: `dwell` (fijo), `silence`, `postroll`
  - Control: `SetAIFpsMode(idle/active)`, `Start/StopStream`, `Open/CloseSession`

## Modelo de Eventos (Bus + FSM)
- Bus: `src/core/bus/bus.ts`, tipos en `src/core/bus/events.ts`.
- Tópicos: `ai.detection`, `ai.keepalive`, `session.open`, `session.close` (y futuros `stream.*`).
- Timers FSM: `fsm.t.dwell.ok`, `fsm.t.silence.ok`, `fsm.t.postroll.ok`.
- Flujo resumido:
  1) `ai.detection` relevante → IDLE → DWELL (timer fijo)
  2) `fsm.t.dwell.ok` → DWELL → ACTIVE + comandos: `StartStream`, `OpenSession`, `SetAIFpsMode('active')`
  3) En ACTIVE: solo `ai.detection` relevante resetea silencio; `ai.keepalive` NO resetea
     - La ingesta de frames + detecciones corre en `main.ts` con `FrameIngester`
  4) `fsm.t.silence.ok` → ACTIVE → CLOSING + `SetAIFpsMode('idle')`
  5) `fsm.t.postroll.ok` → CLOSING → IDLE + `StopStream` + `CloseSession`
  6) Re‑activación: detección relevante durante CLOSING → vuelve a ACTIVE (misma sesión)
  
Detalle: `docs/EVENTS.md`.

## Pipelines de GStreamer
- Ingesta (hub SHM): `src/media/gstreamer.ts:buildIngest()`
  - RTSP: `rtspsrc ! depay ! parse ! avdec_h264 ! videoconvert ! videoscale ! video/x-raw,format=I420,width=WxH,framerate=fpsHub/1 ! shmsink`
  - V4L2: `v4l2src ! (mjpeg|raw) ! jpegdec? ! videoconvert ! videoscale ! videorate ! video/x-raw,format=I420,width=WxH,framerate=fpsHub/1 ! shmsink`
- Captura AI (NV12 v1): `src/modules/video/adapters/gstreamer/nv12-capture-gst.ts`
  - `shmsrc ! I420 WxH@fpsHub ! videorate → fpsAI ! videoscale/convert → NV12@AI_WxH ! fdsink(fd=1)`
- Publicación RTSP: `src/media/gstreamer.ts:buildPublish()`
  - `shmsrc ! I420 WxH@fpsHub ! videoconvert ! encoder(h264) ! parse ! rtspclientsink(location=rtsp://.../path)`

Requisitos I420: `SOURCE_WIDTH/HEIGHT` pares. SHM recomendado ≈ `50 * frameBytes`.

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
SOURCE_WIDTH=640            # Debe ser par (I420)
SOURCE_HEIGHT=480           # Debe ser par (I420)
SOURCE_FPS_HUB=15
SOURCE_SOCKET_PATH=/dev/shm/cam_raw.sock
SOURCE_SHM_SIZE_MB=50

# ============================================================================
# AI WORKER
# ============================================================================
AI_WORKER_HOST=localhost    # worker-ai para Docker
AI_WORKER_PORT=7001
AI_MODEL_NAME=models/yolov8n.onnx
AI_UMBRAL=0.4               # 0.0 - 1.0
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
- Arquitectura: `services/edge-agent/docs/ARCHITECTURE.md`
- Eventos: `services/edge-agent/docs/EVENTS.md`
- Pipelines: `services/edge-agent/src/media/gstreamer.ts`
- FSM: `services/edge-agent/src/core/orchestrator/fsm.ts`
- Orchestrator: `services/edge-agent/src/core/orchestrator/orchestrator.ts`
- Bus: `services/edge-agent/src/core/bus/bus.ts`
- Módulos: `services/edge-agent/src/modules/*`
