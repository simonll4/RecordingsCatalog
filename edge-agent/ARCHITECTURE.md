# Edge Agent - Arquitectura y Documentación

## 📋 Descripción General

Sistema de detección y tracking de objetos en tiempo real para dispositivos edge, con capacidad de grabación de video y visualización web.

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        EDGE AGENT                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │   Capture    │─────▶│   Detector   │─────▶│   Tracker    │  │
│  │  (FFmpeg)    │      │  (YOLOv8 +   │      │  (ByteTrack) │  │
│  │              │      │   Python)    │      │              │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│         │                                            │           │
│         │                                            │           │
│         ▼                                            ▼           │
│  ┌──────────────┐                          ┌──────────────┐    │
│  │VideoRecorder │                          │TracksExporter│    │
│  │  (H.264/MP4) │                          │   (JSON)     │    │
│  └──────────────┘                          └──────────────┘    │
│         │                                            │           │
│         └────────────────┬───────────────────────────┘           │
│                          ▼                                       │
│                  ┌──────────────┐                                │
│                  │  PostgreSQL  │                                │
│                  │  (Sessions + │                                │
│                  │  Detections) │                                │
│                  └──────────────┘                                │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
                  ┌──────────────┐
                  │ Filesystem   │
                  │ Storage:     │
                  │ - MP4 clips  │
                  │ - Tracks JSON│
                  │ - Thumbnails │
                  └──────────────┘
                           │
                           ▼
                  ┌──────────────┐
                  │ Web Viewer   │
                  │ (Port 4000)  │
                  │ - Gallery    │
                  │ - Player     │
                  │ - Overlays   │
                  └──────────────┘
```

## 🔧 Componentes Principales

### 1. **Edge Agent** (`packages/agent`)

- **Función**: Orquestador principal del sistema
- **Responsabilidades**:
  - Gestión del ciclo de vida de sesiones
  - Coordinación de captura, detección y tracking
  - Grabación de video y generación de metadata
  - Persistencia en base de datos

### 2. **Capture** (`packages/capture`)

- **Función**: Captura de frames desde dispositivos de video
- **Tecnologías**: FFmpeg, v4l2 (Linux), AVFoundation (macOS)
- **Características**:
  - Soporte multi-plataforma
  - Clonación de dispositivos con v4l2loopback
  - Emisión de frames vía eventos

### 3. **Detector** (`packages/detector`)

- **Función**: Detección y tracking de objetos
- **Tecnologías**: Python subprocess, YOLOv8, ByteTrack
- **Flujo**:
  - Recibe frames como base64
  - Ejecuta detección con YOLOv8
  - Aplica tracking con ByteTrack
  - Retorna bounding boxes con track IDs

### 4. **Video Recorder** (`packages/agent/src/video-recorder.ts`)

- **Función**: Grabación de clips de video
- **Formato**: H.264 MP4
- **Características**:
  - Inicio/parada sincronizada con sesiones
  - Normalización de rutas de dispositivo
  - Manejo de FFmpeg como subprocess
  - Soporte multi-plataforma

### 5. **Tracks Exporter** (`packages/agent/src/tracks-exporter.ts`)

- **Función**: Generación de metadata de tracking
- **Formato**: JSON con keyframes por track
- **Contenido**:
  - Session info (device, timestamps, duration)
  - Tracks con bounding boxes interpolables
  - Keyframes con timestamps relativos

### 6. **Database** (`packages/db`)

- **Tecnología**: PostgreSQL + Prisma ORM
- **Esquema**:
  - `sessions`: Metadata de sesiones (device, timestamps, URLs)
  - `detections`: Detecciones individuales con track ID
  - Relación: Una sesión tiene muchas detecciones

### 7. **Web Viewer** (`apps/viewer`)

- **Función**: Interfaz web para visualización
- **Tecnologías**: Node.js + Express + Vanilla JS
- **Características**:
  - Galería de sesiones
  - Reproductor de video con overlays
  - Visualización de tracks con interpolación
  - Controles de reproducción

## 📁 Estructura de Directorios

```
edge-agent/
├── apps/
│   ├── cli/                    # CLI del edge agent
│   │   ├── src/
│   │   │   └── index.ts        # Entrypoint principal
│   │   └── storage/            # Storage del edge agent
│   │       ├── clips/          # Videos MP4 por dispositivo
│   │       ├── meta/           # Archivos tracks.json
│   │       └── thumbs/         # Thumbnails de sesiones
│   └── viewer/                 # Web viewer
│       └── src/
│           └── server.ts       # Servidor Express
├── packages/
│   ├── agent/                  # Lógica principal del edge agent
│   │   └── src/
│   │       ├── index.ts        # EdgeAgent class
│   │       ├── video-recorder.ts
│   │       └── tracks-exporter.ts
│   ├── capture/                # Captura de frames
│   ├── detector/               # Wrapper de Python detector
│   ├── db/                     # Prisma ORM y esquema
│   │   └── prisma/
│   │       └── schema.prisma
│   └── common/                 # Tipos compartidos
├── python/
│   ├── yolo_tracker.py         # Script Python para YOLOv8
│   └── requirements.txt
├── configs/
│   └── cameras.json            # Configuración de cámaras
├── models/
│   └── yolov8s.pt             # Modelo YOLO
├── scripts/
│   ├── setup-v4l2loopback.sh  # Setup de v4l2loopback
│   └── clean-db.ts            # Limpieza de base de datos
└── init-db/                    # Scripts de inicialización DB
```

## 🚀 Flujo de Ejecución

### Inicio de Sesión

1. **EdgeAgent** lee configuración de cámaras
2. Inicia **FFmpegCapture** para capturar frames
3. Inicia **VideoRecorder** para grabar MP4
4. Crea registro de sesión en **PostgreSQL**

### Procesamiento de Frames

1. **Capture** emite frame cada N ms
2. **Detector** envía frame a Python subprocess
3. **Python** ejecuta YOLOv8 + ByteTrack
4. **Detector** retorna detecciones con track IDs
5. **EdgeAgent** guarda detecciones en DB

### Fin de Sesión

1. **EdgeAgent** detiene captura y grabación
2. **VideoRecorder** finaliza MP4
3. **TracksExporter** genera tracks.json
4. **EdgeAgent** guarda thumbnail
5. Actualiza sesión en DB con URLs

### Visualización

1. Usuario abre **Web Viewer** en puerto 4000
2. Viewer carga galería desde **PostgreSQL**
3. Usuario selecciona sesión
4. Viewer carga video MP4 y tracks.json
5. Reproduce video con overlays sincronizados

## 🔌 Dispositivos de Video

### v4l2loopback (Linux)

Para evitar conflictos de dispositivo ocupado:

```bash
# Instalar y configurar
bash scripts/setup-v4l2loopback.sh

