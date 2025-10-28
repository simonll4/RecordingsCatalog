# Worker AI - Implementación Completa

## ✅ Objetivo Cumplido

Se ha implementado exitosamente la separación del worker de IA en su propio contenedor Python con comunicación TCP + Protobuf, manteniendo la semántica del orquestador existente.

## 📋 Componentes Implementados

### 1. Contrato Protobuf (`proto/ai.proto`)

✅ **Mensajes definidos:**
- `Envelope` (wrapper con oneof)
- `Request` → `Init`, `Frame`, `End`
- `End` cierra la sesión activa en el worker y fuerza el cierre de archivos JSON.
- `Response` → `InitOk`, `Ready`, `Result`, `Error`
- `Heartbeat` (bidireccional)

✅ **Campos clave:**
- `model_id`: hash del modelo cargado
- `ts_mono_ns`: timestamp monotónico para sincronización
- `max_frame_bytes`: límite de payload
- `providers`: execution providers (CPU/CUDA)
- `preproc`: info de preprocesamiento

### 2. Worker Python (`services/worker-ai/`)

✅ **Características:**
- Estados: IDLE, LOADING, READY, SESSION_ACTIVE
- Regla de desconexión → timer de inactividad (60s default)
- Hot-reload: Init diferente → recarga modelo
- Ventana 1: backpressure natural
- ONNX Runtime con soporte CPU/CUDA
- YOLO11 con NMS optimizado

✅ **Archivos:**
- `worker_new.py`: Servidor TCP asyncio
- `requirements.txt`: numpy, onnxruntime, protobuf
- `Dockerfile`: Image Python 3.11-slim
- `healthcheck.py`: Health check TCP
- `README.md`: Documentación completa

### 3. Cliente TCP Node (`services/edge-agent/src/modules/ai-client.ts`)

✅ **Características:**
- Backpressure ventana 1 (Ready/Result)
- Latest-wins: reemplaza frame encolado
- Reconexión automática con backoff exponencial
- Re-init al reconectar
- Heartbeat timeout (10s)
- Length-prefixed framing (uint32LE)

✅ **Interfaz estable:**
```typescript
interface AIClient {
  connect(): Promise<void>;
  init(args): Promise<void>;
  canSend(): boolean;
  sendFrame(...): void;
  onResult(cb): void;
  shutdown(): Promise<void>;
}
```

### 4. AI Engine TCP (`services/edge-agent/src/modules/ai-engine-tcp.ts`)

✅ **Características:**
- Interfaz `AIEngine` compatible con orquestador
- Delega inferencia al worker
- Filtra detecciones (umbral + clases) en Node
- Publica eventos `ai.detection` / `ai.keepalive`
- Keepalive automático (2s)

### 5. Integración con Orquestador

✅ **Sin cambios en:**
- `Orchestrator`: FSM sin modificaciones
- `AICapture`: sigue usando `onFrame` callback
- Eventos del bus: misma semántica
- Estados FSM: IDLE → DWELL → ACTIVE → CLOSING

✅ **Cambios mínimos en:**
- `main.ts`: `AIEngineSim` → `AIEngineTcp`
- `config/schema.ts`: campo `worker: { host, port }`
- `config/index.ts`: lectura de `AI_WORKER_HOST/PORT`

### 6. Docker Compose

✅ **Nuevo servicio:**
```yaml
worker-ai:
  build: ./services/worker-ai
  environment:
    - BIND_HOST=0.0.0.0
    - BIND_PORT=7001
    - IDLE_TIMEOUT_SEC=60
  volumes:
    - ./data/models:/models:ro
  healthcheck:
    test: ["CMD", "python3", "healthcheck.py"]
```

✅ **Actualizado:**
```yaml
edge-agent:
  depends_on:
    worker-ai:
      condition: service_healthy
  environment:
    - AI_WORKER_HOST=worker-ai
    - AI_WORKER_PORT=7001
```

### 7. Scripts y Herramientas

✅ **Scripts creados:**
- `scripts/generate-proto.sh`: Genera código Protobuf (Python + TS)
- `scripts/setup-ai-worker.sh`: Setup completo (deps + proto + modelo)

✅ **Documentación:**
- `services/worker-ai/README.md`: Arquitectura, API, troubleshooting
- `docs/AI_WORKER_MIGRATION.md`: Guía de migración
- `data/models/README.md`: Cómo obtener modelos ONNX

## 🎯 Criterios de Aceptación

### Unit Tests
- ✅ Parser de framing length-prefixed
- ✅ Máquina de estados Ready/Result
- ✅ Latest-wins (encolado)

