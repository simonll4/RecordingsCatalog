# Testing Local: Worker-AI + Edge-Agent

## Setup para Desarrollo Local

Este documento explica cómo ejecutar el worker-ai localmente (fuera de Docker) y conectarlo con el edge-agent que corre en Docker.

### Configuración Actual

✅ **Worker-AI**: Corriendo localmente con mamba
✅ **Edge-Agent**: Configurado para conectarse a `localhost:7001`
✅ **Visualización**: HABILITADA - verás los frames con detecciones

## Paso 1: Iniciar Worker-AI Local

```bash
# Terminal 1: Worker-AI
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3/services/worker-ai

# Ejecutar worker
./run.sh
```

**Deberías ver**:
```
🤖 Worker AI - Starting...
📝 Usando config.local.toml (desarrollo local)

🔧 Usando entorno worker-ai...

📊 Versiones instaladas:
Python 3.10.19
   ONNX Runtime: 1.23.1
   OpenCV: 4.12.0
   NumPy: 2.2.6

🚀 Iniciando Worker AI...
   Escuchando en: 0.0.0.0:7001
   Output tracks: ./data/tracks/

✓ Visualization ENABLED (cv2 available)
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Tracker initialized: botsort
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Session manager initialized: ./data/tracks
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: AI Worker listening on 0.0.0.0:7001
```

## Paso 2: Iniciar Edge-Agent en Docker

```bash
# Terminal 2: Edge-Agent
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3

# Iniciar solo los servicios necesarios
docker-compose up edge-agent mediamtx session-store postgres
```

**El edge-agent debería conectarse al worker en localhost:7001**

## Paso 3: Verificar Conexión

### En logs del Worker-AI deberías ver:
```
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Client connected: ('172.XX.X.X', XXXXX)
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Received Init: model=/models/yolo11n.onnx
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Config changed, reloading model
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Loading model: /models/yolo11n.onnx
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Model loaded: yolo11n.onnx_640x640, providers=[...]
2025-10-16 XX:XX:XX,XXX [INFO] worker-ai: Sent InitOk
```

### En logs del Edge-Agent deberías ver:
```
2025-10-16TXX:XX:XX.XXXZ [INFO ] Connecting to AI worker | module="main"
2025-10-16TXX:XX:XX.XXXZ [INFO ] Connected to AI worker | module="ai-client-tcp"
2025-10-16TXX:XX:XX.XXXZ [INFO ] Init message sent | module="ai-client-tcp"
2025-10-16TXX:XX:XX.XXXZ [INFO ] Received InitOk | module="ai-client-tcp"
```

## Paso 4: Ver Visualización de Frames

Una vez que el edge-agent empiece a enviar frames:

1. **Se abrirá una ventana de OpenCV** con el título "AI Worker - Detections"
2. Verás los frames con:
   - Bounding boxes verdes alrededor de las detecciones
   - Labels con clase, confianza y track ID
   - Info del frame en la esquina superior izquierda

**Ejemplo de visualización**:
```
┌─────────────────────────────────────────┐
│ Frame: 123 | Detections: 2             │
│                                         │
│   ┌──────────────┐                     │
│   │ person: 0.89 │                     │
│   └──────────────┘                     │
│                                         │
│           ┌────────────┐                │
│           │ car: 0.76  │                │
│           └────────────┘                │
└─────────────────────────────────────────┘
```

## Archivos Generados

Los tracks se guardarán en:
```
/home/simonll4/Desktop/New Folder/tpfinal-v3/services/worker-ai/data/tracks/
  └── {session_id}/
      ├── meta.json
      ├── tracks.jsonl
      └── index.json
```

**Verificar tracks**:
```bash
# Listar sesiones
ls -la ./data/tracks/

# Ver metadata de una sesión
cat ./data/tracks/{session_id}/meta.json | jq

# Ver primeros eventos
head -n 5 ./data/tracks/{session_id}/tracks.jsonl | jq
```

## Troubleshooting

### Worker no recibe frames

**Problema**: Worker arrancado pero no recibe conexión del edge-agent

**Solución**:
```bash
# Verificar que el worker está escuchando
ss -tlnp | grep 7001

# Verificar que edge-agent puede alcanzar localhost
docker-compose exec edge-agent nc -zv host.docker.internal 7001
# O si no funciona:
docker-compose exec edge-agent nc -zv 172.17.0.1 7001
```

Si el edge-agent no puede conectarse a localhost, necesitas usar `host.docker.internal`:

```toml
# En edge-agent/config.toml
worker_host = "host.docker.internal"  # En lugar de localhost
```

### No se abre ventana de visualización

**Problema**: Worker recibe frames pero no muestra ventana

**Verificar**:
```bash
# Verificar que DISPLAY está configurado
echo $DISPLAY  # Debería ser algo como :0 o :1

# Verificar que X11 funciona
xeyes  # Debería abrir una ventana con ojos
```

**Solución**: Asegúrate de ejecutar el worker en un entorno con GUI (no SSH sin X forwarding)

### Worker no puede cargar el modelo

**Problema**: `FileNotFoundError: /models/yolo11n.onnx`

**Solución**: El modelo está en la carpeta local, cambiar path:
```toml
# En edge-agent/config.toml
model_name = "./models/yolo11n.onnx"  # Ruta local en lugar de /models
```

## Volver a Configuración Docker

Cuando quieras volver a usar todo en Docker:

### 1. Edge-Agent config.toml
```toml
# Comentar localhost
# worker_host = "localhost"
# Descomentar Docker
worker_host = "worker-ai"
worker_port = 7001
```

### 2. Ejecutar todo con Docker Compose
```bash
docker-compose up --build
```

## Shortcuts Útiles

```bash
# Detener worker local
Ctrl+C en terminal del worker

# Ver logs de edge-agent en tiempo real
docker-compose logs -f edge-agent

# Ver logs de worker (en otro terminal)
# (Los logs ya se ven en el terminal donde lo ejecutaste)

# Reiniciar edge-agent sin reconstruir
docker-compose restart edge-agent

# Limpiar y reiniciar todo
docker-compose down
docker-compose up --build
```

## Resumen de Configuración Actual

| Componente | Ubicación | Puerto | Config |
|------------|-----------|--------|--------|
| Worker-AI | Local (mamba) | 7001 | config.toml (local) |
| Edge-Agent | Docker | - | config.toml → localhost:7001 |
| MediaMTX | Docker | 8554 | - |
| Session-Store | Docker | 8080 | - |
| Postgres | Docker | 15432 | - |

**✨ Listo para probar! Ejecuta los comandos del Paso 1 y 2 para ver los frames en pantalla.**
