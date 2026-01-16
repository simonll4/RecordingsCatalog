#!/bin/bash
# Script para ejecutar el Worker AI

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🤖 Worker AI - Starting..."
echo ""

# Preparar restauración de config.toml si creamos un symlink temporal
RESTORE_CONFIG=""
BACKUP_PATH="config.toml.__backup_run"

cleanup() {
    if [ "$RESTORE_CONFIG" = "__remove__" ]; then
        rm -f config.toml
    elif [ -n "$RESTORE_CONFIG" ] && [ -f "$RESTORE_CONFIG" ]; then
        rm -f config.toml
        mv "$RESTORE_CONFIG" config.toml
    fi
}
trap cleanup EXIT

# Usar config.local.toml si existe, sino config.toml
if [ -f "config.local.toml" ]; then
    echo "📝 Usando config.local.toml (desarrollo local)"
    export CONFIG_FILE="config.local.toml"
    if [ ! -L "config.toml" ] || [ "$(readlink config.toml)" != "config.local.toml" ]; then
        if [ -e "config.toml" ]; then
            rm -f "$BACKUP_PATH"
            cp config.toml "$BACKUP_PATH"
            RESTORE_CONFIG="$BACKUP_PATH"
        else
            RESTORE_CONFIG="__remove__"
        fi
        ln -sf config.local.toml config.toml
    fi
else
    echo "📝 Usando config.toml (producción/Docker)"
fi
echo ""

# Verificar que mamba está instalado
if ! command -v mamba &> /dev/null; then
    echo "❌ Error: mamba no está instalado"
    echo "   Instala mamba o conda antes de continuar"
    exit 1
fi

# Verificar que el entorno existe
if ! mamba env list | grep -q "worker-ai"; then
    echo "⚠️  Entorno 'worker-ai' no encontrado"
    echo "   Creando entorno desde environment.yml..."
    mamba env create -f environment.yml
    echo "✅ Entorno creado"
fi

# Ejecutar con mamba run (no requiere activación del shell)
echo "🔧 Usando entorno worker-ai..."
echo ""
echo "📊 Versiones instaladas:"
mamba run -n worker-ai python --version
mamba run -n worker-ai python -c "import onnxruntime as ort; print(f'   ONNX Runtime: {ort.__version__}')"
mamba run -n worker-ai python -c "import cv2; print(f'   OpenCV: {cv2.__version__}')"
mamba run -n worker-ai python -c "import numpy as np; print(f'   NumPy: {np.__version__}')"
echo ""

echo "🚀 Iniciando Worker AI..."
echo "   Escuchando en: 0.0.0.0:7001"
echo "   Output tracks: ./data/tracks/"
echo ""
echo "   Presiona Ctrl+C para detener"
echo ""

# Ejecutar worker con mamba run
mamba run -n worker-ai python worker.py
