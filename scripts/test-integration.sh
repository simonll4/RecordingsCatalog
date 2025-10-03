#!/usr/bin/env bash
# Test de integración session-store + edge-agent

set -e

BASE_URL="http://localhost:8080"

echo "🧪 Test de Integración - Session Store"
echo "======================================"
echo ""

# 1. Health check
echo "1️⃣  Verificando health..."
curl -s "$BASE_URL/health" | jq '.'
echo ""

# 2. Crear sesión de prueba
echo "2️⃣  Creando sesión de prueba..."
SESSION_ID="test_sess_$(date +%s)"
curl -s -X POST "$BASE_URL/sessions/open" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"devId\": \"edge-test\",
    \"startTs\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"path\": \"/cam-test/test.mp4\"
  }" | jq '.'
echo ""

# 3. Insertar batch de detecciones
echo "3️⃣  Insertando batch de detecciones..."
curl -s -X POST "$BASE_URL/detections" \
  -H "Content-Type: application/json" \
  -d "{
    \"batchId\": \"batch_test_1\",
    \"sessionId\": \"$SESSION_ID\",
    \"sourceTs\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"items\": [
      {
        \"eventId\": \"evt_${SESSION_ID}_1\",
        \"ts\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
        \"detections\": {
          \"person\": 0.95,
          \"confidence\": \"high\",
          \"bbox\": [100, 200, 50, 80]
        }
      },
      {
        \"eventId\": \"evt_${SESSION_ID}_2\",
        \"ts\": \"$(date -u --date='2 seconds' +%Y-%m-%dT%H:%M:%SZ)\",
        \"detections\": {
          \"car\": 0.87,
          \"confidence\": \"medium\"
        }
      }
    ]
  }" | jq '.'
echo ""

# 4. Consultar detecciones de la sesión
echo "4️⃣  Consultando detecciones de la sesión..."
curl -s "$BASE_URL/detections/session/$SESSION_ID" | jq '.'
echo ""

# 5. Cerrar sesión
echo "5️⃣  Cerrando sesión..."
curl -s -X POST "$BASE_URL/sessions/close" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"endTs\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"postrollSec\": 5
  }" | jq '.'
echo ""

# 6. Verificar sesión cerrada
echo "6️⃣  Verificando sesión cerrada..."
curl -s "$BASE_URL/sessions/$SESSION_ID" | jq '.'
echo ""

echo "✅ Test completado!"
echo ""
echo "📊 Para ver todas las sesiones:"
echo "   curl $BASE_URL/sessions | jq '.'"
echo ""
echo "🔍 Para ver detecciones por rango de tiempo:"
echo "   curl '$BASE_URL/detections/range?from=2025-10-03T00:00:00Z&to=2025-10-03T23:59:59Z' | jq '.'"
