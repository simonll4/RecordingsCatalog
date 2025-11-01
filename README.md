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
                      │   vue-ui   │
                      └────────────┘
```

### Servicios

- **edge-agent**: Captura video, ejecuta detección IA y controla grabaciones mediante FSM
- **manager (dentro de edge-agent)**: expone API para estado/control (`/status`, `/control/*`, `/config/classes*`)
- **worker-ai**: Worker de inferencia YOLO (ONNX Runtime) con protocolo TCP custom
- **mediamtx**: Servidor RTSP/WebRTC para streaming en vivo e ingesta de grabaciones
- **session-store**: API REST para gestión de sesiones y detecciones + PostgreSQL
- **vue-ui**: Interfaz web para explorar grabaciones, ver live y controlar el agente
- **postgres**: Base de datos para metadatos de sesiones

##  Despliegue Rápido

### Prerequisitos

- Docker + Docker Compose
- Cámara USB/V4L2 o stream RTSP (opcional para testing)
- Modelo YOLO ONNX en `services/worker-ai/models/yolo11s.onnx` (montado como `/models` en el contenedor del worker)

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
- Explorador de sesiones grabadas: `/`
- Streaming en vivo (WebRTC): `/live`
- Control del agente (start/stop + clases): `/control`

##  Configuración

**Toda la configuración se maneja mediante archivos `.toml`** - una única fuente de verdad por servicio.

### Edge Agent (`services/edge-agent/config.toml`)

```toml
[device]
id = "cam-local"

[logging]
level = "info"

[source]
kind = "rtsp"
uri = "rtsp://usuario:password@host:554/stream"
width = 640
height = 480
fps_hub = 15
socket_path = "/dev/shm/cam_raw.sock"
shm_size_mb = 50

[ai]
model_name = "/models/yolo11s.onnx"
umbral = 0.4
classes_filter = "person"
fps_idle = 5
fps_active = 12
worker_host = "worker-ai"
worker_port = 7001

[mediamtx]
host = "mediamtx"
port = 8554
record_path = "cam-local"
live_path = "cam-local-live"

[fsm]
dwell_ms = 500
silence_ms = 3000
postroll_ms = 5000

[store]
base_url = "http://session-store:8080"

[status]
port = 7080
```

### Worker AI (`services/worker-ai/config.toml`)

```toml
[server]
bind_host = "0.0.0.0"
bind_port = 7001

[bootstrap]
enabled = false  # true para pre-cargar modelo
model_path = "/models/yolo11s.onnx"

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

### Vue UI (variables de entorno)

Crear un `.env` (o variables del contenedor):

```env
VITE_SESSION_STORE_BASE_URL=http://session-store:8080
VITE_MEDIAMTX_BASE_URL=http://mediamtx:9996
VITE_WEBRTC_BASE_URL=http://mediamtx:8889
VITE_EDGE_AGENT_BASE_URL=http://edge-agent:7080
VITE_LIVE_STREAM_PATH=cam-local-live
```

## 🛠️ Desarrollo

### Testing Local Worker AI (con visualización)

```bash
cd services/worker-ai
./run.sh
```

Esto levanta el worker con la configuración local y visualización opcional.

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
│   ├── models/                # Modelos ONNX (yolo11s.onnx)
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
│   ├── vue-ui/
│   │   ├── src/               # Código de la app Vite
│   │   ├── dist/              # Build de producción (en contenedor)
│   │   └── Dockerfile
│   └── mediamtx/
│       └── mediamtx.yml       # Configuración MediaMTX
├── scripts/
│   ├── rtsp_camera_clean.sh   # Limpieza rápida de streams RTSP
│   └── rtsp_camera_gst.sh     # Utilidades GStreamer para cámaras IP
└── docs/
    ├── OVERVIEW.md             # Descripción general del sistema
    ├── SETUP.md                # Pasos de instalación y configuración
    └── OPERATIONS.md           # Comandos de operación y soporte
```

## Características

- **Configuración TOML centralizada** - Sin variables de entorno
- **FSM inteligente** - Grabación automática por detecciones
- **Worker AI escalable** - Protocolo TCP con control de backpressure
- **Streaming NV12** - Procesamiento eficiente sin re-encoding
- **Streaming en vivo** - Flujo WebRTC (WHEP) con auto-conexión y estado/control del agente desde la UI (`/live`, `/control`)
- **Playback on-demand** - MediaMTX API para recuperar grabaciones
- **UI responsive** - Exploración temporal de sesiones
- **PostgreSQL** - Metadatos de sesiones y detecciones

## Notas Importantes

### Cámara Física

El `docker-compose.yml` no mapea la cámara por defecto. Si necesitás acceder a `/dev/video*` dentro del contenedor, agregá las líneas siguientes (ajustando rutas y GID):

```yaml
edge-agent:
  devices:
    - "/dev/video0:/dev/video0"
  group_add:
    - "44"  # GID del grupo video en tu host
  privileged: true
```

Consulta `docs/SETUP.md` para más variantes y consejos.

### RTSP Remoto

Cambiar en `services/edge-agent/config.toml`:

```toml
[source]
kind = "rtsp"
uri = "rtsp://192.168.1.100:554/stream"
```

### Modelos YOLO

Exportar el modelo ONNX por defecto:

```bash
python services/worker-ai/scripts/export_yolo11s_to_onnx.py
# El modelo queda en services/worker-ai/models/yolo11s.onnx (en contenedor: /models/yolo11s.onnx)
```

## Troubleshooting

**Edge-agent no arranca**: Verificar que existe `/dev/video0` o configurar RTSP

**Worker-ai timeout**: Verificar que existe el modelo en `/models/yolo11s.onnx` dentro del contenedor (mapeado desde `services/worker-ai/models`)

**No se reproducen videos**: Verificar que MediaMTX tiene acceso a `/recordings`

**Errores de permisos**: Verificar ownership de `data/` (debe ser escribible)
