# Edge Agent Configuration Examples

## Multiple Camera Configuration

```json
{
  "cameras": [
    {
      "id": "webcam0",
      "device": 0,
      "modelPath": "./models/yolov8n.onnx",
      "input": {
        "width": 640,
        "height": 640
      },
      "classNames": ["person", "car", "bicycle", "..."],
      "classesOfInterest": ["person"],
      "threshold": 0.6,
      "fps": 10,
      "postRollMs": 3000,
      "captureProvider": "opencv"
    },
    {
      "id": "security_cam",
      "device": "/dev/video1",
      "modelPath": "./models/yolov8s.onnx",
      "input": {
        "width": 640,
        "height": 640
      },
      "classNames": ["person", "car", "bicycle", "..."],
      "classesOfInterest": ["person", "car"],
      "threshold": 0.7,
      "fps": 5,
      "postRollMs": 5000,
      "captureProvider": "ffmpeg"
    }
  ]
}
```

## Environment Variables

```bash
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/edge_agent"

# Capture provider preference
CAPTURE_PROVIDER=opencv  # or 'ffmpeg'

# Detector type
DETECTOR=onnx  # or 'stub' for testing

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

## Model Performance Comparison

| Model        | Size  | Speed   | Accuracy | Use Case                |
| ------------ | ----- | ------- | -------- | ----------------------- |
| yolov8n.onnx | ~6MB  | Fastest | Good     | Real-time, edge devices |
| yolov8s.onnx | ~22MB | Fast    | Better   | Balanced performance    |
| yolov8m.onnx | ~50MB | Medium  | High     | High accuracy needed    |
| yolov8l.onnx | ~87MB | Slow    | Higher   | GPU environments        |

## Capture Provider Comparison

| Provider | Pros                                             | Cons                                              | Requirements                      |
| -------- | ------------------------------------------------ | ------------------------------------------------- | --------------------------------- |
| OpenCV   | - Native performance<br>- Better camera control  | - Complex installation<br>- Platform dependencies | opencv4nodejs, cmake, build tools |
| FFmpeg   | - Universal compatibility<br>- Easy installation | - Higher CPU usage<br>- More latency              | ffmpeg binary                     |

## Performance Tuning

### High Performance

```json
{
  "fps": 30,
  "threshold": 0.8,
  "postRollMs": 1000,
  "captureProvider": "opencv"
}
```

### Balanced

```json
{
  "fps": 10,
  "threshold": 0.6,
  "postRollMs": 3000,
  "captureProvider": "opencv"
}
```

### Resource Constrained

```json
{
  "fps": 5,
  "threshold": 0.5,
  "postRollMs": 5000,
  "captureProvider": "ffmpeg"
}
```
