# Guía de Estilo - Edge Agent

## 📋 Propósito

Esta guía define las convenciones de estilo y mejores prácticas para mantener la consistencia del código en el Edge Agent.

## 🎯 Principios Generales

1. **Legibilidad sobre brevedad** - El código se lee más que se escribe
2. **Consistencia** - Sigue los patrones existentes
3. **Documentación activa** - Los comentarios deben agregar valor
4. **Separación de responsabilidades** - Cada módulo tiene un propósito claro

---

## 📂 Organización de Archivos

### Estructura de Imports

**Orden:**
1. Core (infraestructura)
2. Modules (funcionalidad)
3. Shared (utilidades)

**Ejemplo:**
```typescript
// === Core ===
import { CONFIG } from "../config/index.js";
import { Bus } from "../core/bus/bus.js";
import { Orchestrator } from "../core/orchestrator/orchestrator.js";

// === Modules ===
import { CameraHubGst } from "../modules/video/adapters/gstreamer/camera-hub-gst.js";
import { AIFeeder } from "../modules/ai/feeder/ai-feeder.js";
import { PublisherGst } from "../modules/streaming/adapters/gstreamer/publisher-gst.js";

// === Shared ===
import { logger } from "../shared/logging.js";
import { metrics } from "../shared/metrics.js";
```

---

## 🏗️ Separadores de Sección

### Sección Principal

```typescript
// ============================================================
// NOMBRE DE LA SECCIÓN EN MAYÚSCULAS
// ============================================================
```

**Uso:** Delimitar grandes bloques funcionales (INITIALIZATION, CONFIGURATION, etc.)

### Subsección

```typescript
// --- Nombre de Subsección ---
```

**Uso:** Separar responsabilidades dentro de una sección (Timer Cleanup, Session Events, etc.)

### Comentario Inline

```typescript
// Comentario breve explicando la siguiente línea
const value = calculateSomething();
```

**Uso:** Explicar líneas específicas cuando no es obvio

---

## 📝 Documentación

### JSDoc para Funciones/Métodos

```typescript
/**
 * Descripción breve de qué hace el método
 *
 * Párrafo adicional con detalles si es necesario.
 * Puede incluir múltiples líneas.
 *
 * @param paramName - Descripción del parámetro
 * @param optionalParam - Descripción (opcional)
 * @returns Descripción del valor retornado
 */
async function myMethod(paramName: string, optionalParam?: number): Promise<void> {
  // ...
}
```

### JSDoc para Clases

```typescript
/**
 * Nombre de la Clase - Propósito principal
 *
 * Descripción detallada de la responsabilidad de la clase.
 *
 * Ejemplos de uso:
 * ```typescript
 * const instance = new MyClass(config);
 * await instance.init();
 * ```
 */
export class MyClass {
  // ...
}
```

### Documentación de Estados (FSM)

```typescript
/**
 * ESTADO: Descripción breve
 *
 * Comportamiento:
 * - Punto clave 1
 * - Punto clave 2
 *
 * IMPORTANTE: Nota crítica si aplica
 *
 * Transiciones:
 * - evento → NUEVO_ESTADO (condición de transición)
 * - otro.evento → OTRO_ESTADO (otra condición)
 */
function handleEstado(ctx: FSMContext, event: AllEvents) {
  // ...
}
```

---

## 🎨 Estilo de Código TypeScript

### Naming Conventions

```typescript
// Clases: PascalCase
class CameraHub {}

// Interfaces: PascalCase con prefijo I (opcional)
interface FSMContext {}

// Constantes: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Variables/funciones: camelCase
const sessionId = "abc123";
function handleEvent() {}

// Archivos: kebab-case
// camera-hub.ts
// ai-feeder.ts
```

### Organización de Métodos en Clases

```typescript
export class MyClass {
  // 1. Propiedades privadas
  private bus: Bus;
  private config: Config;
  
  // 2. Constructor
  constructor(bus: Bus, config: Config) {
    this.bus = bus;
    this.config = config;
  }
  
  // ============================================================
  // LIFECYCLE
  // ============================================================
  
  async init(): Promise<void> {}
  async shutdown(): Promise<void> {}
  
  // ============================================================
  // PUBLIC API
  // ============================================================
  
  public start(): void {}
  public stop(): void {}
  
  // ============================================================
  // PRIVATE HELPERS
  // ============================================================
  
  private handleEvent(event: Event): void {}
  private processData(data: Data): void {}
}
```

### Async/Await

```typescript
// ✅ BIEN: Usar async/await
async function fetchData(): Promise<Data> {
  const response = await api.get('/data');
  return response.data;
}

// ❌ MAL: Mezclar callbacks
function fetchData(callback: (data: Data) => void) {
  api.get('/data', (response) => {
    callback(response.data);
  });
}
```

### Error Handling

