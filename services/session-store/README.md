# Session Store Service

Servicio de persistencia y gestión de sesiones de streaming con arquitectura en capas.

## 📁 Arquitectura

El servicio sigue una arquitectura en capas (Layered Architecture) con separación clara de responsabilidades:

```
src/
├── app.ts                  # Configuración de Express
├── server.ts              # Punto de entrada del servidor
├── index.ts               # Exports principales
│
├── config/                # Configuración
│   └── config.ts         # Carga de configuración TOML
│
├── database/              # Capa de acceso a datos
│   ├── connection.ts     # Pool de conexiones PostgreSQL
│   ├── migrations.ts     # Gestión de esquema de BD
│   └── repositories/     # Repositorios de datos
│       ├── session.repository.ts
│       └── detection.repository.ts
│
├── services/              # Capa de lógica de negocio
│   ├── session.service.ts
│   └── ingest.service.ts
│
├── controllers/           # Capa de presentación (HTTP)
│   ├── session.controller.ts
│   ├── ingest.controller.ts
│   ├── hook.controller.ts
│   └── health.controller.ts
│
├── routes/                # Definición de rutas
│   ├── session.routes.ts
│   ├── ingest.routes.ts
│   └── hook.routes.ts
│
├── middleware/            # Middleware Express
│   ├── error.middleware.ts
│   ├── logging.middleware.ts
│   └── validation.middleware.ts
│
├── types/                 # TypeScript types
│   ├── session.types.ts
│   ├── detection.types.ts
│   └── hook.types.ts
│
└── utils/                 # Utilidades
    ├── date.utils.ts
    └── path.utils.ts
```

## 🚀 Endpoints

### Sessions
- `POST /sessions/open` - Abrir nueva sesión
- `POST /sessions/close` - Cerrar sesión existente
- `GET /sessions` - Listar sesiones
- `GET /sessions/:sessionId` - Obtener detalles de sesión
- `GET /sessions/:sessionId/tracks/index` - Obtener índice de tracks
- `GET /sessions/:sessionId/tracks/:segment` - Descargar segmento de track

### Ingest
- `POST /ingest` - Ingestar frame con detecciones
- `GET /ingest/detections/:sessionId` - Obtener detecciones de una sesión

### Hooks (MediaMTX)
- `POST /hooks/mediamtx/publish` - Hook cuando se conecta un publisher
- `POST /hooks/mediamtx/record/segment/complete` - Hook cuando se completa un segmento

### Health
- `GET /health` - Estado del servicio

## 🔧 Configuración

El servicio se configura mediante `config.toml`:

```toml
[server]
port = 8080
node_env = "production"

[database]
url = "postgres://usuario:password@host:puerto/database"

[mediamtx]
playback_base_url = "http://mediamtx:9996"
segment_duration_sec = 300
# hook_token = "optional-token"

[playback]
extra_seconds = 1
start_offset_ms = 1000

[frames]
storage_path = "/data/frames"

[tracks]
storage_path = "/data/tracks"
```

## 💾 Base de Datos

### Esquema

**sessions**
- `session_id` (PK): Identificador único
- `device_id`: ID del dispositivo
- `path`: Path del stream
- `status`: Estado (open/closed)
- `start_ts`: Timestamp de inicio
- `end_ts`: Timestamp de fin (nullable)
- `postroll_sec`: Segundos de postroll (nullable)
- `media_connect_ts`: Timestamp de conexión MediaMTX
- `media_start_ts`: Timestamp de inicio de grabación
- `media_end_ts`: Timestamp de fin de grabación
- `recommended_start_offset_ms`: Offset recomendado
- `reason`: Razón de apertura (nullable)
- `created_at`, `updated_at`: Timestamps de auditoría

**detections**
- `session_id` (PK, FK): Referencia a sesión
- `track_id` (PK): ID del track
- `cls`: Clase de objeto detectado
- `conf`: Confianza (0-1)
- `bbox`: Bounding box (JSONB)
- `url_frame`: URL del frame (nullable)
- `first_ts`: Primera detección
- `last_ts`: Última detección
- `capture_ts`: Timestamp de captura
- `ingest_ts`: Timestamp de ingesta
- `created_at`, `updated_at`: Timestamps de auditoría

## 🏃 Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo con hot reload
npm run dev

# Build para producción
npm run build

# Ejecutar en producción
npm start

# Verificar tipos TypeScript
npm run lint
```

## 🐳 Docker

El servicio está diseñado para ejecutarse en un contenedor Docker. Ver `docker-compose.yml` en la raíz del proyecto.

## 📝 Notas de Migración

### Cambios respecto a la versión anterior:

1. **Endpoints eliminados**:
   - `GET /sessions/:sessionId/clip` - Generación de URLs de MediaMTX movida al cliente
   - `POST /detections` - Endpoint público de detecciones eliminado
   - `POST /hooks/mediamtx/record/segment/start` - Hook no utilizado

2. **Correcciones**:
   - Paths de frames ahora usan `CONFIG.FRAMES_STORAGE_PATH` en lugar de hardcodear `/data/frames`
   - Payload de `/sessions/open` acepta tanto `path` como `streamPath` para compatibilidad con edge-agent
   - Eliminada extensión UUID de PostgreSQL no utilizada

3. **Arquitectura**:
   - Código reorganizado en capas con responsabilidades claras
   - Mejor separación de concerns
   - Mayor testabilidad y mantenibilidad
   - TypeScript types centralizados

## 📊 Monitoreo

El servicio registra todas las peticiones en formato JSON estructurado:

```json
{
  "ts": "2024-01-01T12:00:00Z",
  "method": "GET",
  "path": "/sessions",
  "status": 200,
  "elapsed_ms": 15,
  "ip": "192.168.1.1"
}
```
