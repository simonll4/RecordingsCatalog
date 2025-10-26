#!/usr/bin/env bash
set -euo pipefail

# RTSP pull con GStreamer (view/record)
# Uso:
#   Ver en vivo:   ./rtsp_camera_gst.sh view
#   Grabar 10s:    ./rtsp_camera_gst.sh record salida.mp4
#   Variables útiles:
#     CAM_USER, CAM_PASS, CAM_IP, CHANNEL (1|2), LATENCY_MS (p.ej. 100), DUR (segundos)
#     CODEC (auto|h264|h265) para forzar pipeline

CAM_USER="${CAM_USER:-admin}"
CAM_PASS="${CAM_PASS:-KBXBIN}"
CAM_IP="${CAM_IP:-192.168.1.82}"
CHANNEL="${CHANNEL:-1}"
LATENCY_MS="${LATENCY_MS:-100}"
MODE="${1:-record}"
OUT="${2:-sample.mp4}"
DUR="${DUR:-10}"
CODEC="${CODEC:-auto}"  # auto intenta h264 y luego h265
DEBUG_LEVEL="${GST_DEBUG:-1}"

URLS=(
    "rtsp://$CAM_USER:$CAM_PASS@$CAM_IP:554/Streaming/Channels/1"
)

need() { command -v "$1" >/dev/null; }

pick_url() {
    # Igual que en el script limpio: logs a stderr, stdout solo la URL
    local tried=0
    for u in "${URLS[@]}"; do
        echo "[*] Probando $u" >&2
        if need ffprobe; then
            if ffprobe -v error -rtsp_transport tcp -select_streams v:0 \
            -show_entries stream=codec_name -of default=nw=1:nk=1 "$u" >/dev/null 2>&1; then
                echo "[+] URL válida: $u" >&2
                printf "%s" "$u"
                return 0
            fi
        else
            # Si no está ffprobe, devolvemos la primera y que GStreamer intente
            if (( tried == 0 )); then
                echo "[~] ffprobe no disponible; usando primera URL sin probar" >&2
                printf "%s" "$u"
                return 0
            fi
        fi
        tried=$((tried+1))
    done
    echo "[!] No se encontró un RTSP válido" >&2
    return 1
}

gst_view_h264() {
  # Decodifica y muestra (H.264). Usa dynamic pads mediante name=src y decodebin para evitar depender de gst-libav.
  GST_DEBUG=$DEBUG_LEVEL gst-launch-1.0 -q \
    rtspsrc location="$1" protocols=tcp latency=$LATENCY_MS name=src \
      src. ! queue ! rtph264depay ! h264parse ! \
      decodebin ! videoconvert ! queue ! autovideosink sync=false
}

gst_view_h265() {
  # Decodifica y muestra (H.265)
  GST_DEBUG=$DEBUG_LEVEL gst-launch-1.0 -q \
    rtspsrc location="$1" protocols=tcp latency=$LATENCY_MS name=src \
      src. ! queue ! rtph265depay ! h265parse ! \
      decodebin ! videoconvert ! queue ! autovideosink sync=false
}

_run_with_timeout_ok() {
  # Ejecuta con timeout y trata ciertos códigos como "terminación esperada".
  # Consideramos OK: 0 (EOS limpio), 124 (timeout), 130 (SIGINT)
  local secs="$1"; shift
  set +e
  timeout -s INT "${secs}s" "$@"
  local rc=$?
  set -e
  if [[ $rc -eq 0 || $rc -eq 124 || $rc -eq 130 ]]; then
    return 0
  fi
  return $rc
}

gst_record_h264() {
  # Copia bitstream H.264 a MP4 (requiere EOS para moov; usamos -e y timeout -s INT)
  _run_with_timeout_ok "$DUR" \
    gst-launch-1.0 -e -q \
      rtspsrc location="$1" protocols=tcp latency=$LATENCY_MS name=src \
        src. ! queue ! rtph264depay ! h264parse config-interval=-1 ! queue ! \
        mp4mux faststart=true ! filesink location="$2" sync=false
}

