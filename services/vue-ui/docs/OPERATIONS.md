# Operación

## Configuración
- Endpoints en `src/constants/api-endpoints.ts`
- Config UI y playback en `src/constants/config.ts`
- URLs vía `.env` (VITE_*): ver QUICKSTART
- El panel `/control` consume la API del manager del Edge Agent (`VITE_EDGE_AGENT_BASE_URL`).

## Troubleshooting
- Video no carga: verificar `VITE_MEDIAMTX_BASE_URL` y path de la sesión.
- Overlays vacíos: confirmar que existan `meta.json` / `index.json` en `session-store`.
- 404 en segmentos: sesiones recientes pueden no tener todos los segmentos aún.
- Control no disponible: asegurarse que el manager esté escuchando en `VITE_EDGE_AGENT_BASE_URL` y que responda `/status`.

## Build
```
npm run type-check
npm run build
```
