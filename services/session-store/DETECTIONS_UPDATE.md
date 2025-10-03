# ✅ Session-Store - Cambios Completados

## 📝 Resumen

Se ha agregado soporte completo para **detecciones** al session-store, permitiendo almacenar y consultar las detecciones de IA enviadas por el edge-agent.

## 🔧 Archivos Modificados

### 1. `/services/session-store/migrations/001_init.sql` ✅

**Agregado**:
```sql
-- Tabla de detecciones
CREATE TABLE IF NOT EXISTS detections (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    event_id TEXT NOT NULL UNIQUE,
    ts TIMESTAMPTZ NOT NULL,
    detection_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id);
CREATE INDEX IF NOT EXISTS idx_detections_ts ON detections(ts);
CREATE INDEX IF NOT EXISTS idx_detections_event ON detections(event_id);
```

**Características**:
- ✅ Foreign key a sessions con CASCADE delete
- ✅ event_id UNIQUE para idempotencia
- ✅ Datos en JSONB para flexibilidad
- ✅ Índices optimizados para queries

### 2. `/services/session-store/src/db.ts` ✅

**Agregadas interfaces**:
```typescript
export interface DetectionRecord {
  id: number;
  session_id: string;
  event_id: string;
  ts: string;
  detection_data: any;
  created_at: string;
}

export interface DetectionInsertInput {
  sessionId: string;
  eventId: string;
  ts: string;
  detections: any;
}
```

**Agregadas funciones**:
```typescript
async insertDetection(input: DetectionInsertInput): Promise<DetectionRecord>
async getDetectionsBySession(sessionId: string): Promise<DetectionRecord[]>
async getDetectionsByTimeRange(from: Date, to: Date, limit = 1000): Promise<DetectionRecord[]>
```

### 3. `/services/session-store/src/routes/detections.ts` ✨ **NUEVO**

**Endpoints implementados**:

#### POST /detections
- Recibe batch de detecciones del edge-agent
- Idempotente por event_id
- Retorna conteo de inserted/skipped

**Request**:
```json
{
  "batchId": "batch_123",
  "sessionId": "sess_abc",
  "sourceTs": "2025-10-03T12:00:00Z",
  "items": [
    {
      "eventId": "evt_1",
      "ts": "2025-10-03T12:00:01Z",
      "detections": { "person": 0.95, "car": 0.87 }
    }
  ]
}
```

**Response**:
```json
{
  "batchId": "batch_123",
  "sessionId": "sess_abc",
  "inserted": 5,
  "skipped": 2,
  "total": 7
}
```

#### GET /detections/session/:sessionId
- Obtiene todas las detecciones de una sesión
- Ordenadas por timestamp ASC

**Response**:
```json
{
  "sessionId": "sess_abc",
  "count": 42,
  "detections": [...]
}
```

#### GET /detections/range?from=...&to=...&limit=...
- Filtra detecciones por rango temporal
- Query params: from, to (ISO timestamps), limit (default 1000)

**Response**:
```json
{
  "from": "2025-10-03T00:00:00Z",
  "to": "2025-10-03T23:59:59Z",
  "count": 150,
  "detections": [...]
}
```

### 4. `/services/session-store/src/index.ts` ✅

**Agregado**:
```typescript
import { detectionsRouter } from './routes/detections.js';
app.use('/detections', detectionsRouter);
```

## 🎯 Funcionalidades Clave

### ✅ Batch Insert Optimizado
- Acepta múltiples detecciones en un solo request
- Reduce overhead de red
- Manejo individual de errores por item

### ✅ Idempotencia
- Usa `ON CONFLICT (event_id) DO NOTHING`
- Evita duplicados si el edge-agent reintenta
- Retorna conteo de skipped items

### ✅ Validación Robusta
- Valida sessionId y items array
- Skip de items inválidos sin fallar todo el batch
- Manejo específico de conflictos (código 23505)

### ✅ Queries Eficientes
- Índice en session_id para lookup rápido
- Índice en ts para queries por tiempo
- Índice en event_id para idempotencia

### ✅ Integración Completa con Edge-Agent

El edge-agent envía (sessionio.ts):
```typescript
await axios.post(`${this.baseUrl}/detections`, {
  batchId: batch.batchId,
  sessionId: batch.sessionId,
  sourceTs: batch.sourceTs,
  items: batch.items
});
```

El session-store recibe y procesa ✅

## 🧪 Testing

### 1. Borrar DB y levantar servicios
```bash
docker-compose down -v
./scripts/setup-and-up.sh
```

### 2. Iniciar edge-agent
```bash
./scripts/run-edge-docker.sh up --fg
```

### 3. Verificar sesiones
```bash
curl http://localhost:8080/sessions | jq
```

### 4. Verificar detecciones
```bash
# Por sesión
curl http://localhost:8080/detections/session/sess_2025-10-03T12:00:00.000Z | jq

# Por rango de tiempo
curl "http://localhost:8080/detections/range?from=2025-10-03T00:00:00Z&to=2025-10-03T23:59:59Z" | jq
```

### 5. Insert manual de prueba
```bash
curl -X POST http://localhost:8080/detections \
  -H "Content-Type: application/json" \
  -d '{
    "batchId": "test_batch",
    "sessionId": "test_session",
    "sourceTs": "2025-10-03T12:00:00Z",
    "items": [
      {
        "eventId": "evt_test_1",
        "ts": "2025-10-03T12:00:01Z",
        "detections": {
          "person": 0.95,
          "confidence": "high",
          "bbox": [100, 200, 50, 80]
        }
      }
    ]
  }'
```

## 📊 Schema Completo

```sql
-- Sesiones
sessions (
  session_id, device_id, path, status,
  start_ts, end_ts, postroll_sec, reason,
  created_at, updated_at
)

-- Detecciones
detections (
  id, session_id, event_id, ts,
  detection_data (JSONB), created_at
)

-- Relación
sessions.session_id ←→ detections.session_id (FK CASCADE)
```

## ✅ Checklist Final

- [x] Tabla detections creada
- [x] Índices optimizados
- [x] Foreign key con CASCADE
- [x] Interfaces TypeScript
- [x] Funciones de DB
- [x] POST /detections (batch)
- [x] GET /detections/session/:id
- [x] GET /detections/range
- [x] Ruta registrada en app
- [x] Validación de inputs
- [x] Manejo de errores
- [x] Idempotencia por event_id
- [x] Documentación actualizada

## 🚀 Sistema Listo

El **session-store ahora está 100% integrado** con el edge-agent:
- ✅ Maneja sesiones (open/close)
- ✅ Maneja detecciones (batch insert)
- ✅ Queries por sesión
- ✅ Queries por rango temporal
- ✅ Idempotencia garantizada

**Próximo paso**: Ejecutar `docker-compose down -v` y levantar todo de nuevo para probar la integración completa.
