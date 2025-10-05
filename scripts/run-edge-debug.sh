#!/usr/bin/env bash
# Script para ejecutar edge-agent con nivel de log específico
# Uso: ./run-edge-debug.sh   # LOG_LEVEL=debug
#      ./run-edge-info.sh    # LOG_LEVEL=info (default)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDGE_DIR="$ROOT_DIR/services/edge-agent"

# Detectar nivel según nombre del script
SCRIPT_NAME="$(basename "$0")"
case "$SCRIPT_NAME" in
  *debug*)
    LOG_LEVEL="debug"
    ;;
  *warn*)
    LOG_LEVEL="warn"
    ;;
  *error*)
    LOG_LEVEL="error"
    ;;
  *)
    LOG_LEVEL="info"
    ;;
esac

echo "🔧 Running edge-agent with LOG_LEVEL=$LOG_LEVEL"

cd "$EDGE_DIR"
export LOG_LEVEL
npm run dev
