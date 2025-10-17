# Worker AI - Arquitectura TCP + Protobuf + Tracking

## Objetivo

Separar el worker de IA en su propio contenedor (Python + ONNX) y comunicarlo con el edge-agent (Node) mediante TCP + Protobuf con length-prefixed framing y backpressure de ventana 1 (latest-wins). Incluye tracking de objetos (BoT-SORT) y persistencia de sesiones en formato JSON.

## Arquitectura

```
┌─────────────────┐          TCP + Protobuf           ┌─────────────────┐
│   Edge Agent    │◄──────────────────────────────────►│   Worker AI     │
│   (Node.js)     │        Length-prefixed            │   (Python)      │
│                 │        Ventana 1 (Ready)          │                 │
│  - AIClient     │                                   │  - ONNX Runtime │
│  - AIEngineTcp  │                                   │  - YOLO11       │
│  - Orquestador  │                                   │  - BoT-SORT     │
│                 │                                   │  - Asyncio      │
└─────────────────┘                                   └─────────────────┘
        │                                                     │
        │ ai.detection / ai.keepalive                        │
        ▼                                                     │
   ┌─────────┐                                               │
   │   Bus   │                                               │
   └─────────┘                                               │
        │                                                     │
        ▼                                                     │
   Orquestador (FSM)                                         │
        │                                                     │
        ▼                                                     │
   IDLE → DWELL → ACTIVE → CLOSING                          │
                                                              │
                                              ┌───────────────┘
                                              │
                                              ▼
                                    Estados del Worker:
                                    - IDLE (sin modelo)
                                    - LOADING (cargando)
                                    - READY (listo)
                                    - SESSION_ACTIVE (procesando)
                                    
                                    Tracking & Persistencia:
                                    - BoT-SORT Tracker (IoU-based)
                                    - Session Manager (por session_id)
                                    - JSON persistence:
                                      * tracks.jsonl (eventos)
                                      * index.json (índice por segundo)
                                      * meta.json (metadatos)
```

## Setup y Ejecución

### Prerequisitos

- **Mamba/Conda**: Gestor de entornos Python
- **Python 3.10.19**: Especificado en environment.yml
- **CUDA** (opcional): Para aceleración GPU

### Instalación con Mamba

```bash
# Navegar al directorio del worker
cd /home/simonll4/Desktop/New\ Folder/tpfinal-v3/services/worker-ai

# Crear entorno desde environment.yml
mamba env create -f environment.yml

# Activar entorno
mamba activate worker-ai

# Verificar instalación
python --version  # Debe ser 3.10.19
python -c "import onnxruntime as ort; print(f'ONNX Runtime: {ort.__version__}')"
python -c "import cv2; print(f'OpenCV: {cv2.__version__}')"
```

### Ejecución Local

**Opción 1: Script automático (recomendado)**
```bash
# Ejecutar con el script de conveniencia
./run.sh

# El script automáticamente:
# - Verifica que mamba esté instalado
# - Crea el entorno si no existe
# - Activa el entorno
# - Ejecuta el worker
```

**Opción 2: Manual**
```bash
# Activar entorno
mamba activate worker-ai

# Ejecutar worker
python worker_new.py

# El worker estará escuchando en 0.0.0.0:7001
# Logs mostrarán: "AI Worker listening on 0.0.0.0:7001"
```

### Configuración

Editar `config.toml` para ajustar parámetros:

```toml
[server]
bind_host = "0.0.0.0"
bind_port = 7001

[tracker]
enabled = true
type = "botsort"
config_path = "botsort.yaml"

[sessions]
output_dir = "/data/tracks"
default_fps = 10.0
```

## Nuevas Funcionalidades

### 1. Tracking de Objetos (BoT-SORT)

El worker ahora incluye tracking de objetos usando un tracker basado en IoU (BoT-SORT simplificado). Cada detección recibe un `track_id` único que persiste a través de los frames.

**Configuración**: `botsort.yaml`
```yaml
match_thresh: 0.3    # Umbral de IoU para matching
max_age: 30          # Frames máximos sin detección antes de eliminar track
min_hits: 3          # Detecciones mínimas para confirmar track
track_buffer: 30     # Buffer de tracks
```

