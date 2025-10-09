# Guía de Migración Incremental - Ports & Adapters

## 🎯 Objetivo

Esta guía facilita la **migración segura y verificable** del código antiguo al nuevo diseño Ports & Adapters, permitiendo validar cada paso antes de continuar.

---

## ✅ Estado Actual

### Archivos Nuevos (Refactorización Completa)

```
✅ src/modules/ai/
   ✅ ports/ai-engine.ts
   ✅ ports/ai-client.ts
   ✅ engine/ai-engine-tcp.ts
   ✅ client/ai-client-tcp.ts
   ✅ transforms/result-mapper.ts
   ✅ filters/detection-filter.ts
   ✅ index.ts

✅ src/modules/video/
   ✅ ports/camera-hub.ts
   ✅ ports/rgb-capture.ts
   ✅ adapters/gstreamer/camera-hub-gst.ts
   ✅ adapters/gstreamer/rgb-capture-gst.ts
   ✅ index.ts

✅ src/modules/streaming/
   ✅ ports/publisher.ts
   ✅ adapters/gstreamer/publisher-gst.ts
   ✅ index.ts

✅ src/modules/store/
   ✅ ports/session-store.ts
   ✅ adapters/http/session-store-http.ts
   ✅ index.ts

✅ src/core/orchestrator/orchestrator.ts (actualizado)
✅ src/app/main.ts (actualizado)
```

### Archivos Antiguos (Deprecados)

```
⚠️  src/modules/ai-client.ts
⚠️  src/modules/ai-engine-tcp.ts
⚠️  src/modules/camera-hub.ts
⚠️  src/modules/ai-capture.ts
⚠️  src/modules/publisher.ts
⚠️  src/modules/session-store.ts
```

---

## 📋 Plan de Migración (Pasos)

### **Fase 1: Validación** ✅ COMPLETADO

1. ✅ Crear estructura de directorios
2. ✅ Extraer interfaces (ports)
3. ✅ Crear adaptadores con nueva estructura
4. ✅ Extraer lógica pura (transforms/filters)
5. ✅ Actualizar imports en `orchestrator.ts`
6. ✅ Actualizar imports en `main.ts`
7. ✅ Verificar compilación sin errores

### **Fase 2: Testing** (Siguiente paso)

#### 2.1. Pruebas Unitarias de Utilidades Puras

```bash
# Crear tests para funciones puras
mkdir -p tests/unit/ai/transforms
mkdir -p tests/unit/ai/filters
```

**Test: `result-mapper.test.ts`**
```typescript
import { mapProtobufResult } from '../../../src/modules/ai/transforms/result-mapper';
import Long from 'long';

describe('mapProtobufResult', () => {
  it('should map protobuf result to internal Result type', () => {
    const pbResult = {
      seq: 42,
      tsIso: '2025-01-01T00:00:00.000Z',
      tsMonoNs: Long.fromNumber(1234567890),
      detections: [
        {
          cls: 'person',
          conf: 0.95,
          bbox: { x: 10, y: 20, w: 100, h: 200 },
          trackId: 'track_1'
        }
      ]
    };

    const result = mapProtobufResult(pbResult);

    expect(result.seq).toBe(42);
    expect(result.tsIso).toBe('2025-01-01T00:00:00.000Z');
    expect(result.tsMonoNs).toBe(BigInt(1234567890));
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].cls).toBe('person');
    expect(result.detections[0].conf).toBe(0.95);
    expect(result.detections[0].bbox).toEqual([10, 20, 100, 200]);
  });

  it('should handle missing optional fields with defaults', () => {
    const pbResult = {
      seq: 1,
      tsIso: '',
      detections: []
    };

    const result = mapProtobufResult(pbResult);

    expect(result.tsIso).toBe('');
    expect(result.tsMonoNs).toBe(BigInt(0));
    expect(result.detections).toHaveLength(0);
  });
});
```

