# Edge Agent

Sistema de detección y tracking de objetos en tiempo real para dispositivos edge, con capacidad de grabación de video y visualización web.

## ✨ Características

- 🎥 **Captura de video** multi-plataforma (Linux, macOS, Windows)
- 🔍 **Detección de objetos** con YOLOv8
- 🎯 **Tracking persistente** con ByteTrack
- 📹 **Grabación automática** de clips MP4 por sesión
- 📊 **Metadata estructurada** en JSON con keyframes interpolables
- 🌐 **Viewer web** con reproductor y overlays sincronizados
- 💾 **Persistencia** en PostgreSQL + filesystem
- 🔄 **v4l2loopback** para múltiples lectores del mismo dispositivo

## 🚀 Inicio Rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar base de datos
cp .env.example .env
# Editar .env con credenciales PostgreSQL

# 3. Ejecutar migraciones
npm run db:migrate

# 4. (Linux) Setup v4l2loopback
sudo bash scripts/setup-v4l2loopback.sh

# 5. Configurar cámaras
# Editar configs/cameras.json (device: 2 para v4l2loopback)

# 6. Compilar proyecto
npm run build

# 7. Ejecutar edge agent
npm run dev

# 8. (En otra terminal) Ejecutar viewer
npm run viewer:dev

# 9. Abrir navegador
# http://localhost:4000
```

## 📁 Estructura del Proyecto

```
edge-agent/
├── apps/
│   ├── cli/                    # Edge agent CLI
│   │   └── storage/            # Almacenamiento de datos
│   │       ├── clips/          # Videos MP4
│   │       ├── meta/           # Metadata JSON
│   │       └── thumbs/         # Thumbnails
│   └── viewer/                 # Web viewer (puerto 4000)
├── packages/
│   ├── agent/                  # Lógica principal del edge agent
│   ├── capture/                # Captura de frames (FFmpeg)
│   ├── detector/               # Wrapper de YOLOv8
│   ├── db/                     # Prisma ORM
│   └── common/                 # Tipos compartidos
├── python/
│   └── yolo_tracker.py         # Detector YOLOv8 + ByteTrack
├── configs/
│   └── cameras.json            # Configuración de cámaras
├── models/
│   └── yolov8s.pt             # Modelo YOLO
└── scripts/
    ├── setup-v4l2loopback.sh  # Setup de dispositivo virtual
    ├── clean-db.ts            # Limpieza de base de datos
    └── cleanup.sh             # Limpieza completa del sistema
```

## 📊 Flujo de Datos

```
Cámara → FFmpeg Capture → YOLOv8 Detector → ByteTrack
                              ↓
                        Video Recorder (MP4)
                              ↓
                         PostgreSQL
                              ↓
                         Filesystem
                              ↓
                         Web Viewer
```

## 🔧 Comandos Útiles

```bash
# Desarrollo
npm run dev              # Ejecutar edge agent
npm run viewer:dev       # Ejecutar viewer web
npm run build           # Compilar todo el proyecto

# Base de datos
npm run db:migrate      # Aplicar migraciones
npm run db:studio       # Abrir Prisma Studio
npx tsx scripts/clean-db.ts  # Limpiar todas las sesiones

# Limpieza completa
bash scripts/cleanup.sh  # Limpia DB + storage + docs obsoletos

# Python
cd python && bash setup.sh  # Setup entorno Python
```

## 📝 Configuración

### Variables de Entorno (.env)

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/edge_agent"
PYTHON_PATH="/usr/bin/python3"
STORAGE_DIR="/path/to/edge-agent/apps/cli/storage"
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
      "fps": 15,
      "maxIdleMs": 5000,
      "maxDurationMs": 30000
    }
  ]
}
```

**Nota**: `device: "2"` usa `/dev/video2` (virtual con v4l2loopback)

## 🎬 Formato de Archivos

### Nomenclatura

Todos los archivos siguen el formato: `sesion_YYYYMMDD-HHMMSS_N`

Ejemplo: `sesion_20251007-153045_1.mp4`

### Estructura de Storage

```
apps/cli/storage/
├── clips/camera-1/
│   └── sesion_20251007-153045_1.mp4    # Video H.264 MP4
├── meta/
│   └── sesion_20251007-153045_1.json   # Tracks con keyframes
└── thumbs/
    └── abc123-uuid.jpg                  # Thumbnail de sesión
```

### Tracks JSON

```json
{
  "session_id": "abc123-uuid",
  "dev_id": "camera-1",
  "start_ts": "2025-10-07T15:30:45.123Z",
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

Bounding boxes normalizadas: `[x_center, y_center, width, height]` (0-1)

## 🌐 Web Viewer

El viewer web proporciona una interfaz para visualizar sesiones:

- **Galería**: Lista de todas las sesiones con fechas y thumbnails
- **Player**: Reproduce video MP4 con overlays de detección sincronizados
- **Metadata**: Muestra información de tracks y detecciones
- **Controles**: Play/pause, timeline, toggle overlays

Acceso: `http://localhost:4000`

## 🐛 Troubleshooting

### Device or resource busy

```bash
# Instalar v4l2loopback
sudo bash scripts/setup-v4l2loopback.sh

# Verificar dispositivos
v4l2-ctl --list-devices

# Configurar cameras.json con device: 2
```

### Python detector no responde

```bash
# Verificar Python
which python3

# Instalar dependencias
cd python
pip install -r requirements.txt

# Verificar modelo
ls -lh models/yolov8s.pt
```

### Viewer no muestra videos

```bash
# Verificar archivos
ls -lh apps/cli/storage/clips/camera-1/
ls -lh apps/cli/storage/meta/

# Verificar base de datos
npm run db:studio

# Limpiar y regenerar
bash scripts/cleanup.sh
npm run dev  # Generar nueva sesión
```

## 📚 Documentación

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Arquitectura completa del sistema
- **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** - Guía de configuración
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** - Guía de desarrollo

## 🧪 Testing

```bash
# Limpiar sistema
bash scripts/cleanup.sh

# Ejecutar edge agent (genera sesión de prueba)
npm run dev

# Ctrl+C después de ~30 segundos

# Verificar archivos generados
ls -lh apps/cli/storage/clips/camera-1/
ls -lh apps/cli/storage/meta/

# Abrir viewer
npm run viewer:dev
# http://localhost:4000
```

## 📄 Licencia

MIT

## 👤 Autor

Desarrollado como Trabajo Final de Grado (TFG) - Universidad del IUA
