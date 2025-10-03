# Edge Agent - Arquitectura

## Descripción General

El Edge Agent es un sistema basado en una máquina de estados finitos (FSM) que captura video, detecta objetos de interés usando IA, y gestiona sesiones de grabación en MediaMTX.

## Flujo de Estados (FSM)

```
IDLE → ACTIVE → CLOSING → IDLE
```

### Estados

- **IDLE**: Captura a baja frecuencia (AI_FPS_IDLE), sin publicar stream
- **ACTIVE**: Captura a alta frecuencia (AI_FPS_ACTIVE), publica stream, sesión abierta
- **CLOSING**: Post-roll activo, esperando a cerrar sesión

### Transiciones

- **IDLE → ACTIVE**: Cuando AI detecta objeto relevante (`ai.relevant-start`)
- **ACTIVE → CLOSING**: Cuando pasa SILENCE_MS sin recibir `ai.keepalive`
- **CLOSING → IDLE**: Después de POST_ROLL_SEC segundos

## Arquitectura de Carpetas

```
/src
  /infra
    config.ts         # Configuración centralizada desde .env
    bus.ts            # EventEmitter tipado para comunicación entre módulos
  
  /core
    orchestrator.ts   # FSM que controla estados y transiciones
  
  /modules
    capture.ts        # GStreamer: captura frames RGB para IA
    publisher.ts      # GStreamer: publica stream a MediaMTX
    sessionio.ts      # Gestión de sesiones y batch de detecciones
    ai.ts             # Módulo de IA (actualmente simulado)
  
  main.ts            # Bootstrap - conecta todos los módulos
```

## Módulos

### 1. Config (`infra/config.ts`)

Carga y valida variables de entorno:
- **source**: RTSP o dispositivo local
- **mediamtx**: Host, puerto, path
- **fsm**: Tiempos de dwell, silence, post-roll
- **ai**: Modelo, umbral, dimensiones, clases, FPS
- **store**: URL session-store, batch settings

### 2. Bus de Eventos (`infra/bus.ts`)

EventEmitter tipado que permite comunicación desacoplada entre módulos.

**Eventos emitidos:**
- `ai.relevant-start`: IA detecta inicio de actividad relevante
- `ai.keepalive`: IA confirma que sigue detectando actividad
- `ai.relevant-stop`: IA no detecta más actividad
- `ai.detections`: Detecciones con timestamp y datos
- `stream.started`: Stream publicado a MediaMTX
- `stream.stopped`: Stream detenido

### 3. Capture (`modules/capture.ts`)

**GStreamer pipeline** que captura frames en formato RGB para procesamiento de IA.

- Soporta RTSP (cámaras IP) o V4L2 (cámaras USB/locales)
- Ajusta FPS dinámicamente según estado (IDLE/ACTIVE)
- Emite frames como Buffer RGB (width × height × 3 bytes)

**Pipeline RTSP:**
```
rtspsrc → rtph264depay → h264parse → avdec_h264 → videoconvert → 
videoscale → video/x-raw,format=RGB → fdsink
```

**Pipeline V4L2:**
```
v4l2src → jpegdec → videoconvert → videoscale → 
video/x-raw,format=RGB → fdsink
```

### 4. Publisher (`modules/publisher.ts`)

**GStreamer pipeline** que publica el stream a MediaMTX.

- Se inicia/detiene bajo demanda según FSM
- Restreaming de RTSP o encoding de V4L2

**Pipeline RTSP (restream):**
```
rtspsrc → rtph264depay → h264parse → rtph264pay → rtspclientsink
```

**Pipeline V4L2 (encode):**
```
v4l2src → videoconvert → x264enc → h264parse → rtph264pay → rtspclientsink
```

### 5. SessionIO (`modules/sessionio.ts`)

Gestiona comunicación HTTP con session-store:

- **openSession()**: Crea nueva sesión
- **closeSession()**: Cierra sesión con post-roll
- **pushDetections()**: Batchea detecciones y las envía

**Batching:**
- Timeout: `SINK_BATCH_MS`
- Max items: `SINK_MAX_ITEMS`

### 6. AI Module (`modules/ai.ts`)

**Interfaz para el módulo de IA** (actualmente simulado).

**API:**
```typescript
setOnnxModel(modelName, umbral, height, width, classNames)
run(frame: Buffer, classesFilter: string[]): Promise<void>
```

**Comportamiento:**
- Recibe frames RGB
- Filtra detecciones por `classesFilter`
- Emite eventos según relevancia detectada

**Simulación actual:**
- Alterna entre estados relevante/no-relevante
- Emite detecciones dummy para testing

> **Nota**: Cuando se integre YOLO real, solo hay que reemplazar el cuerpo de `run()` manteniendo la misma interfaz y eventos.

### 7. Orchestrator (`core/orchestrator.ts`)

**FSM que controla el flujo completo:**

1. Inicia captura a FPS_IDLE
2. Escucha eventos de AI
3. Gestiona transiciones de estado
4. Controla publisher y sesiones
5. Ajusta FPS de captura según estado

**Timers:**
- `silenceTimer`: Controla transición ACTIVE → CLOSING
- `postTimer`: Controla transición CLOSING → IDLE

## Flujo de Datos

```
Camera/RTSP
    ↓
Capture (GStreamer)
    ↓
RGB Frames → AI Module
    ↓
Eventos (bus) → Orchestrator
    ↓
    ├─→ Publisher (start/stop)
    ├─→ Capture (setFps)
    └─→ SessionIO (open/close/detections)
```

## Variables de Entorno

```bash
# Fuente (elegir una)
SOURCE_RTSP=rtsp://cam-ip/stream
# CAMERA_DEVICE=/dev/video0

# MediaMTX
MEDIAMTX_HOST=mediamtx
MEDIAMTX_RTSP_PORT=8554
EDGE_STREAM_PATH=cam-local

# FSM
DWELL_MS=500           # Tiempo mínimo para activar
SILENCE_MS=3000        # Timeout sin keepalive
POST_ROLL_SEC=5        # Grabación post-evento

# IA
AI_MODEL_NAME=yolov8n.onnx
AI_UMBRAL=0.4
AI_WIDTH=640
AI_HEIGHT=384
AI_CLASS_NAMES=person,helmet,vest,vehicle
AI_CLASSES_FILTER=person,helmet    # Clases relevantes
AI_FPS_IDLE=5
AI_FPS_ACTIVE=12

# Session-Store
SESSION_STORE_URL=http://session-store:8080
SINK_BATCH_MS=250
SINK_MAX_ITEMS=50
```

## Uso

```bash
# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

## Próximos Pasos

1. **Integrar YOLO real**: Reemplazar `modules/ai.ts` con implementación ONNX
2. **Métricas**: Agregar logging estructurado y métricas
3. **Health checks**: Endpoint HTTP para monitoreo
4. **Configuración dinámica**: Hot-reload de ciertos parámetros