### 2. Gestión de Sesiones

Cada sesión de grabación del edge-agent genera archivos JSON separados con los datos de tracking:

> **Importante**: El edge-agent debe enviar un mensaje `End` cuando termine una sesión. El worker cierra los archivos (`tracks.jsonl`, `index.json`, `meta.json`) al recibirlo. Los frames sin `session_id` se procesan para detección pero no se persisten.

**Estructura de archivos**:
```
/data/tracks/
  └── {session_id}/
      ├── meta.json        # Metadatos de la sesión
      ├── tracks.jsonl     # Eventos de tracking (línea por frame)
      └── index.json       # Índice por segundo para seeking rápido
```

**meta.json**:
```json
{
  "session_id": "session_abc123",
  "fps": 10.0,
  "img_w": 640,
  "img_h": 640,
  "device_id": "cam-local",
  "frame_count": 250,
  "start_time": "2025-10-16T20:30:15",
  "end_time": "2025-10-16T20:34:25"
}
```

**tracks.jsonl** (evento por línea):
```jsonl
{"t": 0.0, "objs": [{"id": 1, "cls": "person", "conf": 0.85, "xyxy": [0.2, 0.3, 0.4, 0.5]}]}
{"t": 0.1, "objs": [{"id": 1, "cls": "person", "conf": 0.87, "xyxy": [0.21, 0.31, 0.41, 0.51]}]}
```

**index.json**:
```json
{
  "fps": 10.0,
  "duration": 120.5,
  "offsets": {
    "0": 0,
    "1": 234,
    "2": 512,
    ...
  }
}
```

### 3. Coordenadas Normalizadas

Las coordenadas en los archivos JSON están normalizadas [0, 1] para facilitar el replay en diferentes resoluciones.

## Contrato Protobuf

Ver `proto/ai.proto` para la definición completa.

### Mensajes principales

#### Request (Agent → Worker)

- **Init**: Inicializar/cambiar modelo
  - `model_path`: Path al modelo ONNX
  - `width`, `height`: Resolución de frames
  - `conf_threshold`: Umbral de confianza
  - `classes_filter`: Clases a detectar (opcional)

- **Frame**: Frame para inferencia
  - `seq`: Secuencia del frame
  - `ts_iso`: Timestamp ISO8601
  - `ts_mono_ns`: Timestamp monotónico (nanosegundos)
  - `width`, `height`: Dimensiones
  - `pix_fmt`: Formato de píxeles (RGB)
  - `data`: Frame raw (bytes)

- **Shutdown**: Solicitud de cierre graceful

#### Response (Worker → Agent)

- **InitOk**: Confirmación de inicialización
  - `runtime`: Versión de ONNX Runtime
  - `model_version`: Versión del modelo
  - `class_names`: Clases detectables
  - `max_frame_bytes`: Límite de payload
  - `providers`: Execution providers (CPU/CUDA)
  - `model_id`: Hash/ID del modelo
  - `preproc`: Info de preprocesamiento

- **Ready**: Crédito para enviar siguiente frame
  - `seq`: Secuencia del último frame procesado

- **Result**: Resultado de inferencia
  - `seq`: Secuencia del frame
  - `ts_iso`, `ts_mono_ns`: Timestamps
  - `detections[]`: Array de detecciones
    - `cls`: Clase
    - `conf`: Confianza
    - `bbox`: Bounding box (x, y, w, h)
    - `track_id`: ID de tracking (opcional)

- **Error**: Error de procesamiento
  - `code`: Código de error
  - `message`: Descripción

#### Heartbeat (Bidireccional)

- `ts_mono_ns`: Timestamp monotónico

## Backpressure (Ventana 1 + Latest-Wins)

### Flujo normal

```
Agent                          Worker
  │                              │
  ├──────► Init ────────────────►│
  │                              │ (carga modelo)
  │◄──────── InitOk ────────────┤
  │◄──────── Ready(0) ───────────┤ (crédito inicial)
  │                              │
  ├──────► Frame(1) ────────────►│
  │                              │ (inferencia)
  │◄──────── Result(1) ──────────┤
  │                              │ (crédito implícito)
  ├──────► Frame(2) ────────────►│
  │                              │
```

