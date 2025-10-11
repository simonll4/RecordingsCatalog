# Guía de Pruebas - Mejoras del Edge Agent

Esta guía proporciona instrucciones detalladas para verificar el funcionamiento de las mejoras implementadas.

---

## Pre-requisitos

```bash
# 1. Compilar el proyecto
npm run build

# 2. Verificar que la base de datos está disponible
docker-compose up -d postgres

# 3. Verificar que el servidor viewer está corriendo (para pruebas visuales)
npm run viewer
```

---

## Test 1: Compactación de Keyframes Básica

### Objetivo

Verificar que la compactación reduce keyframes en ~70-80% sin perder calidad visual.

### Pasos

1. **Ejecutar sesión de prueba (30 segundos):**

   ```bash
   npm run start -- --camera camera-1 --duration 30
   ```

2. **Buscar en logs la línea de compactación:**

   ```
   [EdgeAgent] Tracks compacted: originalKeyframes=900, compactedKeyframes=225, reductionPct=75.0%, method=hybrid
   ```

3. **Verificar el archivo generado:**

   ```bash
   # Buscar el último tracks.json generado
   ls -lh storage/meta/sesion_*.json

   # Tamaño esperado: 100-150KB (vs ~400-500KB sin compactación)
   ```

4. **Inspeccionar contenido del JSON:**
   ```bash
   # Ver el primer track
   cat storage/meta/sesion_*.json | jq '.tracks | to_entries | first'
   ```

### Criterios de Éxito

- ✅ Reducción de keyframes entre 60-80%
- ✅ Archivo tracks.json < 200KB
- ✅ Logs muestran `reductionPct` sin errores

---

## Test 2: Validación Visual en Viewer

### Objetivo

Verificar que la interpolación de keyframes compactados se ve suave y precisa.

### Pasos

1. **Ejecutar sesión con movimiento variado (60s):**

   ```bash
   # Asegúrate de tener objetos moviéndose en la cámara
   npm run start -- --camera camera-1 --duration 60
   ```

2. **Abrir el viewer:**

   ```bash
   # En otra terminal
   npm run viewer

   # Navegar a http://localhost:3030
   ```

3. **Reproducir la sesión:**

   - Seleccionar la sesión más reciente
   - Reproducir el video completo
   - Observar las bounding boxes durante la reproducción

4. **Verificaciones visuales:**
   - [ ] Bounding boxes siguen correctamente al objeto
   - [ ] No hay saltos bruscos en las cajas
   - [ ] No hay "lag" visible en el tracking
   - [ ] Las cajas se ajustan suavemente al cambio de tamaño

### Criterios de Éxito

- ✅ Interpolación visualmente suave (sin saltos)
- ✅ Bounding boxes precisas en todo momento
- ✅ No se observan artefactos de compactación

---

## Test 3: Backpressure con Carga Artificial

### Objetivo

Verificar que la cola maneja correctamente picos de carga descartando frames antiguos.

### Pasos

1. **Modificar temporalmente `processFrame` para simular latencia:**

   Editar `packages/agent/src/index.ts`:

   ```typescript
   private async processFrame(frame: Frame, camConfig: CameraConfig): Promise<void> {
     // TESTING: Añadir delay artificial
     await new Promise(resolve => setTimeout(resolve, 50));

     // ... resto del código original
   }
   ```

2. **Recompilar:**

   ```bash
   npm run build
   ```

3. **Ejecutar sesión de 60 segundos:**

   ```bash
   npm run start -- --camera camera-1 --duration 60
   ```

4. **Observar logs cada 30s:**

   ```
   [EdgeAgent] Queue metrics: totalEnqueued=1800, totalDequeued=1740, droppedFrames=60 (3.3%), latencyP50=180ms, latencyP95=320ms, effectiveFps=29.0

   [EdgeAgent] AdaptiveFPS: Sustained pressure detected, recommend lowering FPS to 24
   ```

5. **Verificar comportamiento:**

   - Los frames se descartan (droppedFrames > 0)
   - La latencia P95 se mantiene < 500ms
   - El sistema sugiere reducir FPS si la presión es sostenida

6. **Revertir el cambio:**
   ```bash
   git checkout packages/agent/src/index.ts
   npm run build
   ```

### Criterios de Éxito

