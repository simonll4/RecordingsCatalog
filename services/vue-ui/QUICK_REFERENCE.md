# 🚀 Quick Reference - Vue UI

Guía rápida de la nueva estructura para desarrolladores.

## 📦 Imports Principales

### Servicios de API

```typescript
// Session operations
import { sessionService } from '@/api'

sessionService.listSessions({ mode: 'all', limit: 50 })
sessionService.getSession('session-id')
sessionService.getSessionMeta('session-id')
sessionService.getSessionIndex('session-id')
sessionService.getSessionClip('session-id')
sessionService.getSessionSegment('session-id', 0)

// Playback operations
import { playbackService } from '@/api'

playbackService.buildSessionPlaybackUrl(session)
playbackService.rewriteClipUrl(clipData)
playbackService.probePlaybackUrl(path, startDate, duration)
```

### Constantes

```typescript
// API Endpoints
import { SESSION_ENDPOINTS, MEDIAMTX_ENDPOINTS } from '@/constants'

SESSION_ENDPOINTS.META('id')           // '/{id}/meta'
SESSION_ENDPOINTS.SEGMENT('id', 5)     // '/{id}/segment/5'
MEDIAMTX_ENDPOINTS.GET                 // '/get'

// Configuration
import { PLAYER_CONFIG, SEGMENT_CONFIG, UI_CONFIG } from '@/constants'

PLAYER_CONFIG.RETRY.MAX_ATTEMPTS       // 5
SEGMENT_CONFIG.MAX_SEGMENTS_IN_MEMORY  // 12
UI_CONFIG.FILTERS.DEFAULT_CONFIDENCE_MIN // 0.4
```

### Utilidades

```typescript
// Bounding boxes
import { processBBox, clamp, isValidBBox } from '@/utils'

const bbox = processBBox([10, 20, 100, 200], 1920, 1080)
const clamped = clamp(value, 0, 1)
const valid = isValidBBox([0.1, 0.2, 0.5, 0.6])

// Dates
import { getDurationSeconds, formatDuration, addMilliseconds } from '@/utils'

const duration = getDurationSeconds(start, end)
const formatted = formatDuration(330)  // '5m 30s'
const newDate = addMilliseconds(date, 200)

// Errors
import { getErrorMessage, isNotFoundError, createErrorNotification } from '@/utils'

const message = getErrorMessage(error)
if (isNotFoundError(error)) { /* handle 404 */ }
const notification = createErrorNotification(error)
```

### Composables

```typescript
// API state management
import { useApi } from '@/composables'

const { data, loading, error, execute } = useApi(
  () => sessionService.listSessions(),
  { immediate: true }
)

// Debouncing
import { useDebouncedRef, useDebouncedFn } from '@/composables'

const { value, debouncedValue, pending } = useDebouncedRef('', 300)
const { debouncedFn, cancel } = useDebouncedFn(myFunction, 500)
```

### Stores

```typescript
// Sessions
import { useSessionsStore } from '@/stores'

const store = useSessionsStore()
await store.loadSessions({ mode: 'all' })
store.selectSession('session-id')
store.refreshSessions()

// Tracks
import { useTracksStore } from '@/stores'

const tracks = useTracksStore()
await tracks.resetForSession('id')
await tracks.loadMeta('id')
await tracks.loadIndex('id')
await tracks.ensureSegment('id', 0)
const { current, trails } = tracks.eventsAtTime(10.5)

// Player
import { usePlayerStore } from '@/stores'

const player = usePlayerStore()
player.attachVideo(videoElement)
player.setPlaybackSource(url)
await player.play()
player.pause()
player.seek(10.5)
```

## 🔄 Tabla de Migración

| Antiguo | Nuevo | Notas |
|---------|-------|-------|
| `import { listSessions } from '../api/sessions'` | `import { sessionService } from '@/api'`<br>`sessionService.listSessions()` | Método del servicio |
| `import { fetchSessionMeta } from '../api/sessions'` | `sessionService.getSessionMeta()` | Mismo comportamiento |
| `import { SESSION_STORE_BASE_URL } from '../config'` | `import { BASE_URLS } from '@/api/http'`<br>`BASE_URLS.SESSION_STORE` | O usar servicios directamente |
| `const url = new URL('/sessions', baseUrl)` | `import { SESSION_ENDPOINTS } from '@/constants'`<br>`SESSION_ENDPOINTS.LIST` | Centralizado |
| `const clamp = (v, min, max) => ...` | `import { clamp } from '@/utils'` | Función reutilizable |
| Código inline de validación bbox | `import { processBBox } from '@/utils'` | Función completa |
| `err instanceof Error ? err.message : 'Error'` | `import { getErrorMessage } from '@/utils'`<br>`getErrorMessage(err)` | Manejo consistente |

## 🎯 Patrones Comunes

### Cargar y Mostrar Sesiones

