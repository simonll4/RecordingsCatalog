# Operación

## Configuración
- Endpoints en `src/constants/api-endpoints.ts`
- Config UI y playback en `src/constants/config.ts`
- URLs vía `.env` (VITE_*): ver QUICKSTART

## Troubleshooting
- Video no carga: verificar `VITE_MEDIAMTX_BASE_URL` y path de la sesión.
- Overlays vacíos: confirmar que existan `meta.json` / `index.json` en `session-store`.
- 404 en segmentos: sesiones recientes pueden no tener todos los segmentos aún.

## Build
```
npm run type-check
npm run build
```