### Latest-wins

Si llega un nuevo frame mientras hay uno en vuelo:

```
Agent                          Worker
  │                              │
  ├──────► Frame(1) ────────────►│ (inflight)
  │                              │
  │  Frame(2) encolado           │
  │  (reemplaza pending)         │
  │                              │
  │◄──────── Result(1) ──────────┤ (crédito)
  ├──────► Frame(2) ────────────►│ (envía pending)
  │                              │
```

## Estados del Worker

### IDLE
- Sin modelo cargado
- Sin clientes conectados
- RAM/GPU liberada

### LOADING
- Cargando/cambiando modelo
- Bloquea crédito (no envía Ready hasta terminar)

### READY
- Modelo cargado
- Listo para atender conexiones
- Puede procesar frames

### Regla de Inactividad

```python
if desconexión:
    arranca_timer(IDLE_TIMEOUT_SEC)  # ej. 60s
    
    if nueva_conexión_antes_de_timeout:
        cancela_timer()
        continúa en READY
    else:
        unload_modelo()
        transición a IDLE
```

## Cliente TCP (Node)

### Interfaz

```typescript
interface AIClient {
  connect(): Promise<void>;
  init(args: InitArgs): Promise<void>;
  canSend(): boolean;  // true si hay crédito
  sendFrame(seq, tsIso, tsMonoNs, w, h, rgb): void;
  onResult(cb: (r: Result) => void): void;
  onError(cb: (err: Error) => void): void;
  shutdown(): Promise<void>;
}
```

### Reconexión automática

Backoff exponencial:
- Intento 1: 500ms
- Intento 2: 2s
- Intento 3: 5s
- Intento 4: 10s
- Intento 5+: 30s (máximo)

Al reconectar, siempre envía `Init` antes de frames.

## Integración con Orquestador

### AICapture

```typescript
// Muestreo a fps fijo (10-12 fps)
const onFrame = (rgb: Buffer, meta: FrameMeta) => {
  if (aiClient.canSend()) {
    aiClient.sendFrame(seq++, meta.ts, tsMonoNs, w, h, rgb);
  } else {
    // Latest-wins: AIClient encola internamente
  }
};
```

### AIEngineTcp

```typescript
// Recibe Result del worker
aiClient.onResult((result) => {
  // Filtrar por umbral y clases (lógica en Node)
  const filtered = result.detections.filter(d => 
    d.conf >= umbral && classesFilter.has(d.cls)
  );
  
  if (filtered.length > 0) {
    bus.emit("ai.detection", { detections: filtered, relevant: true });
  } else {
    bus.emit("ai.detection", { detections: [], relevant: false });
  }
});
```

### Orquestador

No cambia. Sigue escuchando `ai.detection` y `ai.keepalive`.

## Configuración TOML

### Edge Agent

**Archivo**: `services/edge-agent/config.toml`

```toml
[ai]
worker_host = "worker-ai"
worker_port = 7001
model_name = "/models/yolo11n.onnx"
width = 640
height = 480
umbral = 0.35
classes_filter = "person,car"
fps_idle = 5
fps_active = 12
```

### Worker AI

**Archivo**: `services/worker-ai/config.toml`

```toml
[server]
bind_host = "0.0.0.0"
bind_port = 7001
idle_timeout_sec = 60

[bootstrap]
enabled = false  # true para pre-cargar modelo al arranque
model_path = "/models/yolo11n.onnx"
width = 640
height = 480
conf = 0.35
```

## Docker Compose

```yaml
services:
  worker-ai:
    build: ./services/worker-ai
    environment:
      - TZ=UTC
    volumes:
      - ./data/models:/models:ro
    healthcheck:
      test: ["CMD", "python3", "healthcheck.py"]
      interval: 10s
      timeout: 2s
      retries: 3

  edge-agent:
    build: ./services/edge-agent
    depends_on:
      worker-ai:
        condition: service_healthy
    environment:
      - TZ=UTC
```

**Nota**: La configuración se maneja vía `config.toml` en cada servicio, **no mediante variables de entorno**.

## Métricas

### Agent (Node)

