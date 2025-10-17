# Ejemplos de Salida del Worker-AI

Este directorio contiene ejemplos de los archivos JSON generados por el worker-ai.

## Estructura de Archivos

```
/data/tracks/
  └── session_20231016_150045/
      ├── meta.json
      ├── tracks.jsonl
      └── index.json
```

## meta.json

Metadatos de la sesión de tracking (formato actual):

```json
{
  "session_id": "session_20231016_150045",
  "device_id": "cam-local",
  "start_time": "2025-10-16T20:30:15",
  "end_time": "2025-10-16T20:30:51",
  "frame_count": 358,
  "fps": 10.0
}
```

**Campos**:
- `session_id`: Identificador único de la sesión (del edge-agent)
- `device_id`: ID del dispositivo (derivado de session_id)
- `start_time`, `end_time`: Timestamps ISO 8601
- `frame_count`: Cantidad de frames persistidos
- `fps`: FPS objetivo configurado

## tracks.jsonl

Eventos de tracking (un evento JSON por línea, formato JSONL):

```jsonl
{"t": 0.0, "objs": [{"id": 1, "cls": "person", "conf": 0.89, "xyxy": [0.231, 0.312, 0.445, 0.678]}]}
{"t": 0.1, "objs": [{"id": 1, "cls": "person", "conf": 0.91, "xyxy": [0.234, 0.315, 0.448, 0.681]}]}
{"t": 0.2, "objs": [{"id": 1, "cls": "person", "conf": 0.88, "xyxy": [0.237, 0.318, 0.451, 0.684]}, {"id": 2, "cls": "car", "conf": 0.76, "xyxy": [0.612, 0.423, 0.789, 0.598]}]}
{"t": 0.3, "objs": [{"id": 1, "cls": "person", "conf": 0.90, "xyxy": [0.240, 0.321, 0.454, 0.687]}, {"id": 2, "cls": "car", "conf": 0.78, "xyxy": [0.615, 0.426, 0.792, 0.601]}]}
{"t": 0.5, "objs": [{"id": 1, "cls": "person", "conf": 0.87, "xyxy": [0.246, 0.327, 0.460, 0.693]}, {"id": 2, "cls": "car", "conf": 0.79, "xyxy": [0.621, 0.432, 0.798, 0.607]}, {"id": 3, "cls": "bicycle", "conf": 0.65, "xyxy": [0.145, 0.512, 0.267, 0.698]}]}
```

**Formato de evento**:
```json
{
  "t": 1.5,              // Timestamp en segundos (relativo al inicio de sesión)
  "objs": [              // Array de objetos detectados/trackeados
    {
      "id": 1,           // Track ID único (persiste entre frames)
      "cls": "person",   // Clase del objeto
      "conf": 0.89,      // Confianza de la detección [0-1]
      "xyxy": [          // Bounding box en coordenadas normalizadas [0-1]
        0.231,           // x1 (esquina superior izquierda, normalizada)
        0.312,           // y1 (esquina superior izquierda, normalizada)
        0.445,           // x2 (esquina inferior derecha, normalizada)
        0.678            // y2 (esquina inferior derecha, normalizada)
      ]
    }
  ]
}
```

**Notas**:
- Solo se escriben eventos con objetos detectados (no frames vacíos)
- Coordenadas normalizadas [0, 1] para independencia de resolución
- Timestamp relativo al primer frame de la sesión
- Track IDs persisten mientras el objeto es visible

## index.json

Índice de offsets por segundo para seeking rápido:

```json
{
  "fps": 10.0,
  "duration": 35.8,
  "offsets": {
    "0": 0,
    "1": 287,
    "2": 612,
    "3": 891,
    "4": 1203,
    "5": 1489,
    "6": 1776,
    "7": 2045,
    "8": 2334,
    "9": 2621,
    "10": 2908
  }
}
```

**Campos**:
- `fps`: FPS de la sesión
- `duration`: Duración total en segundos
- `offsets`: Map de segundo → byte offset en tracks.jsonl

**Uso del índice**:
```python
import json

# Leer índice
with open("index.json") as f:
    index = json.load(f)

# Buscar eventos del segundo 5
offset = index["offsets"]["5"]

# Leer desde ese offset
with open("tracks.jsonl", "rb") as f:
    f.seek(offset)
    line = f.readline()
    event = json.loads(line)
    print(f"Primer evento del segundo 5: {event}")
```

## Ejemplo de Lectura Completa

```python
import json
from pathlib import Path

session_dir = Path("/data/tracks/session_20231016_150045")

# Leer metadatos
with open(session_dir / "meta.json") as f:
    meta = json.load(f)
    print(f"Session: {meta['session_id']}")
    print(f"Frames: {meta['frame_count']} @ {meta['fps']} fps")
    print(f"Start: {meta['start_time']} End: {meta['end_time']}")

# Leer todos los eventos
events = []
with open(session_dir / "tracks.jsonl") as f:
    for line in f:
        event = json.loads(line)
        events.append(event)

print(f"\nTotal events: {len(events)}")
print(f"First event: {events[0]}")
print(f"Last event: {events[-1]}")

# Estadísticas
total_detections = sum(len(e['objs']) for e in events)
unique_tracks = set()
for event in events:
    for obj in event['objs']:
        unique_tracks.add(obj['id'])

print(f"\nTotal detections: {total_detections}")
print(f"Unique tracks: {len(unique_tracks)}")
```

## Conversión a Coordenadas Absolutas

Las coordenadas normalizadas se pueden convertir de vuelta a píxeles:

```python
def denormalize_bbox(xyxy_norm, img_w, img_h):
    """Convierte coordenadas normalizadas [0,1] a píxeles absolutos"""
    x1, y1, x2, y2 = xyxy_norm
    return [
        int(x1 * img_w),
        int(y1 * img_h),
        int(x2 * img_w),
        int(y2 * img_h)
    ]

# Ejemplo
meta = {"img_w": 640, "img_h": 480}
xyxy_norm = [0.231, 0.312, 0.445, 0.678]
xyxy_abs = denormalize_bbox(xyxy_norm, meta['img_w'], meta['img_h'])
print(xyxy_abs)  # [147, 149, 284, 325]
```

## Visualización con OpenCV

```python
import json
import cv2
from pathlib import Path

session_dir = Path("/data/tracks/session_20231016_150045")

# Leer meta
with open(session_dir / "meta.json") as f:
    meta = json.load(f)

# Leer eventos
with open(session_dir / "tracks.jsonl") as f:
    events = [json.loads(line) for line in f]

# Crear video de salida (asumiendo 10 FPS)
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('output.mp4', fourcc, 10.0, (meta['img_w'], meta['img_h']))

# Dibujar cada evento (frame)
for event in events:
    # Crear frame vacío (o cargar frame real desde MediaMTX)
    frame = np.zeros((meta['img_h'], meta['img_w'], 3), dtype=np.uint8)
    
    for obj in event['objs']:
        # Denormalizar bbox
        x1, y1, x2, y2 = obj['xyxy']
        x1 = int(x1 * meta['img_w'])
        y1 = int(y1 * meta['img_h'])
        x2 = int(x2 * meta['img_w'])
        y2 = int(y2 * meta['img_h'])
        
        # Dibujar bbox
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        
        # Dibujar label
        label = f"{obj['cls']}#{obj['id']}: {obj['conf']:.2f}"
        cv2.putText(frame, label, (x1, y1-10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    
    out.write(frame)

out.release()
print("Video created: output.mp4")
```