```typescript
// ✅ BIEN: Try-catch con logging estructurado
try {
  await riskyOperation();
} catch (err) {
  logger.error("Operation failed", {
    module: "my-module",
    error: err instanceof Error ? err.message : String(err),
  });
  throw err; // Re-throw si es crítico
}

// ❌ MAL: Silent catch
try {
  await riskyOperation();
} catch (err) {
  // Silent catch - nunca hacer esto
}
```

---

## 📊 Logging

### Niveles

```typescript
logger.error("Critical failure", { module: "x", error: err.message });
logger.warn("Recoverable issue", { module: "x", detail: "..." });
logger.info("Important event", { module: "x", sessionId: "..." });
logger.debug("Development info", { module: "x", data: "..." });
```

### Estructura

```typescript
// ✅ BIEN: Logging estructurado con contexto
logger.info("Session opened", {
  module: "orchestrator",
  sessionId: event.sessionId,
  state: this.ctx.state,
});

// ❌ MAL: String concatenation
logger.info(`Session ${event.sessionId} opened in state ${this.ctx.state}`);
```

### Frecuencia

- **ERROR:** Siempre logear errores
- **WARN:** Situaciones anormales recuperables
- **INFO:** Solo cambios de estado importantes
- **DEBUG:** Detalles de desarrollo (no en producción)

```typescript
// ✅ BIEN: INFO solo en transiciones de estado
if (prevState !== this.ctx.state) {
  logger.info("State transition", {
    module: "orchestrator",
    from: prevState,
    to: this.ctx.state,
  });
}

// ❌ MAL: INFO en cada evento
logger.info("Processing event", { event: event.type }); // Demasiado verboso
```

---

## 🧪 Comentarios y TODOs

### Comentarios que Agregan Valor

```typescript
// ✅ BIEN: Explica el "por qué"
// Wait for orchestrator to prevent race condition during startup
const startWhenReady = () => { ... };

// ❌ MAL: Repite el código
// Start when ready
const startWhenReady = () => { ... };
```

### TODOs

```typescript
// ✅ BIEN: TODO con contexto y plan
// TODO: Re-configure capture pipeline to match chosen resolution
// This would require:
// 1. Stop current capture
// 2. Update config with chosen width/height
// 3. Restart capture with new resolution
// For now: log error and proceed (frames may be rejected)

// ❌ MAL: TODO vago
// TODO: Fix this
```

### Código Comentado

```typescript
// ❌ NUNCA: Dejar código comentado
// const oldLogic = () => {
//   // ...
// };

// ✅ MEJOR: Eliminar completamente (Git guarda el historial)
```

---

## 🎯 Patrones Comunes

### Event Handling

```typescript
// ✅ BIEN: Handler con logging y métricas
bus.subscribe("event.type", (event) => {
  logger.debug("Event received", { module: "my-module", event });
  
  try {
    processEvent(event);
    metrics.inc("events_processed_total");
  } catch (err) {
    logger.error("Event processing failed", {
      module: "my-module",
      error: err instanceof Error ? err.message : String(err),
    });
    metrics.inc("events_failed_total");
  }
});
```

### State Machines

```typescript
// ✅ BIEN: FSM pura con comandos externalizados
function reduce(ctx: FSMContext, event: Event): Result {
  switch (ctx.state) {
    case "IDLE":
      return handleIdleState(ctx, event);
    case "ACTIVE":
      return handleActiveState(ctx, event);
    default:
      return { ctx, commands: [] };
  }
}

// ❌ MAL: Side effects dentro de la FSM
function reduce(ctx: FSMContext, event: Event): Result {
  if (ctx.state === "IDLE" && event.type === "start") {
    await api.call(); // ❌ Side effect en FSM pura
  }
}
```

---

## 📦 Exports

### Default Export

```typescript
// ❌ Evitar default exports (dificulta refactoring)
export default class MyClass {}

// ✅ MEJOR: Named exports
export class MyClass {}
```

### Re-exports (Barrel Files)

```typescript
// src/modules/ai/index.ts
export { AIFeeder } from "./ai-feeder.js";
export { AIClientTcp } from "./client/ai-client-tcp.js";
export type { AIEngine } from "./ports/ai-engine.js";
```

---

## ✅ Checklist para Pull Requests

Antes de crear un PR, verificar:

- [ ] Imports organizados (Core, Modules, Shared)
- [ ] Secciones delimitadas con separadores
- [ ] JSDoc en métodos públicos
- [ ] Logging estructurado con módulo
- [ ] Sin código comentado
- [ ] TODOs con contexto (si aplican)
- [ ] Compilación exitosa (`npm run build`)
- [ ] Sin warnings de TypeScript
- [ ] Nombres descriptivos (no `temp`, `foo`, etc.)

---

## 📚 Referencias

- [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md) - Organización actual del código
- [ARCHITECTURE.md](ARCHITECTURE.md) - Arquitectura del sistema
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

---

**Última actualización:** 2025-10-10  
**Estado:** Activo
