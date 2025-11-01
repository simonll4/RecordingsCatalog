# Edge Agent

Sistema de captura y análisis de video basado en eventos, optimizado para baja latencia y resiliencia. Usa GStreamer + SHM (memoria compartida) como hub de video y una FSM (Orchestrator) para coordinar AI, streaming RTSP y persistencia de sesiones y detecciones.

## 📚 Documentación Rápida

### Documentación

| Documento                                               | Descripción                         |
| ------------------------------------------------------- | ----------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | 🏗️ Visión general y flujo           |
| [ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md) | 📊 Diagrama visual                  |
| [EVENTS.md](docs/EVENTS.md)                             | 📡 Tópicos del bus                  |
| [PROTOCOL_V1.md](docs/PROTOCOL_V1.md)                   | 🔌 Protocolo v1 (resumen)           |
| [QUICKSTART.md](docs/QUICKSTART.md)                     | 🚀 Puesta en marcha                 |
| [OPERATIONS.md](docs/OPERATIONS.md)                     | 🛠️ Operación (logging, salud)       |

---

## Tabla de Contenidos

- Visión General
- Arquitectura y Componentes
- Modelo de Eventos (Bus + FSM)
- Pipelines de GStreamer
- Configuración (config.toml)
- Puesta en Marcha (Local / Docker)
- Operación (Logging, Métricas)
- Solución de Problemas (Troubleshooting)
- Extensión (IA real, nuevos eventos)
- Referencias

## Visión General

- Estados: IDLE → DWELL → ACTIVE → CLOSING → IDLE (timers configurables)
- Bus de eventos tipado con backpressure por tópico
- Hub SHM I420 (WxH @ fpsHub) desde cámaras RTSP para múltiples consumidores
- Streaming RTSP bajo demanda hacia MediaMTX (encoder auto-detectado)
- Motor de IA externo (worker-ai) vía Protocolo v1 (NV12/I420 RAW o JPEG)
- Reintentos de detecciones hacia Session Store
- Logging estructurado y métricas integradas

## Arquitectura y Componentes

- Diseño: `docs/ARCHITECTURE.md`
- Eventos: `docs/EVENTS.md`

Componentes principales (implementación actual):

- Camera Hub (`src/modules/video/adapters/gstreamer/camera-hub-gst.ts`)

  - RTSP → I420 @ WxH → `shmsink` (socket SHM)
  - Criterio de readiness AND (pipeline PLAYING + socket presente)
  - Auto-restart con exponential backoff en caso de falla

- NV12 Capture (`src/modules/video/adapters/gstreamer/nv12-capture-gst.ts`)

  - `shmsrc → videorate → scale/convert → NV12/I420 @ AI_WxH → fdsink(stdout)`
  - Entrega frames + metadatos de planos para protocolo v1 (AIFeeder)

- AI Client + Feeder

  - `AIClientTcp` (`src/modules/ai/client/ai-client-tcp.ts`): TCP + Protobuf
  - `AIFeeder` (`src/modules/ai/feeder/ai-feeder.ts`): sliding window + latest‑wins; frame cache

- Publishers (`src/modules/streaming/adapters/gstreamer/media-mtx-on-demand-publisher-gst.ts`)

  - Instancia controlada por FSM (grabación): `shmsrc → encoder(H.264) → rtspclientsink` @ `recordPath`
  - Instancia continua (live): mismo pipeline hacia `livePath` (origen para WebRTC)
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
  1. `ai.detection` relevante → IDLE → DWELL (timer fijo)
  2. `fsm.t.dwell.ok` → DWELL → ACTIVE + comandos: `StartStream`, `OpenSession`, `SetAIFpsMode('active')`
  3. En ACTIVE: solo `ai.detection` relevante resetea silencio; `ai.keepalive` NO resetea
     - La ingesta de frames + detecciones corre en `main.ts` con `FrameIngester`
  4. `fsm.t.silence.ok` → ACTIVE → CLOSING + `SetAIFpsMode('idle')`
  5. `fsm.t.postroll.ok` → CLOSING → IDLE + `StopStream` + `CloseSession`
  6. Re‑activación: detección relevante durante CLOSING → vuelve a ACTIVE (misma sesión)

Detalle: `docs/EVENTS.md`.

## Pipelines de GStreamer

- Ingesta (hub SHM): `src/media/gstreamer.ts:buildIngest()`
  - RTSP: `rtspsrc ! rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! videoscale ! video/x-raw,format=I420,width=WxH,framerate=fpsHub/1 ! shmsink`
- Captura AI (NV12 v1): `src/modules/video/adapters/gstreamer/nv12-capture-gst.ts`
  - `shmsrc ! I420 WxH@fpsHub ! videorate → fpsAI ! videoscale/convert → NV12@AI_WxH ! fdsink(fd=1)`
- Publicación RTSP: `src/media/gstreamer.ts:buildPublish()`
  - `shmsrc ! I420 WxH@fpsHub ! queue ! x264enc/openh264enc ! h264parse ! rtph264pay ! udpsink (unicast)`

Requisitos I420: `SOURCE_WIDTH/HEIGHT` pares. SHM recomendado ≈ `50 * frameBytes`.

