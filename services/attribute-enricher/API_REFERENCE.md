# API Quick Reference - Attribute Enricher Integration

## New Detection Repository Methods

### 1. Get Enriched Detections

Get only detections that have been processed by the attribute-enricher service:

```typescript
import { DetectionRepository } from './repositories/detection.repository';

const repo = new DetectionRepository();

// Get all enriched detections for a session
const enrichedDetections = await repo.findEnrichedBySession('sess_cam-local_1762403230448_1');

console.log(enrichedDetections[0].attributes);
// Output:
// {
//   color: {
//     name: 'azul oscuro',
//     rgb: [0.1, 0.2, 0.8],
//     hex: '#1A33CC',
//     confidence: 0.95,
//     family: 'blue'
//   }
// }
```

### 2. Search by Color

Find detections by color name (case-insensitive, supports partial matches):

```typescript
// Find all blue detections
const blueDetections = await repo.findByColor('sess_cam-local_1762403230448_1', 'azul');

// Find red detections
const redDetections = await repo.findByColor('sess_cam-local_1762403230448_1', 'rojo');

// Find dark colors
const darkDetections = await repo.findByColor('sess_cam-local_1762403230448_1', 'oscuro');
```

### 3. Get Enrichment Statistics

Get aggregated stats about enrichment progress:

```typescript
// Stats for a specific session
const sessionStats = await repo.getEnrichmentStats('sess_cam-local_1762403230448_1');

console.log(sessionStats);
// Output:
// {
//   total: 150,        // Total detections
//   enriched: 145,     // Successfully processed
//   with_color: 142,   // Have color attribute
//   failed: 3          // Enrichment failed
// }

// Stats for all sessions
const globalStats = await repo.getEnrichmentStats();
```

## SQL Query Examples

### Basic Queries

```sql
-- Get all enriched detections with color info
SELECT 
  session_id,
  track_id,
  cls,
  conf,
  attributes->'color'->>'name' as color_name,
  attributes->'color'->>'hex' as color_hex,
  attributes->'color'->'rgb' as color_rgb,
  enriched,
  created_at
FROM detections
WHERE enriched = TRUE
  AND attributes->'color' IS NOT NULL
ORDER BY created_at DESC;

-- Count detections by color
SELECT 
  attributes->'color'->>'name' as color,
  COUNT(*) as count
FROM detections
WHERE enriched = TRUE
  AND attributes->'color' IS NOT NULL
GROUP BY attributes->'color'->>'name'
ORDER BY count DESC;

-- Find specific color patterns
SELECT * FROM detections
WHERE enriched = TRUE
  AND attributes->'color'->>'name' ILIKE '%azul%'
LIMIT 10;

-- Get enrichment statistics
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE enriched = TRUE) as enriched,
  COUNT(*) FILTER (WHERE attributes->'color' IS NOT NULL) as with_color,
  COUNT(*) FILTER (WHERE attributes->>'enrichment_failed' = 'true') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE enriched = TRUE) / COUNT(*), 2) as enrichment_percentage
FROM detections;
```

### Advanced Queries

```sql
-- Get color distribution per class
SELECT 
  cls,
  attributes->'color'->>'name' as color,
  COUNT(*) as count
FROM detections
WHERE enriched = TRUE
  AND attributes->'color' IS NOT NULL
GROUP BY cls, attributes->'color'->>'name'
ORDER BY cls, count DESC;

-- Find detections with high confidence and specific color
SELECT 
  session_id,
  track_id,
  cls,
  conf,
  attributes->'color'->>'name' as color
FROM detections
WHERE enriched = TRUE
  AND conf >= 0.8
  AND attributes->'color'->>'name' ILIKE '%rojo%'
ORDER BY conf DESC;

-- Get failed enrichments with error messages
SELECT 
  session_id,
  track_id,
  cls,
  url_frame,
  attributes->>'error' as error_message
FROM detections
WHERE enriched = TRUE
  AND attributes->>'enrichment_failed' = 'true';

-- Color trends over time
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  attributes->'color'->>'name' as color,
  COUNT(*) as count
FROM detections
WHERE enriched = TRUE
  AND attributes->'color' IS NOT NULL
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, color
ORDER BY hour DESC, count DESC;
```

## REST API Examples (Future Implementation)

### Suggested Endpoints

