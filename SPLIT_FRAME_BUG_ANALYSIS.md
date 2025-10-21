# Análisis del Bug de Imagen Partida (Split Frame)

## Resumen Ejecutivo

El bug de "imagen partida" se manifestaba como frames NV12 con artefactos visuales donde la imagen aparecía cortada y desplazada cíclicamente. Este problema afectaba tanto al almacenamiento en caché como al envío de frames al worker AI.

## Causa Raíz del Problema

### 1. **Desalineación en el Framing de GStreamer**

El problema se originaba en el pipeline de captura NV12:

```
shmsrc → videorate → videoscale → videoconvert (I420→NV12) → fdsink(stdout)
```

**Problema**: GStreamer escribe frames NV12 a stdout como un stream binario continuo. Cuando el buffer de lectura (`chunk`) no se alinea perfectamente con los límites del frame, el acumulador (`this.acc`) puede contener datos que comienzan en medio de un frame.

**Manifestación**: 
- Frame completo: `[Y_plane][UV_plane]` (614,400 bytes para 640x640)
- Frame partido: `[UV_tail][Y_plane][UV_head]` (rotación cíclica de bytes)

### 2. **Flujo del Bug**

```
GStreamer stdout → Buffer chunks → Accumulator → Frame extraction
                                        ↓
                                   ¿Alineado?
                                   ↙      ↘
                                 SÍ       NO
                                 ↓        ↓
                            Frame OK   Frame PARTIDO
```

**Código problemático** (línea 418-420 en `nv12-capture-gst.ts`):

```typescript
while (this.acc.length >= frameBytes) {
  const frameData = this.acc.subarray(0, frameBytes);  // ← Puede empezar en medio
  this.acc = this.acc.subarray(frameBytes);
```

Si `this.acc` contiene:
```
[...últimos 200KB del frame anterior][614,400 bytes del frame actual][...]
```

El `subarray(0, frameBytes)` extraerá:
```
[últimos 200KB del anterior + primeros 414KB del actual] ← FRAME PARTIDO
```

## Solución Implementada

### **Normalización de Frames Partidos** (`nv12-normalizer.ts`)

La solución NO arregla el framing (que es complejo de resolver en GStreamer), sino que **detecta y corrige** frames partidos después de extraerlos.

#### Algoritmo de Detección

```typescript
function detectSplitSeam(data: Buffer, width: number, height: number): number | null {
  // 1. Analizar plano Y (luminancia)
  const yPlane = data.subarray(0, width * height);
  
  // 2. Calcular diferencias entre píxeles adyacentes en cada columna
  for (let row = 0; row < height; row += step) {
    for (let col = 0; col < width; col++) {
      const next = (col + 1) % width;  // Wrap around
      const diff = Math.abs(yPlane[row * width + col] - yPlane[row * width + next]);
      diffs[next] += diff;  // Acumular por columna
    }
  }
  
  // 3. Buscar pico anómalo (seam)
  // En un frame partido, hay UNA columna con diferencia muy alta
  // (transición abrupta entre el final y el inicio del frame)
  if (maxVal > average * 2.5 && maxVal > secondVal * 1.5) {
    return seamIndex;  // Columna donde está el corte
  }
}
```

**Ejemplo visual**:

Frame normal:
```
Columna:  0   1   2   3   ... 639
Diff:     5   4   6   5   ...  4   (valores bajos y uniformes)
```

Frame partido (seam en columna 320):
```
Columna:  0   1   ... 319  320  321  ... 639
Diff:     5   4   ...  6   ***  5   ...  4
                           ↑
                        PICO (diff = 180)
```

#### Algoritmo de Corrección

Una vez detectado el seam, se rota cada fila del frame:

```typescript
function rotatePlane(src, dst, width, rows, seam) {
  for (let row = 0; row < rows; row++) {
    // Copiar [seam, width) al inicio
    src.copy(dst, dstRowStart, srcRowStart + seam, srcRowStart + width);
    
    // Copiar [0, seam) al final
    src.copy(dst, dstRowStart + (width - seam), srcRowStart, srcRowStart + seam);
  }
}
```

**Ejemplo**:

Frame partido (seam=320):
```
Row: [píxeles 320-639][píxeles 0-319]
      ↓ rotate
Row: [píxeles 0-319][píxeles 320-639]  ← CORREGIDO
```

Se aplica tanto al plano Y como al plano UV.

