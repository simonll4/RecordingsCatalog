# Edge Agent

Sistema inteligente de captura y análisis de video basado en eventos, con detección de objetos mediante IA y gestión automática de sesiones de grabación.

## 🎯 Características

- **FSM (Finite State Machine)**: Control de estados IDLE → ACTIVE → CLOSING
- **Detección de IA**: Análisis en tiempo real con YOLO (simulado actualmente)
- **Dual-rate FPS**: Ajuste automático según estado (5 fps idle, 8 fps activo)
- **Arquitectura SHM**: Pipeline optimizado con Shared Memory para mínima latencia
- **Streaming RTSP**: Publicación bajo demanda a MediaMTX con encoder GPU/CPU adaptativo
- **Gestión de Sesiones**: Apertura/cierre automático con post-roll y flush robusto
- **Batch de Detecciones**: Envío optimizado a Session Store con reintentos

## 🏗️ Arquitectura SHM

```
┌──────────────┐
│   Camera     │  Hub always-on (RTSP/V4L2 → I420)
│ (shmsink)    │─────┐
└──────────────┘     │
                     │ /dev/shm/cam_raw.sock
         ┌───────────┴─────────┐
         │                     │
    ┌────▼─────┐        ┌─────▼────┐
    │ Capture  │        │Publisher │
    │(shmsrc)  │        │(shmsrc)  │
    │ AI fps   │        │ RTSP out │
    └──────────┘        └──────────┘
```

**Beneficios:**
- 🚀 Menor latencia (sin copia TCP)
- 💾 Menor uso de memoria (colas con backpressure)
- ⚡ GPU encoding automático (nvh264enc/vaapih264enc/x264enc)

## 📁 Estructura

```
/src
  /infra          # Configuración y bus de eventos
  /core           # Orquestador (FSM)
  /modules        # Captura, Publisher, SessionIO, AI
  main.ts         # Bootstrap
```

Ver [ARCHITECTURE.md](./ARCHITECTURE.md) para diagramas detallados.

## 🚀 Quick Start

### 1. Configurar Variables de Entorno

Copia y edita `.env`:

```bash
# Dispositivo
EDGE_DEVICE_ID=cam-local

# Fuente de video (elige una)
SOURCE_KIND=rtsp  # o "v4l2"
SOURCE_RTSP=rtsp://192.168.1.100:554/stream1
# CAMERA_DEVICE=/dev/video0

# Captura (SHM Hub)
CAPTURE_SOCKET_PATH=/dev/shm/cam_raw.sock
CAPTURE_WIDTH=1280
CAPTURE_HEIGHT=720
CAPTURE_FPS=15
CAPTURE_SHM_SIZE_MB=128

# MediaMTX (RTSP output)
MEDIAMTX_HOST=mediamtx
MEDIAMTX_RTSP_PORT=8554
EDGE_STREAM_PATH=cam-local

# FSM
DWELL_MS=500
SILENCE_MS=3000
POST_ROLL_SEC=5

# IA (Dual-rate FPS)
AI_WIDTH=640
AI_HEIGHT=640
AI_FPS_IDLE=5      # FPS en estado IDLE
AI_FPS_ACTIVE=8    # FPS en estado ACTIVE
AI_UMBRAL=0.4
AI_CLASSES_FILTER=person,helmet

# Session Store
SESSION_STORE_URL=http://session-store:8080
SINK_BATCH_MS=500
SINK_MAX_ITEMS=50
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Ejecutar

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## 🔧 Requisitos

- **Node.js** 20+
- **GStreamer** 1.0+ con plugins (base, good, bad, libav)
- **MediaMTX** (streaming server RTSP)
- **Session Store** (API de sesiones y detecciones)

### Instalar GStreamer (Linux)

```bash
sudo apt-get install gstreamer1.0-tools \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-libav

# Opcional: GPU encoding (Intel)
sudo apt-get install gstreamer1.0-vaapi

# Opcional: GPU encoding (NVIDIA)
# Requiere drivers NVIDIA y gst-plugins-bad con nvcodec
```

### Verificar GStreamer

```bash
# Verificar plugins disponibles
gst-inspect-1.0 shmsink
gst-inspect-1.0 shmsrc
gst-inspect-1.0 nvh264enc    # NVIDIA
gst-inspect-1.0 vaapih264enc # Intel
gst-inspect-1.0 x264enc      # Software (siempre disponible)
```

## 📊 Flujo de Estados

```
IDLE (monitoring) → ACTIVE (recording) → CLOSING (post-roll) → IDLE
   AI: 5fps            AI: 8fps             AI: 8fps          AI: 5fps
   RTSP: off          RTSP: on             RTSP: on         RTSP: off