gst_record_h265() {
  # Copia bitstream H.265 a MP4 (nota: algunos players requieren marcas hvc1/hev1)
  _run_with_timeout_ok "$DUR" \
    gst-launch-1.0 -e -q \
      rtspsrc location="$1" protocols=tcp latency=$LATENCY_MS name=src \
        src. ! queue ! rtph265depay ! h265parse ! queue ! \
        mp4mux faststart=true ! filesink location="$2" sync=false
}

ensure_deps() {
    need gst-launch-1.0 || { echo "Falta gst-launch-1.0 (instala GStreamer)" >&2; exit 1; }
    # Para ver: autovideosink suele venir con gstreamer-plugins-base/ good
}

main() {
    ensure_deps
    URL="rtsp://$CAM_USER:$CAM_PASS@$CAM_IP:554/Streaming/Channels/${CHANNEL}"
    
    # Si queremos auto-detección entre 1 y 2, descomentar:
    # URL="$(pick_url)"
    
    case "$MODE" in
        view)
            echo "[*] Viendo en vivo (GStreamer) desde: $URL" >&2
            case "$CODEC" in
                h264) gst_view_h264 "$URL" ;;
                h265) gst_view_h265 "$URL" ;;
                auto)
                    if gst_view_h264 "$URL"; then exit 0; fi
                    echo "[~] Fallback a H.265" >&2
                    gst_view_h265 "$URL"
                ;;
                *) echo "CODEC inválido: $CODEC (use auto|h264|h265)" >&2; exit 2;;
            esac
        ;;
        record)
            echo "[*] Grabando ${DUR}s a: $OUT (GStreamer)" >&2
            case "$CODEC" in
                h264) gst_record_h264 "$URL" "$OUT" ;;
                h265) gst_record_h265 "$URL" "$OUT" ;;
                auto)
                    if gst_record_h264 "$URL" "$OUT"; then
                        echo "[+] OK (H.264) -> $OUT" >&2
                        exit 0
                    fi
                    echo "[~] Fallback a H.265" >&2
                    gst_record_h265 "$URL" "$OUT"
                    echo "[+] OK (H.265) -> $OUT" >&2
                ;;
                *) echo "CODEC inválido: $CODEC (use auto|h264|h265)" >&2; exit 2;;
            esac
        ;;
        record-seg)
            # Grabación segmentada continua (10s por defecto). Produce out-00000.mp4, out-00001.mp4, ...
            local base="${OUT%.*}"
            local ext="${OUT##*.}"
            local pattern="$base-%05d.$ext"
            echo "[*] Grabación segmentada (cada ${DUR}s) a: $pattern" >&2
      if [[ "$CODEC" == "h265" ]]; then
        gst-launch-1.0 -e -q \
          rtspsrc location="$URL" protocols=tcp latency=$LATENCY_MS name=src \
            src. ! queue ! rtph265depay ! h265parse ! queue ! \
            splitmuxsink muxer=mp4mux location="$pattern" max-size-time=$((DUR*1000000000))
      else
        # default/auto/h264 -> h264
        gst-launch-1.0 -e -q \
          rtspsrc location="$URL" protocols=tcp latency=$LATENCY_MS name=src \
            src. ! queue ! rtph264depay ! h264parse config-interval=-1 ! queue ! \
            splitmuxsink muxer=mp4mux location="$pattern" max-size-time=$((DUR*1000000000))
      fi
        ;;
        *)
            echo "Uso: $0 {view|record|record-seg} [salida.mp4]" >&2
            echo "Vars: CAM_USER, CAM_PASS, CAM_IP, CHANNEL, DUR, CODEC, LATENCY_MS" >&2
            exit 2
        ;;
    esac
}

main "$@"
