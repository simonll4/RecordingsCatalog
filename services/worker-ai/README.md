# Worker AI - Servicio de Inferencia y Tracking

Servidor TCP que recibe frames del edge-agent, ejecuta YOLO11 para detectar objetos, aplica tracking BoT-SORT, y persiste los resultados en JSON por sesión.

## 🏗️ Arquitectura

```
┌──────────────┐    TCP+Protobuf    ┌──────────────┐
│  Edge Agent  │◄──────────────────►│  Worker AI   │
│  (Node.js)   │  Length-prefixed   │  (Python)    │
└──────────────┘                    └──────────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        │                  │                  │
                   Transport          Pipeline           Server
                   • Framing         • Decoder          • Conexiones
                   • Codec           • Inference        • Heartbeats
                                     • Tracking         • Model Loader
                                     • Sessions
```

**Capas modulares:**
- **Transport**: Framing TCP y codec Protobuf
- **Pipeline**: decode → inferencia → tracking → persistencia
- **Server**: Gestión de conexiones y coordinación
- **Config**: Configuración runtime centralizada

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para detalles completos.

## 🚀 Inicio Rápido

**Lee esto primero**: [`QUICKSTART.md`](QUICKSTART.md) - Guía rápida completa

### Prerequisitos

- Python 3.10+
- Mamba/Conda
- Modelo YOLO11 en formato ONNX

### Instalación

```bash
# Con Conda/Mamba
mamba env create -f environment.yml
mamba activate worker-ai

# Verificar que el modelo está disponible
ls -lh data/models/yolo11n.onnx

# Ejecutar
python worker.py

# O usar el script de conveniencia
./run.sh
```

### Verificación Rápida

```bash
# Test del modelo YOLO
python test_detection.py

# Inspeccionar modelo
python inspect_model.py
```

El worker escuchará en `0.0.0.0:7001` por defecto.

### Configuración

Editar `config.toml` o crear `config.local.toml`:

```toml
[server]
bind_host = "0.0.0.0"
bind_port = 7001

[model]
conf_threshold = 0.5
nms_iou = 0.6
classes = ["person", "car"]  # Filtro opcional

[tracker]
enabled = true
config_path = "botsort.yaml"

[sessions]
output_dir = "./data/tracks"
default_fps = 10.0
segment_duration_s = 10.0

[visualization]
enabled = true
```

## 📦 Estructura del Proyecto

```
worker-ai/
├── worker.py              # Punto de entrada
├── ai_pb2.py             # Protobuf generado
├── botsort.yaml          # Config del tracker
├── config.toml           # Configuración principal
├── src/
│   ├── main.py           # Bootstrap principal
│   ├── transport/        # Framing + Codec Protobuf
│   ├── pipeline/         # Procesamiento de frames
│   ├── server/           # Servidor TCP
│   ├── config/           # Configuración runtime
│   ├── core/             # Logger
│   ├── inference/        # YOLO11 ONNX
│   ├── tracking/         # BoT-SORT
│   ├── session/          # Persistencia JSON
│   └── visualization/    # OpenCV viewer
├── docs/                 # Documentación completa
└── data/tracks/          # Salida de sesiones
```

## 📝 Funcionalidades

### Tracking de Objetos (BoT-SORT)

Cada detección recibe un `track_id` único que persiste entre frames. Configurable en `botsort.yaml`:

```yaml
match_thresh: 0.3    # Umbral IoU para matching
max_age: 30          # Frames sin detección antes de eliminar
```

### Gestión de Sesiones

Cada sesión genera:
- `tracks/seg-XXXX.jsonl`: Eventos de tracking por segmento
- `index.json`: Índice de segmentos
- `meta.json`: Metadatos de la sesión

Estructura de salida:
```
data/tracks/
└── session_device123_20241017_150530/
    ├── meta.json
    ├── index.json
    └── tracks/
        ├── seg-0000.jsonl
        ├── seg-0001.jsonl
        └── ...
```

### Protocolos Soportados

- **Init**: Carga modelo YOLO11
- **Frame**: Procesa frame (JPEG, NV12, I420)
- **End**: Finaliza sesión
- **Heartbeat**: Keepalive durante carga de modelo

## 🐳 Docker

```bash
# Build
docker build -t worker-ai .

# Run
docker run -p 7001:7001 -v $(pwd)/data:/data worker-ai
```

## 📚 Documentación

### Guías de Usuario
- **[QUICKSTART.md](QUICKSTART.md)** - ⭐ Inicio rápido (lee esto primero)
- **[EXPORTAR_MODELOS.md](EXPORTAR_MODELOS.md)** - Exportar modelos YOLO a ONNX
- **[REORGANIZATION_NOTES.md](REORGANIZATION_NOTES.md)** - Cambios y mejoras aplicadas
- **[FIX_NMS_INTEGRADO.md](FIX_NMS_INTEGRADO.md)** - Explicación del fix de NMS

### Documentación Técnica
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Arquitectura detallada
- [TESTING_GUIDE.md](docs/TESTING_GUIDE.md) - Guía de testing
- [REFACTORING_SUMMARY.md](docs/REFACTORING_SUMMARY.md) - Historial de refactoring
- [examples.md](docs/examples.md) - Ejemplos de uso

## 🛠️ Scripts Útiles

```bash
# Exportar modelo YOLO a ONNX
python scripts/export_yolo_to_onnx.py --weights yolo11n.pt --nms

# Test de inferencia
python test_detection.py

# Inspeccionar modelo ONNX
python inspect_model.py

# Anotar frames desde JSON
python scripts/annotate_from_json.py
```

Ver [scripts/README.md](scripts/README.md) para más detalles.

## 🔧 Desarrollo

Ver [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md) para:
- Testing unitario
- Testing de integración
- Debugging
- Profiling

### Características Destacadas

✅ **Detección automática de formato ONNX** (con/sin NMS integrado)  
✅ **Soporte para 80 clases COCO**  
✅ **Tracking BoT-SORT** con IDs persistentes  
✅ **Persistencia en JSON** por sesión  
✅ **Visualización en tiempo real** con OpenCV  
✅ **Configuración flexible** vía TOML

## 📄 Licencia

Ver LICENSE en el repositorio principal.
