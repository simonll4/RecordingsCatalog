# Bug Fix: Conversión Incorrecta de Coordenadas de Bounding Box

## Fecha
2025-11-06 01:40 UTC

## Problema Identificado

Las anotaciones de bounding boxes guardadas en la base de datos NO coincidían con las imágenes guardadas, causando que los bboxes se dibujaran en posiciones incorrectas.

## Root Cause

**Conversión incorrecta de formato de coordenadas entre Worker-AI y Session-Store**

### Flujo de Datos

1. **Worker-AI** genera detecciones con bbox en formato **XYXY normalizado (0-1)**:
   ```python
   # Formato: [x1, y1, x2, y2] normalizado
   # Ejemplo: [0.43, 0.19, 0.54, 0.42]
   bbox = (x1_norm, y1_norm, x2_norm, y2_norm)
   ```

2. **Edge-Agent** (main.ts) convierte a formato **centro + dimensiones**:
   ```typescript
   // ❌ CÓDIGO INCORRECTO (antes del fix)
   bbox: {
     x: x1,           // 0.43 - esquina superior izquierda
     y: y1,           // 0.19
     w: x2 - x1,      // 0.11 - ancho
     h: y2 - y1       // 0.23 - alto
   }
   ```

3. **Session-Store** guarda estos valores tal cual en la base de datos

4. **Script draw_bbox.py** interpreta correctamente como **normalized + center anchor**:
   ```python
   # Asume que x,y son el CENTRO del bbox (no la esquina)
   # y que los valores están normalizados (0-1)
   if anchor == "center":
     left = x - w / 2.0
     top = y - h / 2.0
   ```

### El Error

El Edge-Agent estaba enviando:
- `x = x1` (esquina superior izquierda en lugar de centro)
- `y = y1` (esquina superior izquierda en lugar de centro)
- `w = x2 - x1` (ancho correcto)
- `h = y2 - y1` (alto correcto)

Pero el script `draw_bbox.py` esperaba:
- `x = center_x` (punto central del bbox)
- `y = center_y` (punto central del bbox)
- `w = width` (ancho)
- `h = height` (alto)

### Ejemplo Concreto

**Detección original del Worker:**
```
x1=0.43, y1=0.19, x2=0.54, y2=0.42
```

**Código INCORRECTO (antes):**
```typescript
bbox: {
  x: 0.43,  // ❌ esquina, no centro
  y: 0.19,  // ❌ esquina, no centro
  w: 0.11,  // ✅ correcto
  h: 0.23   // ✅ correcto
}
```

**Código CORRECTO (después):**
```typescript
bbox: {
  x: 0.485,  // ✅ 0.43 + 0.11/2 = centro
  y: 0.305,  // ✅ 0.19 + 0.23/2 = centro
  w: 0.11,   // ✅ correcto
  h: 0.23    // ✅ correcto
}
```

## Solución Implementada

Modificado `/services/edge-agent/src/app/main.ts` líneas 616-636:

```typescript
// Convert from xyxy to center (x,y) + width/height
const width = Math.max(0, x2 - x1);
const height = Math.max(0, y2 - y1);
const centerX = x1 + width / 2;
const centerY = y1 + height / 2;

return {
  trackId: trackId ?? "",
  cls: det.cls || "",
  conf: det.conf || 0,
  bbox: {
    x: centerX,   // ✅ Centro, no esquina
    y: centerY,   // ✅ Centro, no esquina
    w: width,     // ✅ Ancho normalizado
    h: height,    // ✅ Alto normalizado
  },
};
```

## Verificación

Para validar el fix con nuevas sesiones:

1. **Generar nueva sesión de detección**
2. **Consultar bbox en DB:**
   ```bash
   docker exec tpfinalv3-postgres psql -U postgres -d session_store \
     -c "SELECT track_id, bbox FROM detections WHERE session_id='sess_xxx';"
   ```

3. **Ejecutar script de validación:**
   ```bash
   # Actualizar IMAGE_PATH y BOUNDING_BOX en draw_bbox.py
   python3 draw_bbox.py
   ```

4. **Verificar que el bbox dibujado coincida con el objeto en la imagen**

## Impacto

- **Sesiones antiguas**: Pueden tener bboxes desincronizados (grabadas con el bug)
- **Sesiones nuevas**: Tendrán bboxes correctos (después del fix)
- **No se requiere migración de datos**: El formato en DB sigue siendo el mismo (center + dimensions normalizadas)

## Archivos Modificados

- `/services/edge-agent/src/app/main.ts` - Conversión de coordenadas corregida

## Testing

Imagen reconstruida y desplegada:
```bash
docker compose build edge-agent
docker compose up -d edge-agent
```

## Notas Técnicas

### Formato de Coordenadas

**XYXY (Worker-AI):**
- `x1, y1`: esquina superior izquierda
- `x2, y2`: esquina inferior derecha
- Valores normalizados: 0-1

**Center + Dimensions (Session-Store):**
- `x, y`: punto central del bbox
- `w, h`: ancho y alto
- Valores normalizados: 0-1

### Fórmulas de Conversión

```
width = x2 - x1
height = y2 - y1
centerX = x1 + width / 2
centerY = y1 + height / 2
```

O equivalente:
```
centerX = (x1 + x2) / 2
centerY = (y1 + y2) / 2
```

## Referencias

- Issue original: Imagen con bbox en posición incorrecta
- Script de validación: `draw_bbox.py` (anchor=center, mode=normalized)
- Documentación de formatos: `/services/edge-agent/src/types/detections.ts`
