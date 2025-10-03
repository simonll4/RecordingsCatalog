#!/usr/bin/env bash
set -euo pipefail

# Script para ejecutar el edge-agent con Docker Compose

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"

# Detecta el comando de Compose
COMPOSE_CMD=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD=(docker-compose)
    else
        echo "[ERROR] docker compose not found" >&2
        exit 1
    fi
fi

echo "🚀 Edge Agent - Docker Compose"
echo "================================"
echo ""

# Verificar si hay cambios sin compilar
EDGE_DIR="${ROOT_DIR}/services/edge-agent"
if [[ -d "${EDGE_DIR}/src" ]] && [[ ! -f "${EDGE_DIR}/dist/main.js" ]]; then
    echo "⚠️  Warning: No build found in edge-agent"
    echo "   Building now..."
    pushd "${EDGE_DIR}" >/dev/null
    npm install
    npm run build
    popd >/dev/null
    echo "   ✅ Build complete"
    echo ""
fi

# Parsear argumentos
ACTION="up"
BUILD_FLAG=""
DETACH_FLAG="-d"

while (($#)); do
    case "$1" in
        --build)
            BUILD_FLAG="--build"
            ;;
        --fg|--foreground)
            DETACH_FLAG=""
            ;;
        up|down|logs|ps|stop|start|restart)
            ACTION="$1"
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
    shift
done

# Ejecutar comando
case "$ACTION" in
    up)
        echo "📦 Starting edge-agent with profile 'edge'..."
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" --profile edge up $DETACH_FLAG $BUILD_FLAG
        if [[ -n "$DETACH_FLAG" ]]; then
            echo ""
            echo "✅ Edge agent started"
            echo ""
            echo "📊 Status:"
            "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" ps --filter "name=edge-agent"
            echo ""
            echo "📝 View logs:"
            echo "   ${COMPOSE_CMD[*]} -f ${COMPOSE_FILE} logs -f edge-agent"
        fi
        ;;
    down)
        echo "🛑 Stopping edge-agent..."
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" --profile edge down
        ;;
    logs)
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" logs -f edge-agent
        ;;
    ps)
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" ps --filter "name=edge-agent"
        ;;
    stop)
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" stop edge-agent
        ;;
    start)
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" start edge-agent
        ;;
    restart)
        "${COMPOSE_CMD[@]}" -f "${COMPOSE_FILE}" restart edge-agent
        ;;
esac
