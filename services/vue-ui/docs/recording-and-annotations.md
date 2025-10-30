# Recording & Annotation Flow (vue-ui)

Este documento explica cómo la interfaz `vue-ui` obtiene la información de sesiones, descarga las grabaciones desde MediaMTX y superpone las anotaciones de tracking generadas por el `worker-ai`.

---

## 1. Descubrimiento de sesiones

1. Al iniciar `vue-ui`, el store `useSessionsStore` llama a `listSessions()` (`src/api/sessions.ts`).
2. `listSessions()` consulta al `session-store` (`services/session-store`) vía:
   - `/sessions/range` (por defecto) o `/sessions?mode=all`, según filtros seleccionados.
3. El `session-store` responde con sesiones que incluyen `session_id`, `device_id`, `start_ts`, `end_ts`, `path`, etc.
4. `Home.vue` muestra la lista; al hacer clic se navega a `/session/:sessionId`.

## 2. Carga de metadatos y segmentos

Cuando se monta `Session.vue`:

1. Se llama a `tracksStore.resetForSession(sessionId)` para limpiar caches.
2. Se lanzan en paralelo:
   - `tracksStore.loadMeta(sessionId)` → `sessionService.getTrackMeta()` → `/sessions/:id/tracks/meta.json`.
   - `tracksStore.loadIndex(sessionId)` → `sessionService.getTrackIndex()` → `/sessions/:id/tracks/index.json`.
3. El `session-store` lee `meta.json` e `index.json` en `data/tracks/<session_id>/`, generados por el `worker-ai`.
   - `meta.json` describe `video`, `classes`, `start_time`, `end_time`, etc.
   - `index.json` lista segmentos NDJSON (`tracks/seg-xxxx.jsonl`) con `t0`, `t1`, `count`, `closed`.
4. Si un archivo falta (404), el front marca `metaMissing` o `indexMissing`, muestra advertencias y deshabilita overlays.

## 3. Obtención del recording (MediaMTX)

1. `Session.vue` obtiene el detalle de la sesión (`sessionService.getSession(sessionId)`).
2. Con esa data, `playbackService.buildSessionPlaybackUrl(session)` genera la URL `GET` de MediaMTX (`http://mediamtx:9996/get?...`).
3. Opcionalmente, `playbackService.probePlaybackUrl(...)` verifica la disponibilidad con reintentos.
4. La URL final se asigna al `<video>` en `Player.vue`, que descarga el MP4 progresivo directamente desde MediaMTX.

## 4. Streaming de anotaciones

1. `useTracksStore` determina qué segmento NDJSON corresponde al `video.currentTime` (`segmentIndexForTime`).
2. `ensureSegment(sessionId, i)` pide `/sessions/:id/tracks/:segment` (NDJSON por segmento):
   - Si el archivo existe: se descarga NDJSON, se parsea en `ndjsonParser.worker.ts` y se cachea (memoria + Dexie).
   - Si no existe (sesión en vivo) y responde 404, se ignora y se reintentará cuando corresponda.
3. `CanvasOverlay` combina la hora actual con los eventos cargados y dibuja cajas, labels y trayectorias.

## 5. Estados especiales

- **Sesión sin meta/index:** el video se reproduce; la UI muestra avisos y los controles de overlays quedan deshabilitados.
- **Sesión abierta:** `index.json` sigue creciendo; los segmentos futuros pueden devolver 404 temporalmente.
- **Error de MediaMTX:** si el clip no se puede descargar, `Player.vue` muestra el mensaje de error.

---

## Componentes involucrados

| Componente / Archivo                                   | Rol principal                                                               |
|--------------------------------------------------------|-----------------------------------------------------------------------------|
| `services/vue-ui/src/views/Home.vue`                   | Listado de sesiones.                                                        |
| `services/vue-ui/src/views/Session.vue`                | Orquesta carga de meta/index, video y overlays.                             |
| `services/vue-ui/src/components/Player.vue`            | Renderiza `<video>` y decide si dibujar overlays.                           |
| `services/vue-ui/src/components/CanvasOverlay.vue`     | Dibuja cajas/labels/trails en un canvas sobre el video.                     |
| `services/vue-ui/src/components/TrackLegend.vue`       | Controles de overlay (filtros, toggles).                                    |
| `services/vue-ui/src/stores/useSessions.ts`            | Estado del listado de sesiones.                                             |
| `services/vue-ui/src/stores/useTracks.ts`              | Cache de metadatos, segmentos y filtros de anotaciones.                     |
| `services/vue-ui/src/api/sessions.ts`                  | Fetchers al `session-store` y MediaMTX (vía servicios).                     |
| `services/session-store/src/routes/session.routes.ts`  | API para sesiones, meta/index y segmentos NDJSON.                           |
| `services/worker-ai/src/session/manager.py`            | Genera `meta.json`, `index.json` y `tracks/seg-xxxx.jsonl`.                 |
| `services/mediamtx`                                    | Sirve grabaciones (`/get?path=...`).                                        |

---

## Checklist de despliegue

1. El `worker-ai` debe escribir en `data/tracks/<session_id>/`.
2. El `session-store` debe montar `./data/tracks:/data/tracks`.
3. MediaMTX debe exponer el endpoint `/get`.
4. `vue-ui` debe tener configuradas las URLs base correctas (`VITE_SESSION_STORE_BASE_URL`, `VITE_MEDIAMTX_BASE_URL` si se personalizan).

Con esos pasos, la UI puede mostrar el video y las anotaciones sin necesidad de proxies adicionales ni lógica duplicada.
