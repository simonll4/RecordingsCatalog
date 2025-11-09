# Arquitectura General del Sistema

Este diagrama resume los componentes principales y los flujos entre captura, inferencia, catálogo y reproducción.

```mermaid
flowchart LR
  %% Nodos principales
  Cam[Camera]
  Edge[Edge Agent]
  Worker[[Worker AI]]
  MTX[(MediaMTX)]
  Store[(Session Store)]
  DB[(PostgreSQL)]
  Obj[(Object Storage /data)]
  UI[Vue UI]

  %% Captura e inferencia
  Cam -->|RTSP H264 pull| Edge
  Edge -->|Frames TCP Protobuf| Worker
  Worker -->|Detections frameId| Edge
  
  %% Ingesta y catálogo
  Edge -->|Ingest meta.json and frame.jpg| Store
  Store -->|Write frames JPEG| Obj
  Worker -->|Write tracks meta index ndjson| Obj
  Store <-->|Read frames tracks| Obj
  Store -->|Persist sessions detections| DB
  
  %% Streaming y hooks
  Edge -->|RTSP publish live record| MTX
  MTX -->|Write segments MP4| Obj
  MTX -->|Hooks publish segment| Store
  
  %% Consumo desde UI
  UI -->|REST sessions tracks| Store
  UI -->|Playback GET WebRTC| MTX
```

Notas rápidas
- Edge Agent captura desde la cámara, envía frames al Worker AI por TCP/Protobuf y recibe detecciones referenciadas por `frameId`.
- Frame Ingester del Edge envía evidencias a Session Store como multipart: `meta.json` + `frame.jpg`.
- Worker AI escribe artefactos de tracks (meta/index/NDJSON) en Object Storage (/data); Session Store los sirve a la UI.
- MediaMTX recibe el RTSP del Edge (live/record), escribe segmentos MP4 en Object Storage y notifica a Session Store mediante hooks (publish/segment) para fijar `media_*`.
- Vue UI consulta a Session Store para catálogo y overlays, y pide playback a MediaMTX.
