# Edge Agent

Sistema inteligente de captura y análisis de video basado en eventos, con detección de objetos mediante IA y gestión automática de sesiones de grabación.

## 🎯 Características

- **FSM (Finite State Machine)**: Control de estados IDLE → ACTIVE → CLOSING
- **Detección de IA**: Análisis en tiempo real con YOLO (simulado actualmente)
- **FPS Dinámico**: Ajuste automático según estado (5 fps idle, 12 fps activo)
- **Streaming RTSP**: Publicación bajo demanda a MediaMTX
- **Gestión de Sesiones**: Apertura/cierre automático con post-roll
- **Batch de Detecciones**: Envío optimizado a Session Store

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
SOURCE_RTSP=rtsp://192.168.1.100:554/stream1
# CAMERA_DEVICE=/dev/video0

# MediaMTX
MEDIAMTX_HOST=mediamtx
MEDIAMTX_RTSP_PORT=8554
EDGE_STREAM_PATH=cam-local

# FSM
SILENCE_MS=3000
POST_ROLL_SEC=5

# IA
AI_FPS_IDLE=5
AI_FPS_ACTIVE=12
AI_CLASSES_FILTER=person,helmet

# Session Store
SESSION_STORE_URL=http://session-store:8080
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
- **GStreamer** 1.0+ con plugins
- **MediaMTX** (streaming server)
- **Session Store** (API de sesiones)

### Instalar GStreamer (Linux)

```bash
sudo apt-get install gstreamer1.0-tools \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gst-libav
```

## 📊 Flujo de Estados

```
IDLE (monitoring) → ACTIVE (recording) → CLOSING (post-roll) → IDLE
     FPS: 5             FPS: 12             FPS: 12            FPS: 5
```

### Transiciones

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

1. Inicia en **IDLE** (FPS 5)
2. AI simula detecciones cada ~1.5s
3. Transiciona a **ACTIVE** (FPS 12)
4. Publica stream a MediaMTX
5. Después de ~700ms sin detección → **CLOSING**
6. Graba 5s más (post-roll) → **IDLE**

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
- `[Orchestrator]`: FSM
- `[gst-capture]`: Captura
- `[gst-pub]`: Publisher
- `[AI]`: Detecciones

## 🚧 Roadmap

- [x] Arquitectura FSM con eventos
- [x] Captura GStreamer con FPS dinámico
- [x] Publisher on-demand a MediaMTX
- [x] Simulación de IA para testing
- [ ] Integración YOLO + ONNX Runtime
- [ ] Health check HTTP endpoint
- [ ] Métricas (Prometheus)
- [ ] Hot-reload de configuración

## 📄 Licencia

MIT

---

**Nota**: El módulo de IA está simulado. Ver `src/modules/ai-real.example.ts` para integración real con YOLO.
