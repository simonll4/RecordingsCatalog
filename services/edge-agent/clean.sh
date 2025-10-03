#!/bin/bash

# Script de limpieza del proyecto edge-agent
# Elimina archivos generados y cachés

set -e

echo "🧹 Limpiando Edge Agent..."
echo ""

# Eliminar node_modules
if [ -d "node_modules" ]; then
    echo "📦 Eliminando node_modules..."
    rm -rf node_modules
fi

# Eliminar dist
if [ -d "dist" ]; then
    echo "🔨 Eliminando dist..."
    rm -rf dist
fi

# Eliminar logs
if ls *.log 1> /dev/null 2>&1; then
    echo "📝 Eliminando logs..."
    rm -f *.log
fi

# Eliminar package-lock
if [ -f "package-lock.json" ]; then
    echo "🔒 Eliminando package-lock.json..."
    rm -f package-lock.json
fi

echo ""
echo "✨ Limpieza completada"
echo ""
echo "Para reinstalar:"
echo "  npm install"
echo "  npm run build"
