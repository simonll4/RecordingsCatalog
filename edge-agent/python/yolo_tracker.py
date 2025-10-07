#!/usr/bin/env python3
"""
YOLOv8 + ByteTrack detection and tracking service
Receives commands via stdin (init/frame/reset) and returns results via stdout
Protocol: NDJSON (newline-delimited JSON)
"""

import sys
import json
import base64
import numpy as np
from ultralytics import YOLO
import cv2
from io import BytesIO
from PIL import Image
import argparse
import logging

# Configure logging to stderr to avoid interfering with stdout communication
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger(__name__)

class YOLOTracker:
    def __init__(self, model_path: str, tracker_config: dict = None):
        """
        Initialize YOLOv8 model with tracking
        
        Args:
            model_path: Path to YOLOv8 model file
            tracker_config: Tracker configuration parameters
        """
        self.model_path = model_path
        self.model = YOLO(model_path)
        self.tracker_config = tracker_config or {
            "tracker_type": "bytetrack",
            "track_high_thresh": 0.5,
            "track_low_thresh": 0.1,
            "new_track_thresh": 0.6,
            "track_buffer": 30,
            "match_thresh": 0.8,
            "fuse_score": True
        }
        self.initialized = False
        self.camera_id = None
        self.threshold = 0.5
        self.classes_of_interest = []
        
        logger.info(f"YOLOv8 model loaded: {model_path}")
        logger.info(f"Tracker config: {self.tracker_config}")
    
    def reset(self):
        """
        Reset tracking state - creates a fresh model instance
        This ensures track IDs start from 1 again
        """
        logger.info("Resetting tracker state...")
        # Reload model to reset predictor and tracking state
        self.model = YOLO(self.model_path)
        logger.info("Tracker state reset complete")
    
    def process_frame(self, frame_data: dict) -> dict:
        """
        Process a single frame with detection and tracking
        
        Args:
            frame_data: Dict with 'data' (base64 image), 'width', 'height', 'timestamp'
            
        Returns:
            Dict with detections including track IDs
        """
        try:
            # Decode base64 image
            image_bytes = base64.b64decode(frame_data['data'])
            image = Image.open(BytesIO(image_bytes))
            
            # Convert to numpy array for YOLOv8
            frame = np.array(image)
            if frame.shape[2] == 4:  # RGBA to RGB
                frame = cv2.cvtColor(frame, cv2.COLOR_RGBA2RGB)
            
            # Run YOLOv8 with tracking
            results = self.model.track(
                frame, 
                persist=True,  # Keep track history
                tracker=f"{self.tracker_config['tracker_type']}.yaml",
                conf=self.tracker_config['track_high_thresh'],
                verbose=False
            )
            
            # Parse results
            detections = []
            if results and len(results) > 0:
                result = results[0]
                
                if result.boxes is not None:
                    boxes = result.boxes.xyxy.cpu().numpy()  # x1, y1, x2, y2
                    scores = result.boxes.conf.cpu().numpy()
                    classes = result.boxes.cls.cpu().numpy()
                    
                    # Get track IDs if available
                    track_ids = None
                    if hasattr(result.boxes, 'id') and result.boxes.id is not None:
                        track_ids = result.boxes.id.cpu().numpy()
                    
                    for i in range(len(boxes)):
                        x1, y1, x2, y2 = boxes[i]
                        
                        detection = {
                            "class": self.model.names[int(classes[i])],
                            "score": float(scores[i]),
                            "bbox": {
                                "x": float(x1),
                                "y": float(y1),
                                "w": float(x2 - x1),
                                "h": float(y2 - y1)
                            }
                        }
                        
                        # Add track ID if available
                        if track_ids is not None:
                            detection["trackId"] = f"track_{int(track_ids[i])}"
                        
                        detections.append(detection)
            
            return {
                "success": True,
                "detections": detections,
                "timestamp": frame_data.get('timestamp', 0),
                "frame_info": {
                    "width": frame_data.get('width', 0),
                    "height": frame_data.get('height', 0)
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing frame: {e}")
            return {
                "success": False,
                "error": str(e),
                "detections": []
            }

def main():
    parser = argparse.ArgumentParser(description='YOLOv8 + ByteTrack service')
    parser.add_argument('--model', '-m', required=True, help='Path to YOLOv8 model file')
    parser.add_argument('--tracker-type', default='bytetrack', choices=['bytetrack', 'botsort'], 
                       help='Tracker type')
    parser.add_argument('--track-high-thresh', type=float, default=0.5, 
                       help='High confidence threshold for tracking')
    parser.add_argument('--track-low-thresh', type=float, default=0.1,
                       help='Low confidence threshold for tracking')
    parser.add_argument('--new-track-thresh', type=float, default=0.6,
                       help='Threshold for creating new tracks')
    parser.add_argument('--track-buffer', type=int, default=30,
                       help='Track buffer frames')
    parser.add_argument('--match-thresh', type=float, default=0.8,
                       help='Matching threshold')
    
    args = parser.parse_args()
    
    # Build tracker config
    tracker_config = {
        "tracker_type": args.tracker_type,
        "track_high_thresh": args.track_high_thresh,
        "track_low_thresh": args.track_low_thresh,
        "new_track_thresh": args.new_track_thresh,
        "track_buffer": args.track_buffer,
        "match_thresh": args.match_thresh,
        "fuse_score": True
    }
    
    # Initialize tracker
    tracker = YOLOTracker(args.model, tracker_config)
    
    logger.info("YOLOv8 + ByteTrack service started. Waiting for commands (init/frame/reset)...")
    
    # Main processing loop with command dispatcher
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
                
            try:
                # Parse command
                message = json.loads(line)
                cmd = message.get('cmd', 'frame')  # Default to 'frame' for backwards compat
                
                if cmd == 'init':
                    # Initialize session
                    tracker.initialized = True
                    tracker.camera_id = message.get('cameraId', 'unknown')
                    tracker.threshold = message.get('threshold', 0.5)
                    tracker.classes_of_interest = message.get('classesOfInterest', [])
                    
                    logger.info(f"Initialized: camera={tracker.camera_id}, threshold={tracker.threshold}, classes={tracker.classes_of_interest}")
                    
                    response = {
                        "ok": True,
                        "cmd": "init",
                        "message": "Tracker initialized"
                    }
                    print(json.dumps(response), flush=True)
                    
                elif cmd == 'frame':
                    # Process frame (legacy format or new format)
                    if 'jpeg_b64' in message:
                        # New format: {"cmd":"frame", "frameId":"...", "jpeg_b64":"..."}
                        frame_data = {
                            'data': message['jpeg_b64'],
                            'width': message.get('width', 640),
                            'height': message.get('height', 640),
                            'timestamp': message.get('ts', 0)
                        }
                    else:
                        # Legacy format: {"data":"...", "width":..., "height":...}
                        frame_data = message
                    
                    result = tracker.process_frame(frame_data)
                    
                    # Add frameId to response if provided
                    if 'frameId' in message:
                        result['frameId'] = message['frameId']
                    
                    print(json.dumps(result), flush=True)
                    
                elif cmd == 'reset':
                    # Reset tracker state
                    tracker.reset()
                    
                    response = {
                        "ok": True,
                        "cmd": "reset",
                        "message": "Tracker state reset"
                    }
                    print(json.dumps(response), flush=True)
                    
                else:
                    error_response = {
                        "ok": False,
                        "error": f"Unknown command: {cmd}"
                    }
                    print(json.dumps(error_response), flush=True)
                
            except json.JSONDecodeError as e:
                error_response = {
                    "success": False,
                    "error": f"JSON decode error: {e}",
                    "detections": []
                }
                print(json.dumps(error_response), flush=True)
                
            except Exception as e:
                logger.error(f"Unexpected error: {e}")
                error_response = {
                    "success": False,
                    "error": f"Unexpected error: {e}",
                    "detections": []
                }
                print(json.dumps(error_response), flush=True)
                
    except KeyboardInterrupt:
        logger.info("Service stopped by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()