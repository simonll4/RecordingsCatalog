# Arquitecturas Visuales

Referencias rápidas para presentar el sistema end-to-end. Cada diagrama está pensado para ser exportado luego a herramientas visuales (Mermaid → SVG/PNG) y acompañarlo con una breve explicación durante la demo.

---

## 1. Panorama General (Servicios / Contenedores)

```mermaid
graph LR
  subgraph Edge Host
    EA[edge-agent\nNode.js/GStreamer] -- TCP + Protobuf --> AI[worker-ai\nPython YOLO]
    EA -- RTSP push + SHM --> MTX[mediamtx\nRTSP + WebRTC]
  end

  MTX -- Hooks HTTP --> SS[session-store\nNode.js + Express]
  SS --- PG[(PostgreSQL)]

  EA -- HTTP ingest/status --> SS
  UI[vue-ui\nVite/Vue SPA] -- REST/WebRTC --> EA
  UI -- REST/Playback --> SS
  UI -- WHEP/HLS --> MTX

  SS -. Files .-> Tracks[data/tracks]
  MTX -. Segments .-> Recs[data/recordings]
```

**Idea clave**: edge-agent coordina captura/IA/RTSP. worker-ai procesa detecciones. mediamtx guarda segmentos y expone live (WHEP). session-store centraliza sesiones/detecciones y se apoya en PostgreSQL. La UI consume tanto la API como los streams.

---

## 2. Flujo de Detección → Grabación → Catálogo

```mermaid
sequenceDiagram
  participant Cam as Cámara / RTSP
  participant EA as edge-agent
  participant AI as worker-ai
  participant MTX as mediamtx
  participant SS as session-store
  participant UI as vue-ui

  Cam->>EA: Frames (RTSP → SHM)
  EA->>AI: Init + Frames (TCP + Protobuf)
  AI-->>EA: Result (detecciones + tracks)
  EA->>EA: FSM (IDLE→DWELL→ACTIVE)
  EA->>SS: POST /sessions/open
  EA->>MTX: RTSP publish (record path)
  MTX-->>SS: Hook /hooks/mediamtx/publish
  loop Mientras ACTIVE
    EA->>SS: POST /ingest (JPEG + detecciones)
    MTX-->>SS: Hook segment_complete
  end
  EA->>SS: POST /sessions/close
  UI->>SS: GET /sessions /tracks/*
  UI-->>MTX: GET /recordings + WHEP /control
```

**Mensajes destacados**:
- `POST /ingest` contiene `meta` + `frame` (JPEG) para timeline UI.
- Hooks informan timestamps y paths exactos de cada segmento MP4.
- La UI reusa `recommended_start_offset_ms` para posicionarse en el clip correcto.

---

## 3. Plano de Datos

```mermaid
graph TD
  subgraph Disk
    REC[data/recordings/<cam>/<ts>.mp4]
    FRAMES[data/frames/<session>/track_*.jpg]
    TRACKS[data/tracks/<session>/meta.json\nindex.json\ntracks/seg-xxxx.jsonl]
  end

  EA -->|JPEG + detecciones| SS[(session-store)]
  SS -->|write| FRAMES
  AI -->|tracks JSONL| TRACKS
  MTX -->|mp4 segments| REC
  SS -->|metadata| PG[(PostgreSQL)]

  UI -->|API| SS
  UI -->|Playback HTTP| REC
  UI -->|Tracks NDJSON| TRACKS
```

**Notas**:
- `data/frames`: evidencias asociadas a detecciones con mayor confianza.
- `data/tracks`: timeline completo por sesión (BoT-SORT) para overlays.
- `data/recordings`: MP4 segmentados (5 min) servidos por la API de MediaMTX.

---

## 4. Control Plane (Supervisor Edge Agent + UI)

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Starting : POST /control/start?wait=heartbeat\nManager spawns runtime\nEDGE_AGENT_CLASSES_FILTER override
  Starting --> Running : Child /status OK
  Running --> Running : UI polls /status (framesProcessed, session, overrides)
  Running --> Stopping : POST /control/stop
  Stopping --> Idle : Child exits (SIGTERM/SIGKILL fallback)

  Running --> Running : PUT /config/classes (persist override)\nrestart required to apply
