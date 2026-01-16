# Attribute Enricher - System Integration Diagram

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RecordingsCatalog System                            │
└─────────────────────────────────────────────────────────────────────────────┘

                                                    ┌──────────────┐
                                                    │   Vue UI     │
                                                    │  (Display)   │
                                                    └──────┬───────┘
                                                           │
                                                           │ GET /api/sessions
                                                           │ GET /detections
                                                           ▼
┌────────────┐         ┌────────────┐           ┌─────────────────┐
│   Camera   │  RTSP   │  MediaMTX  │           │ Session Store   │
│   Source   ├────────▶│  (Stream)  │           │   (REST API)    │
└────────────┘         └─────┬──────┘           └────────┬────────┘
                             │                           │
                             │ Webhook                   │
                             │ (on_publish)              │ INSERT detections
                             ▼                           │
                     ┌───────────────┐                  │
                     │  Edge Agent   │                  │
                     │  (AI Frame    │                  │
                     │   Pipeline)   │──────────────────┘
                     └───────────────┘   POST /ingest


                  ┌──────────────────────────────────────┐
                  │         PostgreSQL Database          │
                  │                                      │
                  │  ┌──────────────────────────────┐   │
                  │  │     sessions table           │   │
                  │  │  - session_id (PK)           │   │
                  │  │  - device_id                 │   │
                  │  │  - start_ts, end_ts          │   │
                  │  │  - detected_classes[]        │   │
                  │  └──────────────────────────────┘   │
                  │                                      │
                  │  ┌──────────────────────────────┐   │
                  │  │     detections table         │   │
                  │  │  - session_id (FK)           │   │
                  │  │  - track_id                  │   │
                  │  │  - cls, conf, bbox           │   │
                  │  │  - url_frame                 │   │
                  │  │  - attributes (JSONB) ◄──┐   │   │
                  │  │  - enriched (BOOLEAN) ◄──┤   │   │
                  │  └──────────────────────────┘   │   │
                  │           ▲                 ▲   │   │
                  │           │ Poll            │   │   │
                  │           │ WHERE           │   │   │
                  │           │ enriched=FALSE  │   │   │
                  │           │                 │   │   │
                  └───────────┼─────────────────┼───┼───┘
                              │                 │   │
                              │                 │   │
                     ┌────────┴────────┐        │   │
                     │   Attribute     │        │   │
                     │   Enricher      │────────┘   │
                     │                 │   UPDATE    │
                     │  Worker Loop:   │   SET attrs │
                     │  1. Poll DB     │   enriched=T│
                     │  2. Load frame  │             │
                     │  3. Crop bbox   │             │
                     │  4. Extract     │             │
                     │     color       │             │
                     │  5. Update DB   │             │
                     └─────────────────┘             │
                              │                      │
                              │ Read frames          │
                              ▼                      │
                     ┌─────────────────┐             │
                     │  Filesystem     │             │
                     │  /data/frames/  │             │
                     │   session_id/   │             │
                     │    track_X.jpg  │             │
                     └─────────────────┘             │
                                                     │
                              New Fields ────────────┘
```

## Data Flow Diagram

```
Step 1: Detection Creation
═════════════════════════════════════════════════════════════════════════

Edge Agent detects object → POST /ingest → Session Store

{
  "sessionId": "sess_cam-local_1762403230448_1",
  "trackId": "track_5",
  "cls": "car",
  "conf": 0.92,
  "bbox": {"x": 100, "y": 200, "w": 150, "h": 200},
  "captureTs": "2025-11-08T10:30:00Z",
  "urlFrame": "/frames/sess_cam-local_1762403230448_1/track_5.jpg"
}

        ↓ INSERT into detections table

{
  "session_id": "sess_cam-local_1762403230448_1",
  "track_id": "track_5",
  "cls": "car",
  "conf": 0.92,
  "bbox": {"x": 100, "y": 200, "w": 150, "h": 200},
  "url_frame": "/frames/sess_cam-local_1762403230448_1/track_5.jpg",
  "attributes": null,           ← NEW: Empty initially
  "enriched": false,            ← NEW: Not processed yet
  "created_at": "2025-11-08T10:30:01Z"
}


Step 2: Attribute Enrichment (5 seconds later)
═════════════════════════════════════════════════════════════════════════

Attribute Enricher polls database:

SELECT * FROM detections 
WHERE enriched = FALSE 
ORDER BY created_at ASC 
LIMIT 10;

        ↓ Returns detection record

Enricher processes:
  1. Load image from /data/frames/sess_cam-local_1762403230448_1/track_5.jpg
  2. Crop to bbox [100, 200, 150, 200]
  3. Color analysis:
     - Filter pixels (saturation, brightness)
     - K-means clustering in CIE Lab space
     - Select dominant cluster
     - Map to Spanish color name
  4. Generate attributes object

        ↓ UPDATE detections

