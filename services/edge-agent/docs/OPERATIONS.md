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

## Troubleshooting rápido
- No conecta AI: verificar `ai.worker_host/port` y modelo en `ai.model_name`
- Sin stream RTSP: revisar MediaMTX y que la FSM esté en ACTIVE/CLOSING
- Sin ingesta: confirmar `store.base_url` y que haya `sessionId` activo