## Configuración

El servicio se configura mediante `config.toml` ubicado en el root del servicio. Ver archivo completo para opciones avanzadas.

**Secciones principales:**

```toml
[logging]
level = "info"  # debug | info | warn | error

[device]
id = "cam-local"

[source]
kind = "rtsp"
uri = "rtsp://admin:password@192.168.1.82:554/Streaming/Channels/1"
width = 640              # Debe ser par (I420)
height = 480             # Debe ser par (I420)
fps_hub = 15
socket_path = "/dev/shm/cam_raw.sock"
shm_size_mb = 50

[ai]
worker_host = "localhost"  # Cambiar a "worker-ai" cuando el agente corra en Docker
worker_port = 7001
model_name = "/models/yolo11s-custom.onnx"
umbral = 0.5
width = 640
height = 640
classes_filter = "backpack,bottle,cup,person,shoes"  # Clases del catálogo, separadas por comas
fps_idle = 5
fps_active = 12

[mediamtx]
host = "localhost"
port = 8554
record_path = "cam-local"
live_path = "cam-local-live"

[fsm]
dwell_ms = 500      # Ventana de confirmación
silence_ms = 3000   # Timeout sin detecciones
postroll_ms = 5000  # Grabación post-detección

[status]
port = 7080         # Puerto del servidor HTTP de estado

[store]
base_url = "http://localhost:8080"
```

**Notas de configuración:**

- `width/height` deben ser pares para I420
- I420 frame bytes ≈ `W*H*1.5`
- SHM recomendado: `~50*frameBytes` en MB
- `classes_filter`: Debe coincidir con los nombres definidos en `class_catalog.json`. Puede sobreescribirse en caliente con `runtime-overrides.json` (creado por el manager) o mediante la variable `EDGE_AGENT_CLASSES_FILTER` cuando se ejecuta el runtime sin supervisor.
- `status.port`: Puerto HTTP (por defecto 7080) donde escucha el manager. El runtime interno expone `/status` en `status.port + 1` (7081 por defecto).
- Overrides rápidos:
  - `EDGE_AGENT_STATUS_PORT`: redefine el puerto que usa el runtime cuando corre standalone
  - `EDGE_AGENT_CHILD_STATUS_PORT`: redefine el puerto que el manager reserva para el runtime (fallback `status.port + 1`)
- **Hostnames según entorno**:
  - **Docker Compose**: usar nombres de servicios (`mediamtx`, `session-store`, `worker-ai`)
  - **Desarrollo local**: usar `localhost` o la IP del servicio externo

## Puesta en Marcha

Prerrequisitos: Node.js 20+, GStreamer 1.0+ (plugins base/good/bad/libav). MediaMTX y Session Store disponibles (ver Docker Compose).

Local (dev):

```bash
cd services/edge-agent
npm install
npm run dev          # Manager + runtime con recarga (ts-node-dev)
npm run dev:agent    # Ejecuta el runtime clásico directamente (sin supervisor)
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

### Manager HTTP API

- `GET http://localhost:7080/status` → snapshot combinado (`manager` + `agent`)
- `POST http://localhost:7080/control/start` → inicia el runtime (202)
- `POST http://localhost:7080/control/stop` → detiene el runtime (202)
- `GET http://localhost:7080/config/classes` → override actual, clases efectivas y defaults
- `PUT http://localhost:7080/config/classes` → `{ "classes": ["person", "car"] }` guarda override
- `GET http://localhost:7080/config/classes/catalog` → catálogo de clases expuesto en la UI

El manager persiste el override en `runtime-overrides.json` (en el root del servicio) y lo inyecta como variable al runtime durante el arranque.

**Nota:** Por defecto el supervisor _no_ inicia el agente automáticamente (`EDGE_AGENT_AUTOSTART=false`). Usá la pantalla *Control* o `POST /control/start` para lanzarlo; definí `EDGE_AGENT_AUTOSTART=true` si querés la semántica anterior.

Ver stream:

```
vlc rtsp://localhost:8554/cam-local
# o
ffplay rtsp://localhost:8554/cam-local
```

Configuración de red: Para cámaras RTSP en LAN, usar `network_mode: host` en Docker si hay problemas de alcanzabilidad (ver `docker-compose.yml`).

## Operación

- Logging: nivel configurable en `config.toml` → `[logging].level` (debug|info|warn|error). Filtra warnings ruidosos de GStreamer conocidos.
- Métricas: contadores en memoria (Prometheus‑style) accesibles desde código (`src/shared/metrics.ts`).
- Backpressure: el Bus limita 1024 eventos en vuelo por tópico (drop controlado + métricas).

## Solución de Problemas

- RTSP source no conecta: verificar URI, credenciales y alcanzabilidad de red de la cámara IP.
- SHM insuficiente: incrementar `shm_size_mb` en config.toml o `shm_size` en docker-compose.yml.
- RTSP publisher no disponible: verificar MediaMTX en `:8554` y sección `[mediamtx]` en config.toml.
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
  - `v4l2h264enc` (hardware genérico - **Nota**: es un encoder HW, no relacionado con cámaras USB/V4L2)

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
