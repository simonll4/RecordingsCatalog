# Setup Guide

Follow these steps to bring the stack online on a development machine. For production, the same containers can be orchestrated with Docker Compose on a host that has access to the target cameras.

## 1. Prerequisites

- Docker and Docker Compose v2
- Node.js 20+ (only required for local development outside Docker)
- Python 3.10+ (only required if you plan to run the worker outside Docker)
- Access to a camera: RTSP stream or USB/V4L2 device

## 2. Prepare Models and Data Directories

```bash
# From the repository root
# Ejemplo (si necesitás regenerar el modelo base):
# python services/worker-ai/scripts/export_yolo11s_to_onnx.py
# Resultado esperado para producción: `services/worker-ai/models/yolo11s-custom.onnx`

mkdir -p data/recordings data/tracks data/frames
```

## 3. Start the Stack

```bash
# Base services (database, session-store, UI, media server)
docker compose up -d

# Optional: start the edge agent profile (requires camera access)
docker compose --profile edge up -d edge-agent
```

> ℹ️ El `worker-ai` se expone en `docker-compose.yml` pero está comentado. Podés ejecutarlo en el host para depurar o habilitar el contenedor descomentando la sección correspondiente.

Useful commands:

```bash
docker compose logs -f                # Tail all services
docker compose ps                     # Check container status
docker compose down                   # Stop everything
```

## 4. Camera Options

### RTSP Camera
- Set the RTSP URI in `services/edge-agent/config.toml` under `[source]`.
- Ensure the host running Docker can reach the camera IP.

### USB / V4L2 Camera
- Add device mappings to the `edge-agent` service inside `docker-compose.yml`:
  ```yaml
  edge-agent:
    devices:
      - "/dev/video0:/dev/video0"
    group_add:
      - "44"        # Replace with the host's video group GID
    privileged: true
  ```
- Restart the agent profile afterwards.

### No Camera Available?
- Point the agent at a public RTSP feed (e.g. Big Buck Bunny).
- Or run the agent outside Docker (`npm run dev`) and use a synthetic source (v4l2loopback or GStreamer test patterns).

## 5. Frontend Access

- Recordings catalogue: `http://localhost:3000/`
- Live stream + control panel: `http://localhost:3000/control`

If you expose the UI on another host, set `VITE_*` env vars for the ui-vue container to point to the correct backends (see `services/vue-ui/README.md`).

## 6. Local Development (Optional)

To work on services without containers:

```bash
# Edge agent
cd services/edge-agent
npm install
npm run dev

# Worker AI with visualization
cd ../worker-ai
conda/mamba env create -f environment.yml
mamba activate worker-ai
python worker.py
```

Ensure the locally running services still reach the camera and MediaMTX instances (using hostnames or `host.docker.internal` as needed).
