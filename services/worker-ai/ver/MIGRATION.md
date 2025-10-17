# Migración de CV → Worker-AI (versión modular)

Este archivo resume la migración realizada desde el prototipo CV al nuevo `worker-ai` modular.  El objetivo fue extraer la lógica de inferencia, tracking y persistencia en módulos claros, listos para operar como servicio TCP con el edge-agent.

---

## Módulos incorporados

| Archivo | Descripción |
|---------|-------------|
| `worker_new.py` | Entry point asyncio. Gestiona conexiones TCP, sesiones y ciclo de vida del tracker. |
| `src/inference/yolo11.py` | Wrapper de YOLO11 ONNX (preproceso letterbox, postproceso con NMS, detecciones normalizadas). |
| `src/tracking/botsort.py` | Implementación BoT‑SORT simplificada (IoU + matching por clase, `match_thresh`, `max_age`). |
| `src/session/manager.py` | Persistencia por sesión (`tracks.jsonl`, `index.json`, `meta.json`). |
| `src/protocol/handler.py` | Manejo del protocolo Protobuf v1 (Init, Frame, Result, Heartbeat, **End**). |
| `src/core/config.py` | Carga de `config.toml` en dataclasses (`server`, `tracker`, `sessions`, `visualization`). |
| `src/core/logger.py` | Setup unificado de logging (stdout). |
| `src/visualization/viewer.py` | Visualizador opcional con OpenCV (solo en modo debug local). |
| `botsort.yaml` | Parámetros del tracker (`match_thresh`, `max_age`, etc.). |
| `environment.yml` | Entorno reproducible con micromamba (Python 3.10.19 + ONNX Runtime + OpenCV). |
| `run.sh` | Script de arranque local (crea entorno, imprime versiones y ejecuta `worker_new.py`). |

---

## Flujo de sesión en `worker_new.py`

1. **Frames sin sesión**  
   - Se responden detecciones “planas” (sin tracking) para permitir que el edge-agent evalúe relevancia.  
   - No se escribe nada en disco ni se actualiza el tracker.

2. **Inicio de sesión**  
   - Primer frame con `session_id` nuevo → se resetea BoT‑SORT, se abre `data/tracks/<session_id>/` y se crean `SessionWriter` + contadores.

3. **Sesión activa**  
   - El tracker mantiene `track_id` estables frame a frame.  
   - Solo si hay tracks se escribe línea en `tracks.jsonl` (`t`, `objs[ {id, cls, conf, xyxy} ]`).  
   - Al cerrar sesión se genera `index.json` (offsets por segundo) y `meta.json` (start/end/time, frames, fps).

4. **Fin de sesión**  
   - Cuando llega `End` (o cambia el `session_id`) se cierran los archivos inmediatamente y se guarda el último `session_id` cerrado para ignorar frames tardíos.
   - Frames posteriores con `session_id` vacío vuelven al modo detección simple.

---

## Ajustes clave respecto al prototipo CV

- 👍 Código modular en `src/` (en lugar de un único `worker.py` de >1k líneas).
- 👍 Persistencia basada en sesiones (no más carpeta `artifacts/video_id`, ni copia del video).
- 👍 Detecciones normalizadas 0‑1, confidencias en rango 0‑1 (se eliminan valores erróneos como `582.2`).
- 👍 Integración explícita con mensaje `End` del edge-agent para cerrar sesiones sin cortar la conexión.
- 👋 Eliminado código no necesario en producción:
  - Lectura/almacenamiento de video con OpenCV.
  - Scripts CLI y helpers del sandbox CV.
  - Configuración legacy (`worker.py`, `tracker.py`, `session_manager.py` planos).

---

## Contrato esperado con el edge-agent

- **Init**: El agente envía el path del modelo y capacidades (incluye `conf_threshold` opcional).
- **Frame**:  
  - `session_id` vacío → el worker no persiste, pero responde detecciones para que el orquestador decida.  
  - `session_id` nuevo → el worker abre sesión y activa tracking/persistencia.  
  - Cambios de `session_id` → cierre automático de la anterior, apertura de la nueva.
- **End**: Obligatorio al terminar la sesión (sin cortar TCP). El worker cierra los archivos inmediatamente.
- **Heartbeat**: Bidireccional para mantener la conexión viva.

---

## Archivos generados por sesión

```
data/tracks/{session_id}/
  ├── tracks.jsonl   # eventos con tracks (solo frames con objetos)
  ├── index.json     # offsets por segundo para acceso rápido
  └── meta.json      # start/end, frames, fps, device_id
```

Los archivos solo existen cuando la sesión estuvo activa. Al finalizar, el tracker queda limpio y la siguiente sesión comienza fresca.

---

## Próximos pasos sugeridos

- ✅ Integración edge-agent ←→ worker completa (Init, Frame, Result, Heartbeat, End).
- 🔍 End-to-end testing con sesiones consecutivas en la misma conexión (valida que `End` llega y se persiste correctamente).
- 📈 Métricas (tiempo de inferencia/tracking, frames droppeados, etc.) para observabilidad futura.

Con esta migración el worker queda listo para operar como servicio dedicado, manteniendo el tracking y la persistencia alineados con el edge-agent.***
