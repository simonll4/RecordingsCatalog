#!/usr/bin/env bash
set -euo pipefail

CAM_USER="${CAM_USER:-admin}"
CAM_PASS="${CAM_PASS:-KBXBIN}"
CAM_IP="${CAM_IP:-192.168.1.82}"
MODE="${1:-record}"
# Optional second argument is a suggested filename (will be placed inside $OUT_DIR).
OUT_ARG="${2:-}"

# Configuration constants (easy to change). Can be overridden via env vars.
# Duration in seconds to record (default 10)
DURATION="${DURATION:-10}"
# Directory to place recordings (default recordings/)
OUT_DIR="${OUT_DIR:-recordings}"

URLS=(
    "rtsp://$CAM_USER:$CAM_PASS@$CAM_IP:554/Streaming/Channels/1"
    "rtsp://$CAM_USER:$CAM_PASS@$CAM_IP:554/Streaming/Channels/2"
)

pick_url() {
    for u in "${URLS[@]}"; do
        echo "[*] Probando $u" >&2
        if ffprobe -v error -rtsp_transport tcp -select_streams v:0 \
        -show_entries stream=codec_name -of default=nw=1:nk=1 "$u" >/dev/null 2>&1; then
            echo "[+] URL válida: $u" >&2
            printf "%s" "$u"
            return 0
        fi
    done
    echo "[!] No se encontró un RTSP válido" >&2
    return 1
}

main() {
    URL="$(pick_url)"
    case "$MODE" in
        view)
            command -v ffplay >/dev/null || { echo "ffplay no está instalado" >&2; exit 1; }
            echo "[*] Viendo en vivo..." >&2
            exec ffplay -fflags nobuffer -rtsp_transport tcp -an "$URL"
        ;;
        record)
            # Ensure output directory exists and form the output filename using start timestamp
            START_TS="$(date +%s%3N)"
            mkdir -p "$OUT_DIR"
            if [ -z "$OUT_ARG" ]; then
                OUT="$OUT_DIR/recording_${START_TS}.mp4"
            else
                # always place user-specified name inside OUT_DIR to keep recordings together
                OUT="$OUT_DIR/$(basename "$OUT_ARG")"
            fi

            echo "[*] Grabando ${DURATION}s en: $OUT" >&2
            if ffmpeg -y -rtsp_transport tcp -i "$URL" -map 0:v:0 -an -c:v copy -t "$DURATION" "$OUT"; then
                echo "[+] OK (copy) -> $OUT" >&2
            else
                echo "[!] Fallback x264..." >&2
                ffmpeg -y -rtsp_transport tcp -i "$URL" -map 0:v:0 -an -c:v libx264 -preset veryfast -t "$DURATION" "$OUT"
                echo "[+] OK (recodificado) -> $OUT" >&2
            fi
        ;;
        *)
            echo "Uso: $0 {view|record} [salida.mp4]" >&2
            echo "Nota: las grabaciones se guardan en '$OUT_DIR' y por defecto se nombran como recording_<timestamp>.mp4" >&2
            exit 2
        ;;
    esac
}

main