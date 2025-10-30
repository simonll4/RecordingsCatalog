# Quickstart

## Requisitos
- Node.js 20+
- Backend `session-store` y `mediamtx` accesibles

## Variables de entorno (.env)
```
VITE_SESSION_STORE_BASE_URL=http://localhost:8080
VITE_MEDIAMTX_BASE_URL=http://localhost:9996
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

