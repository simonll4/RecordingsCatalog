# Future Features & Enhancements

Este documento registra funcionalidades planificadas y mejoras futuras para el Edge Agent.

## Stream Events (Publisher)

**Estado:** Planificado - No implementado

**Descripción:**
Eventos del bus para rastrear el ciclo de vida del streaming RTSP.

### stream.start
- **Propósito:** Emitir cuando el publisher RTSP inicia correctamente
- **Ubicación:** `MediaMtxOnDemandPublisherGst.start()`
- **Uso futuro:**
  - Logging de disponibilidad del stream
  - Métricas de uptime
  - Health checks

### stream.stop
- **Propósito:** Emitir cuando el publisher RTSP se detiene normalmente
- **Ubicación:** `MediaMtxOnDemandPublisherGst.stop()`
- **Uso futuro:**
  - Métricas de duración del stream
  - Logging de ciclo de vida

### stream.error
- **Propósito:** Emitir cuando ocurre un error fatal en el pipeline de streaming
- **Ubicación:** `MediaMtxOnDemandPublisherGst` error handling
- **Uso futuro:**
  - Lógica de retry con exponential backoff
  - Métricas de tasa de errores
  - Alertas centralizadas

**Referencias:**
- Ver `src/core/bus/events.ts` para definiciones de tipos
- Ver `src/modules/streaming/adapters/gstreamer/media-mtx-on-demand-publisher-gst.ts` para implementación

---

## NV12 Capture Reconfiguration

**Estado:** Planificado - No implementado

**Descripción:**
Soporte para reconfiguración dinámica del pipeline de captura NV12 cuando el AI worker
negocia una resolución diferente durante el handshake.

### Problema Actual
Durante el handshake Init/InitOk:
1. Edge agent propone resolución (AI_WIDTH × AI_HEIGHT)
2. Worker puede responder con resolución diferente
3. Si hay mismatch: se registra un warning pero se continúa
4. Los frames pueden tener resolución incorrecta

### Solución Propuesta
1. Detectar mismatch en `handleHandshakeResponse()` (feeder/handshake.ts)
2. Llamar a `NV12CaptureGst.reconfigure(width, height)`
3. Recrear pipeline GStreamer con nueva resolución
4. Continuar captura sin reiniciar todo el sistema

**Ubicaciones afectadas:**
- `src/modules/ai/feeder/handshake.ts` - Detección de mismatch
- `src/modules/video/adapters/gstreamer/nv12-capture-gst.ts` - Reconfiguración

**Referencias:**
- Ver comentarios `TODO: Reconfigure NV12 capture pipeline` en handshake.ts

---

## Implementación de Prioridades

1. **Alta prioridad:** Stream Events (stream.error principalmente)
   - Mejora observabilidad y debugging
   - Necesario para ambientes productivos

2. **Media prioridad:** NV12 Capture Reconfiguration
   - Útil para flexibilidad con múltiples AI workers
   - Actualmente workaround: configurar misma resolución en ambos lados

3. **Baja prioridad:** stream.start/stream.stop eventos
   - Nice-to-have para métricas
   - No crítico para operación
