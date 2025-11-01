# System Overview

This project delivers a containerised video capture and analysis stack for smart recording. The platform ingests video from a camera, performs on-device inference, and stores both footage and events so they can be reviewed from a web interface.

## Architecture at a Glance

```
┌────────────┐     ┌────────────┐     ┌─────────────┐
│ edge-agent │ --> │ worker-ai  │ --> │ session-store│
└─────┬──────┘     └─────┬──────┘     └─────┬───────┘
      │                  │                 │
      │                  │                 │
      ▼                  ▼                 ▼
┌────────────┐     ┌────────────┐     ┌─────────────┐
│ mediamtx   │ --> │ postgres   │ --> │ vue-ui      │
└────────────┘     └────────────┘     └─────────────┘
```

- **edge-agent** (Node.js): Pulls video from the camera, manages the finite state machine that decides when to record, and uploads detections and frames to the backend.
- **worker-ai** (Python): Runs YOLO11 inference and optional tracking over frames received from the agent.
- **session-store** (Node.js): Stores session metadata, serves NDJSON tracks, and exposes REST APIs used by the UI.
- **mediamtx**: Acts as the RTSP/WebRTC server, keeps recordings on disk, and notifies the backend through hooks.
- **postgres**: Persists session metadata for search and filtering.
- **vue-ui**: Presents past sessions, playback, and agent control (start/stop + class filters) in the browser.

## Data Flow Summary

1. The agent pulls frames from the camera (RTSP or V4L2) and pushes them through a shared memory hub.
2. Selected frames are sent to `worker-ai`, which returns detections with bounding boxes.
3. When the FSM enters an active state, the agent asks MediaMTX to start recording and opens a session in `session-store`.
4. Detections, JPEG frames, and metadata are uploaded to `session-store`, while MediaMTX writes MP4 segments.
5. Hooks from MediaMTX inform `session-store` when recordings are ready. The UI consumes both the metadata and the MP4 clips.

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
| vue-ui         | `.env` (VITE_*)                    | Backend URLs consumed by the frontend         |

Core services use TOML files committed in the repo. The Vue UI uses environment variables (`VITE_*`) to locate backends.

## Typical Use Cases

- **Security recording**: Automatically record only when people are detected, backing sessions with metadata for quick search.
- **Live monitoring**: View live streams and agent health in the browser via the `/live` view.
- **Data export**: Access tracks and segments in `data/` for offline analysis or integration with other systems.
