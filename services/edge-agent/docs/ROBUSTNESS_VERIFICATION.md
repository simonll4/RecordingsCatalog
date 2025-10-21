# Edge Agent - Robustness Verification Guide

Guía de verificación de mejoras de robustez aplicadas al edge-agent para prevenir "no envío de frames" y garantizar operación continua.

## 📋 Mejoras Implementadas

### 1. ✅ Degradación sin Detener Captura (Always-On)

**Problema Original**: `attemptDegradation()` detenía la captura con `capture.stop()`, causando pérdida de frames durante renegociación del protocolo.

**Solución**:
- La captura **continúa ejecutándose** durante degradación
- Se renegocia protocolo (Init/InitOk) sin interrumpir el flujo de frames
- Worker maneja frames interim con Error responses

**Ubicación**: `src/modules/ai/feeder/ai-feeder.ts:489-505`

**Verificación**:
```bash
# 1. Iniciar edge con frames normales
docker compose --profile edge up -d

# 2. Forzar degradación (editar config.toml):
[ai]
width = 1920
height = 1080
# Worker configurado para maxFrameBytes bajo

# 3. Verificar en logs:
docker logs -f tpfinalv3-edge-agent | grep -E "FRAME_IN|degradation"

# Resultado esperado:
# - "[FRAME_IN]" continúa apareciendo durante degradación
# - "Attempting degradation to JPEG codec"
# - "Degraded Init sent, waiting for InitOk"
# - NO debe aparecer "Stopping NV12 capture"
```

---

### 2. ✅ Reintentos Indefinidos en NV12Capture

**Problema Original**: 
- Límite `maxConsecutiveFailures = 5`
- "Give up" si socket SHM no disponible en 10s
- Captura no vuelve tras cortes RTSP/SHM prolongados

**Solución**:
- Reintentos **INDEFINIDOS** con backoff exponencial (max 30s)
- Espera **INDEFINIDA** del socket SHM con backoff gradual
- Flag `isRunning()` para verificación externa

**Ubicación**: `src/modules/video/adapters/gstreamer/nv12-capture-gst.ts:540-610`

**Verificación**:
```bash
# Test 1: Corte RTSP prolongado
# 1. Iniciar con cámara RTSP funcionando
# 2. Bloquear tráfico a la cámara
sudo iptables -A OUTPUT -d 192.168.1.82 -j DROP

# 3. Observar logs (debe reintentar indefinidamente)
docker logs -f tpfinalv3-edge-agent | grep "NV12 capture crashed"

# 4. Restaurar tráfico después de varios minutos
sudo iptables -D OUTPUT -d 192.168.1.82 -j DROP

# 5. Verificar recuperación
docker logs -f tpfinalv3-edge-agent | grep "socket available.*restarting"

# Resultado esperado:
# - Logs de "restarting with backoff" cada 30s (no se rinde)
# - Al restaurar: "Camera Hub socket available, restarting NV12 capture"
# - Vuelven frames: "[FRAME_IN] Frame received"
```

---

### 3. ✅ Drops Silenciosos → Degradación Automática

**Problema Original**: 
3 validaciones de tamaño dropeaban frames sin intentar degradación:
- `data.length > maxFrameBytes`
- `data.length !== expectedFrameBytes`
- `totalPlaneSize !== data.length`

**Solución**: Todas disparan `attemptDegradation(FRAME_TOO_LARGE)` automáticamente.

**Ubicación**: `src/modules/ai/feeder/ai-feeder.ts:615,682,709`

**Verificación**:
```bash
# Forzar frame size mismatch
# Editar config.toml temporalmente:
[ai]
width = 1920
height = 1080

# Worker configurado para 640×480
# Iniciar edge-agent
npm run dev

# Verificar métricas:
curl -s http://localhost:3003/metrics | grep -E "frame_bytes_max_hit|ai_degrade"

# Resultado esperado:
# frame_bytes_max_hit_total 1
# ai_degrade_jpeg_switch_total 1
# (Edge intenta degradación en lugar de dropear silenciosamente)
```

---

### 4. ✅ Relanzamiento en Reconexión

**Problema Original**: `onReady` retornaba si `feederStarted` era `true`, sin verificar si captura estaba activa.

