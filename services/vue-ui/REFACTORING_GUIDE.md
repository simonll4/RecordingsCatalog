# 🔄 Guía de Refactorización - Vue UI

## Resumen de Cambios

La aplicación Vue UI ha sido completamente refactorizada manteniendo **100% de compatibilidad con el código existente**. Todos los componentes y vistas funcionan exactamente igual que antes.

## 🎯 Qué se logró

### ✅ Modularización Completa

- **API Services**: Separados en módulos independientes con responsabilidades claras
- **Constants**: Todas las URLs y configuraciones centralizadas
- **Utils**: Funciones reutilizables para operaciones comunes
- **Composables**: Hooks de Vue 3 para lógica reutilizable
- **Type Safety**: Validación con Zod y TypeScript estricto

### ✅ Sin Breaking Changes

- Los componentes existentes siguen funcionando
- Capa de compatibilidad (`sessions-legacy.ts`) mantiene la API antigua
- Migración gradual: puedes adoptar los nuevos servicios poco a poco

## 📋 Estructura Nueva

```
src/
├── api/                  # 🆕 Servicios de API modulares
│   ├── http/            # Cliente HTTP con manejo de errores
│   ├── schemas/         # Validación con Zod
│   └── services/        # Servicios de negocio
├── constants/           # 🆕 Configuración centralizada
├── utils/               # 🆕 Utilidades reutilizables
├── composables/         # 🆕 Vue composables
├── stores/              # ♻️ Refactorizados con nuevos servicios
├── components/          # (Sin cambios)
└── views/               # (Sin cambios)
```

## 🔑 Conceptos Clave

### 1. API Services

En lugar de funciones sueltas, ahora tenemos servicios singleton:

```typescript
// ANTES
import { listSessions, fetchSessionMeta } from '../api/sessions'

// AHORA (recomendado)
import { sessionService } from '@/api'

// Todas las operaciones en un lugar
sessionService.listSessions(params)
sessionService.getSession(id)
sessionService.getSessionMeta(id)
sessionService.getSessionIndex(id)
```

### 2. Constants Centralizadas

Ya no hay que buscar URLs en el código:

```typescript
// Todos los endpoints en un lugar
import { SESSION_ENDPOINTS } from '@/constants'

SESSION_ENDPOINTS.LIST           // ''
SESSION_ENDPOINTS.DETAILS(id)    // '/{id}'
SESSION_ENDPOINTS.META(id)       // '/{id}/meta'
SESSION_ENDPOINTS.INDEX(id)      // '/{id}/index'
SESSION_ENDPOINTS.SEGMENT(id, i) // '/{id}/segment/{i}'
```

### 3. Utilities

Funciones comunes ahora están centralizadas:

```typescript
import { 
  processBBox,    // Normalizar y validar bounding boxes
  clamp,          // Clamp de valores
  getDurationSeconds,  // Calcular duración entre fechas
  formatDuration,      // Formatear duración
  getErrorMessage,     // Extraer mensaje de error
  isNotFoundError      // Check si es 404
} from '@/utils'
```

## 📖 Ejemplos de Uso

### Ejemplo 1: Cargar Sesiones

```typescript
// En un componente o store
import { sessionService } from '@/api'
import { getErrorMessage } from '@/utils'

async function loadSessions() {
  try {
    const response = await sessionService.listSessions({
      mode: 'range',
      limit: 50,
      from: '2024-01-01T00:00:00Z'
    })
    
    sessions.value = response.sessions
    console.log(`Loaded ${response.sessions.length} sessions`)
    
  } catch (error) {
    console.error('Failed to load sessions:', getErrorMessage(error))
  }
}
```

### Ejemplo 2: Generar URL de Playback

```typescript
import { sessionService, playbackService } from '@/api'

async function setupPlayback(sessionId: string) {
  // Obtener sesión
  const session = await sessionService.getSession(sessionId)
  
  // Generar URL de playback
  const playbackInfo = playbackService.buildSessionPlaybackUrl(session)
  
  if (playbackInfo) {
    console.log('Playback URL:', playbackInfo.playbackUrl)
    console.log('Start time:', playbackInfo.start)
    console.log('Duration:', playbackInfo.duration)
    console.log('Anchor source:', playbackInfo.anchorSource)
    
    // Usar la URL en el reproductor
    videoElement.src = playbackInfo.playbackUrl
  }
}
```

### Ejemplo 3: Procesar Bounding Boxes

```typescript
import { processBBox } from '@/utils'

// En el loop de procesamiento de eventos
for (const obj of event.objs) {
  // Normalizar y validar bbox
  const bbox = processBBox(
    obj.bbox_xyxy,
    videoWidth,
    videoHeight
  )
  
  if (bbox) {
    // bbox está normalizado [0-1] y validado
    renderBoundingBox(bbox, obj.cls_name, obj.conf)
  } else {
    console.debug('Invalid bbox dropped:', obj.bbox_xyxy)
  }
}
```

### Ejemplo 4: Usar Composables

```typescript
import { useApi } from '@/composables'
import { sessionService } from '@/api'

// En un componente
const { data, loading, error, execute } = useApi(
  () => sessionService.listSessions({ mode: 'all' }),
  { 
    immediate: true,
    onSuccess: (data) => {
      console.log('Loaded', data.sessions.length, 'sessions')
    },
    onError: (err) => {
      console.error('Failed to load:', err.message)
    }
  }
)

// En el template
<div v-if="loading">Cargando...</div>
<div v-else-if="error">Error: {{ error.message }}</div>
<div v-else>
  <SessionItem v-for="s in data?.sessions" :key="s.session_id" :session="s" />
</div>

// Re-cargar manualmente
<button @click="execute">Refrescar</button>
```

