#!/usr/bin/env bash
set -euo pipefail

# Directorios base
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/services/worker-ai"

# Verificar que exista worker.py
if [[ ! -f "$WORKER_DIR/worker.py" ]]; then
    echo "[worker-ai] Error: No se encontró worker.py" >&2
    exit 1
fi

# Verificar que exista config.toml
if [[ ! -f "$WORKER_DIR/config.toml" ]]; then
    echo "[worker-ai] Error: No se encontró config.toml" >&2
    echo "[worker-ai] Por favor crear el archivo de configuración antes de ejecutar." >&2
    exit 1
fi

# Verificar que existan los protobuf generados
if [[ ! -f "$WORKER_DIR/ai_pb2.py" ]]; then
    echo "[worker-ai] Generando protobuf para ai.proto..."
    pushd "$WORKER_DIR" >/dev/null
    python3 -m grpc_tools.protoc -I../../proto --python_out=. ../../proto/ai.proto
    popd >/dev/null
fi

# Entrar al directorio del worker
pushd "$WORKER_DIR" >/dev/null

echo "[worker-ai] Starting AI Worker"
echo "[worker-ai] Configuration: config.toml"
echo ""
echo "[worker-ai] Protocol Features:"
echo "  - Native NV12/I420 support (no RGB conversion)"
echo "  - Window-based backpressure control"
echo "  - Dynamic window auto-tuning"
echo "  - Protocol version validation"
echo "  - Heartbeat with auto-reconnect"
echo ""

# Ejecutar worker (lee config.toml automáticamente)
python3 worker.py

popd >/dev/null