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

# Verificar que existan los protobuf generados
if [[ ! -f "$WORKER_DIR/ai_pb2.py" ]]; then
    echo "[worker-ai] Generando protobuf para ai.proto..."
    pushd "$WORKER_DIR" >/dev/null
    python3 -m grpc_tools.protoc -I../../proto --python_out=. ../../proto/ai.proto
    popd >/dev/null
fi

# Entrar al directorio del worker
pushd "$WORKER_DIR" >/dev/null

# Variables de entorno
ENV_VARS=()

# Configuración del servidor
ENV_VARS+=("BIND_HOST=${BIND_HOST:-0.0.0.0}")
ENV_VARS+=("BIND_PORT=${BIND_PORT:-7001}")
ENV_VARS+=("IDLE_TIMEOUT_SEC=${IDLE_TIMEOUT_SEC:-60}")

# Bootstrap del modelo (opcional)
# Si se definen estas variables, el modelo se carga al iniciar
if [[ -n "${BOOTSTRAP_MODEL_PATH:-}" ]]; then
    ENV_VARS+=("BOOTSTRAP_MODEL_PATH=$BOOTSTRAP_MODEL_PATH")
    ENV_VARS+=("BOOTSTRAP_WIDTH=${BOOTSTRAP_WIDTH:-640}")
    ENV_VARS+=("BOOTSTRAP_HEIGHT=${BOOTSTRAP_HEIGHT:-480}")
    ENV_VARS+=("BOOTSTRAP_CONF=${BOOTSTRAP_CONF:-0.35}")
fi

# Comando
PYTHON_COMMAND=(python3 worker.py)

echo "[worker-ai] Starting AI Worker"
echo "[worker-ai] Command: ${PYTHON_COMMAND[*]}"
if [[ "${#ENV_VARS[@]}" -gt 0 ]]; then
    echo "[worker-ai] Environment: ${ENV_VARS[*]}"
fi
echo ""
echo "[worker-ai] Protocol Features:"
echo "  - Native NV12/I420 support (no RGB conversion)"
echo "  - Window-based backpressure control"
echo "  - Dynamic window auto-tuning"
echo "  - Protocol version validation"
echo "  - Heartbeat with auto-reconnect"
echo ""
echo "[worker-ai] Server listening on ${BIND_HOST:-0.0.0.0}:${BIND_PORT:-7001}"
echo ""

# Ejecutar
if [[ "${#ENV_VARS[@]}" -gt 0 ]]; then
    env "${ENV_VARS[@]}" "${PYTHON_COMMAND[@]}"
else
    "${PYTHON_COMMAND[@]}"
fi

popd >/dev/null