- ✅ Frames descartados reportados correctamente
- ✅ Latencia P95 < 500ms incluso con carga alta
- ✅ Sugerencias de FPS adaptativo aparecen en logs
- ✅ El sistema no se bloquea ni acumula latencia infinita

---

## Test 4: Backpressure sin Carga (Baseline)

### Objetivo

Verificar que con procesamiento normal la cola no descarta frames.

### Pasos

1. **Ejecutar sesión normal (30s):**

   ```bash
   npm run start -- --camera camera-1 --duration 30
   ```

2. **Buscar métricas en logs:**
   ```
   [EdgeAgent] Queue metrics: totalEnqueued=900, totalDequeued=900, droppedFrames=0 (0.0%), latencyP50=85ms, latencyP95=120ms, effectiveFps=30.0
   ```

### Criterios de Éxito

- ✅ `droppedFrames = 0` (0.0%)
- ✅ Latencia P50 < 100ms
- ✅ Latencia P95 < 200ms
- ✅ `effectiveFps` cercano a FPS configurado (30)

---

## Test 5: Compactación con Diferentes Métodos

### Objetivo

Comparar reducción de keyframes entre métodos: IoU, deadband, hybrid.

### Pasos

1. **Modificar `configs/cameras.json` - Método IoU:**

   ```json
   "tracksCompaction": {
     "enabled": true,
     "method": "iou",
     "kf_similarity_iou": 0.98
   }
   ```

   Ejecutar y anotar `reductionPct`.

2. **Método Deadband:**

   ```json
   "tracksCompaction": {
     "enabled": true,
     "method": "deadband",
     "eps_xy": 0.005,
     "eps_wh": 0.005
   }
   ```

   Ejecutar y anotar `reductionPct`.

3. **Método Hybrid (recomendado):**

   ```json
   "tracksCompaction": {
     "enabled": true,
     "method": "hybrid",
     "kf_similarity_iou": 0.98,
     "eps_xy": 0.005,
     "eps_wh": 0.005
   }
   ```

   Ejecutar y anotar `reductionPct`.

### Resultados Esperados

| Método       | Reducción Esperada | Uso Recomendado                      |
| ------------ | ------------------ | ------------------------------------ |
| **IoU**      | 65-75%             | Objetos estáticos o movimiento lento |
| **Deadband** | 70-80%             | Movimientos suaves y continuos       |
| **Hybrid**   | 75-85%             | Escenario general (recomendado)      |

### Criterios de Éxito

- ✅ Hybrid produce mayor reducción
- ✅ Todos los métodos mantienen interpolación suave en viewer
- ✅ No hay errores de compilación al cambiar método

---

## Test 6: Configuración Deshabilitada (Fallback)

### Objetivo

Verificar que el sistema funciona correctamente con las mejoras deshabilitadas.

### Pasos

1. **Deshabilitar compactación y backpressure:**

   ```json
   "tracksCompaction": {
     "enabled": false
   },
   "backpressure": {
     "enabled": false
   }
   ```

2. **Ejecutar sesión:**

   ```bash
   npm run start -- --camera camera-1 --duration 30
   ```

3. **Verificar logs:**

   ```
   [EdgeAgent] Starting session with compaction disabled
   [EdgeAgent] Starting session with backpressure disabled (direct processing)
   ```

4. **Verificar tracks.json:**
   ```bash
   ls -lh storage/meta/sesion_*.json
   # Tamaño esperado: ~400-500KB (sin compactación)
   ```

### Criterios de Éxito

- ✅ Sistema funciona sin errores
- ✅ No aparecen logs de compactación
- ✅ No aparecen logs de queue metrics
- ✅ tracks.json más grande (sin compactación)

---

## Test 7: Sesiones Ilimitadas con Warning

### Objetivo

Verificar que el sistema advierte cuando se usan sesiones ilimitadas sin compactación.

### Pasos

1. **Configurar sesión ilimitada sin compactación:**

   ```json
   "maxSessionMs": null,
   "tracksCompaction": {
     "enabled": false
   }
   ```

2. **Iniciar sesión:**

   ```bash
   npm run start -- --camera camera-1
   ```

3. **Buscar warning en logs:**

   ```
   [EdgeAgent] WARNING: Unlimited session without compaction enabled. Memory usage may grow unbounded.
   ```

4. **Detener después de 10s (Ctrl+C)**

### Criterios de Éxito

