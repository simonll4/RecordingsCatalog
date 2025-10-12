# AI Flow (Edge Agent)

Este documento resume el flujo actual de datos de IA en el Edge Agent, alineado con la implementación Protocol v1 (NV12/I420) y la estructura de código vigente.

Componentes principales (archivos relevantes):
- Camera Hub: `services/edge-agent/src/modules/video/adapters/gstreamer/camera-hub-gst.ts`
- NV12 Capture: `services/edge-agent/src/modules/video/adapters/gstreamer/nv12-capture-gst.ts`
- AI Feeder (backpressure): `services/edge-agent/src/modules/ai/feeder/ai-feeder.ts`
- AI Client TCP: `services/edge-agent/src/modules/ai/client/ai-client-tcp.ts`
- Orchestrator (FSM): `services/edge-agent/src/core/orchestrator/orchestrator.ts`
- Bus de eventos: `services/edge-agent/src/core/bus/bus.ts`
- Publisher (RTSP): `services/edge-agent/src/modules/streaming/adapters/gstreamer/media-mtx-on-demand-publisher-gst.ts`
- Session Store (HTTP): `services/edge-agent/src/modules/store/adapters/http/session-store-http.ts`
- Worker de IA (Python): `services/worker-ai/worker.py`

## Flujo resumido

```
RTSP/V4L2 ──► CameraHubGst ── I420@WxH (SHM) ─►┐
                                               ├─► PublisherGst ──► MediaMTX (RTSP)
                                               │
                                               └─► NV12CaptureGst ── NV12@AxB ──► AIFeeder ──► AIClientTcp ─► Worker
                                                                                          ▲             └─► Result/WindowUpdate
                                                                                          │
                                                                                       Bus events
```

1) CameraHubGst publica frames I420 en SHM.
2) NV12CaptureGst lee del SHM, remuestrea a `AI_WIDTH/AI_HEIGHT` y entrega buffers NV12 al AIFeeder.
3) AIFeeder aplica backpressure (ventana con LATEST_WINS) y envía frames al Worker vía AIClientTcp (TCP + framing uint32LE + Protobuf v1).
4) El Worker responde `InitOk`, `Result` y `WindowUpdate`. Los `Result` son correlacionados por `frame_id`.
5) `main.ts` filtra resultados por clases/umbral y emite al Bus `ai.detection` (relevant=true) o `ai.keepalive`.
6) Si hay sesión activa, `FrameIngester` envía frame NV12 + detecciones al Session Store (batching).
7) El Orchestrator consume eventos del Bus y ejecuta comandos: `Start/StopStream`, `Open/CloseSession`, `SetAIFpsMode`.

## Protocolo v1 (resumen)

- Handshake: `Init` → `InitOk(chosen, initial_credits, max_frame_bytes)`.
- Frames: NV12/I420/JPEG (preferido NV12). Planos validados por tamaño/stride.
- Backpressure: créditos iniciales + `WindowUpdate` del Worker; no existe `Ready`.
- Heartbeat: bidireccional cada ~2s; reconexión con backoff.

## Variables de entorno relevantes

- `AI_WORKER_HOST` / `AI_WORKER_PORT` – conexión al Worker
- `AI_MODEL_NAME`, `AI_UMBRAL`, `AI_WIDTH`, `AI_HEIGHT`
- `AI_FPS_IDLE` / `AI_FPS_ACTIVE` – dual‑rate controlado por Orchestrator
- `SOURCE_*` – cámara/RTSP y SHM del hub
- `STORE_*` – batch/flush hacia Session Store

## Métricas clave

- `ai_window_size`, `ai_inflight`, `ai_frames_sent_total`, `ai_drops_latestwins_total`
- `bus_*`, `fsm_transitions_total`
- `frame_bytes_max_hit_total`