UPDATE detections 
SET attributes = '{
  "color": {
    "name": "azul oscuro",
    "rgb": [0.15, 0.25, 0.75],
    "hex": "#2640BF",
    "confidence": 0.93,
    "family": "blue"
  }
}'::jsonb,
enriched = TRUE,
updated_at = CURRENT_TIMESTAMP
WHERE session_id = 'sess_cam-local_1762403230448_1' 
  AND track_id = 'track_5';


Step 3: Query Enriched Data
═════════════════════════════════════════════════════════════════════════

Vue UI requests enriched detections:

GET /api/sessions/sess_cam-local_1762403230448_1/detections

        ↓ Session Store queries

SELECT * FROM detections 
WHERE session_id = 'sess_cam-local_1762403230448_1'
ORDER BY last_ts ASC;

        ↓ Returns with enriched attributes

[
  {
    "session_id": "sess_cam-local_1762403230448_1",
    "track_id": "track_5",
    "cls": "car",
    "conf": 0.92,
    "bbox": {"x": 100, "y": 200, "w": 150, "h": 200},
    "url_frame": "/frames/sess_cam-local_1762403230448_1/track_5.jpg",
    "attributes": {
      "color": {
        "name": "azul oscuro",
        "rgb": [0.15, 0.25, 0.75],
        "hex": "#2640BF",
        "confidence": 0.93,
        "family": "blue"
      }
    },
    "enriched": true,
    "created_at": "2025-11-08T10:30:01Z",
    "updated_at": "2025-11-08T10:30:06Z"
  }
]

        ↓ Vue UI displays

┌─────────────────────────────────────────┐
│  Detection: track_5                     │
│  Class: car (92%)                       │
│  Color: 🔵 azul oscuro                  │
│  Captured: 10:30:00                     │
│  [View Frame] [View Track]              │
└─────────────────────────────────────────┘
```

## Database Schema Details

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          detections table                               │
├────────────────┬──────────────┬──────────────┬─────────────────────────┤
│ Column         │ Type         │ Nullable     │ Description             │
├────────────────┼──────────────┼──────────────┼─────────────────────────┤
│ session_id     │ TEXT         │ NOT NULL     │ FK to sessions          │
│ track_id       │ TEXT         │ NOT NULL     │ Unique track ID         │
│ cls            │ TEXT         │ NOT NULL     │ Object class            │
│ conf           │ NUMERIC      │ NOT NULL     │ Confidence 0-1          │
│ bbox           │ JSONB        │ NOT NULL     │ Bounding box coords     │
│ url_frame      │ TEXT         │ NULL         │ Path to frame image     │
│ first_ts       │ TIMESTAMPTZ  │ NOT NULL     │ First detection time    │
│ last_ts        │ TIMESTAMPTZ  │ NOT NULL     │ Last detection time     │
│ capture_ts     │ TIMESTAMPTZ  │ NOT NULL     │ Frame capture time      │
│ ingest_ts      │ TIMESTAMPTZ  │ NOT NULL     │ Ingestion time          │
│ created_at     │ TIMESTAMPTZ  │ NOT NULL     │ Record creation         │
│ updated_at     │ TIMESTAMPTZ  │ NOT NULL     │ Last update             │
│ attributes     │ JSONB        │ NULL         │ 🆕 Enriched attributes  │
│ enriched       │ BOOLEAN      │ NOT NULL     │ 🆕 Processing status    │
└────────────────┴──────────────┴──────────────┴─────────────────────────┘

Primary Key: (session_id, track_id)

Indexes:
  - idx_detections_session ON (session_id)
  - idx_detections_last_ts ON (last_ts)
  - idx_detections_cls ON (cls)
  - idx_detections_enriched ON (enriched) WHERE enriched = FALSE  🆕
  - idx_detections_attributes USING GIN(attributes)  🆕
```

## Attribute Structure

```json
{
  "attributes": {
    "color": {
      "name": "azul oscuro",           // Spanish descriptive name
      "rgb": [0.15, 0.25, 0.75],       // Normalized RGB [0-1]
      "hex": "#2640BF",                // Optional hex code
      "confidence": 0.93,              // Optional analysis confidence
      "family": "blue"                 // Optional color family
    }
  }
}
```

## Service Dependencies

