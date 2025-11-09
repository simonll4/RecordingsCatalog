# Attribute Enricher Integration Documentation

## Overview

The **attribute-enricher** service has been successfully integrated into the RecordingsCatalog system. This service enriches detection records by extracting visual attributes (currently color) from detection crops.

## Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    System Architecture                       │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Edge Agent  │─────▶│ Session Store│◀─────│   Vue UI     │
│ (Detection)  │      │   (Storage)  │      │  (Display)   │
└──────────────┘      └──────┬───────┘      └──────────────┘
                             │
                             │ Database
                             ▼
                      ┌──────────────┐
                      │  PostgreSQL  │
                      │  (detections)│
                      └──────┬───────┘
                             │
                             │ Poll unenriched
                             ▼
                   ┌────────────────────┐
                   │ Attribute Enricher │
                   │                    │
                   │ 1. Fetch detections│
                   │ 2. Load frame      │
                   │ 3. Crop bbox       │
                   │ 4. Extract color   │
                   │ 5. Update DB       │
                   └────────────────────┘
```

## Database Schema Changes

### New Columns in `detections` Table

Two new columns have been added to support attribute enrichment:

```sql
-- JSONB field to store extracted attributes
attributes JSONB DEFAULT NULL

-- Boolean flag to track processing status
enriched BOOLEAN DEFAULT FALSE NOT NULL
```

### Attributes Schema

The `attributes` column stores extracted features in JSON format:

```json
{
  "color": {
    "name": "azul oscuro",
    "rgb": [0.1, 0.2, 0.8],
    "hex": "#1A33CC",
    "confidence": 0.95,
    "family": "blue"
  }
}
```

For failed enrichments:

```json
{
  "error": "Frame not found: /data/frames/session_123/track_5.jpg",
  "enrichment_failed": true
}
```

### Indexes

Two new indexes optimize the enrichment workflow:

```sql
-- Partial index for efficient unenriched detection queries
CREATE INDEX idx_detections_enriched 
  ON detections(enriched) 
  WHERE enriched = FALSE;

-- GIN index for JSON attribute queries
CREATE INDEX idx_detections_attributes 
  ON detections USING GIN(attributes);
```

## Service Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `postgres` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `session_store` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |
| `POLL_INTERVAL_SEC` | Polling interval in seconds | `5` |
| `BATCH_SIZE` | Detections per batch | `10` |
| `FRAMES_BASE_PATH` | Base path for frame images | `/data/frames` |

### Color Provider Configuration

The color provider uses advanced perceptual color analysis:

```yaml
color_provider:
  # Use Spanish descriptive names instead of CSS3
  use_css3_names: false
  
  # Pixel filtering thresholds
  s_min: 0.05        # Minimum saturation
  v_min: 0.02        # Minimum value (brightness)
  v_max: 0.98        # Maximum value
  
  # Preprocessing
  gamma: 1.0         # Gamma correction
  white_balance: true
  blur_radius: 1.0
  
  # Clustering parameters
  min_k: 1           # Minimum clusters
  max_k: 3           # Maximum clusters
  sample_pixels: 5000
  
  # Achromatic detection
  achro_s_th: 0.18
  achro_frac_th: 0.60
```

## Docker Compose Integration

The service is already integrated in `docker-compose.yml`:

```yaml
attribute-enricher:
  build:
    context: ./services/attribute-enricher
  container_name: tpfinalv3-attribute-enricher
  restart: unless-stopped
  depends_on:
    postgres:
      condition: service_healthy
    session-store:
      condition: service_started
  environment:
    TZ: UTC
    DB_HOST: postgres
    DB_PORT: 5432
    DB_NAME: session_store
    DB_USER: postgres
    DB_PASSWORD: postgres
    POLL_INTERVAL_SEC: 5
    BATCH_SIZE: 10
    FRAMES_BASE_PATH: /data/frames
  volumes:
    - ./data/frames:/data/frames
    - /etc/timezone:/etc/timezone:ro
    - /etc/localtime:/etc/localtime:ro
```

## Workflow

### 1. Detection Creation

When the edge-agent or session-store creates a detection:

```typescript
// Default values for new fields
{
  // ... existing fields ...
  attributes: null,
  enriched: false
}
```

### 2. Attribute Enrichment

The attribute-enricher polls for unenriched detections:

```python
# Query executed every POLL_INTERVAL_SEC seconds
SELECT * FROM detections
WHERE enriched = FALSE
ORDER BY created_at ASC
LIMIT batch_size
```

For each detection:
1. Load frame from filesystem: `/data/frames/{session_id}/{frame_file}`
2. Crop to bounding box coordinates
3. Extract color using K-means clustering in CIE Lab space
4. Update database with attributes
5. Mark as `enriched = TRUE`

### 3. Error Handling

If enrichment fails (e.g., frame not found):
- Detection is marked as `enriched = TRUE` (to avoid reprocessing)
- Error information is stored in `attributes.error`
- `attributes.enrichment_failed = true`

## TypeScript Types

Updated types in `session-store/src/types/detection.types.ts`:

```typescript
export interface ColorAttribute {
  name: string;
  rgb: [number, number, number];
  hex?: string;
  confidence?: number;
  family?: string;
}

export interface DetectionAttributes {
  color?: ColorAttribute;
  error?: string;
  enrichment_failed?: boolean;
}

