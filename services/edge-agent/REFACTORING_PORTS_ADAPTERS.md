# Refactorización Ports & Adapters - Edge Agent

## 📋 Resumen Ejecutivo

Se ha completado la refactorización del módulo `edge-agent` siguiendo una arquitectura **Hexagonal (Ports & Adapters)** con agrupación **feature-first**. Esta refactorización separa claramente la lógica de negocio de los detalles de infraestructura, mejorando la mantenibilidad, testeabilidad y extensibilidad del sistema.

---

## 🎯 Objetivos Cumplidos

✅ **Separación de puertos (interfaces) y adaptadores (implementaciones)**  
✅ **Agrupación por dominio**: AI, Video, Streaming, Store  
✅ **Aislamiento de infraestructura**: TCP/Protobuf, GStreamer, HTTP abstraídos  
✅ **Lógica pura extraída**: Transforms y filters reutilizables y testeables  
✅ **Dependency Injection**: Orquestador depende de interfaces, no implementaciones  

---

## 📁 Nueva Estructura

```
src/modules/
├── ai/
│   ├── ports/
│   │   ├── ai-engine.ts          # Interfaz AIEngine
│   │   └── ai-client.ts          # Interfaz AIClient + tipos (InitArgs, Result)
│   ├── engine/
│   │   └── ai-engine-tcp.ts      # Implementación TCP del motor de IA
│   ├── client/
│   │   └── ai-client-tcp.ts      # Cliente TCP + Protobuf + backpressure
│   ├── transforms/
│   │   └── result-mapper.ts      # Mapeo puro: Protobuf → Result
│   ├── filters/
│   │   └── detection-filter.ts   # Filtrado puro: umbral + clases
│   └── index.ts                  # Barrel export (ports + utils)
│
├── video/
│   ├── ports/
│   │   ├── camera-hub.ts         # Interfaz CameraHub
│   │   └── rgb-capture.ts        # Interfaz RGBCapture + OnFrameFn
│   ├── adapters/
│   │   └── gstreamer/
│   │       ├── camera-hub-gst.ts       # Hub GStreamer (V4L2/RTSP → SHM)
│   │       └── rgb-capture-gst.ts      # Captura RGB (SHM → frames)
│   └── index.ts
│
├── streaming/
│   ├── ports/
│   │   └── publisher.ts          # Interfaz Publisher
│   ├── adapters/
│   │   └── gstreamer/
│   │       └── publisher-gst.ts        # RTSP GStreamer (SHM → MediaMTX)
│   └── index.ts
│
└── store/
    ├── ports/
    │   └── session-store.ts      # Interfaz SessionStore
    ├── adapters/
    │   └── http/
    │       └── session-store-http.ts   # Cliente HTTP REST API
    └── index.ts
```

---

## 🔌 Ports (Interfaces)

### **AI Domain**

#### `AIEngine` (`ai/ports/ai-engine.ts`)
- **Responsabilidad**: Contrato para motores de inferencia
- **Métodos**:
  - `setModel(opts)`: Configura modelo, umbral, resolución, filtro de clases
  - `run(frame, meta)`: Envía frame RGB para inferencia

#### `AIClient` (`ai/ports/ai-client.ts`)
- **Responsabilidad**: Contrato para comunicación con workers remotos
- **Métodos**:
  - `connect()`: Establece conexión
  - `init(args)`: Inicializa modelo en worker
  - `canSend()`: Verifica backpressure
  - `sendFrame(...)`: Envía frame con latest-wins
  - `onResult(cb)`: Callback de resultados
  - `onError(cb)`: Callback de errores
  - `shutdown()`: Cierre ordenado

### **Video Domain**

#### `CameraHub` (`video/ports/camera-hub.ts`)
- **Responsabilidad**: Captura always-on → SHM
- **Métodos**:
  - `start()`: Inicia captura
  - `stop()`: Detiene captura
  - `ready(timeout?)`: Espera estado READY

#### `RGBCapture` (`video/ports/rgb-capture.ts`)
- **Responsabilidad**: Extracción de frames RGB para IA
- **Métodos**:
  - `start(onFrame)`: Inicia captura con callback
  - `stop()`: Detiene captura
  - `setMode(mode)`: Cambia FPS (idle/active)

### **Streaming Domain**

#### `Publisher` (`streaming/ports/publisher.ts`)
- **Responsabilidad**: Streaming de video (RTSP, HLS, etc.)
- **Métodos**:
  - `start()`: Inicia streaming
  - `stop(graceMs?)`: Detiene streaming con timeout

### **Store Domain**