```

### Transiciones

- **IDLE → DWELL**: Objeto relevante detectado (arma ventana de confirmación)
- **DWELL → ACTIVE**: Keepalives suficientes en ventana (dwellMs=500ms)
- **DWELL → IDLE**: Sin keepalives en ventana (falsa alarma)
- **ACTIVE → CLOSING**: Timeout sin detecciones (silenceMs=3000ms)
- **CLOSING → IDLE**: Fin de post-roll (postRollSec=5s)

### Dual-rate FPS

El sistema ajusta automáticamente el FPS de procesamiento de IA:
- **IDLE**: 5 fps (ahorro de ~37% CPU)
- **ACTIVE/CLOSING**: 8 fps (mayor precisión)

- **IDLE → ACTIVE**: Objeto relevante detectado por IA
- **ACTIVE → CLOSING**: Timeout sin detecciones (SILENCE_MS)
- **CLOSING → IDLE**: Fin de post-roll (POST_ROLL_SEC)

## 🤖 Módulo de IA

Actualmente **simulado** para testing. Emite eventos:

- `ai.relevant-start`: Primera detección relevante
- `ai.keepalive`: Confirma presencia de objeto
- `ai.detections`: Detecciones con bbox y confianza

### Integración YOLO Real

Ver [ai-real.example.ts](./src/modules/ai-real.example.ts) para ejemplo completo con ONNX Runtime.

```bash
# Instalar runtime
npm install onnxruntime-node

# Descargar modelo
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx
mkdir models && mv yolov8n.onnx models/
```

## 📡 API Endpoints (Session Store)

El edge-agent se comunica con:

- `POST /sessions/open`: Abre sesión
- `POST /sessions/close`: Cierra sesión  
- `POST /detections`: Batch de detecciones

## 🔍 Verificación

### Ver Stream

```bash
# Con VLC
vlc rtsp://localhost:8554/cam-local

# Con ffplay
ffplay rtsp://localhost:8554/cam-local
```

### Ver Sesiones

```bash
curl http://localhost:8080/sessions
```

## 📚 Documentación

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Diagramas y flujo detallado
- [USAGE.md](./USAGE.md) - Guía de uso y troubleshooting
- [src/README.md](./src/README.md) - Documentación de código

## 🐳 Docker

```bash
# Build
docker build -t edge-agent .

# Run
docker run --rm \
  --device=/dev/video0 \
  --env-file .env \
  edge-agent
```

## 🧪 Testing

El sistema funciona en modo simulación:

1. Inicia en **IDLE** (AI: 5fps, hub: 15fps)
2. AI simula detecciones cada ~1.5s
3. Transiciona a **DWELL** → **ACTIVE** (AI: 8fps)
4. Publica stream a MediaMTX (GPU/CPU adaptativo)
5. Después de 3s sin detección → **CLOSING**
6. Graba 5s más (post-roll) → **IDLE** (AI vuelve a 5fps)

## 🔍 Debugging

### Ver Socket SHM

```bash
# Verificar que el socket existe
ls -lh /dev/shm/cam_raw.sock

# Monitorear uso de shared memory
df -h /dev/shm
```

### Logs de GStreamer

```bash
# Nivel de debug (0-5)
export GST_DEBUG=2  # WARNING (default)
export GST_DEBUG=3  # INFO
export GST_DEBUG=4  # DEBUG

# Debug específico de elementos
export GST_DEBUG=shmsink:5,shmsrc:5
```

### Test Pipeline Manual

```bash
# Test hub (RTSP → SHM)
gst-launch-1.0 rtspsrc location=rtsp://... protocols=tcp latency=100 ! \
  rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! videoscale ! \
  video/x-raw,format=I420,width=1280,height=720,framerate=15/1 ! \
  queue leaky=downstream max-size-buffers=1 ! \
  shmsink socket-path=/dev/shm/test.sock shm-size=134217728

# Test consumer (SHM → display)
gst-launch-1.0 shmsrc socket-path=/dev/shm/test.sock is-live=true ! \
  video/x-raw,format=I420,width=1280,height=720 ! videoconvert ! autovideosink
```

## 🛠️ Desarrollo

### Agregar Nuevo Módulo

1. Crear en `/src/modules/mi-modulo.ts`
2. Definir eventos en `/src/infra/bus.ts`
3. Conectar en `/src/core/orchestrator.ts`

### Logs de Debug

```typescript
console.log("[MiModulo]", "mensaje");
```

Prefijos actuales:
- `[Orchestrator]`: FSM y transiciones de estado
- `[camera]`: Hub SHM (always-on)
- `[ai-capture]`: Captura para IA (dual-rate FPS)
- `[publisher]`: Publisher RTSP (encoder adaptativo)
- `[SessionIO]`: Gestión de sesiones y detecciones
- `[AI]`: Detecciones y eventos de IA
- `[Main]`: Bootstrap y shutdown

## 🚧 Roadmap

- [x] Arquitectura FSM con eventos
- [x] Pipeline SHM para mínima latencia
- [x] Dual-rate FPS (idle/active) para eficiencia
- [x] Encoder GPU adaptativo (nvenc/vaapi/x264)
- [x] Captura GStreamer con backpressure controlado
- [x] Publisher on-demand a MediaMTX
- [x] Flush robusto con reintentos
- [x] Simulación de IA para testing
- [ ] Integración YOLO + ONNX Runtime
- [ ] Health check HTTP endpoint
- [ ] Métricas (Prometheus)
- [ ] Spool local si Session Store falla

## 📚 Documentación Adicional

Ver la carpeta [docs/](./docs/) para más información:
- `ARCHITECTURE.md` - Diagramas y flujo detallado
- `SHM_MIGRATION_COMPLETE.md` - Detalles de la arquitectura SHM
- `USAGE.md` - Guía de uso y troubleshooting

## 📄 Licencia

MIT

---

**Nota**: El módulo de IA está simulado. Ver `src/modules/ai-real.example.ts` para integración real con YOLO.