```typescript
<script setup lang="ts">
import { useApi } from '@/composables'
import { sessionService } from '@/api'

const { data, loading, error, execute } = useApi(
  () => sessionService.listSessions({ mode: 'all' }),
  { immediate: true }
)

const sessions = computed(() => data.value?.sessions ?? [])
</script>

<template>
  <div v-if="loading">Cargando...</div>
  <div v-else-if="error">Error: {{ error.message }}</div>
  <div v-else>
    <div v-for="s in sessions" :key="s.session_id">
      {{ s.session_id }}
    </div>
  </div>
</template>
```

### Manejo de Errores Consistente

```typescript
import { sessionService } from '@/api'
import { getErrorMessage, isNotFoundError, logError } from '@/utils'

try {
  const session = await sessionService.getSession(id)
  // ...
} catch (err: unknown) {
  // Log con contexto
  logError('loadSession', err)
  
  // Mensaje para el usuario
  errorMessage.value = getErrorMessage(err)
  
  // Manejo específico
  if (isNotFoundError(err)) {
    // Redirigir o mostrar 404
  }
}
```

### Procesar Bounding Boxes

```typescript
import { processBBox } from '@/utils'

for (const obj of event.objs) {
  const bbox = processBBox(
    obj.bbox_xyxy,
    videoWidth,
    videoHeight
  )
  
  if (bbox) {
    // bbox está normalizado y validado
    renderBox(bbox, obj.cls_name, obj.conf)
  }
}
```

### Generar URL de Playback

```typescript
import { sessionService, playbackService } from '@/api'

// Obtener sesión
const session = await sessionService.getSession(sessionId)

// Generar URL
const playbackInfo = playbackService.buildSessionPlaybackUrl(session)

if (playbackInfo) {
  videoElement.src = playbackInfo.playbackUrl
  console.log('Duration:', playbackInfo.duration)
  console.log('Anchor:', playbackInfo.anchorSource)
}
```

## 📂 Estructura de Archivos

```
src/
├── api/                    Servicios HTTP y API
│   ├── http/              Cliente HTTP
│   ├── schemas/           Validación Zod
│   ├── services/          Lógica de negocio
│   └── index.ts           Exports públicos
├── constants/             Configuración
│   ├── api-endpoints.ts   URLs y paths
│   ├── config.ts          Config de la app
│   └── index.ts
├── utils/                 Utilidades
│   ├── bbox.ts           Bounding boxes
│   ├── date.ts           Fechas y tiempo
│   ├── error.ts          Manejo de errores
│   └── index.ts
├── composables/          Vue composables
│   ├── useApi.ts         Estado API
│   ├── useDebounce.ts    Debouncing
│   └── index.ts
├── stores/               Pinia stores
│   ├── useSessions.ts    Sesiones
│   ├── useTracks.ts      Tracks y segmentos
│   ├── usePlayer.ts      Reproductor
│   └── index.ts
├── components/           Componentes Vue
├── views/               Páginas
├── types/               TypeScript types
└── workers/             Web Workers
```

## 💡 Tips

### 1. Usar Path Aliases

```typescript
// ✅ Hacer esto
import { sessionService } from '@/api'
import { clamp } from '@/utils'

// ❌ Evitar esto
import { sessionService } from '../../../api/services'
```

### 2. Aprovechar TypeScript

```typescript
// Los servicios tienen tipos completos
const response = await sessionService.listSessions({ mode: 'all' })
// response.sessions es SessionSummary[]

// Autocompletado en IDE
SESSION_ENDPOINTS. // Ctrl+Space muestra todos los endpoints
```

### 3. Reutilizar Utilidades

```typescript
// En lugar de escribir lógica inline
if (err instanceof HttpError && err.status === 404) { ... }

// Usar la utilidad
if (isNotFoundError(err)) { ... }
```

### 4. Documentación Inline

```typescript
// Hover sobre cualquier función para ver JSDoc
sessionService.listSessions() // Muestra params, return type, descripción
```

### 5. Constants para Todo

```typescript
// No hardcodear valores
const maxSegments = 12  // ❌

// Usar constantes
import { SEGMENT_CONFIG } from '@/constants'
const maxSegments = SEGMENT_CONFIG.MAX_SEGMENTS_IN_MEMORY  // ✅
```

## 🔍 Encontrar Código

| Necesito... | Buscar en... |
|-------------|--------------|
| Cambiar endpoint de API | `src/constants/api-endpoints.ts` |
| Modificar request HTTP | `src/api/services/*.service.ts` |
| Agregar validación | `src/api/schemas/*.schemas.ts` |
| Nueva utilidad | `src/utils/*.ts` |
| Configuración | `src/constants/config.ts` |
| Nuevo composable | `src/composables/*.ts` |
| Lógica de store | `src/stores/*.ts` |

## 📚 Más Información

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Arquitectura completa
- **[REFACTORING_GUIDE.md](./REFACTORING_GUIDE.md)** - Guía detallada
- **[REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)** - Resumen de cambios

---

**La nueva estructura hace el código más mantenible sin cambiar su funcionamiento.**
