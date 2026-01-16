#!/bin/sh
# Hook ejecutado cuando MediaMTX completa un segmento de grabación
# Variables: $MTX_PATH/$RTSP_PATH, $MTX_SEGMENT_PATH/$MTX_FILE

STORE_URL="${SESSION_STORE_URL:-http://session-store:8080}"
HOOK_TOKEN="${MEDIAMTX_HOOK_TOKEN:-}"

# Compatibilidad con diferentes versiones de MediaMTX
PATH_VALUE="${MTX_PATH:-${RTSP_PATH:-unknown}}"
SEGMENT_PATH="${MTX_SEGMENT_PATH:-${MTX_FILE:-}}"

# Debug si no encontramos las variables
if [ "$PATH_VALUE" = "unknown" ] || [ -z "$SEGMENT_PATH" ]; then
  echo "[segment_complete.sh] WARNING: Missing variables" >&2
  echo "PATH_VALUE=$PATH_VALUE, SEGMENT_PATH=$SEGMENT_PATH" >&2
  env | grep -E "(MTX_|RTSP_)" >&2
fi

# Timestamp UTC del evento
EVENT_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Parsear timestamp del segmento desde la ruta
# Estructuras soportadas:
# 1) Plano:  /recordings/%path/%Y-%m-%d_%H-%M-%S-%f.mp4
#    Ej:    /recordings/cam-local/2025-10-22_02-45-50-995016.mp4
# 2) Anidado: /recordings/%path/%Y/%m/%d/%H/%M/%S-%f.mp4
#    Ej:      /recordings/cam-local/2025/10/22/00/07/53-347052.mp4
SEGMENT_START_TS=""
if [ -n "$SEGMENT_PATH" ]; then
  BASENAME=$(basename "$SEGMENT_PATH" .mp4)
  DIRNAME=$(dirname "$SEGMENT_PATH")

  if echo "$BASENAME" | grep -q '_'; then
    # Formato plano: YYYY-MM-DD_HH-MM-SS-MICROSEC
    DATE_PART=${BASENAME%%_*}
    TIME_PART=${BASENAME#*_}
    YEAR=${DATE_PART%%-*}
    REST=${DATE_PART#*-}; MONTH=${REST%%-*}; DAY=${REST#*-}
    HOUR=${TIME_PART%%-*}
    REST=${TIME_PART#*-}; MINUTE=${REST%%-*}
    REST=${REST#*-}; SECOND=${REST%%-*}
    MICROSEC=${REST#*-}
    if [ -n "$YEAR" ] && [ -n "$MONTH" ] && [ -n "$DAY" ] && [ -n "$HOUR" ] && [ -n "$MINUTE" ] && [ -n "$SECOND" ] && [ -n "$MICROSEC" ]; then
      SEGMENT_START_TS="${YEAR}-${MONTH}-${DAY}T${HOUR}:${MINUTE}:${SECOND}.${MICROSEC}Z"
    fi
  else
    # Formato anidado: extraer YYYY/MM/DD/HH/MM del directorio y SS-MICRO del basename
    YEAR=$(echo "$DIRNAME" | awk -F'/' '{print $(NF-4)}')
    MONTH=$(echo "$DIRNAME" | awk -F'/' '{print $(NF-3)}')
    DAY=$(echo "$DIRNAME" | awk -F'/' '{print $(NF-2)}')
    HOUR=$(echo "$DIRNAME" | awk -F'/' '{print $(NF-1)}')
    MINUTE=$(echo "$DIRNAME" | awk -F'/' '{print $NF}')
    SECOND=$(echo "$BASENAME" | cut -d'-' -f1)
    MICROSEC=$(echo "$BASENAME" | cut -d'-' -f2)
    if [ -n "$YEAR" ] && [ -n "$MONTH" ] && [ -n "$DAY" ] && [ -n "$HOUR" ] && [ -n "$MINUTE" ] && [ -n "$SECOND" ] && [ -n "$MICROSEC" ]; then
      SEGMENT_START_TS="${YEAR}-${MONTH}-${DAY}T${HOUR}:${MINUTE}:${SECOND}.${MICROSEC}Z"
    fi
  fi
fi

# Construir payload JSON
PAYLOAD=$(cat <<EOF
{
  "path": "$PATH_VALUE",
  "segmentPath": "$SEGMENT_PATH",
  "eventTs": "$EVENT_TS",
  "segmentStartTs": "$SEGMENT_START_TS"
}
EOF
)

# Enviar al session-store
CURL_ARGS="--max-time 5 --silent --show-error --fail"

if [ -n "$HOOK_TOKEN" ]; then
  curl -X POST "$STORE_URL/hooks/mediamtx/record/segment/complete" \
    -H "Content-Type: application/json" \
    -H "X-Hook-Token: $HOOK_TOKEN" \
    -d "$PAYLOAD" \
    $CURL_ARGS
else
  curl -X POST "$STORE_URL/hooks/mediamtx/record/segment/complete" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    $CURL_ARGS
fi

status=$?
if [ $status -ne 0 ]; then
  echo "[segment_complete.sh] ERROR: curl exit code $status" >&2
  exit $status
fi

exit 0
