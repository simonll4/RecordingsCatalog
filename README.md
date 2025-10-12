# TP Final v3 - Sistema de Grabación Inteligente

Sistema edge de detección y grabación automática de eventos mediante IA, con arquitectura basada en contenedores Docker y configuración centralizada en archivos TOML.

##  Arquitectura

```
┌─────────────────┐
│   edge-agent    │ ← (cámara → IA → grabación)
└────────┬────────┘
         │
    ┌────┴─────┬──────────┬────────────┐
    │          │          │            │
┌───▼────┐ ┌──▼──────┐ ┌─▼────────┐ ┌─▼──────────┐
│ worker │ │ mediamtx│ │  session │ │  postgres  │
│  -ai   │ │ (RTSP)  │ │  -store  │ │            │
└────────┘ └─────────┘ └────┬─────┘ └────────────┘
                            │
                      ┌─────▼──────┐
                      │   web-ui   │
                      └────────────┘
```

### Servicios

- **edge-agent**: Captura video, ejecuta detección IA, controla grabaciones mediante FSM
- **worker-ai**: Worker de inferencia YOLO (ONNX Runtime) con protocolo TCP custom
- **mediamtx**: Servidor RTSP para streaming e ingesta de grabaciones
- **session-store**: API REST para gestión de sesiones y detecciones + PostgreSQL
- **web-ui**: Interfaz web para explorar grabaciones
- **postgres**: Base de datos para metadatos de sesiones

##  Despliegue Rápido

### Prerequisitos

- Docker + Docker Compose
- Cámara USB/V4L2 o stream RTSP (opcional para testing)
- Modelo YOLO ONNX en `data/models/yolov8n.onnx`

### Levantar Sistema Completo

```bash
# 1. Sistema base (sin edge-agent)
docker compose up -d

# 2. Con edge-agent (requiere cámara o RTSP)
docker compose --profile edge up -d
```

### Acceder a la UI

```
http://localhost:3000
```

##  Configuración

**Toda la configuración se maneja mediante archivos `.toml`** - una única fuente de verdad por servicio.

### Edge Agent (`services/edge-agent/config.toml`)

```toml
[device]
id = "cam-local"

[source]
kind = "v4l2"  # o "rtsp"
uri = "/dev/video0"  # o "rtsp://..."
width = 640
height = 480
fps_hub = 15

[ai]
model_name = "/models/yolov8n.onnx"
umbral = 0.4
classes_filter = "person"
fps_idle = 5
fps_active = 12
worker_host = "worker-ai"
worker_port = 7001

[fsm]
dwell_ms = 500
silence_ms = 3000
postroll_ms = 5000

[store]
base_url = "http://session-store:8080"
```

### Worker AI (`services/worker-ai/config.toml`)

```toml
[server]
bind_host = "0.0.0.0"
bind_port = 7001

[bootstrap]
enabled = false  # true para pre-cargar modelo
model_path = "/models/yolov8n.onnx"

[visualization]
enabled = false  # true para ver detecciones (desarrollo)
```

### Session Store (`services/session-store/config.toml`)

```toml
[database]
url = "postgres://postgres:postgres@postgres:5432/session_store"

[mediamtx]
playback_base_url = "http://mediamtx:9996"
```

### Web UI (`services/web-ui/config.toml`)

```toml
[server]
port = 3000

[backend]
session_store_url = "http://session-store:8080"
mediamtx_url = "http://mediamtx:9996"
```

## 🛠️ Desarrollo

### Testing Local Worker AI (con visualización)

```bash
cd scripts
./run-worker-local.sh
```

Esto ejecuta el worker con ventana de visualización de detecciones.

### Ver Logs

```bash
# Todos los servicios
docker compose logs -f

# Servicio específico
docker compose logs -f edge-agent
docker compose logs -f worker-ai
```

### Rebuild Después de Cambios en Config

```bash
# Rebuild servicio específico
docker compose build edge-agent
docker compose up -d edge-agent

# O rebuild todo
docker compose --profile edge build
docker compose --profile edge up -d
```

##  Estructura del Proyecto

```
tpfinal-v3/
├── docker-compose.yml          # Orquestación de servicios
├── data/
│   ├── models/                # Modelos ONNX (yolov8n.onnx)
│   ├── recordings/            # Grabaciones RTSP
│   └── frames/                # Frames de detecciones
├── services/
│   ├── edge-agent/
│   │   ├── config.toml        # ← Configuración
│   │   ├── src/
│   │   └── Dockerfile
│   ├── worker-ai/
│   │   ├── config.toml        # ← Configuración
│   │   ├── worker.py
│   │   └── Dockerfile
│   ├── session-store/
│   │   ├── config.toml        # ← Configuración
│   │   ├── src/
│   │   └── Dockerfile
│   ├── web-ui/
│   │   ├── config.toml        # ← Configuración
│   │   ├── server.js
│   │   └── public/
│   └── mediamtx/
│       └── mediamtx.yml       # Configuración MediaMTX
├── scripts/
│   └── run-worker-local.sh    # Desarrollo: worker local
└── docs/
    ├── AI-FLOW.md             # Flujo de procesamiento IA
    ├── CAMERA_SETUP.md        # Setup de cámaras
    ├── QUICKSTART_AI_WORKER.md # Guía worker AI
    └── SESSION_STORE_COMPLETE.md # API session-store
```

## Características

- **Configuración TOML centralizada** - Sin variables de entorno
- **FSM inteligente** - Grabación automática por detecciones
- **Worker AI escalable** - Protocolo TCP con control de backpressure
- **Streaming NV12** - Procesamiento eficiente sin re-encoding
- **Playback on-demand** - MediaMTX API para recuperar grabaciones
- **UI responsive** - Exploración temporal de sesiones
- **PostgreSQL** - Metadatos de sesiones y detecciones

## Notas Importantes

### Cámara Física

El `docker-compose.yml` **ya mapea `/dev/video*` y `group_add=video` por defecto**. Si estás en un host sin cámara física o en entorno sin acceso a dispositivos (ej: Docker Desktop), **comentá esas líneas**:

```yaml
edge-agent:
  # devices:
  #   - "/dev/video0:/dev/video0"
  #   - "/dev/video1:/dev/video1"
  # group_add:
  #   - "44"
  # privileged: true
  group_add:
    - "44"  # GID grupo video
  privileged: true
```

### RTSP Remoto

Cambiar en `services/edge-agent/config.toml`:

```toml
[source]
kind = "rtsp"
uri = "rtsp://192.168.1.100:554/stream"
```

### Modelos YOLO

Descargar o exportar modelo ONNX a `data/models/`:

```bash
cd scripts
python export-yolo-onnx.py  # Requiere ultralytics
```

## Troubleshooting

**Edge-agent no arranca**: Verificar que existe `/dev/video0` o configurar RTSP

**Worker-ai timeout**: Verificar que existe el modelo en `/models/yolov8n.onnx`

**No se reproducen videos**: Verificar que MediaMTX tiene acceso a `/recordings`

**Errores de permisos**: Verificar ownership de `data/` (debe ser escribible)
