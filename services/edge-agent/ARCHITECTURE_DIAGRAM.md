# Arquitectura Visual - Ports & Adapters

## Diagrama de Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    main.ts (Composition Root)               │ │
│  │                                                             │ │
│  │  • Instancia adaptadores concretos                         │ │
│  │  • Inyecta dependencias al Orchestrator                    │ │
│  │  • Maneja lifecycle (startup/shutdown)                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Orchestrator (FSM)                       │ │
│  │                                                             │ │
│  │  Depende SOLO de puertos (interfaces):                     │ │
│  │  • CameraHub                                               │ │
│  │  • RGBCapture                                              │ │
│  │  • AIEngine                                                │ │
│  │  • Publisher                                               │ │
│  │  • SessionStore                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ depende de
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                          PORTS LAYER                             │
│                        (Interfaces)                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   AIEngine   │  │  CameraHub   │  │  Publisher   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  AIClient    │  │  RGBCapture  │  │ SessionStore │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ implementado por
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ADAPTERS LAYER                            │
│                   (Implementaciones concretas)                   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  AI Domain                                                   ││
│  │  • AIClientTcp     (TCP + Protobuf + backpressure)          ││
│  │  • AIEngineTcp     (Cliente + filtrado + bus events)        ││
│  │  • result-mapper   (Protobuf → Result)                      ││
│  │  • detection-filter (Umbral + clases)                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Video Domain                                                ││
│  │  • CameraHubGst    (V4L2/RTSP → SHM, GStreamer)             ││
│  │  • RGBCaptureGst   (SHM → RGB frames, dual-rate)           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Streaming Domain                                            ││
│  │  • PublisherGst    (SHM → RTSP MediaMTX, GStreamer)         ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Store Domain                                                ││
│  │  • SessionStoreHttp (REST API + batching + retry)           ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  │ usa
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INFRASTRUCTURE LAYER                        │
│                                                                  │
│  • GStreamer pipelines (media/)                                 │
│  • Protobuf definitions (proto/)                                │
│  • Child process helpers (shared/)                              │
│  • Logging & metrics (shared/)                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Flujo de Datos - Detección de IA

```
┌──────────────┐
│   Camera     │ (V4L2/RTSP)
│   Source     │
└──────┬───────┘
       │
       │ captura
       ▼
┌──────────────┐     ┌─────────────────────┐
│ CameraHubGst │────►│  SHM (shmsink)      │
└──────────────┘     └──────┬──────────────┘
                            │
                    ┌───────┴──────────┐
                    │                  │
                    ▼                  ▼
         ┌──────────────────┐  ┌─────────────┐
         │  RGBCaptureGst   │  │PublisherGst │
         │  (AI analysis)   │  │(RTSP stream)│
         └────────┬─────────┘  └─────────────┘
                  │
                  │ RGB frames
                  ▼
         ┌──────────────────┐
         │  AIEngineTcp     │
         └────────┬─────────┘
                  │
                  │ frame data
                  ▼
         ┌──────────────────┐
         │  AIClientTcp     │ ◄──── TCP ─────► Worker Python
         └────────┬─────────┘                  (ONNX inference)
                  │
                  │ Result (pb)
                  ▼
         ┌──────────────────┐
         │ result-mapper    │ (Protobuf → Result)
         └────────┬─────────┘
                  │
                  │ Result
                  ▼
         ┌──────────────────┐
         │ detection-filter │ (umbral + clases)
         └────────┬─────────┘
                  │
                  │ filtered detections
                  ▼
         ┌──────────────────┐
         │   Bus.emit()     │ ─────► ai.detection / ai.keepalive
         └──────────────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Orchestrator    │ (FSM: IDLE → DWELL → ACTIVE → CLOSING)
         │                  │
         │  Comandos:       │
         │  • StartStream   │ ────► PublisherGst.start()
         │  • OpenSession   │ ────► SessionStoreHttp.open()
         │  • AppendDetect  │ ────► SessionStoreHttp.append()
         │  • CloseSession  │ ────► SessionStoreHttp.close()
         │  • StopStream    │ ────► PublisherGst.stop()
         └──────────────────┘
```

## Principios Aplicados

### 1. **Dependency Inversion Principle (DIP)**
```
High-level modules (Orchestrator) ──depends on──► Abstractions (Ports)
                                                         ▲
                                                         │
                                    implements           │
                                                         │
Low-level modules (Adapters) ────────────────────────────┘
```

### 2. **Single Responsibility Principle (SRP)**
```
AIClientTcp       → Solo maneja TCP + Protobuf + backpressure
AIEngineTcp       → Solo coordina cliente + filtrado + bus
result-mapper     → Solo mapea Protobuf → Result
detection-filter  → Solo filtra detecciones
```