### Integration Tests
- ✅ Handshake Init/InitOk/Ready
- ✅ Envío de frames sintéticos
- ✅ Recepción de Result
- ✅ Publicación de eventos al bus

### Resiliencia
- ✅ Reconexión automática
- ✅ Idle timeout → unload modelo
- ✅ Re-init al reconectar
- ✅ Hot-reload de modelo

### Rendimiento (objetivo)
- 🎯 640×480 RGB @ 10-12 fps
- 🎯 p95 end-to-end < 150ms
- 🎯 Drops por latest-wins ≤ 5%

## 📊 Métricas Implementadas

### Agent (Node)
- `ai_init_ok_total`
- `ai_reconnects_total`
- `ai_frame_inflight` (0/1)
- `ai_frames_sent_total`
- `ai_drops_latestwins_total`
- `ai_result_latency_ms`
- `ai_detections_total`

### Worker (Python)
- `worker_state` (IDLE/LOADING/READY)
- `connections_active`
- `frames_processed_total`
- `inference_time_ms`
- `model_load_seconds`
- `transitions_to_idle_total`

## 🚀 Cómo Empezar

### 1. Setup Inicial
```bash
./scripts/setup-ai-worker.sh
```

### 2. Arrancar Servicios
```bash
docker-compose up -d
```

### 3. Verificar
```bash
# Logs
docker-compose logs -f worker-ai edge-agent

# Salud
docker-compose ps

# Métricas
docker stats worker-ai edge-agent
```

### 4. Testing
```bash
# Unit tests
cd services/edge-agent
npm test

# Integration tests
npm run test:integration
```

## 🔧 Configuración

### Variables Críticas

**Worker:**
- `BIND_HOST`: 0.0.0.0
- `BIND_PORT`: 7001
- `IDLE_TIMEOUT_SEC`: 60

**Agent:**
- `AI_WORKER_HOST`: worker-ai
- `AI_WORKER_PORT`: 7001
- `AI_MODEL_NAME`: /models/yolo11s.onnx
- `AI_UMBRAL`: 0.35
- `AI_FPS_IDLE`: 5
- `AI_FPS_ACTIVE`: 12

## 📦 Estructura Final

```
tpfinal-v3/
├── proto/
│   └── ai.proto                    # Contrato único
├── services/
│   ├── edge-agent/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── ai-client.ts       # TCP client
│   │   │   │   ├── ai-engine-tcp.ts   # Engine remoto
│   │   │   │   └── ai-engine-sim.ts   # Simulador (dev)
│   │   │   └── proto/
│   │   │       ├── ai_pb.js           # Generado
│   │   │       └── ai_pb.d.ts         # Generado
│   │   └── package.json
│   └── worker-ai/
│       ├── worker_new.py              # Worker Python
│       ├── ai_pb2.py                  # Generado
│       ├── requirements.txt
│       ├── Dockerfile
│       └── healthcheck.py
├── data/
│   └── models/
│       └── yolo11s.onnx              # Modelo ONNX
├── scripts/
│   ├── generate-proto.sh
│   └── setup-ai-worker.sh
└── docker-compose.yml
```

## 🐛 Troubleshooting Común

### Worker no arranca
```bash
docker-compose logs worker-ai
docker-compose exec worker-ai ls -lh /models/
```

### Agent no conecta
```bash
docker-compose exec edge-agent nc -zv worker-ai 7001
docker-compose exec edge-agent env | grep AI_WORKER
```

### Modelo no carga
```bash
docker-compose exec worker-ai python3 -c "
import onnxruntime as ort
session = ort.InferenceSession('/models/yolo11s.onnx')
print('OK')
"
```

## 🎓 Próximos Pasos

1. ⏳ Tests de carga (stress testing)
2. ⏳ Métricas avanzadas (Prometheus)
3. ⏳ GPU support (CUDA/TensorRT)
4. ⏳ Batch inference
5. ⏳ Model zoo (múltiples modelos)
6. ⏳ Compression (JPEG/WebP)
7. ⏳ Multi-client support

## 📚 Referencias

- [Protobuf Docs](https://protobuf.dev/)
- [ONNX Runtime](https://onnxruntime.ai/)
- [YOLO11](https://github.com/ultralytics/ultralytics)
- [TCP Backpressure](https://ferd.ca/queues-don-t-fix-overload.html)

---

**Estado:** ✅ Implementación completa y funcional  
**Fecha:** Octubre 2025  
**Autor:** Edge Agent Team
