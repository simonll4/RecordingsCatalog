# MediaMTX Service (RTSP + Recording)

Servicio RTSP/WebRTC basado en MediaMTX que recibe publicaciones del edge-agent. Mantiene grabaciones segmentadas y expone un flujo en vivo de baja latencia para la UI. Incluye hooks de publicación y de fin de segmento para notificar al session-store.

## Qué hace
- Expone un servidor RTSP en `:8554`.
- Expone WebRTC (WHEP) en `:8889` para streaming en vivo desde la UI (incluye configuración ICE/STUN por defecto).
- Expone HLS en `:8888` (opcional, útil para debugging o reproductores sin WebRTC).
- Graba en `fmp4` con segmentos de 5 minutos en `./data/recordings` (montado como `/recordings`) para el path de grabación.
- Expone el playback server HTTP en `:9996` para descargas de grabaciones.
- Dispara hooks cuando el path de grabación está listo y cuando finaliza un segmento; los hooks hacen `POST` al session-store.

## Archivos y estructura
```
services/mediamtx/
├── Dockerfile            # Imagen MediaMTX + curl (para hooks HTTP)
├── mediamtx.yml          # Configuración del servidor (RTSP + WebRTC + recording)
└── hooks/
    ├── publish.sh        # runOnReady → POST /hooks/mediamtx/publish
    └── segment_complete.sh  # runOnRecordSegmentComplete → POST /hooks/mediamtx/record/segment/complete
```

## Puertos y volúmenes (docker-compose)
- Puertos:
  - `8554:8554` RTSP (push/pull)
  - `8889:8889` WebRTC WHEP (UI en vivo)
  - `8888:8888` HLS (opcional)
  - `8189:8189/udp` + `8189:8189/tcp` ICE (WebRTC)
  - `9996:9996` Playback HTTP (descargas)
- Volúmenes:
  - `./services/mediamtx/mediamtx.yml:/mediamtx.yml:ro`
  - `./services/mediamtx/hooks:/hooks:ro`
  - `./data/recordings:/recordings`

## Configuración (mediamtx.yml)
- RTSP por TCP: `rtspTransports: [tcp]`
- WebRTC habilitado (`webrtc: yes`, `webrtcEncryption: false`) con:
  - HTTP listener `0.0.0.0:8889`
  - Transporte UDP/TCP locales (`0.0.0.0:8189`) para ICE
  - Hosts adicionales (`127.0.0.1`, `localhost`)
  - STUN público por defecto
- HLS habilitado (`hls: yes`) como fallback opcional.
- Paths definidos:
  - `cam-local`: path de grabación (recording + hooks).
  - `cam-local-live`: path en vivo continuo (sin grabación ni hooks).
  - `all`: fallback para cualquier otro path publicado.

## Hooks (contrato)
Variables de entorno que MediaMTX exporta a los hooks (varían por versión):
- Path: `MTX_PATH` o `RTSP_PATH`
- Segmento: `MTX_SEGMENT_PATH` o `MTX_FILE`

Ambos scripts son compatibles con ambos nombres y registran un warning si faltan.

Env del contenedor (docker-compose):
- `SESSION_STORE_URL` (default en scripts: `http://session-store:8080`)
- `MEDIAMTX_HOOK_TOKEN` (opcional; si está, se envía como `X-Hook-Token`)

Payloads enviados:
- publish.sh (solo paths con hook configurado, p.ej. `cam-local`) → `POST {SESSION_STORE_URL}/hooks/mediamtx/publish`
```
{
  "path": "<rtsp path>",
  "eventTs": "<UTC ISO>"
}
```
- segment_complete.sh → `POST {SESSION_STORE_URL}/hooks/mediamtx/record/segment/complete`
```
{
  "path": "<rtsp path>",
  "segmentPath": "/recordings/.../YYYY-MM-DD_HH-MM-SS-ffffff.mp4",
  "eventTs": "<UTC ISO>",
  "segmentStartTs": "<UTC ISO derivado del nombre de archivo>"
}
```

## Personalización
- Duración y retención: ajustar `recordSegmentDuration` y `recordDeleteAfter`.
- Estructura de rutas: cambiar `recordPath`. Los hooks soportan formato plano `YYYY-MM-DD_HH-MM-SS-ffffff.mp4` y formato anidado `YYYY/MM/DD/HH/MM/SS-ffffff.mp4`.
- Seguridad de hooks: definir `MEDIAMTX_HOOK_TOKEN` y validarlo en el session-store.

## Operación rápida
- Logs: nivel en `mediamtx.yml` (`logLevel: info`).
- Archivos grabados: bajo `./data/recordings/cam-local/...` en el host.
- Streaming en vivo: vía WebRTC (`http://<host>:8889/cam-local-live/whep`).
- Playback: habilitado en `:9996` (descarga de segmentos grabados).

## Problemas comunes
- No se ejecutan hooks: verificar mounts de `./services/mediamtx/hooks:/hooks:ro` y que la imagen tenga `curl` (instalado en Dockerfile).
- RTSP bloqueado: abrir `8554/tcp` hacia el host; usar `tcp` como transporte (ya configurado).
- No limpia grabaciones: ajustar `recordDeleteAfter` o programar housekeeping externo si se desactiva la eliminación automática.
