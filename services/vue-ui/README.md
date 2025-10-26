# Vue UI - Recordings Catalog Frontend

Vue 3 + TypeScript application for viewing and managing recording sessions with AI-powered object detection overlays.

## 📚 Documentation

- **[Architecture Guide](./ARCHITECTURE.md)** - Detailed architecture and module documentation
- **[Refactoring Guide](./REFACTORING_GUIDE.md)** - Guide for using the new modular structure

## 🏗️ Architecture

The application has been completely refactored with a modular architecture:

```
src/
├── api/           # HTTP services and API layer
├── constants/     # Centralized configuration
├── utils/         # Reusable utilities
├── composables/   # Vue composables
├── stores/        # Pinia state management
├── components/    # Vue components
└── views/         # Page views
```

### Key Features

- ✅ **Modular Services**: Separated API logic with clear responsibilities
- ✅ **Type Safety**: Full TypeScript + Zod validation
- ✅ **Centralized Config**: All URLs and settings in one place
- ✅ **Reusable Utils**: Common operations extracted to utilities
- ✅ **Vue 3 Composables**: Modern reactive patterns
- ✅ **Backward Compatible**: Existing code continues to work

## 🚀 Quick Start

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) 
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
# Session Store API URL
VITE_SESSION_STORE_BASE_URL=http://localhost:8080

# MediaMTX API URL  
VITE_MEDIAMTX_BASE_URL=http://localhost:9996

# Playback configuration
VITE_START_OFFSET_MS=200
VITE_EXTRA_SECONDS=5
```

If not specified, the application will auto-detect URLs based on the current hostname.

## 💻 Usage Examples

### Using Services in Components

```typescript
import { sessionService } from '@/api'
import { getErrorMessage } from '@/utils'

// Load sessions
const { sessions } = await sessionService.listSessions({
  mode: 'range',
  limit: 50
})

// Get session details
const session = await sessionService.getSession('session-id')
```

### Using Composables

```typescript
import { useApi } from '@/composables'
import { sessionService } from '@/api'

const { data, loading, error, execute } = useApi(
  () => sessionService.listSessions({ mode: 'all' }),
  { immediate: true }
)
```

### Using Stores

```typescript
import { useSessionsStore, useTracksStore } from '@/stores'

const sessionsStore = useSessionsStore()
await sessionsStore.loadSessions()

const tracksStore = useTracksStore()
await tracksStore.loadMeta('session-id')
```

For more examples, see the [Refactoring Guide](./REFACTORING_GUIDE.md).

## 🔧 Development

### Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation on:

- Module organization
- Service patterns
- Utility functions
- State management
- Type definitions

### Adding New Features

1. **API Changes**: Update constants in `src/constants/api-endpoints.ts`
2. **New Services**: Add to `src/api/services/`
3. **Utilities**: Add to `src/utils/`
4. **Composables**: Add to `src/composables/`
5. **State**: Add stores to `src/stores/`

## 📦 Build and Deploy

```sh
# Development
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check

# Linting
npm run lint
```

## 🐳 Docker

```sh
# Build image
docker build -t vue-ui .

# Run container
docker run -p 8080:80 \
  -e VITE_SESSION_STORE_BASE_URL=http://session-store:8080 \
  -e VITE_MEDIAMTX_BASE_URL=http://mediamtx:9996 \
  vue-ui
```
