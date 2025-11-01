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

## Overrides de clases
- UI / API guardan overrides en `runtime-overrides.json`
- El manager inyecta `EDGE_AGENT_CLASSES_FILTER` en el runtime al iniciar
- Limpiar override (`PUT /config/classes` con lista vacía) vuelve a lo configurado en `config.toml`
- Autostart deshabilitado por defecto (`EDGE_AGENT_AUTOSTART=false`). Iniciá manualmente con la UI o `POST /control/start`.

## Troubleshooting rápido
- No conecta AI: verificar `ai.worker_host/port` y modelo en `ai.model_name`
- Sin stream RTSP: revisar MediaMTX y que la FSM esté en ACTIVE/CLOSING
- Sin ingesta: confirmar `store.base_url` y que haya `sessionId` activo
