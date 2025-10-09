#!/bin/bash

# 🚀 Comandos Útiles - Post Fix de Detecciones
# Ejecutar desde: services/edge-agent/

# ════════════════════════════════════════════════════════════════
# 🔍 DIAGNÓSTICO
# ════════════════════════════════════════════════════════════════

echo "🔍 Diagnóstico automático de configuración:"
./scripts/diagnose-detections.sh

echo ""
echo "🧪 Validación del fix aplicado:"
./scripts/test-detection-fix.sh

# ════════════════════════════════════════════════════════════════
# 🚀 EJECUCIÓN
# ════════════════════════════════════════════════════════════════

echo ""
echo "Iniciar edge-agent (local):"
echo "  npm run dev"

echo ""
echo "Iniciar edge-agent (Docker):"
echo "  docker-compose up edge-agent"
echo "  # O para reiniciar:"
echo "  docker-compose restart edge-agent"

# ════════════════════════════════════════════════════════════════
# 📊 MONITOREO
# ════════════════════════════════════════════════════════════════

echo ""
echo "Ver logs en tiempo real (todas las detecciones):"
echo "  tail -f logs/\$(ls -t logs/*.log | head -1) | grep --line-buffered 'AI detection'"

echo ""
echo "Ver solo detecciones RELEVANTES:"
echo "  tail -f logs/\$(ls -t logs/*.log | head -1) | grep --line-buffered 'AI detection (relevant)'"

echo ""
echo "Ver detecciones RAW (antes de filtrar):"
echo "  tail -f logs/\$(ls -t logs/*.log | head -1) | grep --line-buffered 'Received AI result (raw)'"

echo ""
echo "Ver qué pasó el filtro:"
echo "  tail -f logs/\$(ls -t logs/*.log | head -1) | grep --line-buffered 'After filtering'"

# ════════════════════════════════════════════════════════════════
# 🔧 AJUSTES
# ════════════════════════════════════════════════════════════════

echo ""
echo "Cambiar umbral temporalmente (sin editar .env):"
echo "  AI_UMBRAL=0.4 npm run dev  # Más sensible"
echo "  AI_UMBRAL=0.6 npm run dev  # Más conservador"

echo ""
echo "Editar configuración permanente:"
echo "  nano .env  # Cambiar AI_UMBRAL=X.X"

# ════════════════════════════════════════════════════════════════
# 🐛 DEBUGGING
# ════════════════════════════════════════════════════════════════

echo ""
echo "Verificar worker AI está corriendo:"
echo "  docker ps | grep worker-ai"

echo ""
echo "Ver logs del worker AI:"
echo "  docker logs -f worker-ai"

echo ""
echo "Buscar errores en logs:"
echo "  tail -n 100 logs/\$(ls -t logs/*.log | head -1) | grep -i error"

# ════════════════════════════════════════════════════════════════
# 📚 DOCUMENTACIÓN
# ════════════════════════════════════════════════════════════════

echo ""
echo "Documentación disponible:"
echo "  QUICK_FIX_GUIDE.md           - Guía rápida del usuario"
echo "  docs/FIX_DETECTION_THRESHOLD.md - Documentación técnica completa"
echo "  FIX_SUMMARY.md               - Resumen ejecutivo del fix"
echo "  CHANGELOG_FIX.md             - Registro completo de cambios"

# ════════════════════════════════════════════════════════════════
# ✅ VALIDACIÓN
# ════════════════════════════════════════════════════════════════

echo ""
echo "Compilar código:"
echo "  npm run build"

echo ""
echo "Verificar arquitectura:"
echo "  npm run arch:check"

echo ""
echo "Ver estructura del build:"
echo "  tree dist/modules -L 3"