```typescript
// In session-store/src/controllers/session.controller.ts

/**
 * GET /api/sessions/:sessionId/detections/enriched
 * Get all enriched detections for a session
 */
async getEnrichedDetections(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const detections = await this.detectionRepo.findEnrichedBySession(sessionId);
  res.json(detections);
}

/**
 * GET /api/sessions/:sessionId/detections/search?color=azul
 * Search detections by color
 */
async searchDetectionsByColor(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const { color } = req.query;
  
  if (!color || typeof color !== 'string') {
    res.status(400).json({ error: 'color query parameter is required' });
    return;
  }
  
  const detections = await this.detectionRepo.findByColor(sessionId, color);
  res.json(detections);
}

/**
 * GET /api/sessions/:sessionId/stats/enrichment
 * Get enrichment statistics
 */
async getEnrichmentStats(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const stats = await this.detectionRepo.getEnrichmentStats(sessionId);
  res.json(stats);
}

/**
 * GET /api/stats/enrichment
 * Get global enrichment statistics
 */
async getGlobalEnrichmentStats(req: Request, res: Response): Promise<void> {
  const stats = await this.detectionRepo.getEnrichmentStats();
  res.json(stats);
}
```

### Usage Examples

```bash
# Get enriched detections
curl http://localhost:8080/api/sessions/sess_cam-local_1762403230448_1/detections/enriched

# Search by color
curl http://localhost:8080/api/sessions/sess_cam-local_1762403230448_1/detections/search?color=azul

# Get session stats
curl http://localhost:8080/api/sessions/sess_cam-local_1762403230448_1/stats/enrichment

# Get global stats
curl http://localhost:8080/api/stats/enrichment
```

## Color Names Reference

The attribute-enricher uses Spanish descriptive color names:

### Achromatic (Neutral)
- `blanco` - white
- `gris muy claro` - very light gray
- `gris claro` - light gray
- `gris` - gray
- `gris oscuro` - dark gray
- `negro` - black

### Red Family
- `rojo brillante` - bright red
- `rojo` - red
- `rojo oscuro` - dark red

### Orange Family
- `naranja brillante` - bright orange
- `naranja` - orange
- `naranja oscuro` - dark orange

### Yellow Family
- `amarillo brillante` - bright yellow
- `amarillo` - yellow
- `amarillo oscuro` - dark yellow

### Green Family
- `verde claro` - light green
- `verde` - green
- `verde oscuro` - dark green

### Cyan Family
- `cian claro` - light cyan
- `cian` - cyan
- `cian oscuro` - dark cyan

### Blue Family
- `azul claro` - light blue
- `azul` - blue
- `azul oscuro` - dark blue

### Purple/Magenta Family
- `magenta claro` - light magenta
- `magenta` - magenta
- `magenta oscuro` - dark magenta
- `púrpura` - purple

## Monitoring Commands

```bash
# Watch enrichment progress in real-time
watch -n 2 'docker-compose exec postgres psql -U postgres -d session_store -c "SELECT enriched, COUNT(*) FROM detections GROUP BY enriched;"'

# Check most recent enriched detections
docker-compose exec postgres psql -U postgres -d session_store -c \
  "SELECT session_id, track_id, cls, attributes->'color'->>'name' as color 
   FROM detections 
   WHERE enriched = TRUE 
   ORDER BY updated_at DESC 
   LIMIT 10;"

# Monitor service logs
docker-compose logs -f attribute-enricher | grep -i "enriched\|color\|error"
```

## Debugging

### Check if columns exist

```bash
docker-compose exec postgres psql -U postgres -d session_store -c \
  "SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'detections' 
   AND column_name IN ('attributes', 'enriched');"
```

### Verify indexes

```bash
docker-compose exec postgres psql -U postgres -d session_store -c \
  "SELECT indexname, indexdef 
   FROM pg_indexes 
   WHERE tablename = 'detections' 
   AND indexname LIKE '%enriched%' OR indexname LIKE '%attributes%';"
```

### Check pending work

```bash
docker-compose exec postgres psql -U postgres -d session_store -c \
  "SELECT COUNT(*) as pending_detections 
   FROM detections 
   WHERE enriched = FALSE;"
```

### Manually trigger enrichment for testing

```sql
-- Reset a detection to be reprocessed
UPDATE detections 
SET enriched = FALSE, attributes = NULL 
WHERE session_id = 'sess_cam-local_1762403230448_1' 
  AND track_id = 'track_5';

-- Reset all detections in a session
UPDATE detections 
SET enriched = FALSE, attributes = NULL 
WHERE session_id = 'sess_cam-local_1762403230448_1';
```

## Performance Tuning

### Index Usage Check

```sql
-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT * FROM detections
WHERE enriched = FALSE
LIMIT 10;

-- Should show "Index Scan using idx_detections_enriched"
```

### Batch Size Optimization

```yaml
# config.yaml - For high volume
worker:
  poll_interval_sec: 2
  batch_size: 20

# For low volume, higher accuracy
worker:
  poll_interval_sec: 10
  batch_size: 5
```

### Color Provider Tuning

```yaml
# Faster processing (less accurate)
color_provider:
  sample_pixels: 2000
  max_k: 2

# More accurate (slower)
color_provider:
  sample_pixels: 10000
  max_k: 5
```
