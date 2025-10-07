# Development Guide

## Quick Start

1. **Setup Environment**

   ```bash
   ./scripts/setup.sh
   ```

2. **Configure Database**

   ```bash
   # Edit .env with your PostgreSQL credentials
   cp .env.example .env
   nano .env
   ```

3. **Run Migrations**

   ```bash
   npm run db:migrate
   ```

4. **Download Model**

   ```bash
   # Option 1: Download pre-converted model
   wget https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx -O models/yolov8n.onnx

   # Option 2: Convert from PyTorch
   pip install ultralytics
   python -c "from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx')"
   mv yolov8n.onnx models/
   ```

5. **Start Development**
   ```bash
   npm run dev
   ```

## Development Workflow

### Building Packages

```bash
# Build all packages
npm run build

# Build specific package
cd packages/detector && npm run build

# Watch mode for development
cd packages/detector && npm run dev
```

### Testing

```bash
# Run all tests
npm run test

# Test specific package
cd packages/tracker && npm test

# Test with coverage
npm run test -- --coverage
```

### Database Operations

```bash
# Create migration
cd packages/db && npx prisma migrate dev --name add_new_field

# Reset database
cd packages/db && npx prisma migrate reset

# View database
npm run db:studio
```

## Debugging

### Check Camera Access

```bash
# List video devices (Linux)
ls /dev/video*

# Test camera with FFmpeg
ffmpeg -f v4l2 -i /dev/video0 -t 5 -f image2pipe -vcodec mjpeg - | head -c 1000000 > test.jpg
```

### Database Debugging

```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1;"

# View tables
psql $DATABASE_URL -c "\dt"

# Check session data
psql $DATABASE_URL -c "SELECT * FROM sessions ORDER BY created_at DESC LIMIT 5;"
```

### Performance Profiling

```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev

# Monitor system resources
htop
nvidia-smi  # if using GPU
```

## Common Issues

### OpenCV Installation Failed

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install cmake build-essential libopencv-dev pkg-config

# Alternative: Use FFmpeg provider
CAPTURE_PROVIDER=ffmpeg npm run dev
```

### ONNX Model Issues

- Ensure model input size matches configuration
- Verify model format is ONNX (not PyTorch .pt)
- Check model was exported with correct ONNX version

### Database Connection Issues

- Verify PostgreSQL is running
- Check DATABASE_URL format
- Ensure database exists and user has permissions

### Performance Issues

- Reduce FPS in camera configuration
- Use smaller model (yolov8n vs yolov8s)
- Increase detection threshold
- Use FFmpeg instead of OpenCV

## Architecture Overview

```
edge-agent/
├── packages/
│   ├── common/          # Shared types and utilities
│   ├── db/             # Database layer (Prisma + repos)
│   ├── detector/       # ONNX inference engine
│   ├── tracker/        # Simple IoU-based tracking
│   ├── capture/        # Camera capture (OpenCV/FFmpeg)
│   └── agent/          # Main EdgeAgent orchestrator
└── apps/
    └── cli/            # Command-line interface
```

## Adding New Features

### New Detection Class

1. Update `classNames` in camera config
2. Add to `classesOfInterest` if relevant
3. Restart agent

### New Capture Provider

1. Create provider class in `packages/capture/src/`
2. Implement `CaptureProvider` interface
3. Add to `createCaptureProvider()` factory
4. Update configuration schema

### New Database Field

1. Update Prisma schema
2. Create migration: `npx prisma migrate dev`
3. Update repository methods
4. Update TypeScript types

## Monitoring

### Application Logs

```bash
# View logs with structured output
npm run dev | pino-pretty

# Save logs to file
npm run dev > logs/app.log 2>&1
```

### Database Monitoring

```sql
-- Active sessions
SELECT dev_id, COUNT(*) as active_sessions
FROM sessions
WHERE edge_end_ts IS NULL
GROUP BY dev_id;

-- Detection statistics
SELECT class, COUNT(*) as detections, AVG(score) as avg_score
FROM detections
WHERE created_at > extract(epoch from now() - interval '1 hour') * 1000
GROUP BY class;
```
