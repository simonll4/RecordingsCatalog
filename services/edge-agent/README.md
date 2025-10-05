# Edge Agent

Sistema de captura y análisis de video basado en eventos. Utiliza GStreamer + SHM para video de baja latencia y una FSM (Orchestrator) que coordina el streaming RTSP y la persistencia de sesiones y detecciones.

## Características

- FSM (IDLE → DWELL → ACTIVE → CLOSING) con timers configurables
- Event Bus tipado (backpressure por tópico, métricas básicas)
- Arquitectura SHM: un único hub de frames I420 para múltiples consumidores
- Streaming RTSP bajo demanda a MediaMTX (encoder adaptativo)
- IA simulada integrada; lista para IA real (sustituible)
- Batching + retry de detecciones hacia Session Store
- Logging estructurado y métricas simples

## Arquitectura

- Diagrama ASCII: docs/GRAFICO.md
- Diseño detallado: docs/ARCHITECTURE.md

Resumen del flujo:
- Camera Hub (RTSP/V4L2 → I420) escribe a un socket SHM.
- AI Capture y Publisher leen del SHM en paralelo.
- AI Engine procesa RGB y emite eventos al Bus.
- Orchestrator escucha eventos, reduce la FSM y ejecuta comandos (start/stop stream, open/close session, AI fps).

## Quick Start

Requisitos
- Node.js 20+
- GStreamer 1.0+ (plugins base/good/bad/libav) y opcionales de GPU

Instalación
```
cd services/edge-agent
npm install
```

Configuración (.env)
```
# Logging
LOG_LEVEL=info  # debug | info | warn | error

# Dispositivo
DEVICE_ID=cam-local

# Fuente
SOURCE_KIND=v4l2           # v4l2 | rtsp
SOURCE_URI=/dev/video0     # o rtsp://cam-ip/stream
SOURCE_WIDTH=1280
SOURCE_HEIGHT=720
SOURCE_FPS_HUB=15
SOURCE_SOCKET_PATH=/dev/shm/cam_raw.sock
SOURCE_SHM_SIZE_MB=128

# MediaMTX (RTSP)
MEDIAMTX_HOST=localhost
MEDIAMTX_PORT=8554
MEDIAMTX_PATH=cam-local

# FSM (ms)
FSM_DWELL_MS=500
FSM_SILENCE_MS=3000
FSM_POSTROLL_MS=5000

# IA
AI_MODEL_NAME=yolov8n.onnx
AI_UMBRAL=0.4
AI_WIDTH=640
AI_HEIGHT=384
AI_CLASS_NAMES=person,helmet,vest,vehicle
AI_CLASSES_FILTER=person,helmet
AI_FPS_IDLE=5
AI_FPS_ACTIVE=12

# Session Store
STORE_BASE_URL=http://localhost:8080
STORE_BATCH_MAX=50
STORE_FLUSH_INTERVAL_MS=250
```

Ejecutar
```
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

Ver stream
```
vlc rtsp://localhost:8554/cam-local
# o
ffplay rtsp://localhost:8554/cam-local
```

## Documentación
- docs/GRAFICO.md
- docs/ARCHITECTURE.md
- docs/LOGGING.md

## Notas
- Los tiempos y FPS son configurables; los valores mostrados son ejemplos.
- El motor de IA actual es un simulador; puede reemplazarse por uno real manteniendo la interfaz.

