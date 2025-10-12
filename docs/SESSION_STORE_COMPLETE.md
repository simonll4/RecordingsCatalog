# ✅ Session-Store - Documentación Completa

## 🎯 Descripción

Session-Store es el servicio backend que gestiona:
- **Sesiones de grabación** - Metadata de grabaciones activadas por detecciones
- **Detecciones de IA** - Objetos rastreados (tracks) con bbox, clase y confianza
- **Frames** - Imágenes JPEG asociadas a detecciones (ingesta vía multipart)

---

## 📦 Esquema de Base de Datos

### Tabla: `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    start_ts TIMESTAMPTZ NOT NULL,
    end_ts TIMESTAMPTZ,
    postroll_sec INTEGER,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

**Campos:**
- `session_id`: ID único de sesión (generado por edge-agent)
- `device_id`: Identificador del dispositivo (ej: "cam-local")
- `path`: Path RTSP de la grabación en MediaMTX
- `status`: `"open"` | `"closed"`
- `start_ts`: Timestamp inicio de grabación
- `end_ts`: Timestamp fin de grabación (null si abierta)
- `postroll_sec`: Segundos de postroll configurados

### Tabla: `detections`

**Primary Key Compuesta**: `(session_id, track_id)`

```sql
CREATE TABLE IF NOT EXISTS detections (
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    cls TEXT NOT NULL,
    conf NUMERIC NOT NULL CHECK (conf >= 0 AND conf <= 1),
    bbox JSONB NOT NULL,
    url_frame TEXT,
    first_ts TIMESTAMPTZ NOT NULL,
    last_ts TIMESTAMPTZ NOT NULL,
    capture_ts TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, track_id)
);
```

**Lógica UPSERT:**
- Si `(session_id, track_id)` no existe → INSERT
- Si existe → UPDATE solo si `nueva conf > conf actual`
- Siempre actualiza `last_ts`
- Preserva `first_ts` original

---

## 🔌 API REST

### POST /sessions
Crea o reabre una sesión.

**Request:**
```json
{
  "sessionId": "sess_abc",
  "deviceId": "cam-local",
  "path": "cam-local",
  "startTs": "2025-01-12T10:00:00Z"
}
```

**Response:**
```json
{
  "record": { "session_id": "sess_abc", "status": "open", ... },
  "created": true
}
```

### PUT /sessions/:sessionId/close
Cierra una sesión.

**Request:**
```json
{
  "endTs": "2025-01-12T10:05:00Z",
  "postrollSec": 5
}
```

### GET /sessions
Lista sesiones recientes.

### GET /sessions/:sessionId/clip
Genera URL de playback.

**Response:**
```json
{
  "sessionId": "sess_abc",
  "playbackUrl": "/api/playback?path=cam-local&start=..."
}
```

---

### POST /detections
Recibe batch de detecciones del edge-agent.

**Request:**
```json
{
  "sessionId": "sess_abc",
  "ts": "2025-01-12T10:00:00Z",
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

**Response:**
```json
{
  "inserted": 5,
  "total": 7
}
```

### GET /detections/session/:sessionId
Obtiene detecciones de una sesión.

**Response:**
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
      "first_ts": "2025-01-12T10:00:00Z",
      "last_ts": "2025-01-12T10:00:05Z",
      ...
    }
  ]
}
```

---

## 📸 Ingesta de Frames

### POST /ingest
Ingesta multipart con frames JPEG.

**Content-Type:** `multipart/form-data`

**Body Parts:**
- `sessionId`: ID de sesión (string)
- `ts`: Timestamp captura (ISO string)
- `detections`: JSON array de detecciones
- `frames`: Array de archivos JPEG (cada uno nombrado como `trackId.jpg`)

**Lógica:**
1. Recibe batch de frames + metadata
2. Guarda JPEGs en `/data/frames/{sessionId}/{trackId}.jpg`
3. Actualiza `url_frame` en tabla detections
4. Hace UPSERT de cada detección

**Response:**
```json
{
  "sessionId": "sess_abc",
  "inserted": 5,
  "framesStored": 3
}
```

---

## 🔗 Integración con Edge-Agent

Edge-agent usa dos estrategias de ingesta:

### 1. Metadata-only (POST /detections)
Envío rápido de detecciones sin frames.

### 2. Multipart con frames (POST /ingest)
Envío batch con JPEGs asociados a tracks.

**Archivo**: `services/edge-agent/src/modules/store/adapters/http/frame-ingester-http.ts`

```typescript
// Construye multipart con detections + frames
const formData = new FormData();
formData.append("sessionId", sessionId);
formData.append("ts", ts);
formData.append("detections", JSON.stringify(detections));

for (const [trackId, jpegBuffer] of frames) {
  formData.append("frames", new Blob([jpegBuffer]), `${trackId}.jpg`);
}

await fetch(`${baseUrl}/ingest`, { method: "POST", body: formData });
```

---

## ✅ Features Implementadas

- ✅ PK compuesta `(session_id, track_id)` para tracking único
- ✅ UPSERT inteligente manteniendo máxima confianza
- ✅ Timestamps `first_ts` / `last_ts` para tracking temporal
- ✅ Ingesta multipart de frames JPEG
- ✅ URLs relativas para frames (`/frames/{sessionId}/{trackId}.jpg`)
- ✅ Cascade delete de detecciones al borrar sesión
- ✅ Índices optimizados para queries por sesión/tiempo/clase
