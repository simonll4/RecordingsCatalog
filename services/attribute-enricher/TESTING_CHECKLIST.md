# Testing Checklist - Attribute Enricher Integration

## Pre-Deployment Checklist

### ✅ Code Changes
- [x] Database migration files created
  - [x] `001_initial_schema.sql`
  - [x] `002_add_attributes_enriched.sql`
- [x] TypeScript types updated
  - [x] `ColorAttribute` interface
  - [x] `DetectionAttributes` interface
  - [x] `DetectionRecord` updated with new fields
- [x] Detection repository methods added
  - [x] `findEnrichedBySession()`
  - [x] `findByColor()`
  - [x] `getEnrichmentStats()`
- [x] Database migrations.ts updated
  - [x] Automatic column creation
  - [x] Index creation
- [x] Attribute enricher cleaned up
  - [x] Removed `ensure_columns_exist()`
  - [x] Removed schema management from worker
- [x] Docker compose configuration verified
- [x] Documentation created
  - [x] INTEGRATION.md
  - [x] API_REFERENCE.md
  - [x] ARCHITECTURE_DIAGRAMS.md
  - [x] INTEGRATION_SUMMARY.md

## Deployment Testing

### 1. Database Setup ✓

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for it to be ready
docker-compose exec postgres pg_isready -U postgres

# Verify migrations are mounted
docker-compose exec postgres ls -la /docker-entrypoint-initdb.d/

# Check if database exists
docker-compose exec postgres psql -U postgres -l | grep session_store
```

**Expected**: Database should be created with migrations applied automatically.

### 2. Verify Schema ✓

```bash
# Check tables exist
docker-compose exec postgres psql -U postgres -d session_store -c "\dt"

# Check detections table structure
docker-compose exec postgres psql -U postgres -d session_store -c "\d detections"

# Verify new columns exist
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'detections' 
AND column_name IN ('attributes', 'enriched');"
```

**Expected Output**:
```
 column_name | data_type | is_nullable | column_default 
-------------+-----------+-------------+----------------
 attributes  | jsonb     | YES         | NULL
 enriched    | boolean   | NO          | false
```

### 3. Verify Indexes ✓

```bash
# Check all indexes on detections table
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'detections' 
ORDER BY indexname;"
```

**Expected**: Should see `idx_detections_enriched` and `idx_detections_attributes`.

### 4. Start Services ✓

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# Verify attribute-enricher is running
docker-compose ps attribute-enricher
```

**Expected**: All services should be in "Up" state.

### 5. Monitor Attribute Enricher Logs ✓

```bash
# Follow logs
docker-compose logs -f attribute-enricher
```

**Expected Output**:
```
attribute-enricher | Starting attribute enrichment worker
attribute-enricher | Loading configuration from: /app/config.yaml
attribute-enricher | Database: postgres:5432/session_store
attribute-enricher | Poll interval: 5 seconds
attribute-enricher | Batch size: 10
attribute-enricher | Frames base path: /data/frames
attribute-enricher | Connected to database at postgres:5432
attribute-enricher | Starting attribute enrichment worker
attribute-enricher | No unenriched detections found
```

## Functional Testing

### 6. Create Test Detection ✓

```bash
# Insert a test detection (requires an existing session first)
docker-compose exec postgres psql -U postgres -d session_store << 'EOF'
-- First, create a test session
INSERT INTO sessions (session_id, device_id, path, start_ts)
VALUES ('test-session-001', 'test-cam', 'test/path', NOW())
ON CONFLICT (session_id) DO NOTHING;

-- Insert a test detection
INSERT INTO detections (
  session_id, track_id, cls, conf, bbox, 
  capture_ts, url_frame, first_ts, last_ts
) VALUES (
  'test-session-001',
  'test-track-001',
  'car',
  0.95,
  '{"x": 100, "y": 200, "w": 150, "h": 200}'::jsonb,
  NOW(),
  '/frames/test-session-001/test-track-001.jpg',
  NOW(),
  NOW()
);

-- Verify it was created
SELECT session_id, track_id, cls, enriched, attributes 
FROM detections 
WHERE session_id = 'test-session-001';
EOF
```

**Expected Output**:
```
    session_id    |    track_id     | cls | enriched | attributes 
------------------+-----------------+-----+----------+------------
 test-session-001 | test-track-001  | car | f        | 
```

### 7. Monitor Enrichment Process ✓

```bash
# Watch the detection get enriched (run in a loop)
watch -n 2 'docker-compose exec -T postgres psql -U postgres -d session_store -c "SELECT session_id, track_id, enriched, attributes IS NOT NULL as has_attrs FROM detections WHERE session_id = '"'"'test-session-001'"'"';"'
```

**Note**: This will fail if the frame file doesn't exist, which is expected. The detection should still be marked as `enriched=true` with an error in attributes.

