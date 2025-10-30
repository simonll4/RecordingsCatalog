# 🎨 Arquitectura Visual - Vue UI

Diagramas visuales de la arquitectura refactorizada.

## 📊 Estructura de Módulos

```
┌─────────────────────────────────────────────────────────────────┐
│                          VUE UI                                  │
│                   (Recordings Catalog Frontend)                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
        ┌───────▼────────┐            ┌────────▼──────┐
        │  PRESENTATION  │            │   BUSINESS    │
        │     LAYER      │            │     LAYER     │
        └───────┬────────┘            └────────┬──────┘
                │                               │
    ┌───────────┼───────────┐       ┌──────────┼──────────┐
    │           │           │       │          │          │
┌───▼───┐ ┌────▼────┐ ┌────▼───┐ ┌─▼───┐ ┌───▼────┐ ┌───▼────┐
│ Views │ │ Comps   │ │ Router │ │ API │ │ Stores │ │ Utils  │
└───────┘ └─────────┘ └────────┘ └──┬──┘ └────────┘ └────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              ┌─────▼────┐    ┌─────▼─────┐   ┌─────▼─────┐
              │   HTTP   │    │ Services  │   │  Schemas  │
              │  Client  │    │           │   │   (Zod)   │
              └──────────┘    └───────────┘   └───────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
  ┌─────▼──────┐        ┌──────▼──────┐
  │  Session   │        │  MediaMTX   │
  │   Store    │        │   Server    │
  │  Backend   │        │   Backend   │
  └────────────┘        └─────────────┘
```

## 🔄 Flujo de Datos

### Cargar Sesiones

```
┌──────────┐
│   User   │
│  Action  │
└─────┬────┘
      │ click "Load Sessions"
      │
┌─────▼────────────┐
│  SessionList.vue │
│   Component      │
└─────┬────────────┘
      │ store.loadSessions()
      │
┌─────▼──────────────┐
│ useSessionsStore   │
│    (Pinia)         │
└─────┬──────────────┘
      │ sessionService.listSessions()
      │
┌─────▼──────────────┐
│  SessionService    │
│   (API Layer)      │
└─────┬──────────────┘
      │ sessionStoreClient.getJson()
      │
┌─────▼──────────────┐
│   HttpClient       │
│  (HTTP Layer)      │
└─────┬──────────────┘
      │ fetch(SESSION_ENDPOINTS.LIST)
      │
┌─────▼──────────────┐
│  Session Store     │
│    Backend API     │
└─────┬──────────────┘
      │ Response { sessions: [...] }
      │
      │ Validate with Zod schema
      ▼
┌──────────────────────┐
│   listSessionsSchema │
│      (Zod)           │
└─────┬────────────────┘
      │ Validated data
      │
      │ Update store state
      ▼
┌──────────────────────┐
│  sessions.value = [] │
│   (Reactive State)   │
└─────┬────────────────┘
      │ Vue reactivity
      │
      │ Re-render
      ▼
┌──────────────────────┐
│  SessionList.vue     │
│  (Updated UI)        │
└──────────────────────┘
```

### Reproducir Sesión

```
┌──────────┐
│   User   │
│  Action  │
└─────┬────┘
      │ click session
      │
┌─────▼────────────┐
│  Session.vue     │
│     View         │
└─────┬────────────┘
      │ loadSessionData()
      │
      ├──────────────────────────┬─────────────────────┐
      │                          │                     │
┌─────▼──────┐          ┌────────▼─────┐    ┌────────▼─────┐
│ fetchSession│          │ loadMeta()   │    │ loadIndex()  │
└─────┬──────┘          └────────┬─────┘    └────────┬─────┘
      │                          │                    │
      │ sessionService           │ sessionService     │ sessionService
      │   .getSession()          │   .getTrackMeta()  │   .getTrackIndex()
      │                          │                    │
      └──────────────────────────┴────────────────────┘
                                 │
                    ┌────────────▼───────────┐
                    │ buildPlaybackUrl()     │
                    │   (PlaybackService)    │
                    └────────────┬───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │ playerStore             │
                    │  .setPlaybackSource()   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  <video> element        │
                    │    plays video          │
                    └─────────────────────────┘
```