```
┌──────────────────────────────────────────────────────────────────┐
│                   Service Dependency Graph                       │
└──────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │  PostgreSQL  │
                    │   (storage)  │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          │                │                │
┌─────────▼─────┐  ┌───────▼──────┐  ┌─────▼──────────┐
│ Session Store │  │ Attribute    │  │   Vue UI       │
│               │  │ Enricher     │  │                │
│ - API         │  │              │  │ - Dashboard    │
│ - Migrations  │  │ - Color      │  │ - Search       │
│ - Detections  │  │   analysis   │  │ - Display      │
└───────▲───────┘  │ - Polling    │  └────────────────┘
        │          │   worker     │
        │          └──────────────┘
        │
┌───────┴────────┐
│  Edge Agent    │
│                │
│ - Frame proc.  │
│ - AI detect.   │
│ - Ingestion    │
└────────────────┘
```

## Configuration Files

```
services/
├── session-store/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql          🆕 Base schema
│   │   └── 002_add_attributes_enriched.sql 🆕 Enrichment columns
│   ├── src/
│   │   ├── types/
│   │   │   └── detection.types.ts          ✏️ Updated types
│   │   └── database/
│   │       ├── migrations.ts               ✏️ Added column creation
│   │       └── repositories/
│   │           └── detection.repository.ts ✏️ Added query methods
│   └── config.toml
│
└── attribute-enricher/
    ├── config.yaml                         ✓ Exists
    ├── Dockerfile                          ✓ Exists
    ├── requirements.txt                    ✓ Exists
    ├── README.md                           ✓ Exists
    ├── INTEGRATION.md                      🆕 Integration guide
    ├── API_REFERENCE.md                    🆕 API reference
    └── src/
        ├── main.py                         ✓ Exists
        ├── worker.py                       ✏️ Removed schema check
        ├── database/
        │   └── db_client.py                ✏️ Removed ensure_columns
        └── core/
            └── providers/
                └── color_provider.py       ✓ Exists
```

## Timeline of Operations

```
T=0s    : Detection ingested by edge-agent
          └─▶ INSERT into detections (enriched=FALSE, attributes=NULL)

T=1-4s  : Detection waiting in database
          └─▶ SELECT WHERE enriched=FALSE returns this detection

T=5s    : Attribute enricher polls database
          └─▶ Finds unenriched detection

T=5.1s  : Load frame from filesystem
          └─▶ /data/frames/session_id/track_X.jpg

T=5.2s  : Crop image to bounding box
          └─▶ Extract region of interest

T=5.3s  : Color analysis
          ├─▶ Filter pixels (saturation, brightness)
          ├─▶ K-means clustering (1-3 clusters)
          ├─▶ Select dominant cluster
          └─▶ Map to Spanish color name

T=5.4s  : Update database
          └─▶ UPDATE detections SET attributes='{...}', enriched=TRUE

T=5.5s  : Detection now enriched and queryable
          └─▶ Available for API queries and UI display

T=10s   : Next poll cycle begins
          └─▶ SELECT WHERE enriched=FALSE (this detection excluded)
```

## Color Analysis Pipeline

```
┌────────────────────────────────────────────────────────────────┐
│              Color Extraction Pipeline                         │
└────────────────────────────────────────────────────────────────┘

Input: Cropped Image (BGR from OpenCV)
  │
  ├─▶ Convert to RGB
  │
  ├─▶ Preprocess
  │   ├─ White balance (optional)
  │   ├─ Gamma correction (default: 1.0)
  │   ├─ Histogram equalization (optional)
  │   └─ Gaussian blur (radius: 1.0)
  │
  ├─▶ Filter Pixels
  │   ├─ Saturation > 0.05
  │   ├─ Value > 0.02 and < 0.98
  │   └─ Sample up to 5000 pixels
  │
  ├─▶ Convert to CIE Lab (perceptually uniform)
  │
  ├─▶ K-means Clustering
  │   ├─ Try k=1, k=2, k=3 clusters
  │   ├─ Select optimal k by silhouette score
  │   └─ Get cluster centroids
  │
  ├─▶ Select Dominant Cluster
  │   └─ Choose cluster with most pixels
  │
  ├─▶ Convert back to RGB
  │
  ├─▶ Determine Color Family
  │   ├─ Calculate hue
  │   ├─ Check if achromatic (low saturation)
  │   │   └─ If yes: white/gray/black by value
  │   └─ If chromatic: red/orange/yellow/green/cyan/blue/purple
  │
  ├─▶ Generate Spanish Name
  │   ├─ Family name (rojo, azul, verde, etc.)
  │   ├─ Brightness modifier (claro, oscuro)
  │   └─ Intensity modifier (brillante for high saturation)
  │
  └─▶ Output: ColorAttribute
      {
        "name": "azul oscuro",
        "rgb": [0.15, 0.25, 0.75],
        "hex": "#2640BF",
        "confidence": 0.93,
        "family": "blue"
      }
```

This completes the visual representation of the attribute-enricher integration!