- ✅ Warning aparece en logs al inicio
- ✅ Sistema funciona pero advierte del riesgo
- ✅ Se puede detener correctamente

---

## Test 8: Stress Test (Opcional)

### Objetivo

Verificar estabilidad con sesión larga y movimiento constante.

### Pasos

1. **Configurar sesión de 5 minutos:**

   ```json
   "maxSessionMs": 300000
   ```

2. **Ejecutar con movimiento constante:**

   ```bash
   npm run start -- --camera camera-1 --duration 300
   ```

3. **Monitorear logs cada 30s:**

   - Frame drop rate
   - Latencia P95
   - Uso de memoria (htop en otra terminal)

4. **Al finalizar, verificar:**
   - Reducción de keyframes reportada
   - Tamaño del tracks.json
   - Reproducción suave en viewer

### Criterios de Éxito

- ✅ Sistema estable durante 5 minutos
- ✅ Frame drop rate < 5%
- ✅ Latencia P95 < 500ms consistentemente
- ✅ tracks.json generado correctamente

---

## Troubleshooting

### Problema: Compactación no se aplica

**Síntomas:**

- No aparece log "Tracks compacted"
- tracks.json tiene tamaño completo (~400KB)

**Soluciones:**

1. Verificar `tracksCompaction.enabled: true` en config
2. Verificar que la sesión tiene detecciones (trackCount > 0)
3. Verificar logs de errores durante `closeSession()`

### Problema: Frames se descartan constantemente

**Síntomas:**

- `droppedFrames` > 10% en logs
- AdaptiveFPS sugiere bajar FPS constantemente

**Soluciones:**

1. Reducir FPS en config: 30 → 20
2. Aumentar `maxQueueSize`: 8 → 12
3. Verificar carga CPU (htop)
4. Verificar que Python detector no está bloqueado

### Problema: Interpolación con saltos en viewer

**Síntomas:**

- Bounding boxes "saltan" entre frames
- Movimiento no es suave

**Soluciones:**

1. Reducir agresividad de compactación:
   - `kf_similarity_iou`: 0.98 → 0.95
   - `eps_xy/eps_wh`: 0.005 → 0.002
2. Aumentar `min_kf_dt`: 0.03 → 0.05
3. Cambiar método: hybrid → iou

### Problema: Errores de compilación

**Síntomas:**

- `npm run build` falla
- TypeScript errors

**Soluciones:**

1. Limpiar y reinstalar:
   ```bash
   rm -rf node_modules packages/*/node_modules
   npm install
   npm run build
   ```
2. Verificar que todas las dependencias están instaladas
3. Verificar versión de Node: >= 18

---

## Checklist de Validación Completa

### Funcional

- [ ] Test 1: Compactación reduce keyframes 60-80%
- [ ] Test 2: Viewer muestra interpolación suave
- [ ] Test 3: Backpressure maneja carga alta correctamente
- [ ] Test 4: Sin carga, no hay frame drops
- [ ] Test 5: Todos los métodos de compactación funcionan
- [ ] Test 6: Sistema funciona con mejoras deshabilitadas
- [ ] Test 7: Warning aparece con sesiones ilimitadas

### No Funcional

- [ ] Compilación exitosa (0 errores)
- [ ] Logs claros y útiles
- [ ] Configuración JSON válida
- [ ] Documentación completa

### Performance

- [ ] Latencia P95 < 500ms
- [ ] Frame drop rate < 5%
- [ ] Reducción keyframes > 60%
- [ ] tracks.json < 200KB

---

## Reporte de Resultados

Después de completar las pruebas, documenta los resultados:

```markdown
## Resultados de Pruebas - [Fecha]

### Test 1: Compactación Básica

- Reducción: 75.3%
- Tamaño tracks.json: 112KB
- Estado: ✅ PASS

### Test 2: Validación Visual

- Interpolación: Suave
- Bounding boxes: Precisas
- Estado: ✅ PASS

### Test 3: Backpressure con Carga

- Frame drops: 3.5%
- Latencia P95: 285ms
- Estado: ✅ PASS

[... continuar con todos los tests ...]

### Conclusión

Sistema validado y listo para producción.
```

---

## Siguiente Paso

Una vez validado, el sistema está listo para:

1. Deploy en entorno de staging
2. Monitoreo con métricas reales
3. Ajuste fino de parámetros según casos de uso específicos
