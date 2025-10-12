#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Diagnóstico pipeline buildNV12Capture()
#
# - Reproduce la tubería actual con shmsrc → videorate → videoscale → videoconvert
# - Captura un frame crudo NV12 y verifica si el tamaño coincide con width*height*1.5
# - Ejecuta variantes útiles (drop-allocation y GDP) para comparar resultados
# - Informa paso a paso qué conviene ajustar antes de tocar código
#
# Uso:
#   ./scripts/diagnostico_nv12.sh               # Lee valores desde .env o defaults
#   SOURCE_SOCKET_PATH=/dev/shm/cam.sock ./scripts/diagnostico_nv12.sh
###############################################################################

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/services/edge-agent/.env"

# Valores por defecto razonables en caso de que .env no exista
SOURCE_SOCKET_PATH=${SOURCE_SOCKET_PATH:-/dev/shm/cam_raw.sock}
SOURCE_WIDTH=${SOURCE_WIDTH:-640}
SOURCE_HEIGHT=${SOURCE_HEIGHT:-480}
AI_WIDTH=${AI_WIDTH:-640}
AI_HEIGHT=${AI_HEIGHT:-640}
AI_FPS_ACTIVE=${AI_FPS_ACTIVE:-12}

# Cargar .env local si está disponible (sin export global indiscriminado)
if [[ -f "${ENV_FILE}" ]]; then
  echo "[INFO] Cargando variables desde ${ENV_FILE}"
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

SOCKET="${SOURCE_SOCKET_PATH}"
SRC_W="${SOURCE_WIDTH}"
SRC_H="${SOURCE_HEIGHT}"
AI_W="${AI_WIDTH}"
AI_H="${AI_HEIGHT}"
FPS="${AI_FPS_ACTIVE}"

GST_BASE_CMD=(gst-launch-1.0 -e --gst-debug-no-color)

EXPECTED_BYTES=$(( AI_W * AI_H * 3 / 2 ))

WORKDIR="${ROOT_DIR}/tmp/nv12-diagnostics"
mkdir -p "${WORKDIR}"

echo
echo "============================================"
echo " Diagnóstico buildNV12Capture()"
echo "============================================"
printf "Socket SHM        : %s\n" "${SOCKET}"
printf "Hub WxH           : %sx%s\n" "${SRC_W}" "${SRC_H}"
printf "AI  WxH           : %sx%s\n" "${AI_W}" "${AI_H}"
printf "AI FPS            : %s\n" "${FPS}"
printf "Tamaño esperado   : %s bytes (AI_W*AI_H*1.5)\n" "${EXPECTED_BYTES}"
echo

run_test() {
  local label="$1"; shift
  local outfile="${WORKDIR}/${label}.raw"

  echo "[TEST] ${label}"
  rm -f "${outfile}"

  local -a gst_cmd
  if [[ ! -S "${SOCKET}" ]]; then
    echo "  ↳ Socket ${SOCKET} no existe o no es accesible."
    echo "     Cambiando a videotestsrc para aislar GStreamer del hardware."
    gst_cmd=(
      "${GST_BASE_CMD[@]}"
      videotestsrc "num-buffers=1"
      "!" "video/x-raw,format=I420,width=${SRC_W},height=${SRC_H},framerate=30/1"
      "!" "queue" "max-size-buffers=1" "leaky=downstream"
      "!" "videorate"
      "!" "video/x-raw,framerate=${FPS}/1"
      "!" "videoscale"
      "!" "video/x-raw,format=I420,width=${AI_W},height=${AI_H}"
      "!" "videoconvert"
    )
  else
    gst_cmd=(
      "${GST_BASE_CMD[@]}"
      shmsrc "socket-path=${SOCKET}" "is-live=true" "do-timestamp=true" "num-buffers=1"
      "!" "video/x-raw,format=I420,width=${SRC_W},height=${SRC_H},framerate=30/1"
      "!" "queue" "max-size-buffers=1" "leaky=downstream"
      "!" "videorate"
      "!" "video/x-raw,framerate=${FPS}/1"
      "!" "videoscale"
      "!" "video/x-raw,format=I420,width=${AI_W},height=${AI_H}"
      "!" "videoconvert"
    )
  fi

  gst_cmd+=("$@")
  gst_cmd+=("!" "filesink" "location=${outfile}" "sync=false")

  echo "  cmd: ${gst_cmd[*]}"

  if ! "${gst_cmd[@]}" >/tmp/nv12-diagnostic.log 2>&1; then
    echo "  ✗ Pipeline falló. Revisa /tmp/nv12-diagnostic.log"
    return 1
  fi

  local size
  size=$(stat --format='%s' "${outfile}")
  printf "  ✓ Archivo generado: %s (%s bytes)\n" "${outfile}" "${size}"

  if [[ "${size}" -eq "${EXPECTED_BYTES}" ]]; then
    echo "    → Tamaño OK. No se observaron bytes extra ni padding."
  else
    echo "    → Tamaño inesperado (esperado ${EXPECTED_BYTES})."
    echo "      • Si es mayor: hay padding/stride distinto a AI_W"
    echo "      • Guarda el archivo para inspección manual"
  fi
}

run_test "raw" \
  "!" "video/x-raw,format=NV12" \
  "!" "queue" "max-size-buffers=2" "leaky=downstream"

run_test "raw_dropalloc" \
  "!" "video/x-raw,format=NV12" \
  "!" "identity" "drop-allocation=true" \
  "!" "queue" "max-size-buffers=2" "leaky=downstream"

run_test "gdp" \
  "!" "video/x-raw,format=NV12" \
  "!" "gdppay"

echo
echo "============================================"
echo " Resultados y sugerencias"
echo "============================================"
cat <<EOF
1. Si los archivos generan un tamaño mayor a ${EXPECTED_BYTES}, el worker debe
   honrar stride y offset reales (no asumir width).
2. Si 'raw_dropalloc' vuelve al tamaño esperado y la vista es correcta, añadir
   identity drop-allocation=true en buildNV12Capture() evita padding.
3. El archivo 'gdp' incluirá cabecera extra; si gdpdepay es viable, GDP ofrece
   framing y caps completos.
4. Para ver un frame:
     gst-launch-1.0 filesrc location=<archivo> ! \\
       video/x-raw,format=NV12,width=${AI_W},height=${AI_H},framerate=${FPS}/1 ! \\
       jpegenc quality=95 ! multifilesink location=${WORKDIR}/frame.jpg
EOF