- `ai_init_ok_total`: Total de Init exitosos
- `ai_reconnects_total`: Total de reconexiones
- `ai_frame_inflight`: Frames en vuelo (0/1)
- `ai_frames_sent_total`: Total de frames enviados
- `ai_drops_latestwins_total`: Frames descartados por latest-wins
- `ai_result_latency_ms`: Latencia de inferencia (p50, p95)
- `ai_detections_total`: Total de detecciones
- `ai_detections_relevant_total`: Detecciones relevantes (post-filtro)

### Worker (Python)

- `worker_state`: Estado actual (IDLE/LOADING/READY)
- `connections_active`: Conexiones activas
- `frames_processed_total`: Total de frames procesados
- `inference_time_ms`: Tiempo de inferencia (p50, p95)
- `model_load_seconds`: Tiempo de carga de modelo
- `transitions_to_idle_total`: Transiciones a IDLE por timeout

## Testing

### Unit Tests (Node)

```bash
cd services/edge-agent
npm test
```

Tests:
- Parser de framing length-prefixed
- Máquina de estados Ready/Result (crédito)
- Latest-wins (encolado)

### Integration Tests

```bash
cd services/edge-agent
npm run test:integration
```

Tests:
- Handshake Init/InitOk/Ready
- Envío de frames sintéticos
- Recepción de Result
- Publicación de eventos al bus
- Reconexión automática

### Resiliencia

```bash
# Cerrar worker → reconexión
docker-compose stop worker-ai
# Esperar reconexión del agent
docker-compose start worker-ai

# Idle timeout → unload
docker-compose exec edge-agent bash
# Desconectar sin volver a conectar
# Verificar logs del worker: "Idle timeout, unloading model"
```

## Rendimiento

### Objetivo

- Resolución: 640×480 RGB
- FPS: 10-12 fps
- Latencia end-to-end (p95): < 150ms
- Drops por latest-wins: ≤ 5% (con cámara a 30 fps)

### Optimizaciones

1. **TCP_NODELAY**: Desactiva Nagle para baja latencia
2. **Letterbox**: Resize con aspect ratio (menos distorsión)
3. **NMS optimizado**: NumPy vectorizado (rápido)
4. **Ventana 1**: Backpressure natural (no sobrecarga)
5. **Latest-wins**: Descarta frames viejos (siempre procesa frescos)

## Troubleshooting

### Worker no arranca

```bash
# Ver logs
docker-compose logs worker-ai

# Verificar healthcheck
docker-compose ps worker-ai

# Probar conexión manual
nc -zv worker-ai 7001
```

### Agent no conecta

```bash
# Ver logs del agent
docker-compose logs edge-agent

# Verificar configuración
docker-compose exec edge-agent cat config.toml

# Probar conexión desde container
docker-compose exec edge-agent nc -zv worker-ai 7001
```

### Modelo no carga

```bash
# Verificar path del modelo
docker-compose exec worker-ai ls -lh /models/

# Verificar permisos
docker-compose exec worker-ai stat /models/yolo11n.onnx

# Probar carga manual
docker-compose exec worker-ai python3 -c "
import onnxruntime as ort
session = ort.InferenceSession('/models/yolo11n.onnx')
print('OK')
"
```

### Alta latencia

```bash
# Verificar métricas de inferencia
docker-compose logs worker-ai | grep "Inference done"

# Verificar CPU/GPU
docker stats worker-ai

# Probar con modelo más pequeño
# yolo11n.onnx → yolo11-nano.onnx
```

## Próximos Pasos

1. **GPU support**: Agregar soporte para CUDA/TensorRT
2. **Batch inference**: Procesar múltiples frames juntos
3. **Model zoo**: Soporte para múltiples modelos (cambio dinámico)
4. **Compression**: Comprimir frames (JPEG/WebP) para reducir bandwidth
5. **Multi-client**: Soportar múltiples agents simultáneos

## Referencias

- [Protobuf Docs](https://protobuf.dev/)
- [ONNX Runtime](https://onnxruntime.ai/)
- [YOLO11](https://github.com/ultralytics/ultralytics)
- [TCP Backpressure](https://ferd.ca/queues-don-t-fix-overload.html)
