#!/usr/bin/env bash
set -e

# Script para ejecutar el AI Worker localmente (para testing)

WORKER_DIR="$(cd "$(dirname "$0")/../services/worker-ai" && pwd)"

echo "[worker-ai] Starting Python AI Worker locally"
echo "[worker-ai] Working directory: $WORKER_DIR"
echo ""

cd "$WORKER_DIR"

# Check if model exists
if [ ! -f "yolov8n.onnx" ]; then
  echo "[worker-ai] WARNING: yolov8n.onnx not found!"
  echo "[worker-ai] Download it with:"
  echo ""
  echo "  wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx -P services/worker-ai/"
  echo ""
  echo "[worker-ai] Or place your own ONNX model in: $WORKER_DIR/yolov8n.onnx"
  echo ""
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
  echo "[worker-ai] Creating Python virtual environment..."
  python3 -m venv venv
  echo "[worker-ai] Installing dependencies..."
  source venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
else
  source venv/bin/activate
fi

# Set environment variables for local testing
export BIND_HOST=${BIND_HOST:-0.0.0.0}
export BIND_PORT=${BIND_PORT:-7001}
export LOG_LEVEL=${LOG_LEVEL:-info}
export ENABLE_VISUALIZATION=${ENABLE_VISUALIZATION:-true}  # Habilitar visualización por defecto en local

echo "[worker-ai] Configuration:"
echo "  Host: $BIND_HOST"
echo "  Port: $BIND_PORT"
echo "  Log Level: $LOG_LEVEL"
echo "  Visualization: $ENABLE_VISUALIZATION"
echo ""
echo "[worker-ai] Starting worker..."
echo "============================================"
echo ""

# Run worker
python worker.py
