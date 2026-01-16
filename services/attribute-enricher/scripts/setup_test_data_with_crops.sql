-- Setup test data using CROPS as frames
-- The frames are already cropped to the detection, so bbox covers the entire image

-- Clean up existing test data
DELETE FROM detections WHERE session_id LIKE 'test_session_%';
DELETE FROM sessions WHERE session_id LIKE 'test_session_%';

-- Create test session
INSERT INTO sessions (
    session_id, 
    device_id, 
    path, 
    status, 
    start_ts, 
    detected_classes,
    created_at
) VALUES (
    'test_session_001',
    'test_device',
    '/test/path',
    'closed',
    NOW() - INTERVAL '1 hour',
    ARRAY['person'],
    NOW() - INTERVAL '1 hour'
);

-- Insert test detections
-- Since frames are CROPS, bbox covers the entire image (or most of it)

-- Detection 1 - crop from 01_person_0.jpg
INSERT INTO detections (
    session_id, 
    track_id, 
    cls, 
    conf, 
    bbox, 
    url_frame,
    first_ts,
    last_ts,
    capture_ts,
    ingest_ts,
    created_at,
    updated_at,
    attributes,
    enriched
) VALUES (
    'test_session_001',
    '1',
    'person',
    0.89,
    '{"x": 0.5, "y": 0.5, "w": 0.95, "h": 0.95}'::jsonb,
    '/frames/test_session_001/track_1.jpg',
    NOW() - INTERVAL '50 minutes',
    NOW() - INTERVAL '49 minutes',
    NOW() - INTERVAL '50 minutes',
    NOW() - INTERVAL '50 minutes',
    NOW() - INTERVAL '50 minutes',
    NOW() - INTERVAL '50 minutes',
    NULL,
    FALSE
);

-- Detection 2 - crop from 02_person_0.jpg
INSERT INTO detections (
    session_id, 
    track_id, 
    cls, 
    conf, 
    bbox, 
    url_frame,
    first_ts,
    last_ts,
    capture_ts,
    ingest_ts,
    created_at,
    updated_at,
    attributes,
    enriched
) VALUES (
    'test_session_001',
    '2',
    'person',
    0.92,
    '{"x": 0.5, "y": 0.5, "w": 0.95, "h": 0.95}'::jsonb,
    '/frames/test_session_001/track_2.jpg',
    NOW() - INTERVAL '40 minutes',
    NOW() - INTERVAL '39 minutes',
    NOW() - INTERVAL '40 minutes',
    NOW() - INTERVAL '40 minutes',
    NOW() - INTERVAL '40 minutes',
    NOW() - INTERVAL '40 minutes',
    NULL,
    FALSE
);

-- Detection 3 - crop from 03_person_0.jpg (rojo oscuro)
INSERT INTO detections (
    session_id, 
    track_id, 
    cls, 
    conf, 
    bbox, 
    url_frame,
    first_ts,
    last_ts,
    capture_ts,
    ingest_ts,
    created_at,
    updated_at,
    attributes,
    enriched
) VALUES (
    'test_session_001',
    '3',
    'person',
    0.88,
    '{"x": 0.5, "y": 0.5, "w": 0.95, "h": 0.95}'::jsonb,
    '/frames/test_session_001/track_3.jpg',
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '29 minutes',
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes',
    NULL,
    FALSE
);

-- Verify insertions
SELECT 'Test data inserted successfully with CROP frames!' as message;
SELECT session_id, track_id, cls, conf, enriched 
FROM detections 
WHERE session_id = 'test_session_001'
ORDER BY track_id;