# Verifica dispositivos
v4l2-ctl --list-devices

# Configurar en cameras.json
{
  "device": "2"  # Usa /dev/video2 (virtual)
}
```

El sistema clona `/dev/video0` → `/dev/video2` permitiendo múltiples lectores.

## 📊 Formato de Datos

### Session (PostgreSQL)

```typescript
{
  id: string (UUID)
  name: string (sesion_YYYYMMDD-HHMMSS_N)
  deviceId: string
  edgeStartTs: Date
  edgeEndTs: Date
  streamPath: string (/media/clips/...)
  playlistUrl: string (/media/clips/.../video.mp4)
  metaUrl: string (/meta/sesion_....json)
  thumbUrl: string (/thumbs/uuid.jpg)
}
```

### Detection (PostgreSQL)

```typescript
{
  id: string (UUID)
  sessionId: string
  trackId: number
  label: string
  confidence: number
  bbox: string (JSON array [x, y, w, h])
  timestamp: Date
}
```

### Tracks JSON (filesystem)

```json
{
  "session_id": "uuid",
  "dev_id": "camera-1",
  "start_ts": "ISO date",
  "duration_s": 30.5,
  "tracks": {
    "1": {
      "label": "person",
      "kf": [
        { "t": 0.0, "b": [0.1, 0.2, 0.15, 0.4] },
        { "t": 1.5, "b": [0.12, 0.21, 0.16, 0.41] }
      ]
    }
  }
}
```

## 🛠️ Configuración

### Variables de Entorno (.env)

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/edge_agent"
PYTHON_PATH="/path/to/python3"
STORAGE_DIR="/path/to/storage"
```

### Cámaras (configs/cameras.json)

```json
{
  "cameras": [
    {
      "id": "camera-1",
      "name": "Front Door",
      "device": "2",
      "width": 640,
      "height": 480,
      "fps": 15
    }
  ]
}
```

## 🧪 Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Compilar todo el proyecto
npm run build

# Ejecutar edge agent
npm run dev

# Ejecutar viewer (puerto 4000)
npm run viewer:dev

# Limpiar base de datos
npx tsx scripts/clean-db.ts

# Setup v4l2loopback
sudo bash scripts/setup-v4l2loopback.sh
```

## 📝 Nomenclatura de Archivos

Todos los archivos siguen el formato:

- **Sesiones**: `sesion_YYYYMMDD-HHMMSS_N`
- **Videos**: `apps/cli/storage/clips/camera-1/sesion_20251007-153045_1.mp4`
- **Metadata**: `apps/cli/storage/meta/sesion_20251007-153045_1.json`
- **Thumbnails**: `apps/cli/storage/thumbs/{session-uuid}.jpg`

## 🔍 Troubleshooting

### Device or resource busy

- Solución: Usar v4l2loopback para clonar dispositivo
- Ver: `scripts/setup-v4l2loopback.sh`

### Python detector no responde

- Verificar: `which python3` y ajustar en `.env`
- Verificar: `pip install -r python/requirements.txt`

### Viewer no muestra videos

- Verificar: `storageDir` apunta a `apps/cli/storage`
- Verificar: Sesión tiene `playlistUrl` en DB
- Verificar: Archivo MP4 existe en filesystem

### Base de datos desincronizada

- Ejecutar: `npx tsx scripts/clean-db.ts`
- Limpiar: `rm -rf apps/cli/storage/{clips,meta,thumbs}/*`

## 📄 Licencia

MIT

## 👤 Autor

Desarrollado como Trabajo Final de Grado (TFG)
