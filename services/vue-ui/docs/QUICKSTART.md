# Quickstart

## Requisitos
- Node.js 20+
- Backend `session-store` y `mediamtx` accesibles

## Variables de entorno (.env)
```
VITE_SESSION_STORE_BASE_URL=http://localhost:8080
VITE_MEDIAMTX_BASE_URL=http://localhost:9996
VITE_WEBRTC_BASE_URL=http://localhost:8889
VITE_EDGE_AGENT_BASE_URL=http://localhost:7080
VITE_START_OFFSET_MS=200
VITE_EXTRA_SECONDS=5
```

## Desarrollo
```
npm install
npm run dev
```

## Producción
```
npm run build
npm run preview
```

## Rutas
- `/` catálogo de sesiones
- `/control` vista unificada (WHEP en vivo + panel del Edge Agent)
