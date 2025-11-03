# Operación

Guía corta para operar y observar edge-agent.

## Logging
- Niveles: `debug` | `info` | `warn` | `error`
- Configurar en `config.toml`:
```
[logging]
level = "info"
```
- `info` recomendado en dev; `warn` en producción.

## Señales y apagado
- Maneja `SIGINT`/`SIGTERM` con cierre ordenado (2s timeout):
  1. Orchestrator: cierra sesión, limpia timers
  2. AIFeeder: detiene captura, limpia cache
  3. AIClient: cierra TCP
  4. CameraHub: detiene GStreamer

## Health y métricas (ligeras)
- Backpressure del bus: cuenta publicaciones y drops
- Métricas internas (en memoria): `ai_*`, `bus_*`, `frame_ingest_*`

## Manager HTTP (API)
- Escucha en `status.port` (7080 por defecto)
- Provee `/status`, `/control/start`, `/control/stop`
- Exponer `/config/classes` para gestionar overrides persistidos (`runtime-overrides.json`)
- Runtime interno usa `status.port + 1` para su `/status`
- No sirve archivos estáticos; la UI externa (Vue) consume esta API

### Endpoints principales

**GET /status**
- Devuelve `{ manager, agent }` con snapshots del supervisor y del runtime.

**POST /control/start**
- Inicia el runtime del edge-agent.
- Parámetros opcionales (query o body JSON):
  - `wait`: Condición de readiness (`child` | `heartbeat` | `detection` | `session`).
  - `timeoutMs`: Timeout en milisegundos (default: 7000).
  - `minFrames`: Número mínimo de frames procesados para `wait=heartbeat` (default: 3).
- Respuestas:
  - `200`: Listo (condición cumplida).
  - `202`: Iniciado pero condición no cumplida (timeout o sin wait).
- Ejemplo de uso con espera de heartbeat (confirmación de procesamiento de frames):
  ```bash
  curl -X POST "http://localhost:7080/control/start?wait=heartbeat&timeoutMs=15000&minFrames=5"
  ```

**POST /control/stop**
- Detiene el runtime del edge-agent.
- Responde `202` con snapshot del manager.

**GET /config/classes**
- Devuelve `{ overrides, effective, defaults }` de las clases configuradas.

**PUT /config/classes**
- Actualiza overrides de clases con body `{ "classes": ["person", "car"] }`.
- Responde con la nueva configuración.

**GET /config/classes/catalog**
- Devuelve el catálogo completo de clases disponibles.

### Condiciones de readiness (wait)

- `child`: El runtime respondió en `/status` (estado `running`).
- `heartbeat`: El worker procesó al menos `minFrames` frames (contador `framesProcessed >= minFrames`).
- `detection`: Al menos una detección registrada (`detections.total > 0`).
- `session`: La FSM abrió una sesión de grabación (`session.active === true`).

**Importante**: La condición `heartbeat` valida que el worker **efectivamente esté procesando frames continuos de la cámara**. El manager espera hasta que el contador `framesProcessed` alcance el mínimo especificado (default 3, configurable con `minFrames`). Esto garantiza que no es solo una conexión TCP sino frames reales loggeándose en el worker.

La UI puede usar `wait=heartbeat&minFrames=5` para confirmar que el sistema está procesando frames de forma sostenida antes de mostrar feedback al usuario.

## Overrides de clases
- UI / API guardan overrides en `runtime-overrides.json`
- El manager inyecta `EDGE_AGENT_CLASSES_FILTER` en el runtime al iniciar
- Limpiar override (`PUT /config/classes` con lista vacía) vuelve a lo configurado en `config.toml`
- Autostart deshabilitado por defecto (`EDGE_AGENT_AUTOSTART=false`). Iniciá manualmente con la UI o `POST /control/start`.

## Troubleshooting rápido
- No conecta AI: verificar `ai.worker_host/port` y modelo en `ai.model_name`
- Sin stream RTSP: revisar MediaMTX y que la FSM esté en ACTIVE/CLOSING
- Sin ingesta: confirmar `store.base_url` y que haya `sessionId` activo
