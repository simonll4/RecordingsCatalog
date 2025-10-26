# 📑 Índice de Archivos - Vue UI

Índice completo de la estructura refactorizada para navegación rápida.

## 📖 Documentación

| Archivo | Descripción | Líneas |
|---------|-------------|---------|
| `README.md` | Información general, setup y ejemplos | ~188 |
| `ARCHITECTURE.md` | Arquitectura completa y guía de módulos | ~900 |
| `REFACTORING_GUIDE.md` | Guía práctica de uso y migración | ~500 |
| `REFACTORING_SUMMARY.md` | Resumen ejecutivo de la refactorización | ~380 |
| `QUICK_REFERENCE.md` | Referencia rápida para desarrollo | ~327 |
| `FILE_INDEX.md` | Este archivo - índice navegable | - |

## 🔧 API Module (`src/api/`)

### HTTP Client
| Archivo | Propósito | Exports |
|---------|-----------|---------|
| `http/client.ts` | Cliente HTTP base con manejo de errores | `HttpClient`, `HttpError` |
| `http/factory.ts` | Instancias de clientes configurados | `sessionStoreClient`, `mediamtxClient`, `BASE_URLS` |
| `http/index.ts` | Re-exports públicos del módulo HTTP | - |

### Schemas
| Archivo | Propósito | Schemas |
|---------|-----------|---------|
| `schemas/session.schemas.ts` | Validación Zod para API responses | `sessionSummarySchema`, `sessionMetaSchema`, `sessionIndexSchema`, `clipResponseSchema` |

### Services
| Archivo | Propósito | Clase/Función |
|---------|-----------|---------------|
| `services/session.service.ts` | Operaciones CRUD de sesiones | `SessionService` (singleton: `sessionService`) |
| `services/playback.service.ts` | Generación y validación de URLs de playback | `PlaybackService` (singleton: `playbackService`) |
| `services/index.ts` | Re-exports de servicios | - |

### Compatibility
| Archivo | Propósito | Nota |
|---------|-----------|------|
| `sessions-legacy.ts` | Capa de compatibilidad con API antigua | ⚠️ Deprecated - usar servicios directamente |
| `sessions.ts` | Re-export para backward compatibility | Importar desde `@/api` en su lugar |
| `index.ts` | API pública del módulo | Export principal |

### Backups
| Archivo | Descripción |
|---------|-------------|
| `sessions.ts.backup` | Original de sessions.ts (406 líneas) |

## 🎯 Constants (`src/constants/`)

| Archivo | Propósito | Exports Principales |
|---------|-----------|-------------------|
| `api-endpoints.ts` | URLs y paths de todas las APIs | `SESSION_ENDPOINTS`, `MEDIAMTX_ENDPOINTS`, `API_HEADERS`, `QUERY_PARAMS` |
| `config.ts` | Configuración de la aplicación | `PLAYER_CONFIG`, `SEGMENT_CONFIG`, `UI_CONFIG`, `ENV_CONFIG` |
| `index.ts` | Re-exports de constantes | - |

## 🛠️ Utils (`src/utils/`)

| Archivo | Propósito | Funciones Principales |
|---------|-----------|---------------------|
| `bbox.ts` | Utilidades para bounding boxes | `processBBox()`, `clamp()`, `normalizeBBox()`, `isValidBBox()` |
| `date.ts` | Utilidades de fecha y tiempo | `getDurationSeconds()`, `formatDuration()`, `addMilliseconds()`, `formatTimestamp()` |
| `error.ts` | Manejo de errores | `getErrorMessage()`, `isNotFoundError()`, `isNetworkError()`, `logError()` |
| `index.ts` | Re-exports de utils | - |

## 🎣 Composables (`src/composables/`)

| Archivo | Propósito | Composable |
|---------|-----------|------------|
| `useApi.ts` | Gestión de estado de API calls | `useApi<T>()` - data, loading, error, execute |
| `useDebounce.ts` | Debouncing de valores y funciones | `useDebouncedRef()`, `useDebouncedFn()` |
| `index.ts` | Re-exports de composables | - |

## 📦 Stores (`src/stores/`)

| Archivo | Propósito | Store | Estado Principal |
|---------|-----------|-------|-----------------|
| `useSessions.ts` | Lista y selección de sesiones | `useSessionsStore` | `sessions`, `selectedSession`, `isLoading` |
| `useTracks.ts` | Tracks, segmentos y overlays | `useTracksStore` | `meta`, `index`, `segmentEvents`, `confMin` |
| `usePlayer.ts` | Control del reproductor de video | `usePlayerStore` | `videoEl`, `currentTime`, `duration`, `isPlaying` |
| `segmentCache.ts` | Cache de segmentos (Dexie) | `segmentCache` | Base de datos IndexedDB |
| `index.ts` | Re-exports de stores | - |