#### `SessionStore` (`store/ports/session-store.ts`)
- **Responsabilidad**: Persistencia de sesiones y detecciones
- **Métodos**:
  - `open(startTs?)`: Abre sesión, retorna sessionId
  - `append(sessionId, payload)`: Agrega detecciones (batch)
  - `close(sessionId, endTs?)`: Cierra sesión
  - `flush(sessionId)`: Fuerza flush del batch
  - `flushAll()`: Flush completo (shutdown)

---

## 🔧 Adapters (Implementaciones)

### **AI Domain**

#### `AIClientTcp` (`ai/client/ai-client-tcp.ts`)
- **Tecnología**: TCP + Protobuf (length-prefixed framing)
- **Características**:
  - Backpressure (ventana 1 + latest-wins)
  - Reconexión automática con backoff exponencial
  - Heartbeat watchdog (10s timeout)
  - Re-init automático post-reconexión
  - Estados: DISCONNECTED → CONNECTING → CONNECTED → READY → SHUTDOWN

#### `AIEngineTcp` (`ai/engine/ai-engine-tcp.ts`)
- **Responsabilidad**: Coordina cliente TCP + filtrado + publicación al bus
- **Características**:
  - Usa `AIClient` (inyección de dependencia)
  - Aplica filtros puros (`detection-filter`)
  - Emite eventos `ai.detection` y `ai.keepalive` al bus
  - Keepalive periódico (2s) cuando no hay actividad

### **Video Domain**

#### `CameraHubGst` (`video/adapters/gstreamer/camera-hub-gst.ts`)
- **Tecnología**: GStreamer (V4L2/RTSP)
- **Características**:
  - Pipeline always-on → SHM (shmsink)
  - Auto-fallback MJPEG → RAW (V4L2)
  - Restart con backoff exponencial
  - Criterio AND ready: PLAYING + socket exists
  - Timeout ready: 3s

#### `RGBCaptureGst` (`video/adapters/gstreamer/rgb-capture-gst.ts`)
- **Tecnología**: GStreamer (shmsrc → fdsink)
- **Características**:
  - Dual-rate FPS (idle: 0.5fps, active: 5fps)
  - Buffering acotado (3 frames max)
  - Auto-recovery con backoff
  - Frames RGB vía stdout (binario)

### **Streaming Domain**

#### `PublisherGst` (`streaming/adapters/gstreamer/publisher-gst.ts`)
- **Tecnología**: GStreamer (rtspclientsink)
- **Características**:
  - SHM → RTSP MediaMTX
  - Detección automática de encoder H.264 (HW/SW)
  - Estados: idle → starting → running → stopping
  - Shutdown ordenado (SIGINT → SIGKILL timeout 1.5s)

### **Store Domain**

#### `SessionStoreHttp` (`store/adapters/http/session-store-http.ts`)
- **Tecnología**: HTTP REST API (fetch)
- **Características**:
  - Batching (timer 2s + límite 50 items)
  - Retry con backoff exponencial (3 intentos)
  - Timeout 5s por request
  - FlushAll para shutdown ordenado

---

## 🧩 Utilidades Puras

### **Transforms** (`ai/transforms/result-mapper.ts`)

```typescript
mapProtobufResult(pbResult: pb.ai.IResult): Result
```
- **Responsabilidad**: Convierte mensajes Protobuf a tipo `Result` interno
- **Características**:
  - Conversión segura de tipos (Long → bigint)
  - Valores por defecto para campos opcionales
  - Sin side effects (función pura)

### **Filters** (`ai/filters/detection-filter.ts`)

```typescript
filterDetections(result: Result, config: FilterConfig): Detection[]
calculateScore(detections: Detection[]): number
isRelevant(detections: Detection[]): boolean
```
- **Responsabilidad**: Lógica pura de filtrado y scoring
- **Características**:
  - Umbral de confianza
  - Filtro por clases permitidas
  - Cálculo de score global (max confidence)
  - Sin side effects (funciones puras)

---

## 🔄 Flujo de Dependencias

```
main.ts
  │
  ├─► Crea adaptadores concretos:
  │   ├─► CameraHubGst
  │   ├─► RGBCaptureGst
  │   ├─► AIClientTcp
  │   ├─► AIEngineTcp (recibe AIClientTcp)
  │   ├─► PublisherGst
  │   └─► SessionStoreHttp
  │
  └─► Inyecta al Orchestrator (solo ve puertos):
      └─► Orchestrator
          ├─► camera: CameraHub (interfaz)
          ├─► capture: RGBCapture (interfaz)
          ├─► ai: AIEngine (interfaz)
          ├─► publisher: Publisher (interfaz)
          └─► store: SessionStore (interfaz)
```

**Regla de oro**: El orquestador **solo** conoce las interfaces (puertos), nunca las implementaciones concretas. Esto permite:
- **Testear** con mocks/stubs
- **Cambiar** tecnologías sin tocar la lógica de negocio
- **Extender** con nuevas implementaciones (ej: `AIClientHttp`, `PublisherWebRTC`)

