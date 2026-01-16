# Quickstart

Objetivo: levantar edge-agent rápido en desarrollo o producción.

## Prerrequisitos
- Node.js 20+
- GStreamer 1.0 con plugins base/good/bad/ugly/libav
- Servicios externos disponibles: MediaMTX (RTSP), session-store, worker-ai

## Configuración
Editar `services/edge-agent/config.toml`.

Claves mínimas:
- `[source]`: `uri`, `width`, `height`, `fps_hub`, `socket_path`
- `[ai]`: `worker_host`, `worker_port`, `model_name`, `width`, `height`, `classes_filter`, `umbral`
- `[mediamtx]`: `host`, `port`, `path`
- `[fsm]`: `dwell_ms`, `silence_ms`, `postroll_ms`
- `[store]`: `base_url`

## Desarrollo
```
cd services/edge-agent
npm install
# Levanta el manager (API) + runtime en dev
npm run dev
```

## Producción
```
cd services/edge-agent
npm run build
npm start
```

La UI no se sirve desde el manager; usá el servicio `ui-vue` en `http://localhost:3000`.

## Docker (imagen local)
El Dockerfile instala GStreamer y dependencias. Ajustar `config.toml` según entorno (hostnames de servicios).

## Verificación rápida
- Logs en `info` muestran: cámara lista, orquestador listo, conexión AI, transiciones FSM.
- Stream disponible: `rtsp://{mediamtx.host}:{port}/{path}` cuando ACTIVE/CLOSING.
