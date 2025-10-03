#!/usr/bin/env bash
# Script para verificar que todos los contenedores usan la misma zona horaria (UTC)

set -e

echo "🕐 Verificando sincronización de zona horaria en contenedores..."
echo ""

# Array de contenedores a verificar
CONTAINERS=(
  "tpfinalv3-mediamtx"
  "tpfinalv3-postgres"
  "tpfinalv3-session-store"
  "tpfinalv3-web-ui"
)

# Colores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "📋 Verificando host..."
HOST_TZ=$(timedatectl | grep "Time zone" | awk '{print $3}')
HOST_SYNC=$(timedatectl | grep "System clock synchronized" | awk '{print $4}')

if [ "$HOST_TZ" = "UTC" ]; then
  echo -e "  ${GREEN}✓${NC} Host TZ: $HOST_TZ"
else
  echo -e "  ${RED}✗${NC} Host TZ: $HOST_TZ (debería ser UTC)"
fi

if [ "$HOST_SYNC" = "yes" ]; then
  echo -e "  ${GREEN}✓${NC} Host sincronizado: $HOST_SYNC"
else
  echo -e "  ${YELLOW}⚠${NC} Host sincronizado: $HOST_SYNC"
fi

echo ""
echo "📦 Verificando contenedores..."

ALL_OK=true

for container in "${CONTAINERS[@]}"; do
  if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    echo -e "  ${YELLOW}⊘${NC} $container (no está corriendo)"
    continue
  fi

  # Obtener fecha UTC del contenedor
  CONTAINER_DATE=$(docker exec "$container" date -u '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "ERROR")
  
  if [ "$CONTAINER_DATE" = "ERROR" ]; then
    echo -e "  ${RED}✗${NC} $container (error al obtener fecha)"
    ALL_OK=false
    continue
  fi

  # Verificar que termine en UTC
  if echo "$CONTAINER_DATE" | grep -q "UTC"; then
    echo -e "  ${GREEN}✓${NC} $container: $CONTAINER_DATE"
  else
    echo -e "  ${RED}✗${NC} $container: $CONTAINER_DATE (no está en UTC)"
    ALL_OK=false
  fi
done

echo ""
echo "🔍 Verificando diferencias de tiempo entre contenedores..."

# Obtener timestamps de todos los contenedores
declare -A timestamps

for container in "${CONTAINERS[@]}"; do
  if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    ts=$(docker exec "$container" date -u '+%s' 2>/dev/null || echo "0")
    timestamps[$container]=$ts
  fi
done

# Comparar todos con el primero
first_container=""
first_ts=0

for container in "${!timestamps[@]}"; do
  if [ -z "$first_container" ]; then
    first_container=$container
    first_ts=${timestamps[$container]}
    continue
  fi
  
  diff=$((${timestamps[$container]} - first_ts))
  abs_diff=${diff#-}  # valor absoluto
  
  if [ "$abs_diff" -le 2 ]; then
    echo -e "  ${GREEN}✓${NC} $container vs $first_container: ${diff}s de diferencia"
  else
    echo -e "  ${RED}✗${NC} $container vs $first_container: ${diff}s de diferencia (>2s)"
    ALL_OK=false
  fi
done

echo ""
if $ALL_OK; then
  echo -e "${GREEN}✅ Todos los servicios están sincronizados en UTC${NC}"
  exit 0
else
  echo -e "${RED}❌ Algunos servicios tienen problemas de sincronización${NC}"
  echo ""
  echo "💡 Soluciones:"
  echo "  1. Verifica que el host esté en UTC: sudo timedatectl set-timezone UTC"
  echo "  2. Reinicia los contenedores: docker compose down && docker compose up -d"
  echo "  3. Verifica que docker-compose.yml tenga TZ=UTC en todos los servicios"
  exit 1
fi
