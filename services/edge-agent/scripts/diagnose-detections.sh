#!/bin/bash

# 🔍 Diagnóstico de Detecciones No Relevantes
# 
# Este script ayuda a debuggear por qué las detecciones no son relevantes
# cuando debería detectar personas.

set -e

cd "$(dirname "$0")/.."

echo "🔍 Diagnóstico de Detecciones - Edge Agent"
echo "=========================================="
echo ""

# 1. Verificar configuración actual
echo "📋 1. Configuración Actual"
echo "--------------------------"
echo "AI_UMBRAL: $(grep AI_UMBRAL .env | cut -d'=' -f2)"
echo "AI_CLASSES_FILTER: $(grep AI_CLASSES_FILTER .env | cut -d'=' -f2)"
echo "LOG_LEVEL: $(grep LOG_LEVEL .env | cut -d'=' -f2)"
echo ""

# 2. Verificar si el worker AI está corriendo
echo "🤖 2. Estado del Worker AI"
echo "--------------------------"
if docker ps | grep -q worker-ai; then
    echo "✅ Worker AI está corriendo"
    echo "Logs recientes:"
    docker logs worker-ai --tail 5 2>&1 | sed 's/^/  /'
else
    echo "❌ Worker AI NO está corriendo"
    echo "   Ejecuta: docker-compose up -d worker-ai"
fi
echo ""

# 3. Verificar logs del edge-agent
echo "📊 3. Logs del Edge Agent (últimos 20)"
echo "---------------------------------------"
if [ -d "logs" ]; then
    LATEST_LOG=$(ls -t logs/*.log 2>/dev/null | head -1)
    if [ -n "$LATEST_LOG" ]; then
        echo "Archivo: $LATEST_LOG"
        echo ""
        echo "🔎 Buscando detecciones no relevantes:"
        grep "not relevant" "$LATEST_LOG" | tail -5 | sed 's/^/  /'
        echo ""
        echo "🔎 Buscando detecciones relevantes:"
        grep "AI detection (relevant)" "$LATEST_LOG" | tail -5 | sed 's/^/  /'
        echo ""
        echo "🔎 Buscando raw detections:"
        grep "Received AI result (raw)" "$LATEST_LOG" | tail -3 | sed 's/^/  /'
    else
        echo "❌ No hay archivos de log"
    fi
else
    echo "❌ Directorio logs/ no existe"
fi
echo ""

# 4. Sugerencias
echo "💡 4. Análisis y Sugerencias"
echo "----------------------------"

UMBRAL=$(grep AI_UMBRAL .env | cut -d'=' -f2)
UMBRAL_NUM=$(echo "$UMBRAL" | bc 2>/dev/null || echo "0")

if [ "$UMBRAL_NUM" != "0" ]; then
    UMBRAL_PERCENT=$(echo "$UMBRAL * 100" | bc)
    echo "⚠️  Umbral actual: $UMBRAL ($UMBRAL_PERCENT%)"
    
    if (( $(echo "$UMBRAL > 0.7" | bc -l) )); then
        echo "    ❌ UMBRAL MUY ALTO (>70%)"
        echo "    → Las personas necesitan confianza >$UMBRAL_PERCENT% para ser detectadas"
        echo ""
        echo "    📝 SOLUCIÓN RECOMENDADA:"
        echo "    1. Editar .env y cambiar:"
        echo "       AI_UMBRAL=0.5    # 50% es un buen balance"
        echo ""
        echo "    2. Reiniciar edge-agent:"
        echo "       docker-compose restart edge-agent"
        echo "       # O si estás corriendo localmente:"
        echo "       npm run dev"
    elif (( $(echo "$UMBRAL > 0.5" | bc -l) )); then
        echo "    ⚠️  Umbral moderadamente alto (50-70%)"
        echo "    → Puede filtrar personas con pose parcial u oclusión"
        echo ""
        echo "    📝 Si sigues sin detectar, prueba:"
        echo "       AI_UMBRAL=0.4"
    else
        echo "    ✅ Umbral razonable (<50%)"
        echo "    → El problema puede estar en otro lado"
    fi
else
    echo "❌ No se pudo leer AI_UMBRAL"
fi

echo ""
echo "🔧 5. Comandos Útiles"
echo "---------------------"
echo "Ver logs en tiempo real:"
echo "  tail -f logs/\$(ls -t logs/*.log | head -1)"
echo ""
echo "Ver solo detecciones:"
echo "  tail -f logs/\$(ls -t logs/*.log | head -1) | grep 'AI detection'"
echo ""
echo "Verificar worker AI:"
echo "  docker logs -f worker-ai"
echo ""
echo "Cambiar umbral temporalmente (solo esta sesión):"
echo "  AI_UMBRAL=0.4 npm run dev"
echo ""

echo "=========================================="
echo "✅ Diagnóstico completado"
