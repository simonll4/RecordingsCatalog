#!/bin/bash

# Script de limpieza completo para Edge Agent
# Limpia base de datos, storage y documentos de auditoría

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🧹 Limpieza completa del Edge Agent"
echo "===================================="
echo ""

# 1. Limpiar base de datos
echo "📊 Limpiando base de datos..."
cd "$PROJECT_ROOT"
npx tsx scripts/clean-db.ts || echo "⚠️  No se pudo limpiar la DB (puede estar vacía)"
echo ""

# 2. Limpiar storage de CLI
echo "🗄️  Limpiando storage de CLI..."
rm -rf "$PROJECT_ROOT/apps/cli/storage/clips/"*
rm -rf "$PROJECT_ROOT/apps/cli/storage/meta/"*
rm -rf "$PROJECT_ROOT/apps/cli/storage/thumbs/"*
echo "   ✓ Clips eliminados"
echo "   ✓ Metadata eliminada"
echo "   ✓ Thumbnails eliminados"
echo ""

# 3. Limpiar storage raíz (no usado pero por si acaso)
echo "🗄️  Limpiando storage raíz (obsoleto)..."
rm -rf "$PROJECT_ROOT/storage/clips/"*
rm -rf "$PROJECT_ROOT/storage/meta/"*
rm -rf "$PROJECT_ROOT/storage/thumbs/"*
rm -rf "$PROJECT_ROOT/storage/frames/"*
echo "   ✓ Storage raíz limpiado"
echo ""

# 4. Eliminar documentos de auditoría
echo "📄 Eliminando documentos de auditoría..."
cd "$PROJECT_ROOT"
rm -f AUDIT_REPORT.md
rm -f BUGFIX_QUICK.md
rm -f FINAL_SUMMARY.md
rm -f IMPLEMENTATION_SUMMARY.md
rm -f VIEWER_STATUS.md
echo "   ✓ Documentos raíz eliminados"
echo ""

# 5. Limpiar docs/
echo "📚 Limpiando directorio docs/..."
cd "$PROJECT_ROOT/docs"
rm -f AUDIT_PERSISTENCIA.md
rm -f BUGFIX_SESSION_ID.md
rm -f EXECUTIVE_SUMMARY.md
rm -f IMPLEMENTATION_VIDEO_RECORDING.md
rm -f TROUBLESHOOTING.md
rm -f USAGE_GUIDE.md
rm -f VIDEO_RECORDER_CHECKLIST.md
rm -f VIDEO_RECORDING_ISSUE.md
rm -f VIEWER_AUDIT.md
rm -f VIEWER_IMPLEMENTATION.md
rm -f VIEWER_SUMMARY.md
echo "   ✓ Documentos de auditoría eliminados"
echo ""

# 6. Mantener solo documentación útil
echo "📖 Documentación mantenida:"
echo "   - README.md (root)"
echo "   - ARCHITECTURE.md (root) - Nueva documentación consolidada"
echo "   - docs/CONFIGURATION.md - Guía de configuración"
echo "   - docs/DEVELOPMENT.md - Guía de desarrollo"
echo ""

# 7. Limpiar scripts de prueba obsoletos
echo "🔧 Limpiando scripts obsoletos..."
cd "$PROJECT_ROOT/scripts"
rm -f backfill-sessions.ts
rm -f check-repo.ts
rm -f check-session.ts
rm -f check-sessions.ts
rm -f fix-meta-urls.ts
rm -f quick-test.sh
rm -f sanitize-track-details.js
rm -f test-viewer.sh
echo "   ✓ Scripts de prueba eliminados"
echo ""

# 8. Scripts mantenidos
echo "🔧 Scripts mantenidos:"
echo "   - scripts/clean-db.ts - Limpieza de DB"
echo "   - scripts/setup-v4l2loopback.sh - Setup de v4l2loopback"
echo "   - scripts/cleanup.sh - Este script"
echo ""

echo "✅ Limpieza completada!"
echo ""
echo "📋 Siguiente paso: Ejecutar edge agent para generar datos de prueba"
echo "   npm run dev"
echo ""
echo "🌐 Luego abrir el viewer:"
echo "   npm run viewer:dev"
echo "   http://localhost:4000"
