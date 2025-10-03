#!/bin/bash

# Script de validación del Edge Agent
# Verifica dependencias y configuración antes de ejecutar

set -e

echo "🔍 Edge Agent - Validación de Sistema"
echo "======================================"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones auxiliares
check_ok() {
    echo -e "${GREEN}✓${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

check_error() {
    echo -e "${RED}✗${NC} $1"
}

# 1. Verificar Node.js
echo "1️⃣  Verificando Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_ok "Node.js instalado: $NODE_VERSION"
else
    check_error "Node.js NO instalado"
    exit 1
fi

# 2. Verificar npm
echo ""
echo "2️⃣  Verificando npm..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    check_ok "npm instalado: $NPM_VERSION"
else
    check_error "npm NO instalado"
    exit 1
fi

# 3. Verificar GStreamer
echo ""
echo "3️⃣  Verificando GStreamer..."
if command -v gst-launch-1.0 &> /dev/null; then
    GST_VERSION=$(gst-launch-1.0 --version | grep version | awk '{print $3}')
    check_ok "GStreamer instalado: $GST_VERSION"
    
    # Verificar plugins
    echo "   Verificando plugins..."
    PLUGINS=("base" "good" "bad" "ugly" "libav")
    for plugin in "${PLUGINS[@]}"; do
        if gst-inspect-1.0 --plugin 2>&1 | grep -q "gst-plugins-$plugin"; then
            check_ok "   Plugin $plugin disponible"
        else
            check_warn "   Plugin $plugin podría no estar disponible"
        fi
    done
else
    check_error "GStreamer NO instalado"
    echo ""
    echo "Instalar con:"
    echo "  Ubuntu/Debian:"
    echo "    sudo apt-get install gstreamer1.0-tools gstreamer1.0-plugins-base \\"
    echo "      gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \\"
    echo "      gstreamer1.0-plugins-ugly gst-libav"
    echo ""
    exit 1
fi

# 4. Verificar archivo .env
echo ""
echo "4️⃣  Verificando configuración..."
if [ -f ".env" ]; then
    check_ok "Archivo .env encontrado"
    
    # Variables críticas
    REQUIRED_VARS=("SESSION_STORE_URL" "MEDIAMTX_HOST" "EDGE_DEVICE_ID")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^$var=" .env 2>/dev/null; then
            VALUE=$(grep "^$var=" .env | cut -d'=' -f2)
            check_ok "   $var configurado"
        else
            check_error "   $var NO configurado"
        fi
    done
    
    # Verificar fuente de video
    if grep -q "^SOURCE_RTSP=" .env && ! grep -q "^SOURCE_RTSP=$" .env && ! grep -q "^#SOURCE_RTSP=" .env; then
        RTSP=$(grep "^SOURCE_RTSP=" .env | cut -d'=' -f2)
        check_ok "   Fuente RTSP: $RTSP"
    elif grep -q "^CAMERA_DEVICE=" .env && ! grep -q "^CAMERA_DEVICE=$" .env && ! grep -q "^#CAMERA_DEVICE=" .env; then
        DEVICE=$(grep "^CAMERA_DEVICE=" .env | cut -d'=' -f2)
        if [ -e "$DEVICE" ]; then
            check_ok "   Dispositivo local: $DEVICE"
        else
            check_warn "   Dispositivo $DEVICE no encontrado"
        fi
    else
        check_error "   No se configuró SOURCE_RTSP ni CAMERA_DEVICE"
    fi
else
    check_error "Archivo .env NO encontrado"
    echo ""
    echo "Copiar desde template:"
    echo "  cp .env.example .env"
    echo ""
    exit 1
fi

# 5. Verificar dependencias npm
echo ""
echo "5️⃣  Verificando dependencias npm..."
if [ -d "node_modules" ]; then
    check_ok "node_modules encontrado"
else
    check_warn "node_modules NO encontrado - ejecutar: npm install"
fi

# 6. Verificar build
echo ""
echo "6️⃣  Verificando build..."
if [ -f "dist/main.js" ]; then
    check_ok "Build encontrado (dist/main.js)"
else
    check_warn "Build NO encontrado - ejecutar: npm run build"
fi

# 7. Verificar conectividad (opcional)
echo ""
echo "7️⃣  Verificando servicios externos..."

# MediaMTX
if [ ! -z "$MEDIAMTX_HOST" ]; then
    MEDIAMTX_HOST=$(grep "^MEDIAMTX_HOST=" .env 2>/dev/null | cut -d'=' -f2)
    MEDIAMTX_PORT=$(grep "^MEDIAMTX_RTSP_PORT=" .env 2>/dev/null | cut -d'=' -f2)
    MEDIAMTX_PORT=${MEDIAMTX_PORT:-8554}
    
    if timeout 2 bash -c "echo > /dev/tcp/$MEDIAMTX_HOST/$MEDIAMTX_PORT" 2>/dev/null; then
        check_ok "MediaMTX accesible en $MEDIAMTX_HOST:$MEDIAMTX_PORT"
    else
        check_warn "MediaMTX no responde en $MEDIAMTX_HOST:$MEDIAMTX_PORT"
    fi
fi

# Session Store
if [ ! -z "$SESSION_STORE_URL" ]; then
    SESSION_STORE_URL=$(grep "^SESSION_STORE_URL=" .env 2>/dev/null | cut -d'=' -f2)
    
    if command -v curl &> /dev/null; then
        if curl -s --connect-timeout 2 "$SESSION_STORE_URL/sessions" > /dev/null 2>&1; then
            check_ok "Session Store accesible en $SESSION_STORE_URL"
        else
            check_warn "Session Store no responde en $SESSION_STORE_URL"
        fi
    else
        check_warn "curl no disponible - no se puede verificar Session Store"
    fi
fi

# 8. Resumen
echo ""
echo "======================================"
echo "✨ Validación completada"
echo ""
echo "Comandos disponibles:"
echo "  npm run dev    - Ejecutar en modo desarrollo"
echo "  npm run build  - Compilar TypeScript"
echo "  npm start      - Ejecutar en producción"
echo ""
echo "Documentación:"
echo "  README.md         - Guía principal"
echo "  ARCHITECTURE.md   - Diagramas y arquitectura"
echo "  USAGE.md          - Uso y troubleshooting"
echo ""
