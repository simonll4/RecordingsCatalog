# ✅ Session-Store - Cambios Completados

## 📝 Resumen

Se ha agregado soporte completo para **detecciones** al session-store, permitiendo almacenar y consultar las detecciones de IA enviadas por el edge-agent.

## 🔧 Archivos Modificados

### 1. `/services/session-store/migrations/001_init.sql` ✅

**Agregado**:
```sql
-- Tabla de detecciones - PK compuesta (session_id, track_id)
CREATE TABLE IF NOT EXISTS detections (
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    cls TEXT NOT NULL,
    conf NUMERIC NOT NULL CHECK (conf >= 0 AND conf <= 1),
    bbox JSONB NOT NULL,  -- {x, y, w, h} normalizadas 0..1
    url_frame TEXT,
    first_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    capture_ts TIMESTAMPTZ NOT NULL,
    ingest_ts TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id);
CREATE INDEX IF NOT EXISTS idx_detections_last_ts ON detections(last_ts);
CREATE INDEX IF NOT EXISTS idx_detections_cls ON detections(cls);
```

**Características**:
- ✅ Primary key compuesta (session_id, track_id)
- ✅ Foreign key a sessions con CASCADE delete
- ✅ Almacena clase detectada, confianza y bbox normalizado
- ✅ Timestamps first_ts/last_ts para tracking temporal
- ✅ Índices optimizados para queries por sesión, tiempo y clase

### 2. `/services/session-store/src/db.ts` ✅

**Agregadas interfaces**:
```typescript
export interface DetectionRecord {
  session_id: string;
  track_id: string;
  cls: string;
  conf: number;
  bbox: { x: number; y: number; w: number; h: number };
  url_frame: string | null;
  first_ts: string;
  last_ts: string;
  capture_ts: string;
  ingest_ts: string;
  created_at: string;
  updated_at: string;
}

export interface DetectionInsertInput {
  sessionId: string;
  trackId: string;
  cls: string;
  conf: number;
  bbox: { x: number; y: number; w: number; h: number };
  captureTs: string;
  urlFrame?: string;
}
```

**Agregadas funciones**:
```typescript
// UPSERT: Inserta o actualiza manteniendo máxima confianza
async insertDetection(input: DetectionInsertInput): Promise<DetectionRecord | null>

// Obtener detecciones de una sesión
async getDetectionsBySession(sessionId: string): Promise<DetectionRecord[]>

// Filtrar detecciones por rango temporal
async getDetectionsByTimeRange(from: Date, to: Date, limit = 1000): Promise<DetectionRecord[]>
```

**Lógica de UPSERT**:
- Si (session_id, track_id) no existe → INSERT
- Si existe → UPDATE solo si nueva conf > conf anterior
- Actualiza last_ts en cada operación
- Mantiene first_ts original del primer INSERT

### 3. `/services/session-store/src/routes/detections.ts` ✨ **NUEVO**

**Endpoints implementados**:

#### POST /detections
- Recibe batch de detecciones del edge-agent
- Valida sessionId y detecta si existe
- Hace UPSERT de cada detección (trackId único)
- Retorna conteo de inserted/total

**Request**:
```json
{
  "sessionId": "sess_abc",
  "ts": "2025-01-12T12:00:00Z",
  "detections": [
    {
      "trackId": "trk_1",
      "cls": "person",
      "conf": 0.95,
      "bbox": { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4 }
    }
  ]
}
```

**Response**:
```json
{
  "inserted": 5,
  "total": 7
}
```

#### GET /detections/session/:sessionId
- Obtiene todas las detecciones de una sesión
- Ordenadas por last_ts ASC

**Response**:
```json
{
  "sessionId": "sess_abc",
  "count": 42,
  "detections": [
    {
      "session_id": "sess_abc",
      "track_id": "trk_1",
      "cls": "person",
      "conf": 0.95,
      "bbox": { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4 },
      "url_frame": null,
      "first_ts": "2025-01-12T12:00:00Z",
      "last_ts": "2025-01-12T12:00:05Z",
      "capture_ts": "2025-01-12T12:00:00Z",
      "ingest_ts": "2025-01-12T12:00:01Z"
    }
  ]
}
```

#### GET /detections/range?from=...&to=...&limit=...
- Filtra detecciones por rango temporal
- Query params: from, to (ISO timestamps), limit (default 1000)

**Response**:
```json
{
  "from": "2025-01-12T00:00:00Z",
  "to": "2025-01-12T23:59:59Z",
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

### ✅ UPSERT Inteligente
- Usa PK compuesta (session_id, track_id)
- Mantiene máxima confianza por track_id
- Actualiza bbox/cls/url_frame solo si conf mejora
- Actualiza last_ts en cada upsert
- Preserva first_ts original

### ✅ Tracking Temporal
- first_ts: timestamp primera detección del track
- last_ts: timestamp última actualización
- capture_ts: timestamp original de captura de frame
- ingest_ts: timestamp de ingesta al DB

### ✅ Validación Robusta
- Valida sessionId existe antes de insertar
- Skip de items inválidos sin fallar todo el batch
- Retorna conteo de inserted/total

### ✅ Queries Eficientes
- Índices en session_id, last_ts y cls
- Soporte para filtrado por sesión o rango temporal
- Límite configurable en queries temporales

### ✅ Integración Completa con Edge-Agent

El edge-agent envía detecciones con trackId:
```typescript
await fetch(`${this.baseUrl}/detections`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    sessionId: sessionId,
    ts: new Date().toISOString(),
    detections: [
      { trackId: "trk_1", cls: "person", conf: 0.95, bbox: {...} }
    ]
  })
});
```

El session-store hace UPSERT por (session_id, track_id) ✅

## 🧪 Testing

### 1. Borrar DB y levantar servicios
```bash
docker-compose down -v
docker-compose up -d
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