## 🏗️ Arquitectura de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Views (Home.vue, Session.vue)                       │   │
│  │  ├─ Orchestrates component interaction              │   │
│  │  └─ Handles page-level state                        │   │
│  └───────────────────┬─────────────────────────────────┘   │
│                      │                                       │
│  ┌───────────────────▼─────────────────────────────────┐   │
│  │ Components (SessionList, Player, TrackLegend, etc.) │   │
│  │  ├─ Reusable UI components                          │   │
│  │  └─ Local component state                           │   │
│  └───────────────────┬─────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     BUSINESS LAYER                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Composables (useApi, useDebounce)                   │   │
│  │  ├─ Reusable reactive logic                         │   │
│  │  └─ Vue 3 composition API patterns                  │   │
│  └───────────────────┬─────────────────────────────────┘   │
│                      │                                       │
│  ┌───────────────────▼─────────────────────────────────┐   │
│  │ Stores (useSessions, useTracks, usePlayer)          │   │
│  │  ├─ Global state management (Pinia)                 │   │
│  │  ├─ Business logic coordination                     │   │
│  │  └─ Reactive state                                  │   │
│  └───────────────────┬─────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     SERVICE LAYER                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Services (SessionService, PlaybackService)          │   │
│  │  ├─ API operation encapsulation                     │   │
│  │  ├─ Business logic for external communication       │   │
│  │  └─ Singleton instances                             │   │
│  └───────────────────┬─────────────────────────────────┘   │
│                      │                                       │
│  ┌───────────────────▼─────────────────────────────────┐   │
│  │ HTTP Client (HttpClient)                            │   │
│  │  ├─ HTTP communication                              │   │
│  │  ├─ Error handling                                  │   │
│  │  └─ Request/response interceptors                   │   │
│  └───────────────────┬─────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    SUPPORT LAYERS                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Utils (bbox, date, error)                           │   │
│  │  └─ Pure utility functions                          │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Constants (api-endpoints, config)                   │   │
│  │  └─ Configuration and constants                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Schemas (session.schemas)                           │   │
│  │  └─ Zod validation schemas                          │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Types (tracks.ts)                                   │   │
│  │  └─ TypeScript type definitions                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Organización de Módulos

```
src/
│
├─ 🎨 PRESENTATION
│  ├─ views/          ─┐
│  ├─ components/     ─┤ UI Components
│  └─ router/         ─┘
│
├─ 🎣 COMPOSITION
│  └─ composables/    ─── Reusable Logic
│
├─ 📦 STATE
│  └─ stores/         ─── Pinia Stores
│
├─ 🌐 API
│  ├─ http/           ─┐
│  ├─ services/       ─┤ API Layer
│  └─ schemas/        ─┘
│
├─ 🛠️ SUPPORT
│  ├─ utils/          ─┐
│  ├─ constants/      ─┤ Utilities
│  └─ types/          ─┘
│
└─ ⚙️ INFRASTRUCTURE
   ├─ workers/        ─── Web Workers
   └─ main.ts         ─── Entry Point
```

## 🔀 Dependency Flow

```
┌──────────────────────────────────────────────────────┐
│               DEPENDENCY HIERARCHY                    │
│                                                       │
│  Views/Components (Top Level)                        │
│         │                                             │
│         ├─► Composables                              │
│         │      │                                      │
│         │      └─► Stores                            │
│         │              │                              │
│         └──────────────┴─► Services                  │
│                                │                      │
│                                ├─► HTTP Client       │
│                                │      │               │
│                                │      └─► Constants  │
│                                │                      │
│                                ├─► Schemas (Zod)     │
│                                │                      │
│                                └─► Utils             │
│                                                       │
│  Types (Used by all layers)                          │
│                                                       │
└──────────────────────────────────────────────────────┘

Rules:
✅ Higher layers can import from lower layers
❌ Lower layers NEVER import from higher layers
✅ Utils are pure functions (no dependencies)
✅ Constants have no dependencies
```

## 🎯 Request Flow Example

```
User clicks "Load Sessions"
         │
         ▼
┌────────────────────┐
│  SessionList.vue   │ ◄─── Presentation Layer
└────────┬───────────┘
         │ useSessionsStore().loadSessions()
         ▼
┌────────────────────┐
│ useSessionsStore   │ ◄─── State Layer
└────────┬───────────┘
         │ sessionService.listSessions()
         ▼
┌────────────────────┐
│  SessionService    │ ◄─── Service Layer
└────────┬───────────┘
         │ sessionStoreClient.getJson(
         │   SESSION_ENDPOINTS.LIST,
         │   listSessionsSchema
         │ )
         ▼
┌────────────────────┐
│   HttpClient       │ ◄─── HTTP Layer
└────────┬───────────┘
         │ fetch(url)
         ▼
┌────────────────────┐
│  Backend API       │ ◄─── External Service
└────────┬───────────┘
         │ Response
         ▼
   Zod Validation ────► listSessionsSchema
         │
         ▼ (valid data)
   Store Update ─────► sessions.value = data
         │
         ▼
  Vue Reactivity ────► Component Re-render
```

