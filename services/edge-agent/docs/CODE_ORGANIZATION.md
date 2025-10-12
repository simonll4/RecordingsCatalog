# Organización del Código - Edge Agent

## 📋 Resumen

Este documento describe la organización y estructura del código del Edge Agent después de la refactorización de legibilidad aplicada el 2025-10-10.

## 🎯 Objetivos de la Refactorización

1. **Mejorar legibilidad** - Código más fácil de leer y entender
2. **Organizar imports** - Agrupados por categoría (core, modules, shared)
3. **Documentar secciones** - Separadores visuales claros entre responsabilidades
4. **Limpiar TODOs obsoletos** - Eliminar comentarios obsoletos
5. **Estandarizar comentarios** - Consistencia en documentación

## 📂 Estructura de Archivos Principales

### `src/app/main.ts`

**Responsabilidad:** Composition root y bootstrap de la aplicación

**Secciones organizadas:**

```typescript
// === Core ===
// Imports de infraestructura (Config, Bus, Orchestrator)

// === Modules ===
// Imports de módulos funcionales (Camera, AI, Publisher, Store)

// === Shared ===
// Imports de utilidades compartidas (logger, metrics)

// ============================================================
// INITIALIZATION
// ============================================================
// Instanciación de módulos

// ============================================================
// CONFIGURATION
// ============================================================
// Configuración de módulos

// ============================================================
// SESSION TRACKING & EVENT HANDLING
// ============================================================
// Estado de sesiones y suscripciones a eventos

// --- Session Lifecycle Events ---
// Handlers de session.open/close

// --- AI Callbacks ---
// onReady, onResult, onError

// ============================================================
// ORCHESTRATOR (FSM)
// ============================================================
// Adapter y configuración del orquestador

// ============================================================
// STARTUP SEQUENCE
// ============================================================
// Secuencia crítica de inicialización

// ============================================================
// SHUTDOWN HANDLER
// ============================================================
// Apagado ordenado
```

**Mejoras aplicadas:**

- ✅ Imports agrupados por categoría
- ✅ Separadores visuales claros (=== y ---)
- ✅ Comentarios mejorados en callbacks
- ✅ Secciones lógicas bien delimitadas

### `src/core/orchestrator/orchestrator.ts`

**Responsabilidad:** Coordinador central del sistema (FSM)

**Secciones organizadas:**

```typescript
// ============================================================
// LIFECYCLE
// ============================================================
// init(), shutdown()

// ============================================================
// EVENT HANDLING & FSM
// ============================================================
// handleEvent(), executeCommands()

// ============================================================
// TIMER MANAGEMENT
// ============================================================
// manageTimers(), manageDwellTimer(), manageActiveTimer(), manageClosingTimer()

// --- Timer Cleanup ---
// clearDwellTimer(), clearSilenceTimer(), clearPostRollTimer(), clearAllTimers()
```

**Mejoras aplicadas:**

- ✅ Métodos agrupados por responsabilidad
- ✅ Separadores de secciones claros
- ✅ JSDoc mejorado en métodos privados
- ✅ Header con documentación completa de FSM

### `src/core/orchestrator/fsm.ts`

**Responsabilidad:** FSM pura (Finite State Machine)

**Documentación existente:**

```typescript
/**
 * Diagrama de Estados:
 *
 *                     ai.detection (relevant=true)
 *           IDLE ────────────────────────────────────> DWELL
 *            ↑                                           │
 *            │                                           │ fsm.t.dwell.ok
 *            │                                           ↓
 *            │                                        ACTIVE ←──────┐
 *            │                                           │          │
 *            │                                           │          │ ai.detection
 *            │                  fsm.t.silence.ok         │          │ (relevant=true)
 *            │                 (sin detecciones)         │          │
 *            │                                           ↓          │
 *            │                                        CLOSING ──────┘
 *            │                                           │
 *            │                          fsm.t.postroll.ok
 *            │                      (completó post-roll)
 *            └───────────────────────────────────────────┘
 */
```

**Mejoras aplicadas:**

- ✅ Diagrama ASCII de estados
- ✅ Documentación completa de eventos
- ✅ Documentación completa de comandos
- ✅ JSDoc detallado en cada handler (IDLE, DWELL, ACTIVE, CLOSING)

