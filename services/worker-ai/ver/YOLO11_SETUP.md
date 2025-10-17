# Configuración Actualizada - YOLO11n Local

## ✅ Cambios Realizados

### 1. Modelo YOLO11n Copiado
- **Desde**: `/home/simonll4/Desktop/New Folder/CV/models/yolo11n.onnx`
- **A**: `/home/simonll4/Desktop/New Folder/tpfinal-v3/data/models/yolo11n.onnx`
- **También en**: `/home/simonll4/Desktop/New Folder/tpfinal-v3/services/worker-ai/models/yolo11n.onnx`

### 2. Edge-Agent Config Actualizado
**Archivo**: `services/edge-agent/config.toml`

```toml
[ai]
# DESARROLLO LOCAL: path absoluto en el host donde corre el worker
model_name = "/home/simonll4/Desktop/New Folder/tpfinal-v3/data/models/yolo11n.onnx"
```

### 3. Firewall Configurado
```bash
sudo ufw allow 7001/tcp  # ✅ Ya ejecutado
```

## 🚀 Ejecutar Ahora

### Terminal 1: Worker
```bash
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3/services/worker-ai
./run.sh
```

**Espera a ver**:
```
AI Worker listening on 0.0.0.0:7001
```

### Terminal 2: Reconstruir y Ejecutar Edge-Agent
```bash
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3

# Reconstruir edge-agent con nueva config
docker-compose build edge-agent

# Iniciar servicios
docker-compose up edge-agent mediamtx session-store postgres
```

## ✅ Verificación Exitosa

Deberías ver en el worker:
```
Client connected: ('172.18.0.x', XXXXX)
Received Init: model=/home/simonll4/Desktop/New Folder/tpfinal-v3/data/models/yolo11n.onnx
Loading model: /home/simonll4/Desktop/New Folder/tpfinal-v3/data/models/yolo11n.onnx
Model loaded successfully
Processing frame for session: ...
```

Y aparecer la **ventana OpenCV** con detecciones!

## 🔄 Revertir a Producción (Todo en Docker)

En `services/edge-agent/config.toml`:
```toml
[ai]
model_name = "/models/yolo11n.onnx"  # Path Docker

[ai]
worker_host = "worker-ai"  # Nombre del servicio
```

Y copiar yolo11n.onnx a `data/models/` (que ya está hecho).
