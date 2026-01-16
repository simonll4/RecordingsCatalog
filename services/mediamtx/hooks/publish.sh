#!/bin/sh
# Hook ejecutado cuando un path está ready en MediaMTX
# Variables: $MTX_PATH o $RTSP_PATH (según versión)

STORE_URL="${SESSION_STORE_URL:-http://session-store:8080}"
HOOK_TOKEN="${MEDIAMTX_HOOK_TOKEN:-}"

# Compatibilidad: usar MTX_PATH o RTSP_PATH
PATH_VALUE="${MTX_PATH:-${RTSP_PATH:-unknown}}"

# Debug: log de variables disponibles (solo si hay error)
if [ "$PATH_VALUE" = "unknown" ]; then
  echo "[publish.sh] WARNING: No path variable found. Available env:" >&2
  env | grep -E "(MTX_|RTSP_)" >&2
fi

# Timestamp UTC del evento
EVENT_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Construir payload JSON
PAYLOAD=$(cat <<EOF
{
  "path": "$PATH_VALUE",
  "eventTs": "$EVENT_TS"
}
EOF
)

# Enviar al session-store
CURL_ARGS="--max-time 5 --silent --show-error --fail"

if [ -n "$HOOK_TOKEN" ]; then
  curl -X POST "$STORE_URL/hooks/mediamtx/publish" \
    -H "Content-Type: application/json" \
    -H "X-Hook-Token: $HOOK_TOKEN" \
    -d "$PAYLOAD" \
    $CURL_ARGS
else
  curl -X POST "$STORE_URL/hooks/mediamtx/publish" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    $CURL_ARGS
fi

status=$?
if [ $status -ne 0 ]; then
  echo "[publish.sh] ERROR: curl exit code $status" >&2
  exit $status
fi

exit 0
