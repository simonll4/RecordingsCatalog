# MediaMTX Service (RTSP + Recording)

Servicio RTSP basado en MediaMTX que recibe publicaciones del edge-agent y graba segmentos fMP4 en disco. Incluye hooks de publicación y de fin de segmento para notificar al session-store.

## Qué hace
- Expone un servidor RTSP en `:8554`.
- Graba en `fmp4` con segmentos de 5 minutos en `./data/recordings` (montado como `/recordings`).
- Expone el playback server HTTP en `:9996` para descargas.
- Dispara hooks cuando un path está listo y cuando finaliza un segmento; los hooks hacen `POST` al session-store.

## Archivos y estructura
```
services/mediamtx/
├── Dockerfile            # Imagen MediaMTX + curl (para hooks HTTP)
├── mediamtx.yml          # Configuración del servidor RTSP/recording
└── hooks/
    ├── publish.sh        # runOnReady → POST /hooks/mediamtx/publish
    └── segment_complete.sh  # runOnRecordSegmentComplete → POST /hooks/mediamtx/record/segment/complete
```

## Puertos y volúmenes (docker-compose)
- Puertos:
  - `8554:8554` RTSP
  - `9996:9996` Playback HTTP
- Volúmenes:
  - `./services/mediamtx/mediamtx.yml:/mediamtx.yml:ro`
  - `./services/mediamtx/hooks:/hooks:ro`
  - `./data/recordings:/recordings`

## Configuración (mediamtx.yml)
- RTSP por TCP: `rtspTransports: [tcp]`
- Grabación activada para todos los paths:
  - `record: yes`
  - `recordFormat: fmp4`
  - `recordPath: /recordings/%path/%Y-%m-%d_%H-%M-%S-%f`
  - `recordSegmentDuration: 5m`
  - `recordDeleteAfter: 168h` (7 días)
- Hooks:
  - `runOnReady: /hooks/publish.sh`
  - `runOnRecordSegmentComplete: /hooks/segment_complete.sh`

## Hooks (contrato)
Variables de entorno que MediaMTX exporta a los hooks (varían por versión):
- Path: `MTX_PATH` o `RTSP_PATH`
- Segmento: `MTX_SEGMENT_PATH` o `MTX_FILE`

Ambos scripts son compatibles con ambos nombres y registran un warning si faltan.

Env del contenedor (docker-compose):
- `SESSION_STORE_URL` (default en scripts: `http://session-store:8080`)
- `MEDIAMTX_HOOK_TOKEN` (opcional; si está, se envía como `X-Hook-Token`)

Payloads enviados:
- publish.sh → `POST {SESSION_STORE_URL}/hooks/mediamtx/publish`
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
- Archivos grabados: bajo `./data/recordings/{path}/...` en el host.
- Playback: habilitado en `:9996` (usado para descargas, no streaming en vivo).

## Problemas comunes
- No se ejecutan hooks: verificar mounts de `./services/mediamtx/hooks:/hooks:ro` y que la imagen tenga `curl` (instalado en Dockerfile).
- RTSP bloqueado: abrir `8554/tcp` hacia el host; usar `tcp` como transporte (ya configurado).
- No limpia grabaciones: ajustar `recordDeleteAfter` o programar housekeeping externo si se desactiva la eliminación automática.

