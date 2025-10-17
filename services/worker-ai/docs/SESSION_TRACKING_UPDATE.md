# Actualización 2025-10-16 · Worker AI + Edge Agent

Cambios aplicados durante la depuración de cierre de sesiones y tracking.

## Worker AI

- Entrada principal en `worker_new.py`:
  - Procesa frames sin `session_id` solo para detección; no persiste ni actualiza el tracker.
  - Abre sesión cuando llega un `session_id` nuevo, resetea BoT‑SORT y crea `data/tracks/<session_id>/`.
  - Maneja el mensaje `End` aun si viene sin `req.end` explícito (`MT_END` en envelope).
  - Cierra archivos (`tracks.jsonl`, `index.json`, `meta.json`) inmediatamente al recibir `End` o cambio de sesión.
  - Ignora frames tardíos con el `session_id` recién cerrado (evita escribir en carpetas anteriores).
- `SessionManager` garantiza que los directorios existen al finalizar y loguea cualquier error de persistencia.
- Documentación actualizada:
  - `docs/artefactos-del-worker.md`: describe la carpeta `data/tracks/<session_id>/`.
  - `ver/MIGRATION.md`: refleja la estructura modular (`src/*`) y el nuevo flujo de sesiones.

## Edge Agent

- `AIEngine` agrega el método `closeSession(sessionId)`.
- Adapter en `app/main.ts`:
  - Propaga `setSessionId(...)` cuando el orquestador abre sesión.
  - En `closeSession(...)` siempre envía `End`, aunque el `sessionId` ya se haya limpiado.
- `AIClientTcp.sendEnd()` construye el `Envelope` usando `pb.ai.Request.create(...)` y loguea el envío.
- `Orchestrator` pasa el `sessionId` al comando `StopStream`; al ejecutarse, se llama a `ai.closeSession(sessionId)` antes de cerrar en Session Store.
- `AIFeeder` vuelve a enviar frames aunque no haya sesión (sessionId vacío). El worker decide cuándo persistir.

## Resultado

- Una conexión TCP puede manejar múltiples sesiones consecutivas sin reiniciar.
- El worker cierra carpetas de tracking en cuanto el edge-agent termina la sesión (no espera a que caiga el socket).
- Los frames entre sesiones siguen produciendo detecciones para que la FSM determine si debe abrir la siguiente sesión.

## Pasos recomendados

1. Levantar worker (`./run.sh`) y stack (`docker compose --profile edge up -d --build`).
2. Confirmar en los logs:
   - Edge-agent: `AI adapter session close signal sent` / `End message sent to worker`.
   - Worker: `End recibido. Cerrando sesión <session_id>`.
3. Verificar que cada carpeta en `data/tracks/` contenga los tres archivos y no se reabra al finalizar.
