# Artefactos generados por el worker (`data/tracks/…`)

Cada sesión que procesa el worker produce una carpeta dentro de `data/tracks/` con el nombre exacto del `session_id` recibido desde el edge‑agent:

```
data/tracks/
  └── sess_cam-local_1760656740501_2/
      ├── meta.json
      ├── tracks.jsonl
      └── index.json
```

El worker **solo crea esta carpeta cuando hay una sesión activa**. Mientras los frames llegan con `session_id` vacío, el worker responde detecciones pero no persiste nada ni actualiza el tracker.

## `meta.json`
Metadatos resumidos de la sesión:

```json
{
  "session_id": "sess_cam-local_1760656740501_2",
  "device_id": "cam-local",
  "start_time": "2025-10-16T23:12:01.102143",
  "end_time": "2025-10-16T23:12:09.281544",
  "frame_count": 92,
  "fps": 10.0
}
```

Campos principales:
- `session_id`: Copiado del frame protobuf.
- `device_id`: Derivado del prefijo (`cam-local` en el ejemplo).
- `start_time` / `end_time`: Instantes ISO8601 registrados localmente.
- `frame_count`: Cantidad de frames persistidos (solo los que tuvieron tracks).
- `fps`: FPS usado para calcular timestamps relativos (`t` en `tracks.jsonl`).

## `tracks.jsonl`
Eventos de tracking en formato JSON Lines. Cada línea contiene los objetos rastreados en un frame:

```json
{"t": 0.4, "objs": [
  {"id": 3, "cls": "person", "conf": 0.81, "xyxy": [0.32, 0.18, 0.54, 0.91]}
]}
```

Notas:
- `t`: segundos desde el inicio de la sesión (`frame_idx / fps`).
- `objs`: array de objetos presentes en ese frame.
- `id`: identificador estable del track (solo se emite cuando el tracker está activo).
- `cls`: nombre de clase (actualmente solo `person`).
- `conf`: confianza normalizada 0‑1.
- `xyxy`: caja normalizada `[x1, y1, x2, y2]` en rango `[0, 1]`. Multiplicá por el ancho/alto reales si necesitás píxeles.

Si el frame no tuvo detecciones/tracks, no se escribe línea.

## `index.json`
Offset rápido para buscar dentro de `tracks.jsonl`:

```json
{
  "fps": 10.0,
  "duration": 9.2,
  "offsets": {
    "0": 0,
    "1": 183,
    "2": 366
  }
}
```

- `offsets`: mapa `segundo → byte offset` de la primera línea que cae en ese segundo.  
  Útil para saltar directo con `seek()` sin leer el archivo completo.

## Flujo resumido
1. El edge‑agent abre sesión y empieza a mandar frames con un `session_id`.
2. El worker detecta el primer frame con ese ID, resetea el tracker y crea la carpeta `data/tracks/<session_id>/`.
3. Mientras la sesión está activa, el worker:
   - Aplica BoT‑SORT para mantener `track_id` estables.
   - Escribe la línea correspondiente en `tracks.jsonl` (solo si hubo tracks).
   - Actualiza `meta.json` e `index.json` al final al cerrar la sesión.
4. Cuando el edge‑agent envía `End` o cambia de `session_id`, el worker cierra la sesión y descarga al tracker. Los frames posteriores con `session_id` vacío no generan tracking ni persistencia.

Con esto los artefactos de cada sesión quedan encapsulados, listos para ingestión o análisis offline sin depender del video original.