**Solución**: 
- Verifica `nv12Capture.isRunning()` en reconexión
- Relanza `aiFeeder.start()` si captura detenida pero orchestrator listo

**Ubicación**: `src/app/main.ts:172-193`

**Verificación**:
```bash
# Test: Worker down/up
# 1. Edge y worker corriendo normalmente
docker compose --profile edge up -d

# 2. Detener worker
docker stop tpfinalv3-worker-ai

# 3. Esperar ~10s, luego reiniciar
docker start tpfinalv3-worker-ai

# 4. Verificar logs de edge:
docker logs -f tpfinalv3-edge-agent | grep -E "onReady|isRunning|restarting"

# Resultado esperado:
# - "AI reconnected - checking capture state"
# - "captureRunning=true" o "captureRunning=false"
# - Si false: "Capture not running, restarting after reconnection"
# - Vuelven frames: "[FRAME_SEND] Sending frame to worker"
```

---

### 5. ✅ Window Credits Mínimo Defensivo

**Problema Original**: Worker podría enviar `initialCredits = 0`, bloqueando envío.

**Solución**: `Math.max(1, windowSize)` garantiza al menos 1 crédito.

**Ubicación**: `src/modules/ai/feeder/window.ts:117`

**Verificación**:
```bash
# Métricas de window:
curl -s http://localhost:3003/metrics | grep ai_window_size

# Resultado esperado:
# ai_window_size 4  (o al menos 1, nunca 0)

# Si worker enviara 0 (caso edge):
# Logs mostrarían: "Worker sent window size < 1, using 1"
```

---

### 6. ✅ AIFeeder.start() Idempotente

**Problema Original**: Múltiples llamadas creaban subscripciones duplicadas al callback.

**Solución**: Flag `_isStarted` previene múltiples inicios.

**Ubicación**: `src/modules/ai/feeder/ai-feeder.ts:537-551`

**Verificación**:
```typescript
// Test unitario (conceptual):
await aiFeeder.start();  // Primera llamada
await aiFeeder.start();  // Segunda llamada

// Logs deben mostrar:
// 1ra: "AI Feeder started"
// 2da: "AI Feeder already started" (debug level)
```

---

### 7. ✅ FrameCache Cleanup sin Memory Leaks

**Problema Original**: `setInterval` en constructor nunca se limpiaba.

**Solución**: 
- Guardar referencia a `cleanupInterval`
- Método `destroy()` que hace `clearInterval`
- Llamado en shutdown de `main.ts`

**Ubicación**: 
- `src/modules/ai/cache/frame-cache.ts:139,279`
- `src/modules/ai/feeder/ai-feeder.ts:575`
- `src/app/main.ts:549`

**Verificación**:
```bash
# Verificar shutdown limpio:
docker compose --profile edge up -d
# Esperar ~10s
docker compose --profile edge stop

# Logs deben mostrar:
docker logs tpfinalv3-edge-agent | grep -E "destroy|Shutdown complete"

# Resultado esperado:
# - "AI Feeder destroyed"
# - "Frame cache destroyed"
# - "Shutdown complete"
# (Sin procesos huérfanos ni memory leaks)
```

---

### 8. ✅ Docker shm_size para HD/4K

**Problema Original**: 64 MB SHM default insuficiente para 1080p.

**Solución**: `shm_size: "512m"` en docker-compose.yml

**Ubicación**: `docker-compose.yml:83`

**Verificación**:
```bash
# Verificar SHM del container:
docker inspect tpfinalv3-edge-agent | grep -i shm

# Resultado esperado:
# "ShmSize": 536870912  (512 MB en bytes)

# Test con 1080p:
# Editar config.toml:
[source]
width = 1920
height = 1080

# Iniciar edge:
docker compose --profile edge up --build

# No debe haber errores de "Failed to allocate SHM buffer"
```

---

## 📊 Métricas de Monitoreo

### Métricas Clave para Verificación