**Test: `detection-filter.test.ts`**
```typescript
import {
  filterDetections,
  calculateScore,
  isRelevant
} from '../../../src/modules/ai/filters/detection-filter';

describe('detection-filter', () => {
  const mockResult = {
    seq: 1,
    tsIso: '2025-01-01T00:00:00Z',
    tsMonoNs: BigInt(0),
    detections: [
      { cls: 'person', conf: 0.95, bbox: [10, 20, 100, 200] as [number, number, number, number] },
      { cls: 'car', conf: 0.85, bbox: [50, 60, 150, 160] as [number, number, number, number] },
      { cls: 'person', conf: 0.3, bbox: [100, 100, 200, 200] as [number, number, number, number] }
    ]
  };

  describe('filterDetections', () => {
    it('should filter by confidence threshold', () => {
      const config = { umbral: 0.5, classesFilter: new Set<string>() };
      const filtered = filterDetections(mockResult, config);

      expect(filtered).toHaveLength(2); // 0.95 y 0.85, no 0.3
      expect(filtered[0].conf).toBeGreaterThanOrEqual(0.5);
      expect(filtered[1].conf).toBeGreaterThanOrEqual(0.5);
    });

    it('should filter by allowed classes', () => {
      const config = { 
        umbral: 0.0, 
        classesFilter: new Set(['person']) 
      };
      const filtered = filterDetections(mockResult, config);

      expect(filtered).toHaveLength(2); // Solo 'person'
      expect(filtered.every(d => d.cls === 'person')).toBe(true);
    });

    it('should apply both filters', () => {
      const config = { 
        umbral: 0.5, 
        classesFilter: new Set(['person']) 
      };
      const filtered = filterDetections(mockResult, config);

      expect(filtered).toHaveLength(1); // Solo person con conf >= 0.5
      expect(filtered[0].cls).toBe('person');
      expect(filtered[0].conf).toBe(0.95);
    });
  });

  describe('calculateScore', () => {
    it('should return max confidence', () => {
      const score = calculateScore(mockResult.detections);
      expect(score).toBe(0.95);
    });

    it('should return 0 for empty array', () => {
      const score = calculateScore([]);
      expect(score).toBe(0);
    });
  });

  describe('isRelevant', () => {
    it('should return true if detections exist', () => {
      expect(isRelevant(mockResult.detections)).toBe(true);
    });

    it('should return false if no detections', () => {
      expect(isRelevant([])).toBe(false);
    });
  });
});
```

**Ejecutar tests:**
```bash
npm test -- detection-filter
npm test -- result-mapper
```

#### 2.2. Pruebas de Integración con Mocks

**Mock: `ai-client.mock.ts`**
```typescript
import { AIClient, InitArgs, Result } from '../../../src/modules/ai/ports/ai-client';

export class AIClientMock implements AIClient {
  private resultCb?: (r: Result) => void;
  private errorCb?: (err: Error) => void;
  public initCalled = false;
  public connectCalled = false;
  public shutdownCalled = false;

  async connect(): Promise<void> {
    this.connectCalled = true;
  }

  async init(args: InitArgs): Promise<void> {
    this.initCalled = true;
  }

  canSend(): boolean {
    return true;
  }

  sendFrame(seq: number, tsIso: string, tsMonoNs: bigint, 
            w: number, h: number, rgb: Buffer): void {
    // Simular resultado después de 10ms
    setTimeout(() => {
      if (this.resultCb) {
        this.resultCb({
          seq,
          tsIso,
          tsMonoNs,
          detections: [
            { cls: 'person', conf: 0.95, bbox: [10, 20, 100, 200] }
          ]
        });
      }
    }, 10);
  }

  onResult(cb: (r: Result) => void): void {
    this.resultCb = cb;
  }

  onError(cb: (err: Error) => void): void {
    this.errorCb = cb;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
  }

  // Helper para simular resultados en tests
  simulateResult(result: Result): void {
    if (this.resultCb) {
      this.resultCb(result);
    }
  }

  simulateError(error: Error): void {
    if (this.errorCb) {
      this.errorCb(error);
    }
  }
}
```

**Test: `ai-engine-tcp.test.ts`**
```typescript
import { Bus } from '../../../src/core/bus/bus';
import { AIEngineTcp } from '../../../src/modules/ai/engine/ai-engine-tcp';
import { AIClientMock } from '../../mocks/ai-client.mock';

describe('AIEngineTcp', () => {
  let bus: Bus;
  let client: AIClientMock;
  let engine: AIEngineTcp;

  beforeEach(() => {
    bus = new Bus();
    client = new AIClientMock();
    engine = new AIEngineTcp(bus, client);
  });

  it('should emit ai.detection when result is relevant', async (done) => {
    await engine.setModel({
      modelName: 'test.onnx',
      umbral: 0.5,
      width: 640,
      height: 640
    });

    bus.on('ai.detection', (event) => {
      expect(event.relevant).toBe(true);
      expect(event.detections).toHaveLength(1);
      expect(event.detections[0].cls).toBe('person');
      done();
    });

    const mockFrame = Buffer.alloc(640 * 640 * 3);
    await engine.run(mockFrame, {
      ts: '2025-01-01T00:00:00Z',
      width: 640,
      height: 640,
      pixFmt: 'RGB'
    });
  });

  it('should emit ai.detection with relevant=false when filtered', async (done) => {
    await engine.setModel({
      modelName: 'test.onnx',
      umbral: 0.99, // Umbral muy alto
      width: 640,
      height: 640
    });

    bus.on('ai.detection', (event) => {
      expect(event.relevant).toBe(false);
      expect(event.detections).toHaveLength(0);
      done();
    });

    const mockFrame = Buffer.alloc(640 * 640 * 3);
    await engine.run(mockFrame, {
      ts: '2025-01-01T00:00:00Z',
      width: 640,
      height: 640,
      pixFmt: 'RGB'
    });
  });
});
```

**Ejecutar tests:**
```bash
npm test -- ai-engine-tcp
```

### **Fase 3: Integración E2E** (Después de tests unitarios)

#### 3.1. Test con Worker Python Real

```bash
# Levantar worker de IA en background
docker-compose up -d worker-ai

# Ejecutar test E2E
npm run test:e2e
```

