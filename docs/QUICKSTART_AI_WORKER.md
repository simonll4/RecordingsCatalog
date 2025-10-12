# Guía Rápida de Inicio - Worker AI + Edge Agent

## ✅ Estado Actual

- ✅ Código Protobuf generado
- ✅ TypeScript compilado sin errores
- ✅ Estructura completa implementada

## 🚀 Inicio Rápido

### 1. Descargar Modelo ONNX

```bash
# Descargar YOLOv8 Nano (6 MB - recomendado para edge)
mkdir -p data/models
cd data/models
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx
cd ../..
```

### 2. Build Docker Images

```bash
# Build worker AI y edge agent
docker-compose build worker-ai edge-agent
```

### 3. Iniciar Servicios

```bash
# Iniciar todos los servicios
docker-compose up -d

# O solo los servicios core (sin edge-agent que requiere cámara)
docker-compose up -d postgres mediamtx session-store worker-ai web-ui
```

### 4. Verificar Estado

```bash
# Ver logs
docker-compose logs -f worker-ai

# Estado de servicios
docker-compose ps

# Health checks
docker-compose ps worker-ai
```

## 🔍 Verificación del Worker AI

### Verificar que está escuchando

```bash
# Desde el host
nc -zv localhost 7001

# Desde otro container
docker-compose exec edge-agent nc -zv worker-ai 7001
```

### Ver logs del worker

```bash
docker-compose logs -f worker-ai
```

Deberías ver:
```
worker-ai | Starting AI Worker on 0.0.0.0:7001
worker-ai | AI Worker listening on 0.0.0.0:7001
```

### Test de carga de modelo

```bash
docker-compose exec worker-ai python3 << 'EOF'
import onnxruntime as ort

session = ort.InferenceSession('/models/yolov8n.onnx')
print(f"✓ Model loaded successfully")
print(f"  Inputs: {[i.name for i in session.get_inputs()]}")
print(f"  Outputs: {[o.name for o in session.get_outputs()]}")
print(f"  Providers: {session.get_providers()}")
EOF
```

## 🧪 Testing sin Cámara

Si no tienes cámara física, puedes:

### Opción 1: Usar RTSP simulado

Puedes usar una fuente RTSP de prueba:

```yaml
# En docker-compose.yml, cambiar:
SOURCE_KIND: rtsp
SOURCE_URI: rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mp4
```

## 📊 Monitoreo

### Ver todas las métricas

```bash
# Logs con métricas
docker-compose logs worker-ai | grep "Inference done"
docker-compose logs edge-agent | grep "Frame sent"

# Stats en tiempo real
docker stats worker-ai edge-agent
```

### Métricas esperadas

**Worker:**
- `Inference done: seq=X, detections=Y, time=Z.Zms`
- Estado: `IDLE`, `LOADING`, `READY`

**Edge Agent:**
- `Frame sent to AI worker: seq=X`
- `Received Result: seq=X, detections=Y`
- `AI detection (relevant)` o `AI detection (not relevant)`

### Opción 2: Usar v4l2loopback (dispositivo virtual)

```bash
sudo modprobe v4l2loopback
ffmpeg -re -stream_loop -1 -i your-video.mp4 -f v4l2 /dev/video0
```

## 🐛 Troubleshooting

### Worker no arranca

```bash
# Ver errores
docker-compose logs worker-ai

# Verificar modelo
docker-compose exec worker-ai ls -lh /models/

# Verificar puerto
docker-compose exec worker-ai python3 -c "
import socket
s = socket.socket()
s.bind(('0.0.0.0', 7001))
s.listen(1)
print('Port 7001 is available')
s.close()
"
```

### Edge Agent no conecta

```bash
# Ver logs
docker-compose logs edge-agent | grep -i "ai"

# Verificar DNS
docker-compose exec edge-agent ping -c 1 worker-ai

# Verificar conectividad
docker-compose exec edge-agent nc -zv worker-ai 7001
```

### Error: "Cannot find module '../proto/ai_pb.*'"

Regenerar Protobuf para el edge-agent con protobufjs:

```bash
cd services/edge-agent
npx pbjs -t static-module -w commonjs -o src/proto/ai_pb.cjs ../../proto/ai.proto
npx pbts -o src/proto/ai_pb.d.ts src/proto/ai_pb.cjs
```

Luego rebuild del servicio:
```bash
docker-compose build edge-agent
```

### Modelo no carga

```bash
# Verificar que existe
docker-compose exec worker-ai ls -lh /models/yolov8n.onnx

# Verificar permisos
docker-compose exec worker-ai stat /models/yolov8n.onnx

# Test manual
docker-compose exec worker-ai python3 -c "
import onnxruntime as ort
session = ort.InferenceSession('/models/yolov8n.onnx')
print('Model OK!')
"
```

## 📈 Configuración Avanzada

### Cambiar modelo

Editar `services/edge-agent/config.toml`:

```toml
[ai]
model_name = "/models/yolov8s.onnx"  # Modelo más grande (mejor precisión)
```

Descarga:
```bash
cd data/models
wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8s.onnx
```

### Ajustar resolución

Editar `services/edge-agent/config.toml`:

```toml
[ai]
width = 320      # Más rápido, menos preciso
height = 240

# O
width = 1280     # Más lento, más preciso
height = 720
```

### Bootstrap (pre-carga modelo)

Editar `services/worker-ai/config.toml`:

```toml
[bootstrap]
enabled = true
model_path = "/models/yolov8n.onnx"
width = 640
height = 480
conf = 0.35
```

El worker cargará el modelo al arrancar (arranque más lento, pero primera inferencia más rápida).

### Ajustar FPS

```yaml
# En docker-compose.yml
AI_FPS_IDLE: 2      # Muy bajo consumo en idle
AI_FPS_ACTIVE: 15   # Alta frecuencia durante grabación
```

## 🎯 Próximos Pasos

1. **Testing de integración**: Probar flujo completo con cámara real
2. **GPU Support**: Agregar soporte CUDA si tienes GPU NVIDIA
3. **Métricas**: Integrar con Prometheus/Grafana
4. **Alertas**: Configurar alertas por fallos de conexión
5. **Batch Inference**: Procesar múltiples frames juntos

## 📚 Documentación Adicional

- `services/worker-ai/README.md`: Detalles del worker
- `services/worker-ai/IMPLEMENTATION.md`: Resumen de implementación
- `docs/AI_WORKER_MIGRATION.md`: Guía de migración
- `proto/ai.proto`: Contrato Protobuf

---

**¿Problemas?** Revisa los logs con `docker-compose logs -f worker-ai edge-agent`
