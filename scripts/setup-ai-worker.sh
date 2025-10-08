#!/bin/bash
# Setup completo para la arquitectura TCP + Protobuf

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."

echo "=== Setup AI Worker + Edge Agent ==="
echo ""

# 1. Instalar dependencias de Node
echo "1. Installing Node.js dependencies..."
cd "$PROJECT_ROOT/services/edge-agent"
npm install
echo "✓ Node.js dependencies installed"
echo ""

# 2. Instalar dependencias de Python
echo "2. Installing Python dependencies..."
pip3 install grpcio-tools protobuf
echo "✓ Python dependencies installed"
echo ""

# 3. Generar código Protobuf
echo "3. Generating Protobuf code..."
bash "$SCRIPT_DIR/generate-proto.sh"
echo ""

# 4. Crear directorio de modelos si no existe
echo "4. Setting up models directory..."
mkdir -p "$PROJECT_ROOT/data/models"
echo "✓ Models directory ready"
echo ""

# 5. Descargar modelo YOLOv8n si no existe
if [ ! -f "$PROJECT_ROOT/data/models/yolov8n.onnx" ]; then
    echo "5. Downloading YOLOv8n model..."
    cd "$PROJECT_ROOT/data/models"
    wget -q --show-progress https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx
    echo "✓ YOLOv8n model downloaded"
else
    echo "5. YOLOv8n model already exists"
fi
echo ""

# 6. Build Docker images
echo "6. Building Docker images..."
cd "$PROJECT_ROOT"
docker-compose build worker-ai edge-agent
echo "✓ Docker images built"
echo ""

echo "=== Setup Complete! ==="
echo ""
echo "Next steps:"
echo "  1. Start services: docker-compose up -d"
echo "  2. Check logs: docker-compose logs -f worker-ai edge-agent"
echo "  3. Monitor metrics: docker stats"
echo ""
echo "Configuration:"
echo "  - Worker AI: services/worker-ai/"
echo "  - Edge Agent: services/edge-agent/"
echo "  - Protobuf: proto/ai.proto"
echo "  - Models: data/models/"
echo ""