```

**Puntos de conversación**:
- El manager (`npm run dev`) es quien expone la API para la UI (no sirve assets).
- `wait=heartbeat&minFrames=N` garantiza que realmente se están procesando frames antes de dar feedback positivo al usuario.
- Overrides persistidos en `runtime-overrides.json` permiten ajustar clases desde la UI sin editar el TOML.

---

> Para exportar: copiar cada bloque ` ```mermaid ` a https://mermaid.live o VS Code + plugin Mermaid, ajustar estilos corporativos y generar SVG/PNG para la presentación.

---

## 5. Diagramas de bloques (texto)

Para presentaciones o documentos donde no se quiera renderizar Mermaid podés usar estos bloques ASCII.

### 5.1 Panorama general

```
┌────────────┐        RTSP        ┌────────────────────────┐        HTTP/WebRTC        ┌──────────────┐
│Camera/RTSP │───────────────────►│ edge-agent (FSM+GST)   │◄────────────────────────►│   vue-ui     │
└────────────┘                    │  - captura             │                           │ (SPA Vite)   │
                                  │  - IA / worker client │                           └─────┬────────┘
                                  │  - publicación RTSP   │                                 │
                                  └────┬──────────┬───────┘                                 │
                                       │          │                                         │
                                       │ TCP      │ HTTP ingest                             │
                               ┌───────▼───┐  ┌───▼────────────────┐             ┌──────────▼────────┐
                               │ worker-ai │  │ session-store API  │◄───────────►│  MediaMTX (RTSP)  │
                               │ (YOLO)    │  │ + PostgreSQL       │   Hooks     │  + WebRTC/HLS     │
                               └───────────┘  └──────────┬─────────┘             └──────────┬────────┘
                                                         │                               data/recordings
                                              data/tracks│data/frames
```

### 5.2 Flujo detección → grabación → catálogo

```
┌───────┐     SHM/I420      ┌──────────────┐     NV12/TCP     ┌────────┐
│Camera │ ────────────────► │ edge-agent   │ ───────────────► │worker- │
└──┬────┘                   │ - CameraHub  │                  │  ai    │
   │                        │ - NV12Capture│                  └──┬─────┘
   │                        │ - AIFeeder   │                     │ Result (detecciones)
   │                        └────┬─────────┘                     │
   │        Hooks + RTSP         │     Frame + meta              │
   ▼                             ▼          │                    │
┌────────┐   RTSP push   ┌────────────┐     │POST /ingest  ┌─────▼─────────┐      REST/WHEP     ┌──────────────┐
│MediaMTX│◄──────────────│Publisher   │─────┘─────────────►│session-store │◄──────────────────►│   vue-ui     │
└────────┘   MP4/HLS     └────────────┘   close session    │+ PostgreSQL  │   /sessions,tracks │ (catálogo)   │
   ▲                                           ▲           └──────────────┘                    └──────────────┘
   │ segment_complete hooks                    │
   └────────────── (Media ready feedback) ─────┘
```

Pasos clave: captura → detección → apertura de sesión → ingesta (`/ingest`) → grabación MediaMTX → hooks → consumo desde la UI.

### 5.3 Plano de datos

```
┌──────────────┐    multipart    ┌────────────────┐
│ edge-agent   │───────────────►│ session-store   │
│ FrameIngester│                │  API            │
└─────┬────────┘                └──────┬──────────┘
      │ writes JPEGs/metadata         │
      ▼                                ▼
┌──────────────┐               ┌─────────────────┐
│ data/frames  │               │ PostgreSQL      │
│ track_ID.jpg │               │ sessions/detect │
└──────────────┘               └─────────────────┘

┌──────────────┐    NDJSON      ┌──────────────┐
│ worker-ai    │──────────────►│ data/tracks  │
│ SessionWriter│               │ meta/index   │
└──────────────┘               └──────────────┘

┌──────────────┐   MP4 segments ┌────────────────┐
│ MediaMTX     │──────────────► │ data/recordings│
└─────┬────────┘                └────────────────┘
      │ hooks notify path
      ▼
┌──────────────┐
│ session-store│ updates media_* timestamps
└──────────────┘

La UI consume:
  • REST `session-store` (catálogo / tracks meta)
  • `data/recordings` vía MediaMTX playback API
  • `data/tracks/*` para overlays
```
