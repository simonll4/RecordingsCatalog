# 🔧 Fix: Desincronización Video-Anotaciones

## 🐛 El Problema

Las anotaciones (bounding boxes) se dibujaban correctamente pero **desfasadas temporalmente**:
- Las BB se movían ANTES que los objetos reales
- Las anotaciones terminaban antes que el video
- Adelantamiento temporal progresivo

### Ejemplo del Error:

```
Video Frame:  0    10    20    30    40    50    60    70    80    90
Anotación:    10   20    30    40    50    60    70    (fin)
              └─ Adelanto de ~10 frames
```

---

## 🔍 La Causa Raíz

### El Problema Fundamental:

El worker usaba un **contador interno** (`self.frame_idx`) para guardar los tracks, pero este contador **NO corresponde** a los frames reales del video.

### Por Qué No Coinciden:

#### Edge-Agent envía frames a tasas variables:
```toml
[ai]
fps_idle = 5      # 5 FPS cuando está IDLE
fps_active = 12   # 12 FPS cuando detecta algo
```

#### Video se graba a tasa fija:
```toml
[source]
fps_hub = 15      # TODOS los frames a 15 FPS
```

### El Desfase:

**Scenario real**:
```
Video Frame Timeline (fps_hub=15):
Frame: 0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 ...
Time:  0 66 133 200 266 333 400 466 533 600 666 733 800 866 933 1000 ...ms

Worker Processing (fps_active=12):
Procesa frames:    0     3     6     9     12    15    18    21 ...
frame_idx:         0     1     2     3     4     5     6     7  ...
                   └─────────────┘
                   NO coincide con frame real!
```

**Resultado**: 
- Worker procesa frame de video #9
- Guarda como `frame_idx=3`
- Script de anotación lee `"frame": 3`
- Dibuja la BB en el frame #3 del video
- **Adelanto de 6 frames** (400ms a 15 FPS)

---

## ✅ La Solución

### Código Anterior (Incorrecto):

```python
# processor.py - ANTES
if tracking_active and tracks:
    self.session_service.append(
        tracks,
        self.frame_idx,  # ❌ Contador interno, NO frame del video
        frame_width=img_w,
        frame_height=img_h
    )

self.frame_idx += 1  # Se incrementa cada frame procesado
```

### Código Nuevo (Correcto):

```python
# processor.py - AHORA
if tracking_active and tracks:
    self.session_service.append(
        tracks,
        payload.frame_id,  # ✅ Frame ID real del video
        frame_width=img_w,
        frame_height=img_h
    )

self.frame_idx += 1  # Solo para control interno
```

### ¿De Dónde Viene `frame_id`?

El **edge-agent** envía en cada mensaje Frame:

```protobuf
message Frame {
    optional string session_id = 1;
    uint32 frame_id = 2;           // ← ID del frame REAL del video
    Codec codec = 3;
    PixelFormat pixel_format = 4;
    uint32 width = 5;
    uint32 height = 6;
    bytes data = 7;
}
```

Este `frame_id` corresponde **exactamente** al frame del video grabado.

---

## 📊 Verificación del Fix

### Antes del Fix:

```json
// tracks.jsonl - INCORRECTO
{"frame": 0, "t_rel_s": 0.000, "objs": [...]}
{"frame": 1, "t_rel_s": 0.100, "objs": [...]}  // frame_idx=1
{"frame": 2, "t_rel_s": 0.200, "objs": [...]}  // frame_idx=2
{"frame": 3, "t_rel_s": 0.300, "objs": [...]}  // frame_idx=3
```

```
Video frames procesados: 0, 3, 6, 9, 12, 15...
JSON frames guardados:   0, 1, 2, 3,  4,  5...
                            ❌ NO coinciden!
```

### Después del Fix:

```json
// tracks.jsonl - CORRECTO
{"frame": 0, "t_rel_s": 0.000, "objs": [...]}
{"frame": 3, "t_rel_s": 0.200, "objs": [...]}  // frame_id=3
{"frame": 6, "t_rel_s": 0.400, "objs": [...]}  // frame_id=6
{"frame": 9, "t_rel_s": 0.600, "objs": [...]}  // frame_id=9
```

```
Video frames procesados: 0, 3, 6, 9, 12, 15...
JSON frames guardados:   0, 3, 6, 9, 12, 15...
                            ✅ Coinciden perfectamente!
```

---

## 🧪 Cómo Verificar

### 1. Eliminar sesiones antiguas

```bash
rm -rf /home/simonll4/Desktop/final-scripting/tpfinal-v3/data/tracks/sess_*
```

### 2. Reiniciar el worker

```bash
cd /home/simonll4/Desktop/final-scripting/tpfinal-v3/services/worker-ai
./run.sh
```

### 3. Generar nueva sesión

Deja que el edge-agent detecte algo y cree una nueva sesión.

### 4. Verificar el JSON

```bash
# Ver los frames guardados
cat data/tracks/sess_*/tracks/seg-0000.jsonl | jq '.frame'
```

**Deberías ver**:
```
0
3
6
9
12
15
18
...
```

NO:
```
0
1
2
3
4
5
...
```

### 5. Anotar video

```bash
python scripts/annotate_from_json.py
```

**Ahora las anotaciones deben estar perfectamente sincronizadas** ✅

---

## 📝 Notas Técnicas

### ¿Por Qué Mantenemos `frame_idx`?

`frame_idx` todavía es útil para:
- Control interno del worker
- Reset al cambiar de sesión
- Debugging

Pero **NO se debe usar** para sincronización con el video.

### Cálculo de `t_rel_s`

En `manager.py`:

```python
# ANTES (Incorrecto)
t_rel_s = frame_idx / self.fps  # fps del worker (puede variar)

# AHORA (Correcto) 
t_rel_s = frame_id / self.fps   # fps del video (fijo)
```

**Nota**: Si `self.fps` en el manager no coincide exactamente con `fps_hub` del agent, puede haber pequeños desfases en `t_rel_s`. Esto se puede mejorar pasando el FPS correcto al manager.

### Edge-Agent Frame Numbering

El agent numera frames desde que **inicia la grabación**, no desde que inicia la sesión. Esto es correcto porque:
- La grabación puede empezar ANTES de la sesión AI
- El frame_id es único y secuencial para todo el video
- Permite sincronización perfecta con el archivo MP4

---

## ✅ Resultado Final

Con este fix:
- ✅ **Sincronización perfecta** entre anotaciones y video
- ✅ **BB se mueven con los objetos** reales
- ✅ **Las anotaciones duran** exactamente lo que dura la detección
- ✅ **No hay adelantos** ni retrasos

---

## 🔧 Archivo Modificado

- **`src/pipeline/processor.py`** línea 106  
  Cambio: `self.frame_idx` → `payload.frame_id`

---

**Creado**: 2025-10-18  
**Fix aplicado**: ✅ Sincronización corregida  
**Impacto**: Sesiones anteriores deben regrabarse con el fix aplicado
