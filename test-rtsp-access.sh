#!/usr/bin/env bash
set -euo pipefail

# Script de prueba: Verificar acceso a cámara IP desde contenedor Docker
# Uso: ./test-rtsp-access.sh

CAM_IP="${CAM_IP:-192.168.1.82}"
CAM_USER="${CAM_USER:-admin}"
CAM_PASS="${CAM_PASS:-KBXBIN}"
RTSP_URL="rtsp://$CAM_USER:$CAM_PASS@$CAM_IP:554/Streaming/Channels/1"

echo "==========================================="
echo "  Test de Acceso a Cámara IP desde Docker"
echo "==========================================="
echo ""

# 1. Verificar conectividad de red al host de la cámara
echo "[1/4] Verificando conectividad de red a $CAM_IP..."
if docker run --rm alpine ping -c 3 "$CAM_IP" >/dev/null 2>&1; then
    echo "✓ Ping exitoso a $CAM_IP"
else
    echo "✗ No se puede hacer ping a $CAM_IP"
    echo "  → Verifica que la cámara esté encendida y en la misma red"
    exit 1
fi
echo ""

# 2. Verificar resolución DNS (si aplica)
echo "[2/4] Verificando acceso de red desde contenedor..."
if docker run --rm alpine nc -zv "$CAM_IP" 554 2>&1 | grep -q "open"; then
    echo "✓ Puerto RTSP (554) accesible desde contenedor"
else
    echo "✗ Puerto RTSP (554) no accesible"
    echo "  → Verifica firewall o configuración de red"
    exit 1
fi
echo ""

# 3. Probar acceso RTSP con ffprobe (si está disponible)
echo "[3/4] Probando stream RTSP con ffprobe..."
if command -v ffprobe >/dev/null 2>&1; then
    if ffprobe -v error -rtsp_transport tcp -select_streams v:0 \
        -show_entries stream=codec_name -of default=nw=1:nk=1 "$RTSP_URL" >/dev/null 2>&1; then
        echo "✓ Stream RTSP válido"
        CODEC=$(ffprobe -v error -rtsp_transport tcp -select_streams v:0 \
            -show_entries stream=codec_name -of default=nw=1:nk=1 "$RTSP_URL" 2>/dev/null)
        echo "  Codec detectado: $CODEC"
    else
        echo "✗ No se puede acceder al stream RTSP"
        echo "  → Verifica credenciales (CAM_USER/CAM_PASS) o URL"
        exit 1
    fi
else
    echo "⊘ ffprobe no disponible, saltando test de stream"
fi
echo ""

# 4. Probar con GStreamer (si está disponible)
echo "[4/4] Probando con GStreamer..."
if command -v gst-launch-1.0 >/dev/null 2>&1; then
    echo "  Capturando 3 segundos de video..."
    if timeout 5s gst-launch-1.0 -q \
        rtspsrc location="$RTSP_URL" protocols=tcp latency=100 ! \
        fakesink >/dev/null 2>&1; then
        echo "✓ GStreamer puede acceder al stream"
    else
        echo "✗ GStreamer no puede acceder al stream"
        exit 1
    fi
else
    echo "⊘ GStreamer no disponible, saltando test"
fi
echo ""

echo "==========================================="
echo "✓ Todos los tests pasaron exitosamente"
echo "==========================================="
echo ""
echo "La cámara IP es accesible desde Docker."
echo "Puedes iniciar el edge-agent con:"
echo "  docker compose --profile edge up -d"
echo ""
