# Artefactos generados por el worker (`data/tracks/<session_id>/`)

El worker persiste, por sesión, metadatos y timeline de tracks en `data/tracks/<session_id>/`. La carpeta se crea únicamente cuando existe una sesión activa (el edge‑agent envía `sessionId` en los frames).

Estructura real de archivos:

```
data/tracks/
  └── sess_cam-01_1760656740501_2/
      ├── meta.json
      ├── index.json
      └── tracks/
          ├── seg-0000.jsonl
          ├── seg-0001.jsonl
          └── ...
```

La segmentación (`seg-000N.jsonl`) facilita streaming/precarga en la UI y evita archivos gigantes. El tamaño del segmento está configurado en segundos (por defecto 10s).

## Cómo se generan (pipeline interno)

1) Primer frame con sesión activa
- Se inicializan marcas base:
  - `session_start_mono_ns`: timestamp monotónico del primer frame recibido.
  - `session_start_utc_ns`: timestamp UTC del primer frame.
- `start_time` se toma de `session_start_utc_ns` y se formatea en ISO8601.

2) Para cada frame con tracks
- Se calcula `t_rel_s` (tiempo relativo al inicio) preferentemente con monotónico:  
  `(ts_mono_ns - session_start_mono_ns) / 1e9`. Si no hay monotónico, se usa UTC.
- Se decide el segmento: `segment_index = int(t_rel_s // segment_duration_s)` y se escribe en `tracks/seg-XXXX.jsonl`.
- Se actualizan acumulados: `frame_count`, `latest_*_ns` y el catálogo de clases vistas.

3) Al cerrar la sesión
- Se fija `end_time` (último `ts_utc_ns` observado o `now`).
- Se marcan segmentos como `closed` y se reescriben `index.json` y `meta.json` usando escritura atómica (archivo `.tmp` + rename).

Referencia de código: `services/worker-ai/src/session/manager.py` (`SessionWriter`).

## `meta.json`
Resumen de la sesión y características del video/objetos. Ejemplo:

```json
{
  "session_id": "sess_cam-01_1760656740501_2",
  "device_id": "cam-01",
  "start_time": "2025-01-11T12:00:00.123Z",
  "end_time": "2025-01-11T12:05:07.456Z",
  "frame_count": 1345,
  "fps": 10.0,
  "video": {
    "width": 1280,
    "height": 720,
    "fps": 10.0,
    "start_ts_utc_ns": "1736592000123456789",
    "end_ts_utc_ns": "1736592307456789123"
  },
  "classes": [
    { "id": 0, "name": "person" },
    { "id": 26, "name": "backpack" }
  ]
}
```

Campos clave:
- `session_id`, `device_id`: la UI y el Session‑Store los usan como claves.
- `start_time`, `end_time`: ISO8601 en UTC; calculados con `ts_utc_ns` del primer/último frame.
- `frame_count`, `fps`: frames con tracks escritos y FPS efectivo del writer.
- `video`: tamaño/fps y marcas UTC en nanosegundos del primer/último frame vistos.
- `classes`: catálogo de clases detectadas durante la sesión (id del modelo + nombre).

## `index.json`
Índice de segmentos para navegación rápida y precarga.

```json
{
  "segment_duration_s": 10.0,
  "segments": [
    { "i": 0, "t0": 0.0, "t1": 10.0, "url": "tracks/seg-0000.jsonl", "count": 87, "closed": true },
    { "i": 1, "t0": 10.0, "t1": 20.0, "url": "tracks/seg-0001.jsonl", "count": 92, "closed": true }
  ],
  "fps": 10.0,
  "duration_s": 67.3
}
```

- `segment_duration_s`: tamaño de cada segmento.
- `segments[]`: índice, intervalo temporal relativo (`t0`–`t1` segundos desde el inicio), URL local al NDJSON, cantidad de eventos y si quedó `closed`.
- `duration_s`: duración total de la sesión (por monotónico si está disponible; si no, por `frame_idx/fps`).

## `tracks/seg-XXXX.jsonl`
NDJSON (una línea por frame con tracks). Ejemplo de línea:

```json
{
  "t_rel_s": 12.347,
  "frame": 1234,
  "ts_mono_ns": 1736592012345678900,
  "ts_utc_ns": 1736592012456000000,
  "objs": [
    {
      "track_id": 17,
      "cls": 0,
      "cls_name": "person",
      "conf": 0.9345,
      "bbox_xyxy": [0.32, 0.18, 0.54, 0.91],
      "kf_state": {
        "bbox_smooth": [0.31, 0.18, 0.55, 0.92],
        "bbox_pred": [0.33, 0.19, 0.55, 0.93],
        "velocity": [0.02, -0.01]
      },
      "track_meta": {
        "age": 42,
        "hits": 39,
        "hit_streak": 7,
        "time_since_update": 0,
        "state": 2
      }
    }
  ]
}
```

Notas:
- `t_rel_s`: segundo relativo al inicio de sesión (base del `index.json`).
- `frame`: id del frame en la sesión (el que propaga el edge‑agent).
- `ts_mono_ns`/`ts_utc_ns`: timestamps del frame (monotónico para cálculos, UTC para auditoría).
- `objs[]`:
  - `track_id`: id estable del objeto (seguimiento BoT‑SORT/kalman).
  - `cls`/`cls_name`: id y nombre de clase del modelo.
  - `conf`: confianza 0–1 (redondeada a 4 decimales).
  - `bbox_xyxy`: caja normalizada.
  - `kf_state` (opcional): bounding boxes suavizados/predichos y velocidad.
  - `track_meta` (opcional): métricas internas del tracker.

Si no hubo objetos en un frame, no se escribe línea.

## Razonamiento de diseño
- Segmentación en NDJSON: reduce latencia de acceso en UI, permite prefetch y tolera escrituras prolongadas.
- Timestamps: `t_rel_s` desde monotónico evita saltos por ajustes de reloj; `ts_utc_ns` facilita correlación externa.
- Escrituras atómicas en `meta.json`/`index.json`: evita lecturas parciales en la UI.
- Catálogo de clases en `meta.json`: útil para filtros de UI y consultas por clase.

Con estos artefactos la UI puede renderizar overlays sincronizados, hacer búsqueda temporal eficiente y auditar sesiones sin depender del video original.