export interface DetectionRecord {
  // ... existing fields ...
  attributes: DetectionAttributes | null;
  enriched: boolean;
}
```

## Migration Files

### `001_initial_schema.sql`
- Creates base tables (`sessions`, `detections`)
- Sets up triggers and base indexes

### `002_add_attributes_enriched.sql`
- Adds `attributes` and `enriched` columns
- Creates optimization indexes
- Adds column comments

Both migrations are idempotent and can be run multiple times safely.

## Deployment

### First Time Setup

```bash
# 1. Start PostgreSQL and run migrations
docker-compose up -d postgres
docker-compose exec postgres psql -U postgres -d session_store -f /docker-entrypoint-initdb.d/001_initial_schema.sql
docker-compose exec postgres psql -U postgres -d session_store -f /docker-entrypoint-initdb.d/002_add_attributes_enriched.sql

# 2. Start all services
docker-compose up -d
```

### Verify Integration

```bash
# Check attribute-enricher logs
docker-compose logs -f attribute-enricher

# Expected output:
# attribute-enricher | Starting attribute enrichment worker
# attribute-enricher | Connected to database at postgres:5432
# attribute-enricher | Poll interval: 5 seconds
# attribute-enricher | Batch size: 10
```

### Query Enriched Data

```sql
-- Get enriched detections with color
SELECT 
  session_id, 
  track_id, 
  cls, 
  attributes->'color'->>'name' as color_name,
  enriched
FROM detections
WHERE enriched = TRUE AND attributes->'color' IS NOT NULL;

-- Get failed enrichments
SELECT 
  session_id, 
  track_id, 
  attributes->>'error' as error_message
FROM detections
WHERE enriched = TRUE AND attributes->>'enrichment_failed' = 'true';

-- Count enrichment status
SELECT 
  enriched, 
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE attributes->'color' IS NOT NULL) as with_color,
  COUNT(*) FILTER (WHERE attributes->>'enrichment_failed' = 'true') as failed
FROM detections
GROUP BY enriched;
```

## Color Analysis Details

The service uses sophisticated color extraction:

### 1. Pixel Filtering
- Filters out uninformative pixels (too dark, too light, too gray)
- Applies white balance and gamma correction

### 2. K-means Clustering
- Clusters colors in CIE Lab space (perceptually uniform)
- Uses 1-3 clusters depending on color variance
- Samples up to 5000 pixels for performance

### 3. Color Naming
- Spanish descriptive names: "azul oscuro", "rojo brillante", "gris"
- Considers hue, saturation, and brightness
- Uses CIEDE2000 for perceptual distance

### 4. Example Color Names

- **Achromatic**: blanco, gris claro, gris, gris oscuro, negro
- **Red family**: rojo brillante, rojo, rojo oscuro
- **Blue family**: azul claro, azul, azul oscuro
- **Green family**: verde claro, verde, verde oscuro
- **Yellow family**: amarillo brillante, amarillo

## Performance Considerations

### Tuning Parameters

**High Volume (many detections)**:
```yaml
worker:
  poll_interval_sec: 2    # Poll more frequently
  batch_size: 20          # Process more per batch

color_provider:
  sample_pixels: 3000     # Reduce for speed
```

**High Accuracy (fewer detections)**:
```yaml
worker:
  poll_interval_sec: 10   # Poll less frequently
  batch_size: 5           # Smaller batches

color_provider:
  sample_pixels: 10000    # More samples for accuracy
  max_k: 5                # More clusters
```

### Database Load

The partial index `idx_detections_enriched` ensures queries remain fast even with millions of enriched detections.

## Future Enhancements

Potential attributes to add:

1. **Size attributes**: relative size classification (small, medium, large)
2. **Shape attributes**: aspect ratio, compactness
3. **Texture attributes**: smooth, rough, patterned
4. **Motion attributes**: speed, direction (from track history)
5. **Temporal attributes**: time of day, duration

To add new attributes:
```python
# In worker._process_detection()
attributes = {
    "color": color_attr,
    "size": self.size_provider.enrich(cropped_image),
    "shape": self.shape_provider.enrich(cropped_image),
}
```

## Troubleshooting

### Service Not Processing

```bash
# Check if service is running
docker-compose ps attribute-enricher

# Check logs
docker-compose logs attribute-enricher

# Verify database columns exist
docker-compose exec postgres psql -U postgres -d session_store -c "\d detections"
```

### Frame Not Found Errors

```bash
# Verify frame path structure
ls -la ./data/frames/

# Check url_frame format in database
docker-compose exec postgres psql -U postgres -d session_store -c "SELECT session_id, track_id, url_frame FROM detections LIMIT 5;"
```

### Slow Processing

- Reduce `sample_pixels` in config
- Increase `batch_size`
- Check disk I/O (frames are read from filesystem)

## API Integration (Future)

For querying enriched attributes via REST API, add to `session-store`:

```typescript
// GET /api/sessions/:sessionId/detections?color=azul
export async function getDetectionsByColor(
  sessionId: string, 
  color: string
): Promise<DetectionRecord[]> {
  return pool.query(`
    SELECT * FROM detections
    WHERE session_id = $1 
    AND attributes->'color'->>'name' LIKE $2
    AND enriched = TRUE
  `, [sessionId, `%${color}%`]);
}
```

## Summary

✅ **Integrated Features**:
- Database schema with `attributes` and `enriched` columns
- Migration files in session-store
- Updated TypeScript types
- Docker Compose configuration
- Automatic polling and processing
- Perceptual color extraction with Spanish names
- Error handling and retry prevention

The attribute-enricher service is now fully integrated and ready for production use.
