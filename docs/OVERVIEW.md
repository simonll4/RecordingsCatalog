# System Overview

This project delivers a containerised video capture and analysis stack for smart recording. The platform ingests video from a camera, performs on-device inference, and stores both footage and events so they can be reviewed from a web interface.

## Architecture at a Glance

```
             TCP + Protobuf
        ┌─────────────────────┐
        │      worker-ai      │
        └────────▲────────────┘
                 │
┌──────────────┐ │   HTTP ingest/status    ┌────────────────────┐
│  edge-agent  │─┼────────────────────────►│  session-store API │◄─────┐
└──────┬───────┘ │                         └────────┬──────────┘      │
       │         │                                  │                 │ REST (sessions, control)
       │         │                                  │ SQL             │
       │         │                                  ▼                 │
       │         │                         ┌────────────────┐         │
       │         │                         │   PostgreSQL    │         │
       │         │                         └────────────────┘         │
       │         │
       │         │ hooks (HTTP)                 ▲                     │
       ▼         └──────────────────────────────┘                     │
┌──────────────┐         RTSP push + recording    │                   │
│   mediamtx   │◄─────────────────────────────────┘                   │
│ (RTSP/WHEP)  │                                                       │
└──────┬──────┘                                                       │
       │ WebRTC / playback REST                                       │
       │                                                              │
       └────────────────────────────────────────┬─────────────────────┘
                                                │
                                                ▼
                                        ┌──────────────┐
                                        │    ui-vue    │
                                        │ (catalog +   │
                                        │  control)    │
                                        └──────────────┘
```

- **edge-agent** (Node.js): Captures video, drives the finite state machine that decides when to record, pushes RTSP to MediaMTX, and ingests detections + frames into the backend.
- **worker-ai** (Python): Runs YOLO11 inference (with optional tracking) over frames received via the TCP protocol and returns detections to the agent.
- **session-store** (Node.js + PostgreSQL): Persists session metadata and detections, serves track files and metadata, and receives hook callbacks from MediaMTX.
- **mediamtx**: RTSP/WebRTC server that receives the agent stream, records MP4 segments under `data/recordings`, exposes playback endpoints, and notifies the session-store when new segments are ready.
- **postgres**: Database backing the session-store for querying sessions, detections, and metadata.
- **ui-vue**: Vue 3 SPA that consumes both the session-store (catalog/control API) and MediaMTX (playback/WebRTC) endpoints.

## Data Flow Summary

1. The agent pulls frames from the camera (RTSP or V4L2) and pushes them through a shared memory hub.
2. Selected frames are sent to `worker-ai`, which returns detections with bounding boxes.
3. When the FSM enters an active state, the agent asks MediaMTX to start recording and opens a session in `session-store`.
4. Detections, JPEG frames, and metadata are uploaded to `session-store`, while MediaMTX writes MP4 segments under `data/recordings`.
5. Hooks from MediaMTX inform `session-store` when recordings are ready and update media timestamps.
6. The UI polls `session-store` for catalog data and pulls live/playback streams from MediaMTX (WHEP/HTTP playback).

## Key Directories

```
services/worker-ai/models/  # ONNX models consumed by worker-ai
data/recordings/  # MP4 segments created by MediaMTX
data/tracks/      # JSON tracks generated per session
services/         # Source code for each service
docs/             # This documentation set
```

## Configuration Snapshot

| Component      | File                               | Highlights                                    |
|----------------|------------------------------------|-----------------------------------------------|
| edge-agent     | `services/edge-agent/config.toml`  | Camera source, FSM timers, AI worker address  |
| worker-ai      | `services/worker-ai/config.toml`   | Model path, tracker options, visualisation    |
| session-store  | `services/session-store/config.toml` | Database URL and paths for frames/tracks    |
| ui-vue         | `.env` (VITE_*)                    | Backend URLs consumed by the frontend         |

Core services use TOML files committed in the repo. The ui-vue frontend uses environment variables (`VITE_*`) to locate backends.

## Typical Use Cases

- **Security recording**: Automatically record only when people are detected, backing sessions with metadata for quick search.
- **Live monitoring**: View live streams and agent health from the unified `/control` view.
- **Data export**: Access tracks and segments in `data/` for offline analysis or integration with other systems.
