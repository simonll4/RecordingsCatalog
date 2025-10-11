#!/bin/bash
# Generar código Protobuf para Python y TypeScript

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTO_DIR="$SCRIPT_DIR/../proto"
WORKER_DIR="$SCRIPT_DIR/../services/worker-ai"
EDGE_DIR="$SCRIPT_DIR/../services/edge-agent"

echo "=== Protobuf Code Generation ==="
echo ""

# ============================================================================
# 1. Verificar dependencias de Python
# ============================================================================
echo "1. Checking Python dependencies..."

if ! python3 -c "import grpc_tools.protoc" 2>/dev/null; then
    echo "❌ grpcio-tools not found"
    echo "Installing Python dependencies..."
    pip3 install grpcio-tools protobuf
    echo "✓ Python dependencies installed"
else
    echo "✓ Python dependencies OK"
fi
echo ""

# ============================================================================
# 2. Generar código Python
# ============================================================================
echo "2. Generating Python protobuf code..."

python3 -m grpc_tools.protoc \
    -I"$PROTO_DIR" \
    --python_out="$WORKER_DIR" \
    "$PROTO_DIR/ai.proto"

echo "✓ Generated $WORKER_DIR/ai_pb2.py"
echo ""

# ============================================================================
# 3. Verificar dependencias de Node.js
# ============================================================================
echo "3. Checking Node.js dependencies..."

cd "$EDGE_DIR"

if [ ! -d "node_modules" ]; then
    echo "Installing Node.js dependencies..."
    npm install
    echo "✓ Node.js dependencies installed"
else
    echo "✓ Node.js dependencies OK"
fi
echo ""

# ============================================================================
# 4. Generar código TypeScript/JavaScript
# ============================================================================
echo "4. Generating TypeScript protobuf code..."

# Crear directorio proto si no existe
mkdir -p src/proto

# Usar protobufjs-cli (no pbjs standalone)
npx -p protobufjs-cli pbjs -t static-module -w es6 -o src/proto/ai_pb.js ../../proto/ai.proto

# Fix import para ES modules (agregar .js)
sed -i "s|from \"protobufjs/minimal\"|from \"protobufjs/minimal.js\"|g" src/proto/ai_pb.js

npx -p protobufjs-cli pbts -o src/proto/ai_pb.d.ts src/proto/ai_pb.js

echo "✓ Generated $EDGE_DIR/src/proto/ai_pb.js"
echo "✓ Generated $EDGE_DIR/src/proto/ai_pb.d.ts"
echo ""

# ============================================================================
# 5. Resumen
# ============================================================================
echo "=== Protobuf Code Generation Complete! ==="
echo ""
echo "Generated files:"
echo "  - $WORKER_DIR/ai_pb2.py"
echo "  - $EDGE_DIR/src/proto/ai_pb.js"
echo "  - $EDGE_DIR/src/proto/ai_pb.d.ts"
echo ""
echo "Next steps:"
echo "  1. Build services: docker-compose build worker-ai edge-agent"
echo "  2. Start services: docker-compose up -d"
echo ""
