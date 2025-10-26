# Vue UI - Arquitectura y Organización

## 📋 Índice

1. [Visión General](#visión-general)
2. [Estructura de Carpetas](#estructura-de-carpetas)
3. [Módulos Principales](#módulos-principales)
4. [Patrones y Convenciones](#patrones-y-convenciones)
5. [Guía de Migración](#guía-de-migración)

## 🎯 Visión General

La aplicación Vue UI ha sido completamente refactorizada siguiendo las mejores prácticas de Vue 3 + TypeScript, con una arquitectura modular que facilita:

- **Mantenimiento**: Código organizado en módulos con responsabilidades claras
- **Escalabilidad**: Fácil agregar nuevas funcionalidades sin afectar código existente
- **Testabilidad**: Servicios y utilidades aisladas que pueden testearse independientemente
- **Developer Experience**: Imports claros, autocompletado mejorado, y documentación inline

## 📁 Estructura de Carpetas

```
src/
├── api/                    # Capa de API y servicios HTTP
│   ├── http/              # Cliente HTTP base y configuración
│   │   ├── client.ts      # HttpClient con manejo de errores
│   │   ├── factory.ts     # Instancias de clientes (sessionStore, mediamtx)
│   │   └── index.ts       # Exports públicos
│   ├── schemas/           # Esquemas Zod para validación
│   │   └── session.schemas.ts
│   ├── services/          # Servicios de negocio
│   │   ├── session.service.ts    # Operaciones de sesiones
│   │   ├── playback.service.ts   # Generación de URLs de playback
│   │   └── index.ts
│   ├── sessions-legacy.ts # Capa de compatibilidad (deprecated)
│   ├── sessions.ts        # Export principal para backward compatibility
│   └── index.ts           # API pública del módulo
│
├── constants/             # Constantes y configuración
│   ├── api-endpoints.ts   # URLs y paths de API
│   ├── config.ts          # Configuración de la aplicación
│   └── index.ts
│
├── utils/                 # Utilidades y helpers
│   ├── bbox.ts           # Manipulación de bounding boxes
│   ├── date.ts           # Utilidades de fecha/hora
│   ├── error.ts          # Manejo de errores
│   └── index.ts
│
├── composables/           # Vue Composables (hooks)
│   ├── useApi.ts         # Gestión de estado API
│   ├── useDebounce.ts    # Debouncing de valores/funciones
│   └── index.ts
│
├── stores/               # Pinia Stores
│   ├── useSessions.ts    # Estado de sesiones
│   ├── useTracks.ts      # Estado de tracks y segmentos
│   ├── usePlayer.ts      # Estado del reproductor
│   ├── segmentCache.ts   # Cache de segmentos (Dexie)
│   └── index.ts
│
├── components/           # Componentes Vue
│   ├── Player.vue
│   ├── SessionList.vue
│   ├── CanvasOverlay.vue
│   └── ...
│
├── views/               # Páginas/Vistas
│   ├── Home.vue
│   └── Session.vue
│
├── types/               # TypeScript types globales
│   └── tracks.ts
│
├── workers/             # Web Workers
│   └── ndjsonParser.worker.ts
│
├── assets/              # Assets estáticos
├── router/              # Vue Router
├── App.vue              # Componente raíz
└── main.ts              # Entry point

```

## 🔧 Módulos Principales

### API Module (`src/api/`)

Maneja todas las comunicaciones HTTP con los servicios backend.

#### HTTP Client (`api/http/`)

Cliente HTTP configurable con:
- Manejo automático de errores
- Validación de respuestas con Zod
- Support para JSON y binary data
- Configuración de headers y parámetros

**Ejemplo de uso:**

```typescript
import { sessionStoreClient } from '@/api/http'
import { sessionSummarySchema } from '@/api/schemas/session.schemas'

// GET request con validación
const session = await sessionStoreClient.getJson(
  '/sessions/abc123',
  sessionSummarySchema
)

// GET request sin validación (datos binarios)
const response = await sessionStoreClient.getRaw('/sessions/abc123/segment/0')
const buffer = await response.arrayBuffer()

// HEAD request para check de existencia
const exists = await sessionStoreClient.head('/sessions/abc123')
```

#### Services (`api/services/`)

Encapsulan la lógica de negocio para interactuar con APIs:

**SessionService** (`session.service.ts`):
- `listSessions(params)` - Lista sesiones con filtros
- `getSession(id)` - Obtiene detalles de una sesión
- `getSessionMeta(id)` - Obtiene metadata
- `getSessionIndex(id)` - Obtiene índice de segmentos
- `getSessionClip(id)` - Obtiene info de clip
- `getSessionSegment(id, index)` - Descarga un segmento

**PlaybackService** (`playback.service.ts`):
- `buildSessionPlaybackUrl(session)` - Genera URL de reproducción
- `rewriteClipUrl(clipData)` - Reescribe URLs de MediaMTX
- `probePlaybackUrl(...)` - Valida URLs con retry logic

**Ejemplo de uso:**

```typescript
import { sessionService, playbackService } from '@/api'

// Listar sesiones
const { sessions } = await sessionService.listSessions({
  mode: 'range',
  limit: 50,
  from: '2024-01-01T00:00:00Z',
  to: '2024-01-31T23:59:59Z'
})

// Generar URL de playback
const session = await sessionService.getSession('abc123')
const playbackInfo = playbackService.buildSessionPlaybackUrl(session)
console.log(playbackInfo?.playbackUrl)
```

### Constants Module (`src/constants/`)

Centraliza todas las constantes de configuración.

**API Endpoints** (`api-endpoints.ts`):
```typescript
import { SESSION_ENDPOINTS, MEDIAMTX_ENDPOINTS } from '@/constants'

const metaUrl = SESSION_ENDPOINTS.META('session-id')
// '/session-id/meta'

const getUrl = MEDIAMTX_ENDPOINTS.GET
// '/get'
```

**Configuration** (`config.ts`):
```typescript
import { PLAYER_CONFIG, SEGMENT_CONFIG, UI_CONFIG } from '@/constants'

const maxRetries = PLAYER_CONFIG.RETRY.MAX_ATTEMPTS // 5
const maxSegments = SEGMENT_CONFIG.MAX_SEGMENTS_IN_MEMORY // 12
const defaultConfidence = UI_CONFIG.FILTERS.DEFAULT_CONFIDENCE_MIN // 0.4
```

### Utils Module (`src/utils/`)

Funciones de utilidad reutilizables.

**Bounding Box Utils** (`bbox.ts`):
```typescript
import { processBBox, isValidBBox, clampBBox } from '@/utils'

// Procesar bbox: normalizar si es necesario, clamp y validar
const bbox = processBBox([10, 20, 100, 200], 1920, 1080)
// [0.005, 0.018, 0.052, 0.185]
```

**Date Utils** (`date.ts`):
```typescript
import { getDurationSeconds, formatDuration, addMilliseconds } from '@/utils'

const duration = getDurationSeconds('2024-01-01T00:00:00Z', '2024-01-01T00:05:30Z')
// 330

const formatted = formatDuration(330)
// '5m 30s'
```

**Error Utils** (`error.ts`):
```typescript
import { getErrorMessage, isNotFoundError, createErrorNotification } from '@/utils'

try {
  await someApiCall()
} catch (error) {
  const message = getErrorMessage(error)
  console.error(message)
  
  if (isNotFoundError(error)) {
    // Handle 404 specifically
  }
}
```

### Composables Module (`src/composables/`)

Vue 3 composables para lógica reutilizable.

**useApi** - Gestión de estado API:
```typescript
import { useApi } from '@/composables'
import { sessionService } from '@/api'

const { data, loading, error, execute } = useApi(
  () => sessionService.listSessions({ mode: 'all' }),
  { immediate: true }
)

// data.value contiene el resultado
// loading.value indica si está cargando
// error.value contiene el error si ocurrió
// execute() para re-ejecutar manualmente
```

**useDebounce** - Debouncing de valores:
```typescript
import { useDebouncedRef } from '@/composables'

const { value, debouncedValue, pending } = useDebouncedRef('', 300)

// value.value se actualiza inmediatamente
// debouncedValue.value se actualiza después de 300ms
// pending.value indica si hay un debounce pendiente
```

### Stores Module (`src/stores/`)

Pinia stores para gestión de estado global.

**useSessionsStore**:
```typescript
import { useSessionsStore } from '@/stores'

const sessionsStore = useSessionsStore()

// Cargar sesiones
await sessionsStore.loadSessions({ mode: 'all', limit: 100 })

// Acceder a datos
const sessions = sessionsStore.sessions
const selected = sessionsStore.selectedSession
const isLoading = sessionsStore.isLoading

// Acciones
sessionsStore.selectSession('session-id')
sessionsStore.refreshSessions()
sessionsStore.clearSessions()
```

**useTracksStore**:
```typescript
import { useTracksStore } from '@/stores'

const tracksStore = useTracksStore()

// Resetear para nueva sesión
await tracksStore.resetForSession('session-id')

// Cargar metadata e índice
await tracksStore.loadMeta('session-id')
await tracksStore.loadIndex('session-id')

// Asegurar segmento cargado
await tracksStore.ensureSegment('session-id', 0)

// Obtener eventos en tiempo dado
const { current, trails } = tracksStore.eventsAtTime(10.5)

// UI state
tracksStore.confMin = 0.5
tracksStore.showBoxes = true
tracksStore.toggleClass(1)
```

**usePlayerStore**:
```typescript
import { usePlayerStore } from '@/stores'

const playerStore = usePlayerStore()

// Attach video element
const videoRef = ref<HTMLVideoElement>()
playerStore.attachVideo(videoRef.value)

// Control playback
playerStore.setPlaybackSource('https://example.com/video.mp4')
await playerStore.play()
playerStore.pause()
playerStore.seek(10.5)

// Estado
const currentTime = playerStore.currentTime
const duration = playerStore.duration
const isPlaying = playerStore.isPlaying
```

## 🎨 Patrones y Convenciones

### Imports

Utilizar path aliases para imports limpios:

```typescript
// ✅ Correcto
import { sessionService } from '@/api'
import { getErrorMessage } from '@/utils'
import { PLAYER_CONFIG } from '@/constants'

// ❌ Evitar
import { sessionService } from '../../../api/services'
```

### Manejo de Errores

Siempre tipar errores como `unknown` y validar:

```typescript
try {
  await someOperation()
} catch (err: unknown) {
  if (err instanceof HttpError && err.status === 404) {
    // Handle not found
  }
  console.error('Operation failed', err)
  throw err
}
```

### Exports

Centralizar exports en `index.ts`:

```typescript
// src/api/services/index.ts
export { sessionService } from './session.service'
export { playbackService } from './playback.service'
export type { ListSessionsParams } from './session.service'
```

### Documentación

Documentar funciones públicas con JSDoc:

```typescript
/**
 * Load sessions from the session store
 * @param params - Query parameters for filtering
 * @returns Promise with sessions and metadata
 */
async listSessions(params: ListSessionsParams): Promise<ListSessionsResponse> {
  // ...
}
```

## 🔄 Guía de Migración

### De código antiguo a código nuevo

#### 1. Imports de API

**Antes:**
```typescript
import { listSessions, fetchSessionMeta } from '../api/sessions'
```

**Ahora:**
```typescript
import { sessionService } from '@/api'

// Usar los métodos del servicio
sessionService.listSessions(params)
sessionService.getSessionMeta(id)
```

#### 2. Configuración

**Antes:**
```typescript
import { SESSION_STORE_BASE_URL, MEDIAMTX_BASE_URL } from '../config'
```

**Ahora:**
```typescript
import { BASE_URLS } from '@/api/http'

// O mejor aún, usar los servicios directamente
// que ya tienen las URLs configuradas
```

#### 3. Utilidades

**Antes:**
```typescript
// Código duplicado en múltiples lugares
const clamp = (val, min, max) => Math.min(Math.max(val, min), max)
```

**Ahora:**
```typescript
import { clamp } from '@/utils'
```

#### 4. Constantes

**Antes:**
```typescript
const MAX_SEGMENTS = 12
const DEFAULT_OFFSET = 200
```

**Ahora:**
```typescript
import { SEGMENT_CONFIG, ENV_CONFIG } from '@/constants'

const maxSegments = SEGMENT_CONFIG.MAX_SEGMENTS_IN_MEMORY
const defaultOffset = ENV_CONFIG.START_OFFSET_MS
```

## ✅ Beneficios de la Nueva Arquitectura

1. **URLs Centralizadas**: Cambiar un endpoint es cuestión de modificar una constante
2. **Type Safety**: TypeScript y Zod garantizan tipos correctos en toda la app
3. **Código Reutilizable**: Utilidades y composables evitan duplicación
4. **Fácil Testing**: Servicios aislados pueden mockearse fácilmente
5. **Mejor DX**: Autocompletado mejorado y documentación inline
6. **Escalabilidad**: Agregar nuevas features no afecta código existente
7. **Mantenibilidad**: Estructura clara facilita encontrar y modificar código

## 📚 Próximos Pasos

1. Migrar componentes para usar los nuevos servicios directamente
2. Agregar tests unitarios para servicios y utilidades
3. Crear más composables para lógica común en componentes
4. Documentar componentes con Storybook
5. Agregar más validaciones con Zod para responses de API
