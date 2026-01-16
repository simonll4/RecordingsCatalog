# Protocolo v1 (resumen)

Canal TCP con framing length-prefixed y mensajes protobuf.

## Mensajes
- Envelope: `protocol_version=1`, `stream_id`, `msg_type` (`INIT`, `INIT_OK`, `FRAME`, `RESULT`, `WINDOW_UPDATE`, `HEARTBEAT`, `END`).

## Handshake
- Edge → Worker: `Init`
  - `model`: ruta/nombre del modelo
  - `caps`:
    - `accepted_pixel_formats`: `NV12`, `I420`
    - `accepted_codecs`: `RAW` preferido, `JPEG` fallback
    - `max_width`, `max_height`, `max_inflight`
    - `desired_max_frame_bytes` ≈ `W*H*1.5`
  - `classes_filter`: clases relevantes (de `config.toml`)
  - `confidence_threshold`: umbral mínimo (de `ai.umbral`)
- Worker → Edge: `InitOk`
  - `chosen`: `pixel_format`, `codec`, `width`, `height`, `policy=LATEST_WINS`, `initial_credits`
  - `max_frame_bytes`

## Envío de frames
- `Frame`: `frame_id`, `ts_mono_ns`, `width`, `height`, `pixel_format`, `codec`, `planes|data`, `session_id`.
- Feeder usa ventana deslizante (`maxInflight`) con política `LATEST_WINS`.

## Resultados
- `Result`: `frame_id`, `lat` (pre/infer/post), `detections` (cls, conf, bbox, trackId).
- `main.ts` filtra por clases, publica `ai.detection/ai.keepalive` y, si hay sesión, ingesta mediante `FrameIngester`.

## Heartbeat
- Bidireccional cada ~2s. Timeout → reconexión exponencial.

Para detalles ver implementación en `src/modules/ai/client/*` y `src/modules/ai/feeder/*`.
