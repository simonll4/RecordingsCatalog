# Arquitectura Visual

Diagrama simplificado y alineado con la implementación actual.

```mermaid
flowchart LR
  subgraph EdgeAgent
    CAMHUB[CameraHubGst RTSP->I420]
    PUB[PublisherGst RTSP push]
    CAP[NV12CaptureGst]
    FEED[AIFeeder AIClientTcp]
    SM[SessionManager FrameCache]
    ORCH[Orchestrator FSM]
    ING[FrameIngester ingest]
  end

  Cam[Camera] -->|RTSP pull| CAMHUB
  CAMHUB -->|SHM I420| CAP
  CAMHUB -->|SHM I420| PUB
  CAP -->|NV12/I420 frames| FEED
  FEED -->|result frameId dets| SM
  SM -->|NV12 and meta| ING
  FEED -->|TCP and Protobuf| WorkerAI[[Worker AI]]
  WorkerAI -->|infer results| FEED
  FEED -->|ai.detection / keepalive| ORCH
  ORCH -->|Start/StopStream| PUB
  ORCH -->|Open/Close session| SessionStore[(Session Store)]
  ING -->|frames + detections| SessionStore
  WorkerAI -->|track meta/index| SessionStore

  PUB -->|RTSP H.264| MediaMTX[(MediaMTX)]
  MediaMTX -->|publish/segment hooks| SessionStore

  SessionStore -->|sessions + detections| DB[(PostgreSQL)]
  SessionStore -->|frames/tracks/meta| VueUI[Vue UI]
  VueUI -->|playback request| MediaMTX
  VueUI -->|WebRTC live WHEP| MediaMTX
```

Notas

- Edge-Agent encapsula captura (CameraHub/NV12Capture), inferencia (AIFeeder + AIClientTcp) y control (Orchestrator + FrameIngester). Cada módulo aparece como bloque dentro del subgrafo.
- El Orchestrator es el único que emite comandos de streaming y sesiones; los eventos `ai.detection/keepalive` llegan desde AIFeeder tras procesar la respuesta del Worker.
- Session-Store persiste todo (PostgreSQL + archivos) y también recibe los hooks de MediaMTX para guardar `media_*` timestamps antes de exponerlos a la UI.

## Edge-Agent (interno)

```mermaid
flowchart TB
  %% Legend: dashed (-.->) = events via Event Bus; solid (--> ) = calls/HTTP/in-process
  subgraph EdgeAgentInternal [Edge-Agent internal]
    HUB[Camera Hub RTSP to I420]
    CAP[NV12 Capture]
    FEED[AI Feeder TCP]
    SM[Session Manager Frame Cache]
    BUS[Event Bus]
    ORCH[Orchestrator FSM]
    PUB[RTSP Publisher]
    ING[Frame Ingester]
    CONF[Config Loader classes]
    STORECLIENT[Store HTTP Client]
    STATUS[Status Service]
  end

  HUB -->|SHM I420| CAP
  HUB -->|SHM I420| PUB
  CAP -->|NV12 frames| FEED
  CONF -->|init classes filter| FEED

  %% Inference and events
  FEED -->|cache NV12 captureTs by frameId| SM
  FEED -->|send frames over TCP Protobuf| WORKER[[Worker AI]]
  WORKER -->|detections with frameId| FEED
  FEED -.->|publish ai.detection keepalive| BUS

  %% Orchestrator and session lifecycle
  BUS -.->|ORCH subscribes ai.*| ORCH
  ORCH -.->|publish session.*| BUS
  BUS -.->|SM subscribes session.*| SM
  ORCH -->|set session id| FEED

  %% Ingest path
  FEED -->|detections with frameId| SM
  SM -->|NV12 frame captureTs detections sessionId seqNo| ING
  ING -->|meta.json and frame.jpg| STORE[(Session Store)]
  ORCH -->|sessions open close| STORECLIENT
  STORECLIENT -->|HTTP requests| STORE

  %% Streaming control
  ORCH -->|start/stop stream| PUB
  PUB -->|RTSP record path| MTX[(MediaMTX)]
  PUB -->|RTSP live path| MTX

  %% Status reporting
  ORCH -->|state updates| STATUS
```
