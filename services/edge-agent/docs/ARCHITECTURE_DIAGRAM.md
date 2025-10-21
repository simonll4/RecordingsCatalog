# Arquitectura Visual

Diagrama simplificado y alineado con la implementación actual.

```
                                 +--------------------+
                                 |     MediaMTX       |
                                 +--------------------+
                                          ^
                                   RTSP (H.264)
                                          |
   +--------------------------------------------------------------+
   |                        edge-agent                            |
   |                                                              |
   |  +-----------------+      SHM (I420)      +---------------+  |
   |  |  CameraHubGst   | ───────────────────► | PublisherGst  |──┼──► RTSP
   |  | (RTSP/V4L2→I420)|                     +---------------+  |
   |  +-----------------+                            ▲           |
   |              │                                   | commands  |
   |              │ SHM (I420)                        |           |
   |              ▼                                   |           |
   |  +-----------------+     NV12/I420 frames   +-----------+    |
   |  | NV12CaptureGst  | ─────────────────────► | AIFeeder  |    |
   |  +-----------------+                         +-----------+    |
   |                                                   │ send     |
   |                                                   ▼          |
   |                                            +--------------+  |
   |                                            | AIClientTcp  |──┼──► AI Worker
   |                                            +--------------+  |
   |                                                   │ results |
   |                                                   ▼          |
   |  +------------------+  ai.detection/keepalive  +---------+   |
   |  |      Bus         |◄──────────────────────── | main.ts |   |
   |  +------------------+                          +---------+   |
   |          ▲                                           │       |
   |          │                                           │ ingest|
   |          │                               +-------------------+-----+
   |          │                               | FrameIngester (/ingest)  |
   |  +------------------+                    +-------------------------+ |
   |  |  Orchestrator    |  commands: Start/StopStream, Open/CloseSession |
   |  |  (FSM)           |  SetAIFpsMode                                     |
   |  +------------------+                           HTTP                    |
   |          │                                                 ▼            |
   |          │                                           +-----------+      |
   |          └──────────────────────────────────────────► |  Store   |◄─────┘
   |                                                      +-----------+
   +--------------------------------------------------------------+
```

Notas

- El Orchestrator no ingesta detecciones; solo maneja sesiones y streaming.
- `ai.keepalive` no resetea el timer de silencio en ACTIVE.
- El hub SHM permite que Publisher y Captura AI lean en paralelo el mismo stream.