### 8. Check Enrichment Result ✓

```bash
# View the enrichment result
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT 
  session_id,
  track_id,
  cls,
  enriched,
  attributes,
  updated_at
FROM detections 
WHERE session_id = 'test-session-001';"
```

**Expected**: 
- `enriched` should be `true`
- `attributes` should contain either:
  - Color data: `{"color": {...}}`
  - OR error data: `{"error": "...", "enrichment_failed": true}`

### 9. Test Repository Methods ✓

Create a test script `test_queries.ts`:

```typescript
import { DetectionRepository } from './services/session-store/src/database/repositories/detection.repository';

async function testQueries() {
  const repo = new DetectionRepository();
  
  console.log('Testing findEnrichedBySession...');
  const enriched = await repo.findEnrichedBySession('test-session-001');
  console.log('Enriched detections:', enriched.length);
  
  console.log('\nTesting getEnrichmentStats...');
  const stats = await repo.getEnrichmentStats('test-session-001');
  console.log('Stats:', stats);
  
  console.log('\nTesting findByColor...');
  const blueDetections = await repo.findByColor('test-session-001', 'azul');
  console.log('Blue detections:', blueDetections.length);
}

testQueries().catch(console.error);
```

### 10. Load Testing ✓

```bash
# Insert multiple test detections
docker-compose exec postgres psql -U postgres -d session_store << 'EOF'
INSERT INTO detections (
  session_id, track_id, cls, conf, bbox, 
  capture_ts, url_frame, first_ts, last_ts
)
SELECT 
  'test-session-001',
  'test-track-' || generate_series,
  'car',
  0.9 + (random() * 0.1),
  '{"x": 100, "y": 200, "w": 150, "h": 200}'::jsonb,
  NOW(),
  '/frames/test-session-001/test-track-' || generate_series || '.jpg',
  NOW(),
  NOW()
FROM generate_series(1, 50);
EOF

# Monitor enrichment progress
watch -n 1 'docker-compose exec -T postgres psql -U postgres -d session_store -c "SELECT enriched, COUNT(*) FROM detections WHERE session_id = '"'"'test-session-001'"'"' GROUP BY enriched;"'
```

**Expected**: All 50 detections should gradually transition from `enriched=false` to `enriched=true`.

## Performance Testing

### 11. Check Query Performance ✓

```bash
# Test index usage
docker-compose exec postgres psql -U postgres -d session_store -c "
EXPLAIN ANALYZE
SELECT * FROM detections
WHERE enriched = FALSE
LIMIT 10;"
```

**Expected**: Should use `Index Scan using idx_detections_enriched`.

### 12. Measure Enrichment Speed ✓

```bash
# Insert 100 detections and time how long it takes to enrich all
time docker-compose exec postgres psql -U postgres -d session_store << 'EOF'
INSERT INTO detections (
  session_id, track_id, cls, conf, bbox, 
  capture_ts, url_frame, first_ts, last_ts
)
SELECT 
  'perf-test-session',
  'track-' || generate_series,
  'car',
  0.9,
  '{"x": 100, "y": 200, "w": 150, "h": 200}'::jsonb,
  NOW(),
  '/frames/perf-test/track-' || generate_series || '.jpg',
  NOW(),
  NOW()
FROM generate_series(1, 100);

-- Wait for all to be enriched
SELECT pg_sleep(1);
SELECT COUNT(*) FROM detections WHERE session_id = 'perf-test-session' AND enriched = FALSE;
EOF
```

### 13. Monitor Resource Usage ✓

```bash
# Check CPU and memory usage
docker stats attribute-enricher --no-stream

# Check database connections
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT count(*) as connections 
FROM pg_stat_activity 
WHERE datname = 'session_store';"
```

## Integration Testing

### 14. Test with Real Edge Agent Data ✓

```bash
# Start edge agent if not running
docker-compose --profile edge up -d edge-agent

# Monitor detections being created and enriched
watch -n 2 'docker-compose exec -T postgres psql -U postgres -d session_store -c "SELECT COUNT(*) FILTER (WHERE enriched = FALSE) as pending, COUNT(*) FILTER (WHERE enriched = TRUE) as enriched, COUNT(*) as total FROM detections;"'
```

### 15. Test Color Search ✓

```bash
# Once you have enriched detections, test color search
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT 
  session_id,
  track_id,
  cls,
  attributes->'color'->>'name' as color
FROM detections
WHERE enriched = TRUE
  AND attributes->'color'->>'name' ILIKE '%azul%'
LIMIT 10;"
```

### 16. Test Statistics Query ✓

```bash
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE enriched = TRUE) as enriched,
  COUNT(*) FILTER (WHERE attributes->'color' IS NOT NULL) as with_color,
  COUNT(*) FILTER (WHERE attributes->>'enrichment_failed' = 'true') as failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE enriched = TRUE) / NULLIF(COUNT(*), 0), 2) as enrichment_pct
FROM detections;"
```

