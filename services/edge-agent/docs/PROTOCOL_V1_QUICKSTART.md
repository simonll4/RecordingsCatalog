# Protocol v1 Quickstart Guide

## Descripción

Protocol v1 permite enviar frames NV12/I420 nativos al worker de IA, reduciendo CPU y ancho de banda (sin convertir a RGB en transporte).

## Prerrequisitos

- Python (worker-ai): `cd services/worker-ai && pip install -r requirements.txt`
- Node.js (edge-agent): `cd services/edge-agent && npm install`
- Modelo ONNX disponible (p. ej. `yolov8n.onnx`, montado en `/models` por Docker o accesible localmente)

## Puesta en marcha

### Opción A: Docker Compose (recomendada)

```bash
docker compose up -d postgres mediamtx session-store
docker compose --profile edge up --build worker-ai edge-agent
```

Verifica en logs el handshake Init/InitOk y el flujo de `Frame`/`Result`.

### Opción B: Local (dos terminales)

Terminal 1 — Worker AI
```bash
cd services/worker-ai
export BIND_HOST=0.0.0.0
export BIND_PORT=7001
python3 worker.py
```

Terminal 2 — Edge Agent
```bash
cd services/edge-agent
export AI_WORKER_HOST=localhost
export AI_WORKER_PORT=7001
npm run dev
```

## Variables de entorno relevantes

Edge Agent
- `AI_WORKER_HOST` (default: `localhost`)
- `AI_WORKER_PORT` (default: `7001`)

Worker AI
- `BIND_HOST`, `BIND_PORT`, `BOOTSTRAP_*` (opcionales para precarga del modelo)

## Verificación rápida

- Worker logs: “Starting AI Worker v1…”, “Received Init…”, “Sent InitOk”, “Processing frame…”
- Edge logs: “Connected to AI worker”, “Received InitOk”, “Frame sent…”, “Received Result”

## Troubleshooting

- “Cannot send frame, no credit”
  - Revisa que el worker haya enviado `InitOk` y (opcionalmente) `WindowUpdate` con créditos > 0.
- “Protocol version 0 not supported”
  - Asegura que ambos lados usen `protocol_version = 1`.
- “ai_pb2 module not found”
  - Genera protobuf en el worker: `python3 -m grpc_tools.protoc -I../../proto --python_out=. ../../proto/ai.proto`.
- Depuración en edge-agent
  - `export LOG_LEVEL=debug && npm run dev`

## Flujo (resumen)

```
Edge Agent ── TCP ──> Worker
  Init -----------------------> InitOk
  Frame (NV12/I420) ----------> Result
  Heartbeat <-----------------> Heartbeat
```

Más detalles: `PROTOCOL_V1_IMPLEMENTATION.md`.
