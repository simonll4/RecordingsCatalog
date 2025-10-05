#!/usr/bin/env bash
set -euo pipefail

# URL RTSP por defecto (puedes sobreescribir con RTSP_URL=...)
RTSP_URL="${RTSP_URL:-rtsp://admin:admin@192.168.1.33:1935}"

usage() {
  cat <<EOF
Uso:
  $0 play        [tcp|udp]   # Reproducir con ffplay (por defecto TCP)
  $0 gst         [tcp|udp]   # Reproducir con GStreamer
  $0 probe                   # Inspeccionar el stream con ffprobe
  $0 record      salida.mp4  # Grabar a archivo MP4 (copia el video sin recodificar)
  Variables:
    RTSP_URL=rtsp://usuario:pass@IP:PUERTO[/path]

Ejemplos:
  RTSP_URL="rtsp://admin:admin@192.168.1.33:1935" ./view-rtsp.sh play tcp
  ./view-rtsp.sh gst tcp
  ./view-rtsp.sh probe
  ./view-rtsp.sh record captura.mp4
EOF
}

cmd="${1:-play}"
mode="${2:-tcp}"

# Normaliza modo
[[ "$mode" == "tcp" || "$mode" == "udp" ]] || mode="tcp"

case "$cmd" in
    play)
        echo "[+] ffplay → $RTSP_URL (rtsp_transport=$mode)"
        exec ffplay -fflags nobuffer -rtsp_transport "$mode" "$RTSP_URL"
    ;;
    
    gst)
        echo "[+] GStreamer → $RTSP_URL (protocols=$mode)"
        # protocols=4=tcp, 0=udp (gstreamer usa flags)
        proto_flag=$([[ "$mode" == "tcp" ]] && echo "tcp" || echo "udp")
        exec gst-launch-1.0 rtspsrc location="$RTSP_URL" latency=0 protocols="$proto_flag" \
        ! rtph264depay ! h264parse ! avdec_h264 ! videoconvert ! autovideosink sync=false
    ;;
    
    probe)
        echo "[+] ffprobe → $RTSP_URL (tcp primero, luego udp si falla)"
        if ffprobe -v error -select_streams v:0 -show_streams -show_format -rtsp_transport tcp "$RTSP_URL"; then
            exit 0
        else
            echo "[i] Reintentando con UDP…"
            exec ffprobe -v error -select_streams v:0 -show_streams -show_format -rtsp_transport udp "$RTSP_URL"
        fi
    ;;
    
    record)
        outfile="${2:-capture.mp4}"
        [[ -z "${outfile}" ]] && { echo "[!] Falta nombre de archivo"; usage; exit 1; }
        echo "[+] Grabando → $outfile (sin recodificar si es H.264/H.265)"
        # Si el video es H.264/H.265, copiamos; si no, quita -c copy
        exec ffmpeg -rtsp_transport "$mode" -i "$RTSP_URL" -fflags nobuffer -flags low_delay -c copy -movflags +faststart "$outfile"
    ;;
    
    ""|-h|--help|help)
        usage
    ;;
    
    *)
        echo "[!] Opción inválida"; usage; exit 1
    ;;
esac