```bash
# Endpoint de métricas
curl -s http://localhost:3003/metrics

# Frames enviados (debe crecer continuamente)
ai_frames_sent_total

# Window state (debe ser > 0)
ai_window_size

# Frames in-flight (debe estar entre 0 y window_size)
ai_inflight

# RTT promedio (latencia AI worker)
ai_rtt_ms

# Degradación (debe ser 0 en operación normal)
frame_bytes_max_hit_total
ai_frame_size_mismatch_total
ai_degrade_jpeg_switch_total

# Drops por backpressure (normal en ráfagas)
ai_drops_latestwins_total

# Bus backpressure (debe ser 0)
bus_drops_total
```

### Dashboard de Verificación

```bash
# Watch continuo de métricas críticas:
watch -n 1 'curl -s http://localhost:3003/metrics | grep -E "ai_frames_sent_total|ai_window_size|ai_inflight"'

# Resultado esperado (operación normal):
# ai_frames_sent_total 1234  (incrementa ~5-12/s dependiendo de FPS)
# ai_window_size 4
# ai_inflight 2  (varía entre 0 y window_size)
```

---

## 🧪 Escenarios de Testing Completos

### Test 1: Worker Indisponible Prolongado

```bash
# 1. Iniciar sistema
docker compose --profile edge up -d

# 2. Detener worker por 5 minutos
docker stop tpfinalv3-worker-ai
sleep 300

# 3. Reiniciar worker
docker start tpfinalv3-worker-ai

# 4. Verificar:
# - Edge se reconecta automáticamente
# - Handshake se completa (InitOk)
# - Frames vuelven a fluir
# - ai_frames_sent_total vuelve a crecer
```

### Test 2: Corte de Red RTSP

```bash
# 1. Sistema funcionando con cámara RTSP
# 2. Bloquear IP de cámara
sudo iptables -A OUTPUT -d 192.168.1.82 -j DROP

# 3. Esperar 2 minutos (observar reintentos)
# 4. Desbloquear
sudo iptables -D OUTPUT -d 192.168.1.82 -j DROP

# 5. Verificar recuperación automática
# - CameraHub se reconecta a RTSP
# - SHM socket se recrea
# - NV12Capture detecta socket y reinicia
# - Frames vuelven: "[FRAME_IN]"
```

### Test 3: Forzar Degradación por Tamaño

```bash
# 1. Configurar edge para alta resolución
# config.toml: width=1920, height=1080

# 2. Worker con maxFrameBytes bajo (640×480)
# 3. Iniciar edge

# 4. Verificar:
# - Primer frame dispara degradación
# - "attempting degradation" en logs
# - Edge renegocia Init con JPEG
# - Worker acepta frames JPEG
# - ai_degrade_jpeg_switch_total == 1
```

---

## 📝 Checklist de Robustez

- [x] Degradación no detiene captura
- [x] NV12Capture reintentos indefinidos
- [x] Drops disparan degradación automática
- [x] Relanzamiento en reconexión verificado
- [x] Window credits nunca 0
- [x] AIFeeder.start() idempotente
- [x] FrameCache cleanup sin leaks
- [x] Docker shm_size adecuado (512 MB)
- [x] Bus logging consistente (no console.*)
- [x] Docs actualizadas (config.toml, no env vars)

---

## 🎯 Criterios de Aceptación

Sistema considerado robusto si cumple:

1. **Reconexión Worker**: Tras 5 min offline → vuelve envío automático
2. **Corte RTSP**: Tras bloqueo de 2 min → recupera automático
3. **Frame Size Mismatch**: Dispara degradación, no drop infinito
4. **Shutdown Limpio**: Sin procesos huérfanos, memory leaks
5. **Métricas Consistentes**: `ai_frames_sent_total` crece sin gaps > 30s
6. **Logs Estructurados**: Todo vía logger, no console.*
7. **Docker Resiliente**: `restart: unless-stopped` funciona

---

## 📚 Referencias

- **Código de Degradación**: `src/modules/ai/feeder/ai-feeder.ts:459-528`
- **Reintentos NV12**: `src/modules/video/adapters/gstreamer/nv12-capture-gst.ts:540-610`
- **Reconexión Main**: `src/app/main.ts:172-193`
- **Docker Config**: `docker-compose.yml:78-115`
- **Métricas**: `http://localhost:3003/metrics`
- **Logs**: `docker logs -f tpfinalv3-edge-agent`

---

**Última actualización**: 2025-10-21
**Versión edge-agent**: v1.0-robust
