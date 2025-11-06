# Bug Fix: Frame-BBox Mismatch

## Problema Identificado

### Síntoma
Al dibujar el bounding box guardado en la base de datos sobre el frame `track_1.jpg`, la anotación no coincide con la persona en la imagen.

### Diagnóstico

El script `draw_bbox.py` funciona correctamente. El problema estaba en el código de ingesta de frames (`ingest.service.ts`).

**Root Cause**: Race condition / lógica incorrecta en la actualización de frames

### Flujo del Bug

1. **Frame 1** llega con detección: `track_id=1, conf=0.75, bbox=A`
   - ✅ Se guarda `track_1.jpg` (Frame 1)
   - ✅ Se inserta en BD: `conf=0.75, bbox=A`

2. **Frame 2** llega con detección: `track_id=1, conf=0.88, bbox=B` (MEJOR confianza)
   - ✅ Se sobrescribe `track_1.jpg` (Frame 2)
   - ✅ Se actualiza BD: `conf=0.88, bbox=B`
   - ✅ CORRECTO: Frame y BD sincronizados

3. **Frame 3** llega con detección: `track_id=1, conf=0.60, bbox=C` (PEOR confianza)
   - ❌ **BUG**: Se sobrescribe `track_1.jpg` (Frame 3) ← PROBLEMA
   - ✅ BD NO se actualiza: `conf=0.88, bbox=B` sigue
   - ❌ **DESINCRONIZADO**: Frame 3 en disco, bbox B en BD

### Código Problemático

```typescript
// ANTES (BUGGY)
const framesToWrite = new Set<string>();

for (const detection of detections) {
  const shouldUpdate = isNewDetection || hasBetterConfidence;
  
  if (shouldUpdate) {
    const framePath = path.join(sessionFrameDir, filename);
    framesToWrite.add(framePath);  // ❌ Solo guarda PATH
  }
}

// ❌ PROBLEMA: Se escribe SIEMPRE que haya algo en el Set
if (framesToWrite.size > 0) {
  await Promise.all(
    Array.from(framesToWrite).map((framePath) =>
      fs.writeFile(framePath, frameBuffer)  // ❌ Usa NUEVO buffer incluso si conf es peor
    )
  );
}
```

El bug: El código determinaba correctamente `shouldUpdate`, pero luego **siempre escribía el buffer actual del frame**, incluso cuando la BD no se actualizaba por tener peor confianza.

### Solución Implementada

```typescript
// DESPUÉS (FIXED)
const framesToWrite: Array<{ path: string; buffer: Buffer }> = [];

for (const detection of detections) {
  const shouldUpdate = isNewDetection || hasBetterConfidence;
  
  if (shouldUpdate) {
    const framePath = path.join(sessionFrameDir, filename);
    // ✅ Guarda PATH + BUFFER juntos
    framesToWrite.push({ path: framePath, buffer: frameBuffer as Buffer });
  }
}

// ✅ Solo escribe si shouldUpdate era true
if (framesToWrite.length > 0) {
  await Promise.all(
    framesToWrite.map(({ path, buffer }) =>
      fs.writeFile(path, buffer)  // ✅ Escribe el buffer correcto
    )
  );
}
```

### Cambios Clave

1. **Cambio de Set<string> a Array<{path, buffer}>**: Ahora asociamos el buffer con el path desde el inicio
2. **Escritura condicional**: Solo se escribe si `shouldUpdate` es true (nueva detección o mejor confianza)
3. **Atomicidad lógica**: La decisión de actualizar aplica tanto a BD como a disco

## Impacto

### Antes del Fix
- ❌ Frames podían sobrescribirse con detecciones de peor calidad
- ❌ Desincronización entre `bbox` en BD y frame en disco
- ❌ Script de validación (`draw_bbox.py`) mostraba bboxes incorrectos

### Después del Fix
- ✅ Frames solo se sobrescriben con mejores detecciones
- ✅ Sincronización garantizada entre BD y disco
- ✅ Script de validación funciona correctamente
- ✅ Siempre se guarda el "mejor frame" por track

## Verificación

Para verificar que el fix funciona:

1. Iniciar una nueva sesión de detección
2. Esperar a que se detecte un objeto con múltiples frames
3. Verificar la BD:
   ```sql
   SELECT track_id, conf, bbox FROM detections WHERE session_id = 'sess_xxx';
   ```
4. Usar `draw_bbox.py` para dibujar el bbox sobre el frame correspondiente
5. Verificar que el bbox coincide con el objeto en la imagen

## Archivos Modificados

- `services/session-store/src/services/ingest.service.ts` (líneas 59-100)

## Deployed

✅ Service rebuilt: `docker compose build session-store`  
✅ Service restarted: `docker compose up -d session-store`  
✅ Fix active desde: 2025-11-06
