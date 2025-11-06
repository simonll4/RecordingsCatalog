#!/bin/bash

# Script para verificar y aplicar la migración de detected_classes

echo "🔍 Verificando estado de la migración..."

# Verificar si la columna ya existe
docker compose exec -T session-store psql -U postgres -d tpfinal -c "\d sessions" | grep detected_classes

if [ $? -eq 0 ]; then
    echo "✅ La columna 'detected_classes' ya existe en la tabla sessions"
else
    echo "⚠️  La columna 'detected_classes' NO existe. Aplicando migración..."
    
    # Aplicar migración
    cat services/session-store/migrations/001_add_detected_classes.sql | \
    docker compose exec -T session-store psql -U postgres -d tpfinal
    
    if [ $? -eq 0 ]; then
        echo "✅ Migración aplicada exitosamente"
    else
        echo "❌ Error al aplicar la migración"
        exit 1
    fi
fi

echo ""
echo "📊 Estructura actual de la tabla sessions:"
docker compose exec -T session-store psql -U postgres -d tpfinal -c "\d sessions"
