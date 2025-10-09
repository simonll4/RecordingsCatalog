#!/bin/bash

# 🧪 Script de Testing Post-Fix: Detecciones
#
# Verifica que el fix de umbral funcione correctamente

set -e

cd "$(dirname "$0")/.."

echo "🧪 Testing: Fix de Detecciones"
echo "================================"
echo ""

# 1. Verificar configuración
echo "📋 1. Configuración Actual"
echo "--------------------------"
UMBRAL=$(grep "^AI_UMBRAL=" .env | cut -d'=' -f2)
CLASSES=$(grep "^AI_CLASSES_FILTER=" .env | cut -d'=' -f2)
echo "AI_UMBRAL: $UMBRAL"
echo "AI_CLASSES_FILTER: $CLASSES"

if [ "$UMBRAL" != "0.5" ]; then
    echo "⚠️  WARNING: Umbral no es 0.5 (valor recomendado)"
    echo "   Actual: $UMBRAL"
fi
echo ""

# 2. Compilar
echo "🔨 2. Compilando Código"
echo "-----------------------"
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Compilación exitosa"
else
    echo "❌ Error en compilación"
    exit 1
fi
echo ""

# 3. Verificar logs mejorados
echo "🔍 3. Verificando Logs Mejorados"
echo "--------------------------------"
if grep -q "Received AI result (raw)" dist/modules/ai/engine/ai-engine-tcp.js; then
    echo "✅ Logs detallados presentes en código compilado"
else
    echo "❌ Logs detallados NO encontrados"
    exit 1
fi
echo ""

# 4. Instrucciones de testing manual
echo "📝 4. Testing Manual"
echo "--------------------"
echo "Para validar el fix:"
echo ""
echo "1. Iniciar edge-agent:"
echo "   npm run dev"
echo "   # O con Docker:"
echo "   docker-compose up edge-agent"
echo ""
echo "2. Abrir logs en otra terminal:"
echo "   tail -f logs/\$(ls -t logs/*.log | head -1) | grep --line-buffered 'AI detection'"
echo ""
echo "3. Acciones:"
echo "   a) Pararse frente a la cámara"
echo "   b) Moverse lateralmente"
echo "   c) Agacharse (pose parcial)"
echo ""
echo "4. Verificar en logs:"
echo "   ✅ Debe aparecer: [DEBUG] AI detection (relevant)"
echo "   ✅ Debe aparecer: detections=1 classes=[\"person\"]"
echo "   ✅ Debe aparecer: conf entre 0.5-0.9 en logs raw"
echo ""
echo "5. Si NO detecta:"
echo "   - Verificar que worker-ai está corriendo:"
echo "     docker ps | grep worker-ai"
echo "   - Ver logs del worker:"
echo "     docker logs -f worker-ai"
echo "   - Bajar umbral temporalmente:"
echo "     AI_UMBRAL=0.4 npm run dev"
echo ""

# 5. Test automático de logs
echo "🤖 5. Test Automático de Logs (si hay archivos)"
echo "------------------------------------------------"
if [ -d "logs" ] && [ "$(ls -A logs/*.log 2>/dev/null)" ]; then
    LATEST_LOG=$(ls -t logs/*.log | head -1)
    echo "Archivo: $LATEST_LOG"
    echo ""
    
    RELEVANT_COUNT=$(grep -c "AI detection (relevant)" "$LATEST_LOG" 2>/dev/null || echo "0")
    NOT_RELEVANT_COUNT=$(grep -c "AI detection (not relevant)" "$LATEST_LOG" 2>/dev/null || echo "0")
    
    echo "Detecciones relevantes:     $RELEVANT_COUNT"
    echo "Detecciones no relevantes:  $NOT_RELEVANT_COUNT"
    
    if [ "$RELEVANT_COUNT" -gt 0 ]; then
        echo "✅ Al menos una detección relevante encontrada"
        echo ""
        echo "Últimas 3 detecciones relevantes:"
        grep "AI detection (relevant)" "$LATEST_LOG" | tail -3 | sed 's/^/  /'
    else
        echo "⚠️  No se encontraron detecciones relevantes en logs"
        echo "   Esto es normal si aún no se ha ejecutado el agente con el fix"
    fi
else
    echo "ℹ️  No hay archivos de log aún"
    echo "   Se crearán al ejecutar el edge-agent"
fi
echo ""

# 6. Resumen
echo "================================"
echo "✅ Testing Pre-Deploy Completo"
echo ""
echo "Próximo paso:"
echo "  1. Ejecutar: npm run dev"
echo "  2. Pararse frente a la cámara"
echo "  3. Verificar logs con detecciones relevantes"
echo ""
echo "Si hay problemas:"
echo "  ./scripts/diagnose-detections.sh"
