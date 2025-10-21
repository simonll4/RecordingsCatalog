#!/usr/bin/env bash
# Script de diagnóstico completo del sistema edge-agent + worker

echo "=========================================="
echo "  Diagnóstico del Sistema de Detección"
echo "=========================================="
echo ""

# 1. Estado de contenedores
echo "[1/6] Estado de contenedores..."
docker compose ps
echo ""

# 2. Verificar socket de shared memory
echo "[2/6] Verificando shared memory socket..."
docker compose exec -T edge-agent ls -lh /dev/shm/ 2>&1 || echo "⚠️  No se puede acceder al contenedor edge-agent"
echo ""

# 3. Últimos logs edge-agent (sin RTSP spam)
echo "[3/6] Últimos logs edge-agent (filtrando RTSP)..."
docker compose logs edge-agent --tail 50 --no-log-prefix 2>&1 | \
  grep -v "RTSP connection error" | \
  grep -E "INFO|ERROR|WARN" | \
  tail -20
echo ""

# 4. Buscar logs de DEBUG específicos
echo "[4/6] Buscando logs de debugging..."
echo "  - Frames capturados:"
docker compose logs edge-agent --tail 200 2>&1 | grep "Receiving data from GStreamer" | tail -3
echo "  - Frames enviados:"
docker compose logs edge-agent --tail 200 2>&1 | grep "Frames sent to worker" | tail -3
echo "  - Resultados recibidos:"
docker compose logs edge-agent --tail 200 2>&1 | grep "Result recibido" | tail -3
echo ""

# 5. Worker AI
echo "[5/6] Verificando Worker AI (si está en Docker)..."
if docker compose ps worker-ai 2>/dev/null | grep -q "Up"; then
  docker compose logs worker-ai --tail 20
else
  echo "  Worker AI corriendo fuera de Docker (OK)"
fi
echo ""

# 6. Resumen
echo "[6/6] Resumen de conectividad..."
echo "  Cámara IP: 192.168.1.82:554"
ping -c 2 192.168.1.82 >/dev/null 2>&1 && echo "    ✓ Ping OK" || echo "    ✗ Ping FAIL"
echo ""

echo "=========================================="
echo "  Diagnóstico Completo"
echo "=========================================="
