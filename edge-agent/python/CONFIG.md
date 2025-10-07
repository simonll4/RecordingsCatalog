# Example configuration for Python YOLOv8 + ByteTrack detector

# Install Python dependencies first:

# cd python && ./setup.sh

# Example usage in configs/cameras.json:

{
"cameras": [
{
"id": "camera-1",
"name": "Main Camera",
"captureProvider": "ffmpeg",
"device": 0,
"width": 640,
"height": 480,
"fps": 30,
"detector": {
"type": "python",
"modelPath": "./models/yolov8s.pt",
"classesOfInterest": ["person"],
"threshold": 0.5,
"tracker": {
"type": "bytetrack",
"trackHighThresh": 0.5,
"trackLowThresh": 0.1,
"newTrackThresh": 0.6,
"trackBuffer": 30,
"matchThresh": 0.8
},
"pythonPath": "python/yolo_tracker.py"
},
"postRollMs": 2000,
"thumbnailInterval": 1000
}
]
}

# Available tracker types:

# - bytetrack: Fast and efficient, good for real-time

# - botsort: More accurate but slower, better for complex scenes

# Tracker parameters:

# - trackHighThresh: High confidence threshold (0.0-1.0)

# - trackLowThresh: Low confidence threshold (0.0-1.0)

# - newTrackThresh: Threshold for new tracks (0.0-1.0)

# - trackBuffer: Frames to keep lost tracks (integer)

# - matchThresh: IoU threshold for matching (0.0-1.0)