## 🔧 Module Responsibilities

```
┌─────────────────────────────────────────────────────┐
│                    MODULE ROLES                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  🎨 Views/Components                                │
│     • Render UI                                     │
│     • Handle user interactions                      │
│     • Compose other components                      │
│     • NO business logic                             │
│                                                      │
│  🎣 Composables                                     │
│     • Encapsulate reusable reactive logic           │
│     • Share state between components                │
│     • Lifecycle hooks                               │
│                                                      │
│  📦 Stores (Pinia)                                  │
│     • Global state management                       │
│     • Business logic coordination                   │
│     • Call services                                 │
│     • Reactive state                                │
│                                                      │
│  🌐 Services                                        │
│     • API communication                             │
│     • External system integration                   │
│     • Data transformation                           │
│     • Business logic for external calls             │
│                                                      │
│  🔌 HTTP Client                                     │
│     • HTTP requests/responses                       │
│     • Error handling                                │
│     • Request configuration                         │
│                                                      │
│  ✅ Schemas (Zod)                                   │
│     • Data validation                               │
│     • Type inference                                │
│     • Runtime type checking                         │
│                                                      │
│  🛠️ Utils                                           │
│     • Pure utility functions                        │
│     • NO side effects                               │
│     • Reusable across app                           │
│                                                      │
│  📝 Constants                                       │
│     • Configuration values                          │
│     • API endpoints                                 │
│     • Magic numbers/strings                         │
│                                                      │
│  📋 Types                                           │
│     • TypeScript interfaces                         │
│     • Type definitions                              │
│     • Shared across modules                         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## 🎪 Component Communication

```
┌─────────────────────────────────────────────────────┐
│               COMPONENT COMMUNICATION                │
└─────────────────────────────────────────────────────┘

Parent-Child:
┌──────────────┐
│    Parent    │
└──────┬───────┘
       │ props ↓
       │ emits ↑
┌──────▼───────┐
│    Child     │
└──────────────┘

Sibling (via Store):
┌──────────────┐     ┌──────────────┐
│  Component A │────→│  Pinia Store │←────┌──────────────┐
└──────────────┘     └──────────────┘     │  Component B │
                                           └──────────────┘

Global State (Pinia):
┌──────────────┐
│  Any Comp    │─┐
└──────────────┘ │
┌──────────────┐ │   ┌──────────────┐
│  Any Comp    │─┼──→│  Pinia Store │
└──────────────┘ │   └──────────────┘
┌──────────────┐ │
│  Any Comp    │─┘
└──────────────┘

Composables (Shared Logic):
┌──────────────┐     ┌──────────────┐
│  Component A │────→│  Composable  │←────┌──────────────┐
└──────────────┘     └──────────────┘     │  Component B │
                                           └──────────────┘
```

## 📚 Import Patterns

```
Good ✅:
┌──────────────────────────────────────┐
│  import { sessionService } from '@/api'     │
│  import { PLAYER_CONFIG } from '@/constants'│
│  import { processBBox } from '@/utils'      │
└──────────────────────────────────────┘

Bad ❌:
┌──────────────────────────────────────┐
│  import { sessionService }                  │
│    from '../../../api/services/session'    │
└──────────────────────────────────────┘
```

---

## 🎯 Key Architectural Decisions

### ✅ Singleton Services
Services are singleton instances, not classes to instantiate.

```typescript
// ✅ Do this
import { sessionService } from '@/api'
sessionService.listSessions()

// ❌ Not this
import { SessionService } from '@/api'
const service = new SessionService()
```

### ✅ Pure Utils
Utilities are pure functions with no side effects.

```typescript
// ✅ Pure function
export const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max)
}

// ❌ Not pure (has side effect)
export const clamp = (value: number, min: number, max: number) => {
  console.log('Clamping', value) // Side effect!
  return Math.min(Math.max(value, min), max)
}
```

### ✅ Reactive Stores
Stores use Vue's reactivity system.

```typescript
// ✅ Reactive
const sessions = ref<SessionSummary[]>([])

// ❌ Not reactive
let sessions: SessionSummary[] = []
```

### ✅ Type Safety
Always use TypeScript and Zod for validation.

```typescript
// ✅ Type-safe with Zod
const data = await fetchJson(url, sessionSummarySchema)

// ❌ No validation
const data = await fetch(url).then(r => r.json())
```

---

**Esta arquitectura es escalable, mantenible y sigue las mejores prácticas de Vue 3.** ✨