## 🔧 Cómo Cambiar URLs/Endpoints

### Antes (difícil de mantener)

Buscar en todo el código dónde se construyen las URLs:

```typescript
// En sessions.ts
const url = new URL(`/sessions/${id}/meta`, SESSION_STORE_BASE_URL)

// En otro archivo
const metaUrl = `${baseUrl}/sessions/${sessionId}/meta`

// En otro más
fetch(`${config.sessionStore}/sessions/${id}/meta`)
```

### Ahora (centralizado)

Cambiar en **un solo lugar**:

```typescript
// src/constants/api-endpoints.ts
export const SESSION_ENDPOINTS = {
  META: (sessionId: string) => `/${encodeURIComponent(sessionId)}/meta`,
  
  // Para cambiar la ruta:
  // META: (sessionId: string) => `/${encodeURIComponent(sessionId)}/metadata`,
  // o
  // META: (sessionId: string) => `/v2/sessions/${encodeURIComponent(sessionId)}/meta`,
} as const
```

Todos los servicios usan automáticamente la nueva ruta.

## 📊 Configuración Centralizada

### Antes

```typescript
// Disperso en diferentes archivos
const MAX_SEGMENTS = 12
const EVENT_WINDOW = 0.2
const DEFAULT_CONFIDENCE = 0.4
const START_OFFSET = parseInt(import.meta.env.VITE_START_OFFSET_MS || '200')
```

### Ahora

```typescript
// src/constants/config.ts
export const SEGMENT_CONFIG = {
  MAX_SEGMENTS_IN_MEMORY: 12,
  EVENT_WINDOW_SECONDS: 0.2,
  TRAIL_WINDOW_SECONDS: 2.0,
}

export const UI_CONFIG = {
  FILTERS: {
    DEFAULT_CONFIDENCE_MIN: 0.4,
    // ...
  }
}

export const ENV_CONFIG = {
  START_OFFSET_MS: parseInt(import.meta.env.VITE_START_OFFSET_MS || '200', 10),
  // ...
}
```

Uso:

```typescript
import { SEGMENT_CONFIG, UI_CONFIG, ENV_CONFIG } from '@/constants'

const maxSegments = SEGMENT_CONFIG.MAX_SEGMENTS_IN_MEMORY
const defaultConf = UI_CONFIG.FILTERS.DEFAULT_CONFIDENCE_MIN
const offset = ENV_CONFIG.START_OFFSET_MS
```

## 🚀 Migrando Componentes (Opcional)

Los componentes actuales siguen funcionando, pero puedes migrarlos gradualmente:

### Componente Antiguo

```vue
<script setup lang="ts">
import { listSessions } from '../api/sessions'

const sessions = ref([])
const loading = ref(false)

async function loadSessions() {
  loading.value = true
  try {
    const response = await listSessions({ mode: 'all' })
    sessions.value = response.sessions
  } catch (error) {
    console.error('Error loading sessions', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => loadSessions())
</script>
```

### Componente Migrado (con composable)

```vue
<script setup lang="ts">
import { useApi } from '@/composables'
import { sessionService } from '@/api'

const { data, loading, error, execute } = useApi(
  () => sessionService.listSessions({ mode: 'all' }),
  { immediate: true }
)

// Acceso más simple
const sessions = computed(() => data.value?.sessions ?? [])
</script>
```

## 🧪 Testing (Futuro)

La nueva arquitectura facilita el testing:

```typescript
// Mock del servicio
vi.mock('@/api', () => ({
  sessionService: {
    listSessions: vi.fn().mockResolvedValue({
      mode: 'all',
      sessions: [/* mock data */]
    })
  }
}))

// Test del componente
it('loads sessions on mount', async () => {
  const wrapper = mount(SessionList)
  
  await flushPromises()
  
  expect(sessionService.listSessions).toHaveBeenCalledWith({ mode: 'all' })
  expect(wrapper.findAll('.session-item')).toHaveLength(2)
})
```

## 📝 Checklist de Adopción

Para adoptar gradualmente la nueva arquitectura:

- [ ] Familiarizarse con la estructura de `src/api/services/`
- [ ] Revisar las constantes disponibles en `src/constants/`
- [ ] Explorar las utilidades en `src/utils/`
- [ ] Intentar usar `sessionService` en lugar de las funciones antiguas
- [ ] Usar `playbackService` para generar URLs de playback
- [ ] Probar los composables en componentes nuevos
- [ ] Consultar `ARCHITECTURE.md` para detalles completos
- [ ] Deprecar gradualmente el uso de `sessions-legacy.ts`

## 🎓 Mejores Prácticas

1. **Imports**: Usar siempre path aliases (`@/api`, `@/utils`, etc.)
2. **Constantes**: No hardcodear valores, usar las constantes definidas
3. **Errores**: Usar `getErrorMessage()` para mensajes user-friendly
4. **BBoxes**: Usar `processBBox()` en lugar de lógica manual
5. **Servicios**: Usar los servicios singleton en lugar de crear instancias
6. **Types**: Importar types desde `@/api` para type safety

## 🆘 Soporte

- Ver ejemplos completos en `ARCHITECTURE.md`
- Consultar documentación inline (JSDoc)
- Revisar el código de los servicios como referencia
- Los archivos `.backup` contienen el código original si necesitas comparar

---

**La aplicación funciona exactamente igual que antes, solo que ahora es mucho más fácil de mantener y escalar.** 🎉
