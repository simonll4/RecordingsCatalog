# Legacy Worker (Protocol v0)

Este directorio contiene la implementación del **AI Worker v0** mantenida únicamente como **referencia**.

## ⚠️ NO USAR EN PRODUCCIÓN

El código en esta carpeta:
- **NO está activo** en Docker ni en producción
- Implementa el protocolo v0 (obsoleto)
- Se mantiene solo para consulta o migración futura

## Archivos Legacy

- `worker.py` - AI Worker protocolo v0
- `ai_pb2.py` - Protobuf generado desde `proto/ai.legacy.proto`

## Protocolo Actual (v1)

El sistema usa **protocolo v1**:
- Worker: `worker_v1.py`
- Protobuf: `ai_v1_pb2.py` (generado desde `proto/ai_v1.proto`)
- Dockerfile: copia y ejecuta `worker_v1.py`

## Regenerar Protobuf v1

```bash
cd services/worker-ai
python3 -m grpc_tools.protoc -I../../proto --python_out=. ../../proto/ai_v1.proto
```

## Ejecutar Worker v1

```bash
# Local
./scripts/run-worker-v1.sh

# Docker
docker-compose up worker-ai
```

Para más información: `services/edge-agent/docs/PROTOCOL_V1_IMPLEMENTATION.md`