### Backups
| Archivo | Descripción |
|---------|-------------|
| `useTracks.ts.backup` | Original de useTracks.ts (424 líneas) |

## 🎨 Components (`src/components/`)

| Archivo | Propósito | Props/Emits |
|---------|-----------|-------------|
| `Player.vue` | Reproductor de video con overlay | `sessionId` |
| `SessionList.vue` | Lista de sesiones disponibles | - |
| `SessionSearch.vue` | Búsqueda y filtrado de sesiones | - |
| `TrackLegend.vue` | Leyenda y filtros de detecciones | - |
| `CanvasOverlay.vue` | Canvas para dibujar bounding boxes | `videoEl`, `tracks` |

## 📄 Views (`src/views/`)

| Archivo | Propósito | Ruta |
|---------|-----------|------|
| `Home.vue` | Página principal con lista de sesiones | `/` |
| `Session.vue` | Vista de sesión individual con player | `/session/:sessionId` |

## 🔤 Types (`src/types/`)

| Archivo | Propósito | Types/Interfaces |
|---------|-----------|------------------|
| `tracks.ts` | Definiciones de tipos para tracks | `TrackObject`, `TrackEvent`, `TrackMeta`, `TrackIndex`, `RenderObject`, `PlaybackInfo` |

## ⚙️ Workers (`src/workers/`)

| Archivo | Propósito | Exports |
|---------|-----------|---------|
| `ndjsonParser.worker.ts` | Parser de NDJSON en background | `parseSegment()` via Comlink |

## 🎯 Router (`src/router/`)

| Archivo | Propósito |
|---------|-----------|
| `index.ts` | Configuración de Vue Router |

## 🌐 Root Files

| Archivo | Propósito |
|---------|-----------|
| `main.ts` | Entry point de la aplicación |
| `App.vue` | Componente raíz |
| `config.ts` | Config legacy (backward compatibility) |

### Backups
| Archivo | Descripción |
|---------|-------------|
| `config.ts.backup` | Original de config.ts (31 líneas) |

## 📊 Estadísticas

### Módulos Nuevos
- **API Services**: 10 archivos nuevos
- **Constants**: 3 archivos nuevos
- **Utils**: 4 archivos nuevos
- **Composables**: 3 archivos nuevos

### Archivos Refactorizados
- `useSessions.ts` - Mejorado con nuevos servicios
- `useTracks.ts` - Reescrito con mejor organización
- `Session.vue` - Tipos corregidos
- `config.ts` - Ahora es capa de compatibilidad

### Total
- **38 archivos** TypeScript/Vue en `src/`
- **6 archivos** de documentación en root
- **3 archivos** de backup preservados
- **0 errores** de TypeScript

## 🗺️ Mapa de Navegación Rápida

### Para Cambiar URLs/Endpoints
```
src/constants/api-endpoints.ts
```

### Para Modificar Configuración
```
src/constants/config.ts
```

### Para Agregar Nueva Funcionalidad de API
```
src/api/services/[nombre].service.ts
```

### Para Agregar Validación
```
src/api/schemas/[nombre].schemas.ts
```

### Para Agregar Utilidad
```
src/utils/[categoria].ts
```

### Para Agregar Composable
```
src/composables/use[Nombre].ts
```

### Para Modificar Estado Global
```
src/stores/use[Nombre].ts
```

## 🔍 Búsqueda por Funcionalidad

### Sessions
- **API**: `src/api/services/session.service.ts`
- **Store**: `src/stores/useSessions.ts`
- **View**: `src/views/Home.vue`, `src/views/Session.vue`
- **Component**: `src/components/SessionList.vue`, `src/components/SessionSearch.vue`

### Playback
- **API**: `src/api/services/playback.service.ts`
- **Store**: `src/stores/usePlayer.ts`
- **Component**: `src/components/Player.vue`

### Tracks & Overlays
- **API**: `src/api/services/session.service.ts` (meta, index, segments)
- **Store**: `src/stores/useTracks.ts`
- **Component**: `src/components/CanvasOverlay.vue`, `src/components/TrackLegend.vue`
- **Utils**: `src/utils/bbox.ts`

### Error Handling
- **HTTP**: `src/api/http/client.ts` (`HttpError`)
- **Utils**: `src/utils/error.ts` (helpers)

### Date/Time
- **Utils**: `src/utils/date.ts`

## 📚 Guías de Referencia

1. **Comenzar**: `README.md`
2. **Entender la arquitectura**: `ARCHITECTURE.md`
3. **Usar los nuevos servicios**: `REFACTORING_GUIDE.md`
4. **Referencia rápida**: `QUICK_REFERENCE.md`
5. **Resumen de cambios**: `REFACTORING_SUMMARY.md`
6. **Este índice**: `FILE_INDEX.md`

---

**Tip**: Usa Ctrl+P (VS Code) o Cmd+P (Mac) y empieza a escribir el nombre del archivo para navegación rápida.
