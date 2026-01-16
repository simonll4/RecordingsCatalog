# Operations Guide

This guide covers the day-to-day commands and quick checks to keep the system healthy.

## Monitoring & Status

- **Aggregate logs**  
  ```bash
  docker compose logs -f
  ```
- **Service status**  
  ```bash
  docker compose ps
  ```
- **Edge agent health**  
  Visit `http://localhost:7080/status` or tail the agent logs:
  ```bash
  docker compose logs -f edge-agent
  ```
  
  The manager exposes a REST API for control and monitoring:
  - `GET /status` → Combined manager + agent snapshot
  - `POST /control/start` → Start runtime (optional wait for readiness)
  - `POST /control/stop` → Stop runtime
  
  **Readiness checks**: You can request the manager to wait for specific conditions before responding to start:
  - `wait=heartbeat` → Confirms worker is processing frames (validates framesProcessed >= minFrames)
  - `wait=detection` → Waits for at least one detection
  - `wait=session` → Waits for FSM to open a recording session
  
  The `heartbeat` condition ensures the worker has processed a minimum number of frames (default 3, configurable with `minFrames` parameter), guaranteeing sustained frame processing, not just initial connection.
  
  Example:
  ```bash
  curl -X POST "http://localhost:7080/control/start?wait=heartbeat&timeoutMs=15000&minFrames=5"
  ```
  
- **MediaMTX hook activity**  
  ```bash
  docker compose logs -f mediamtx
  ```

## Verifying the System

1. **Camera connectivity**  
   Use the helper script to confirm RTSP access:
   ```bash
   ./scripts/rtsp_camera_gst.sh view
   ```
2. **Worker AI inference**  
   Look for `Inference done` messages in the worker logs.
3. **Sessions in the UI**  
   Open `http://localhost:3000/`, select a session, and check that playback and overlays load.
4. **Recordings on disk**  
   Clips should appear under `data/recordings/<camera>/<timestamp>.mp4`.

## Common Troubleshooting

| Issue | Checks | Fixes |
|-------|--------|-------|
| Agent cannot reach camera | `docker compose logs edge-agent` | Verify RTSP URL, network reachability, or USB device mapping |
| Worker times out | Verificá que `services/worker-ai/models/yolo11s-custom.onnx` exista (montado como `/models/yolo11s-custom.onnx` en el contenedor) | Re-exportá el modelo o ajustá `[ai].model_name` en el edge-agent para apuntar al archivo correcto |
| No sessions in UI | Check `session-store` logs for errors; confirm PostgreSQL is up | Restart `session-store`, verify database connection string |
| Live view blank | Confirm MediaMTX is running and the agent reports ACTIVE state | Refresh `/control`, or restart the agent profile |

## Rolling Updates

```bash
docker compose pull            # Fetch latest images
docker compose build           # Rebuild local images after code changes
docker compose up -d <service> # Restart specific service
```

## Backups & Data Retention

- **Sessions & metadata**: stored in PostgreSQL (`postgres` volume). Use standard `pg_dump` to back up as needed.
- **Recordings**: MP4 segments under `data/recordings`. Copy or archive this directory according to your retention policy.
- **Tracks**: NDJSON data per session under `data/tracks`. Useful for analytics or reprocessing.

Regularly monitor disk usage if the system records continuously.
