#!/usr/bin/env bash
set -euo pipefail

CAM_USER="${CAM_USER:-admin}"
CAM_PASS="${CAM_PASS:-KBXBIN}"
CAM_IP="${CAM_IP:-192.168.1.82}"
MODE="${1:-record}"
OUT="${2:-sample.mp4}"

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
            echo "[*] Grabando 10s en: $OUT" >&2
            if ffmpeg -y -rtsp_transport tcp -i "$URL" -map 0:v:0 -an -c:v copy -t 10 "$OUT"; then
                echo "[+] OK (copy) -> $OUT" >&2
            else
                echo "[!] Fallback x264..." >&2
                ffmpeg -y -rtsp_transport tcp -i "$URL" -map 0:v:0 -an -c:v libx264 -preset veryfast -t 10 "$OUT"
                echo "[+] OK (recodificado) -> $OUT" >&2
            fi
        ;;
        *)
            echo "Uso: $0 {view|record} [salida.mp4]" >&2
            exit 2
        ;;
    esac
}

main

