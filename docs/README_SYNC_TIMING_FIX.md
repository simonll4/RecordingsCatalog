# Fix de sincronización video ↔ anotaciones

Este documento resume el cambio aplicado para eliminar el desfase entre las *bounding boxes* y las grabaciones producidas por MediaMTX.

---

## 🧩 Problema original
- Las anotaciones avanzaban más rápido que el video en `vue-ui` y en el script `annotate_from_json.py`.
- El worker persistía `t_rel_s` dividiendo un contador de frames lógico por un FPS fijo (`sessions.default_fps = 10`), mientras el Edge Agent procesaba a tasas variables y MediaMTX grababa a ~15 FPS.
- El campo `frame` del NDJSON provenía del contador interno del feeder, no del índice real del MP4.

Resultado: deriva lineal (adelanto creciente) y desalineación evidente en cualquier reproductor.

---

## ✅ Solución aplicada

| Componente | Cambio |
|------------|--------|
| **worker-ai** (`session.manager.SessionWriter`) | Persiste timestamps monotónicos/UTC originados en el edge (`ts_mono_ns`, `ts_utc_ns`). Calcula `t_rel_s`, `duration_s`, `start_time` y `end_time` con esos relojes. |
| **DTO / pipeline** | `FramePayload` transporta `ts_mono_ns` y `ts_utc_ns` desde el protobuf hasta el SessionWriter. |
| **edge-agent** (`AIFeeder.sendFrame`) | Convierte `process.hrtime` a UTC una sola vez para cada conexión y rellena `tsUtcNs`. Reutiliza el mismo valor para cache y worker para mantener coherencia. |
| **Script offline** (`annotate_from_json.py`) | Agrupa eventos por `t_rel_s` y acepta múltiples objetos por frame; ya no depende de un índice de frame arbitrario. |

El resto de la UI (vue-ui) ya se guiaba por `t_rel_s`, así que empezó a dibujar exactamente onde corresponde una vez que cambió la base de tiempo.

---

## 📂 Archivos relevantes
- `services/worker-ai/src/session/manager.py`
- `services/worker-ai/src/pipeline/dto.py`
- `services/worker-ai/src/pipeline/processor.py`
- `services/worker-ai/src/pipeline/session_service.py`
- `services/worker-ai/src/server/connection.py`
- `services/edge-agent/src/modules/ai/feeder/ai-feeder.ts`
- `services/worker-ai/scripts/annotate_from_json.py`

---

## 🔬 Cómo validar
1. Generar una nueva sesión (las previas quedaron con t_rel_s en base a 10 FPS).
2. Revisar `data/tracks/<session>/tracks/*.jsonl`:
   - Cada evento incluye `ts_mono_ns`, `ts_utc_ns` y un `t_rel_s` coherente.
3. Abrir la sesión en `vue-ui` o ejecutar `python services/worker-ai/scripts/annotate_from_json.py`.
   - Las cajas deben seguir al objeto sin desfase del inicio al final del clip.
4. (Opcional) Verificar `meta.json` e `index.json`:
   - `start_time` y `end_time` corresponden a los timestamps del feed.
   - `duration_s` coincide con la duración real de la grabación.

---

## 📌 Notas adicionales
- Los datos históricos deben reprocesarse si se requiere sincronización perfecta.
- El worker sigue guardando el campo `frame` para depuración, pero no es usado para sincronizar.
- El edge-agent mantiene la lógica de backpressure y frameId; únicamente se añadió la traducción a UTC para alinear todos los artefactos.

