#!/usr/bin/env bash
set -euo pipefail
# -e: aborta si un comando falla
# -u: error si se usa una variable no definida
# -o pipefail: si falla cualquier comando en un pipe, falla todo el pipe

# Directorios base
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDGE_DIR="$ROOT_DIR/services/edge-agent"
DIST_DIR="$EDGE_DIR/dist"

# Valores por defecto
USE_CAMERA="auto"   # puede ser auto / yes / no
CUSTOM_CAMERA=""    # path específico, ej. /dev/video2
NODE_ARGS=()        # argumentos extras para el comando node

# Parseo de argumentos (flags)
while (($#)); do
    case "$1" in
        --with-camera)
            USE_CAMERA="yes"
        ;;
        --no-camera)
            USE_CAMERA="no"
        ;;
        --camera-device=*)
            CUSTOM_CAMERA="${1#*=}"   # extrae el valor después de "="
        ;;
        *)
            NODE_ARGS+=("$1")         # cualquier otro argumento se pasa tal cual a node
        ;;
    esac
    shift
done

# Verificación de build
if [[ ! -d "$DIST_DIR" ]]; then
    echo "[edge-agent] No se encontró la carpeta dist/." >&2
    echo "Ejecutá 'npm run build' dentro de services/edge-agent." >&2
    exit 1
fi

if [[ ! -f "$DIST_DIR/app/main.js" ]]; then
    echo "[edge-agent] No se encontró dist/app/main.js." >&2
    echo "Ejecutá 'npm run build' dentro de services/edge-agent." >&2
    exit 1
fi

# Asegurar que el bundle incluya Protobuf generado
if [[ ! -f "$DIST_DIR/proto/ai_pb.js" ]]; then
    echo "[edge-agent] Falta dist/proto/ai_pb.js. Ejecutando build..."
    pushd "$EDGE_DIR" >/dev/null
    npm run build
    popd >/dev/null
fi

# Entramos a la carpeta del servicio
pushd "$EDGE_DIR" >/dev/null

# Variables de entorno que se pasarán al proceso
ENV_VARS=()

# Variables para conectarse a servicios desde el host
ENV_VARS+=("MEDIAMTX_HOST=localhost")
ENV_VARS+=("STORE_BASE_URL=http://localhost:8080")

# AI Classes Filter Configuration
# AI_CLASSES_FILTER: Clases que dispararán grabación (COCO dataset)
#
# Clases comunes de COCO (80 clases disponibles):
#   person, car, bicycle, motorcycle, bus, truck, boat
#   bottle, wine glass, cup, fork, knife, spoon, bowl
#   cat, dog, bird, horse, sheep, cow
#   backpack, handbag, suitcase, umbrella
#   laptop, cell phone, keyboard, mouse, tv
#
# Ejemplos de uso:
#   - Solo personas: AI_CLASSES_FILTER=person
#   - Personas y vehículos: AI_CLASSES_FILTER=person,car,truck,bus
#   - Todo: AI_CLASSES_FILTER= (vacío = todas las clases son relevantes)

ENV_VARS+=("AI_CLASSES_FILTER=${AI_CLASSES_FILTER:-person}")

# Selección de cámara según flags
if [[ -n "$CUSTOM_CAMERA" ]]; then
    ENV_VARS+=("SOURCE_URI=$CUSTOM_CAMERA")
else
    case "$USE_CAMERA" in
        yes)
            ENV_VARS+=("SOURCE_URI=/dev/video0")
        ;;
        no)
            # Sin cámara, no setear nada (usará defaults del .env)
            :
        ;;
    esac
fi

# Comando final a ejecutar (ACTUALIZADO: app/main.js)
NODE_COMMAND=(node dist/app/main.js "${NODE_ARGS[@]}")

echo "[edge-agent] Starting Edge Agent v2.0"
echo "[edge-agent] Command: ${NODE_COMMAND[*]}"
if [[ "${#ENV_VARS[@]}" -gt 0 ]]; then
    echo "[edge-agent] Environment: ${ENV_VARS[*]}"
fi
echo ""

# Ejecutar con o sin env vars
if [[ "${#ENV_VARS[@]}" -gt 0 ]]; then
    env "${ENV_VARS[@]}" "${NODE_COMMAND[@]}"
else
    "${NODE_COMMAND[@]}"
fi

# Volvemos al directorio anterior
popd >/dev/null