**Test: `full-pipeline.e2e.test.ts`**
```typescript
describe('Full Pipeline E2E', () => {
  it('should detect objects and store session', async () => {
    const bus = new Bus();
    const camera = new CameraHubGst();
    const capture = new RGBCaptureGst();
    const aiClient = new AIClientTcp('localhost', 50051);
    const ai = new AIEngineTcp(bus, aiClient);
    const publisher = new PublisherGst();
    const store = new SessionStoreHttp();

    // Setup
    await ai.setModel({
      modelName: '/models/yolov8n.onnx',
      umbral: 0.5,
      width: 640,
      height: 640
    });

    // ... ejecutar pipeline completo
    // ... verificar detecciones
    // ... verificar sesión en DB

    // Cleanup
    await camera.stop();
    await capture.stop();
    await ai.shutdown();
  });
});
```

### **Fase 4: Limpieza** (Después de validar)

#### 4.1. Marcar archivos antiguos como deprecated

```typescript
// src/modules/ai-client.ts
/**
 * @deprecated Use `src/modules/ai/client/ai-client-tcp.ts` instead
 * This file will be removed in v2.0.0
 */
export { AIClientTcp } from './ai/client/ai-client-tcp.js';
export type { AIClient, InitArgs, Result } from './ai/ports/ai-client.js';
```

#### 4.2. Actualizar imports en archivos que aún usen rutas antiguas

```bash
# Buscar imports antiguos
grep -r "from.*modules/ai-client" src/
grep -r "from.*modules/camera-hub" src/
# ... etc
```

#### 4.3. Eliminar archivos antiguos (después de PR review)

```bash
# Hacer backup
git checkout -b backup/old-modules

# Eliminar archivos deprecados
rm src/modules/ai-client.ts
rm src/modules/ai-engine-tcp.ts
rm src/modules/camera-hub.ts
rm src/modules/ai-capture.ts
rm src/modules/publisher.ts
rm src/modules/session-store.ts

# Commit
git add -A
git commit -m "chore: remove deprecated modules (migrated to ports & adapters)"
```

---

## 🧪 Checklist de Validación

### Pre-deployment
- [ ] Todos los tests unitarios pasan (`npm test`)
- [ ] Tests de integración con mocks pasan
- [ ] No hay errores de compilación (`npm run build`)
- [ ] Linter sin warnings (`npm run lint`)
- [ ] Cobertura de tests > 80% en funciones puras

### Deployment
- [ ] Test E2E con worker real pasa
- [ ] Pipeline completo funciona en dev
- [ ] Logs no muestran errores críticos
- [ ] Métricas confirman funcionamiento (detections_total, etc.)

### Post-deployment
- [ ] Monitorear por 24h en producción
- [ ] Comparar métricas vs baseline anterior
- [ ] Verificar memoria/CPU estables
- [ ] No hay regresiones reportadas

---

## 🚨 Rollback Plan

Si algo falla crítico en producción:

### Opción 1: Revertir PR
```bash
git revert <commit-hash-refactoring>
git push origin main
```

### Opción 2: Toggle Feature Flag (si existe)
```typescript
// config/index.ts
const USE_NEW_ARCHITECTURE = process.env.USE_NEW_ARCH === 'true';

// main.ts
const camera = USE_NEW_ARCHITECTURE 
  ? new CameraHubGst() 
  : new CameraHubImpl();
```

### Opción 3: Redeploy versión anterior
```bash
docker pull <registry>/edge-agent:<version-anterior>
docker-compose up -d edge-agent
```

---

## 📊 Métricas de Éxito

### Antes de la refactorización (baseline)
```
• Tiempo de compilación: ___ segundos
• Tests ejecutados: ___ tests
• Cobertura de código: ___%
• Archivos en src/modules/: 6 archivos
• Líneas de código: ~2000 LOC
```

### Después de la refactorización (objetivo)
```
• Tiempo de compilación: similar o mejor
• Tests ejecutados: +50% (funciones puras + mocks)
• Cobertura de código: >80%
• Archivos en src/modules/: ~20 archivos (pero mejor organizados)
• Líneas de código: ~2500 LOC (documentación incluida)
• Tiempo para agregar nuevo adapter: <30 min
```

---

## 📚 Referencias

- [Hexagonal Architecture (Ports & Adapters)](https://alistair.cockburn.us/hexagonal-architecture/)
- [Clean Architecture - Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Feature-First Organization](https://feature-sliced.design/)

---

## 🎓 Lecciones Aprendidas

### ✅ Qué funcionó bien
- Separación clara de responsabilidades
- Funciones puras fáciles de testear
- Dependency Injection simplifica testing
- Estructura auto-documentada

### ⚠️ Qué mejorar
- Agregar path aliases en tsconfig.json
- Documentar convenciones de naming
- Crear templates para nuevos adapters
- Automatizar detección de imports antiguos

### 💡 Próximos pasos
- [ ] Agregar tests de rendimiento (benchmarks)
- [ ] Crear diagramas de secuencia automáticos
- [ ] Implementar health checks por módulo
- [ ] Documentar patrones de error handling