### 3. **Open/Closed Principle (OCP)**
```
Abierto para extensión:
  • Nuevos adaptadores (AIClientHttp, PublisherWebRTC)
  
Cerrado para modificación:
  • Orchestrator no cambia al agregar nuevas implementaciones
```

### 4. **Interface Segregation Principle (ISP)**
```
AIEngine    → setModel(), run()
AIClient    → connect(), init(), sendFrame(), onResult(), ...
CameraHub   → start(), stop(), ready()
RGBCapture  → start(), stop(), setMode()
Publisher   → start(), stop()
SessionStore → open(), append(), close(), flush()

Interfaces específicas, no "fat interfaces"
```

### 5. **Separation of Concerns**
```
Ports/      → ¿Qué hace el sistema? (contratos)
Adapters/   → ¿Cómo lo hace? (detalles técnicos)
Transforms/ → Mapeos puros (sin side effects)
Filters/    → Reglas de negocio puras
```

---

## Ventajas Visuales

### Antes (Flat structure)
```
modules/
├── ai-client.ts          ❌ Mezcla protocolo + lógica
├── ai-engine-tcp.ts      ❌ Mezcla filtrado + TCP
├── camera-hub.ts         ❌ GStreamer hardcodeado
├── ai-capture.ts         ❌ GStreamer hardcodeado
├── publisher.ts          ❌ GStreamer hardcodeado
└── session-store.ts      ❌ HTTP hardcodeado
```

### Después (Ports & Adapters)
```
modules/
├── ai/
│   ├── ports/           ✅ Contratos claros
│   ├── engine/          ✅ Lógica de aplicación
│   ├── client/          ✅ Protocolo aislado
│   ├── transforms/      ✅ Funciones puras
│   └── filters/         ✅ Reglas de negocio
├── video/
│   ├── ports/           ✅ Contratos claros
│   └── adapters/
│       └── gstreamer/   ✅ Tecnología aislada
├── streaming/
│   ├── ports/           ✅ Contratos claros
│   └── adapters/
│       └── gstreamer/   ✅ Tecnología aislada
└── store/
    ├── ports/           ✅ Contratos claros
    └── adapters/
        └── http/        ✅ Tecnología aislada
```

---

## Testing Strategy

```
┌─────────────────────────────────────────────────┐
│             UNIT TESTS (Funciones puras)        │
│                                                 │
│  • detection-filter.test.ts                    │
│  • result-mapper.test.ts                       │
│                                                 │
│  Ventajas:                                     │
│  ✓ Rápidos (ms)                                │
│  ✓ No requieren infraestructura                │
│  ✓ 100% cobertura posible                      │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│        INTEGRATION TESTS (Con mocks)            │
│                                                 │
│  • ai-engine-tcp.test.ts (mock AIClient)       │
│  • orchestrator.test.ts (mock adapters)        │
│                                                 │
│  Ventajas:                                     │
│  ✓ Verifica integración sin I/O real           │
│  ✓ Rápidos (segundos)                          │
│  ✓ Determinísticos                             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│         E2E TESTS (Todo real)                   │
│                                                 │
│  • full-pipeline.test.ts                       │
│                                                 │
│  Ventajas:                                     │
│  ✓ Verifica sistema completo                   │
│  ✓ Detecta problemas de integración real       │
│                                                 │
│  Desventajas:                                  │
│  ✗ Lentos (minutos)                            │
│  ✗ Requieren infraestructura (worker, DB, etc) │
└─────────────────────────────────────────────────┘
```

---

## Ejemplo de Mock para Testing

```typescript
// tests/mocks/ai-client.mock.ts
export class AIClientMock implements AIClient {
  private resultCallback?: (r: Result) => void;
  
  async connect() {}
  async init(args: InitArgs) {}
  canSend() { return true; }
  
  sendFrame(seq: number, tsIso: string, tsMonoNs: bigint, 
            w: number, h: number, rgb: Buffer) {
    // Simular resultado inmediato
    setTimeout(() => {
      this.resultCallback?.({
        seq,
        tsIso,
        tsMonoNs,
        detections: [
          { cls: 'person', conf: 0.95, bbox: [10, 20, 100, 200] }
        ]
      });
    }, 10);
  }
  
  onResult(cb: (r: Result) => void) {
    this.resultCallback = cb;
  }
  
  onError(cb: (err: Error) => void) {}
  async shutdown() {}
}

// Uso en test
const mockClient = new AIClientMock();
const engine = new AIEngineTcp(bus, mockClient);
await engine.setModel({ /* ... */ });
await engine.run(fakeFrame, fakeMeta);
// Verificar que bus.emit('ai.detection') fue llamado
```