### `src/modules/ai/feeder/ai-feeder.ts`

**Responsabilidad:** Coordinación de frames y backpressure Protocol v1

**Mejoras aplicadas:**

- ✅ TODO obsoleto eliminado (degradation ya implementada)
- ✅ TODO válido mantenido (re-configuración de resolución)
- ✅ Comentarios de degradation strategy actualizados

## 📝 Convenciones de Documentación

### Separadores de Sección

```typescript
// ============================================================
// SECCIÓN PRINCIPAL
// ============================================================

// --- Subsección ---
```

### Imports

```typescript
// === Core ===
import { CONFIG } from "../config/index.js";
import { Bus } from "../core/bus/bus.js";

// === Modules ===
import { CameraHub } from "../modules/video/ports/camera-hub.js";

// === Shared ===
import { logger } from "../shared/logging.js";
```

### Comentarios de Código

```typescript
// Comentario breve en línea

/**
 * JSDoc para métodos públicos/privados
 * 
 * @param event - Descripción del parámetro
 * @returns Descripción del retorno
 */
```

### Estados de FSM

Cada handler de estado tiene documentación estructurada:

```typescript
/**
 * ESTADO: Descripción breve
 *
 * Comportamiento:
 * - Punto 1
 * - Punto 2
 *
 * IMPORTANTE: Nota crítica si aplica
 *
 * Transiciones:
 * - evento → NUEVO_ESTADO (condición)
 */
function handleEstado(ctx, event) {
  // ...
}
```

## 🧹 Limpieza Realizada

### Archivos Legacy Eliminados

- ❌ Ya no existen archivos en `/legacy/`
- ❌ No existen archivos `*.legacy.*`

### TODOs Revisados

- ✅ TODO obsoleto eliminado de `feeder/ai-feeder.ts` (degradation ya implementada)
- ✅ TODO válido mantenido (re-configuración de resolución - mejora futura)

### Código Comentado

- ✅ No hay código comentado en archivos principales
- ✅ Todos los comentarios son documentación activa

## 🎨 Estilo de Código

### Consistencia

- ✅ Todos los imports organizados igual
- ✅ Todos los separadores de sección iguales
- ✅ Todos los JSDoc con mismo formato

### Legibilidad

- ✅ Secciones claramente delimitadas
- ✅ Responsabilidades agrupadas
- ✅ Flujo lógico evidente

### Documentación

- ✅ Header completo en archivos críticos
- ✅ JSDoc en métodos públicos/privados
- ✅ Comentarios inline solo cuando agregan valor

## 📊 Métricas de Calidad

### Compilación

```bash
npm run build
# ✅ 0 errores
# ✅ 0 warnings
```

### Archivos Principales

| Archivo | Líneas | Secciones | Estado |
|---------|--------|-----------|--------|
| `main.ts` | 371 | 6 | ✅ Organizado |
| `orchestrator.ts` | 449 | 3 | ✅ Organizado |
| `fsm.ts` | 283 | 1 | ✅ Documentado |
| `feeder/ai-feeder.ts` | 565 | - | ✅ Limpio |

## 🔍 Próximos Pasos (Opcionales)

1. **Extracción de tipos** - Mover tipos compartidos a `/types`
2. **Tests unitarios** - Agregar tests para FSM pura
3. **Linting** - Configurar ESLint con reglas personalizadas
4. **Documentación API** - Generar docs con TypeDoc

## ✅ Verificación

Para verificar que todo está en orden:

```bash
# Compilar TypeScript
npm run build

# Verificar estructura
tree src/ -L 3

# Buscar TODOs pendientes
grep -r "TODO" src/ --exclude-dir=node_modules
```

## 📚 Referencias

- **Arquitectura:** `docs/ARCHITECTURE.md`
- **FSM Flow:** Diagrama en `fsm.ts` líneas 20-40
- **Eventos:** `src/core/bus/events.ts`
- **Configuración:** `src/config/index.ts`

---

**Fecha:** 2025-10-10  
**Autor:** Refactorización de legibilidad  
**Estado:** ✅ Completado