---

## ✅ Ventajas de la Nueva Arquitectura

### **1. Separación de Responsabilidades**
- **Puertos**: ¿Qué hace el sistema? (interfaces)
- **Adaptadores**: ¿Cómo lo hace? (implementaciones)
- **Lógica pura**: Reglas de negocio testeables

### **2. Testabilidad**
```typescript
// Mock sencillo para tests
class AIClientMock implements AIClient {
  async connect() {}
  async init(args: InitArgs) {}
  canSend() { return true; }
  sendFrame(...) {}
  onResult(cb) { /* Simular resultados */ }
  onError(cb) {}
  async shutdown() {}
}

// Test del engine sin TCP real
const mockClient = new AIClientMock();
const engine = new AIEngineTcp(bus, mockClient);
```

### **3. Extensibilidad**
Agregar nuevas implementaciones sin cambiar el core:
```typescript
// Nuevo adaptador WebSocket
export class AIClientWs implements AIClient { ... }

// Nuevo adaptador local (sin red)
export class AIEngineLocal implements AIEngine { ... }

// Nuevo publisher WebRTC
export class PublisherWebRTC implements Publisher { ... }
```

### **4. Mantenibilidad**
- **Búsqueda rápida**: `video/adapters/gstreamer/` → todo lo GStreamer de video
- **Cambios localizados**: Cambiar protobuf → solo tocar `ai/client/`
- **Documentación clara**: Cada archivo tiene un propósito único

### **5. Reutilización**
- **Filtros puros** → usables desde tests, CLI tools, scripts
- **Mappers puros** → compartibles entre cliente TCP y HTTP
- **Puertos** → contratos reutilizables para otros proyectos

---

## 🚀 Próximos Pasos (Opcional)

### **Path Aliases** (tsconfig.json)
```json
{
  "compilerOptions": {
    "paths": {
      "@modules/ai": ["./src/modules/ai"],
      "@modules/video": ["./src/modules/video"],
      "@modules/streaming": ["./src/modules/streaming"],
      "@modules/store": ["./src/modules/store"],
      "@ports/ai": ["./src/modules/ai/ports"],
      "@ports/video": ["./src/modules/video/ports"]
    }
  }
}
```

### **Tests Unitarios**
```typescript
// tests/unit/ai/filters/detection-filter.test.ts
describe('filterDetections', () => {
  it('should filter by confidence threshold', () => {
    const result = { detections: [
      { cls: 'person', conf: 0.9, bbox: [0,0,1,1] },
      { cls: 'car', conf: 0.3, bbox: [0,0,1,1] }
    ]};
    const config = { umbral: 0.5, classesFilter: new Set() };
    const filtered = filterDetections(result, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].cls).toBe('person');
  });
});
```

### **Tests de Integración**
```typescript
// tests/integration/ai/engine-tcp.test.ts
describe('AIEngineTcp', () => {
  it('should emit ai.detection on relevant results', async () => {
    const bus = new Bus();
    const mockClient = new AIClientMock();
    const engine = new AIEngineTcp(bus, mockClient);
    
    let detected = false;
    bus.on('ai.detection', () => { detected = true; });
    
    mockClient.simulateResult({ /* ... */ });
    await waitFor(() => detected);
    
    expect(detected).toBe(true);
  });
});
```

---

## 📝 Archivos Antiguos (Deprecated)

Los siguientes archivos quedan **deprecados** pero no se eliminan aún para backward compatibility:

- `src/modules/ai-client.ts` → `src/modules/ai/client/ai-client-tcp.ts`
- `src/modules/ai-engine-tcp.ts` → `src/modules/ai/engine/ai-engine-tcp.ts`
- `src/modules/camera-hub.ts` → `src/modules/video/adapters/gstreamer/camera-hub-gst.ts`
- `src/modules/ai-capture.ts` → `src/modules/video/adapters/gstreamer/rgb-capture-gst.ts`
- `src/modules/publisher.ts` → `src/modules/streaming/adapters/gstreamer/publisher-gst.ts`
- `src/modules/session-store.ts` → `src/modules/store/adapters/http/session-store-http.ts`

**Recomendación**: Eliminar tras validar que el nuevo código funciona correctamente.

---

## 🎓 Conclusión

Esta refactorización transforma el edge-agent de un diseño procedural (todo en `modules/`) a una arquitectura limpia y escalable basada en **Hexagonal Architecture**. El sistema ahora es:

- ✅ **Más testeable**: Mocks simples, lógica pura separada
- ✅ **Más mantenible**: Separación clara de responsabilidades
- ✅ **Más extensible**: Nuevas implementaciones sin tocar el core
- ✅ **Más documentado**: Estructura auto-explicativa

**Feature-first + Ports & Adapters = Código profesional y escalable** 🚀