## Impacto en el Sistema

### **Antes de la Corrección**

1. **Cache de Frames** (`frameCache.set`):
   - Guardaba frames partidos
   - SessionManager recuperaba frames corruptos para ingestion
   - Frames almacenados en session-store estaban corruptos

2. **Envío al Worker**:
   - Worker recibía frames partidos
   - YOLO procesaba imágenes corruptas
   - Detecciones incorrectas o fallidas

3. **Visualización**:
   - Frames mostrados en el visualizador del worker aparecían partidos

### **Después de la Corrección**

```typescript
// En nv12-capture-gst.ts (línea 448)
const { buffer: normalizedData, seam } = normalizeNV12SplitFrame(
  frameData,
  width,
  height
);

// normalizedData está CORREGIDO antes de:
// 1. Pasar al callback (ai-feeder)
// 2. Guardarse en cache
// 3. Enviarse al worker
this.onFrame?.(normalizedData, meta);
```

**Resultado**:
- ✅ Cache almacena frames correctos
- ✅ Worker recibe frames correctos
- ✅ Detecciones precisas
- ✅ Visualización sin artefactos
- ✅ Frames ingested en session-store son válidos

## Métricas de Detección

El sistema loguea cuando detecta y corrige un frame partido:

```typescript
if (seam !== this.lastLoggedSeam) {
  this.lastLoggedSeam = seam;
  if (seam !== null) {
    logger.debug("Corrected split NV12 frame", {
      module: "nv12-capture-gst",
      seam,      // Columna donde estaba el corte
      width,
      height,
    });
  }
}
```

**Interpretación**:
- `seam: null` → Frame estaba OK, no se corrigió nada
- `seam: 320` → Frame partido detectado en columna 320, corregido automáticamente

## Por Qué Funcionó el Fix

### **Timing Crítico**

El bug se arregló cuando se forzó un rebuild completo de Docker (`--no-cache`). Esto sugiere que:

1. **Cambios previos** ya incluían la normalización, pero no se estaban aplicando
2. **Docker cache** estaba sirviendo una versión vieja del código
3. **Rebuild forzado** incluyó todos los cambios acumulados:
   - Normalización de frames partidos
   - Logging mejorado
   - Validaciones de tamaño de frame

### **Cambios Clave que se Aplicaron**

1. **Normalización automática** (línea 448 `nv12-capture-gst.ts`):
   ```typescript
   const { buffer: normalizedData } = normalizeNV12SplitFrame(frameData, width, height);
   ```

2. **Validación de planes** (línea 660 `ai-feeder.ts`):
   ```typescript
   const totalPlaneSize = planes.reduce((sum, p) => sum + p.size, 0);
   if (totalPlaneSize !== data.length) {
     logger.error("Plane size mismatch");
     return;  // No enviar frame corrupto
   }
   ```

3. **Validación de tamaño esperado** (línea 617 `ai-feeder.ts`):
   ```typescript
   const expectedFrameBytes = Math.trunc(width * height * 1.5);
   if (data.length !== expectedFrameBytes) {
     logger.error("Frame size mismatch");
     return;  // No enviar frame de tamaño incorrecto
   }
   ```

## Conclusión

El bug de imagen partida era un problema de **desalineación de framing** en el stream binario de GStreamer. La solución implementada:

1. ✅ **Detecta** frames partidos mediante análisis de gradientes de luminancia
2. ✅ **Corrige** automáticamente rotando las filas del frame
3. ✅ **Valida** tamaños antes de enviar al worker
4. ✅ **Previene** almacenamiento de frames corruptos en cache

El fix se aplicó exitosamente cuando Docker recompiló el código sin cache, incluyendo todos los cambios de normalización y validación que ya estaban en el código fuente pero no se habían desplegado.

## Archivos Involucrados

- `services/edge-agent/src/modules/video/utils/nv12-normalizer.ts` - Algoritmo de detección y corrección
- `services/edge-agent/src/modules/video/adapters/gstreamer/nv12-capture-gst.ts` - Aplicación de normalización
- `services/edge-agent/src/modules/ai/feeder/ai-feeder.ts` - Validaciones antes de envío
- `services/edge-agent/Dockerfile` - Build que finalmente incluyó los cambios

---

**Fecha**: 2025-10-21  
**Versión**: tpfinal-v3  
**Status**: ✅ RESUELTO