## Error Handling Testing

### 17. Test Missing Frame Handling ✓

```bash
# Insert detection with invalid frame path
docker-compose exec postgres psql -U postgres -d session_store << 'EOF'
INSERT INTO detections (
  session_id, track_id, cls, conf, bbox, 
  capture_ts, url_frame, first_ts, last_ts
) VALUES (
  'test-session-001',
  'missing-frame-track',
  'car',
  0.95,
  '{"x": 100, "y": 200, "w": 150, "h": 200}'::jsonb,
  NOW(),
  '/frames/nonexistent/path/to/frame.jpg',
  NOW(),
  NOW()
);
EOF

# Wait for it to be processed
sleep 10

# Check error was recorded
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT 
  track_id,
  enriched,
  attributes->>'error' as error_msg,
  attributes->>'enrichment_failed' as failed
FROM detections 
WHERE track_id = 'missing-frame-track';"
```

**Expected**:
```
      track_id       | enriched |           error_msg            | failed 
---------------------+----------+--------------------------------+--------
 missing-frame-track | t        | Frame not found: /data/fra...  | true
```

### 18. Test Service Recovery ✓

```bash
# Stop the attribute enricher
docker-compose stop attribute-enricher

# Insert detections while it's down
docker-compose exec postgres psql -U postgres -d session_store << 'EOF'
INSERT INTO detections (session_id, track_id, cls, conf, bbox, capture_ts, url_frame, first_ts, last_ts)
SELECT 'recovery-test', 'track-' || generate_series, 'car', 0.9, 
       '{"x": 100, "y": 200, "w": 150, "h": 200}'::jsonb, 
       NOW(), '/frames/recovery-test/track.jpg', NOW(), NOW()
FROM generate_series(1, 10);
EOF

# Start it back up
docker-compose start attribute-enricher

# Verify it catches up
sleep 15
docker-compose exec postgres psql -U postgres -d session_store -c "
SELECT COUNT(*) FROM detections 
WHERE session_id = 'recovery-test' AND enriched = FALSE;"
```

**Expected**: Count should be 0 (all enriched).

## Cleanup

### 19. Clean Up Test Data ✓

```bash
# Remove test detections and sessions
docker-compose exec postgres psql -U postgres -d session_store << 'EOF'
DELETE FROM detections WHERE session_id IN (
  'test-session-001', 
  'perf-test-session', 
  'recovery-test'
);
DELETE FROM sessions WHERE session_id IN (
  'test-session-001', 
  'perf-test-session', 
  'recovery-test'
);
EOF
```

## Final Verification Checklist

- [ ] All services start without errors
- [ ] Database schema includes `attributes` and `enriched` columns
- [ ] Indexes are created and being used
- [ ] Attribute enricher polls and processes detections
- [ ] Enrichment succeeds with valid frame paths
- [ ] Enrichment fails gracefully with invalid frame paths
- [ ] Repository methods return correct data
- [ ] Service recovers from restarts
- [ ] Performance is acceptable (batch_size detections in ~1 second)
- [ ] No memory leaks after processing many detections
- [ ] Logs are informative and not too verbose

## Common Issues and Solutions

### Issue: Columns not created
**Solution**: 
```bash
docker-compose restart session-store
docker-compose logs session-store | grep -i "schema\|migration"
```

### Issue: Service not processing
**Solution**:
```bash
# Check logs
docker-compose logs attribute-enricher

# Verify database connection
docker-compose exec attribute-enricher python -c "
import psycopg2
conn = psycopg2.connect(
  host='postgres', port=5432, 
  dbname='session_store', 
  user='postgres', password='postgres'
)
print('Connected successfully')
"
```

### Issue: Slow processing
**Solution**: Increase batch_size or reduce sample_pixels:
```bash
docker-compose exec attribute-enricher vi /app/config.yaml
# Modify:
# batch_size: 20
# sample_pixels: 3000
docker-compose restart attribute-enricher
```

## Success Criteria

✅ The integration is successful when:

1. All new database columns exist and have correct types
2. Indexes are created and improve query performance
3. Attribute enricher starts without errors
4. Detections are automatically enriched within 5-10 seconds
5. Color attributes are correctly extracted and stored
6. Repository methods return accurate data
7. Error cases are handled gracefully
8. Service recovers from restarts
9. Performance is acceptable for expected load
10. Documentation is complete and accurate

## Sign-off

- [ ] Database schema verified
- [ ] Service functionality tested
- [ ] Performance acceptable
- [ ] Error handling verified
- [ ] Documentation reviewed
- [ ] Ready for production deployment

**Tested by**: ___________________  
**Date**: ___________________  
**Notes**: ___________________
