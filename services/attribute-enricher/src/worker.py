"""Attribute enrichment worker that processes unenriched detections."""

import os
import time
import logging
from typing import Dict, Any
import numpy as np

from .database.db_client import DatabaseClient
from .core.providers.color_provider import ColorAttributeProvider
from .utils.image_utils import load_image, crop_bbox, draw_bbox_on_image

logger = logging.getLogger(__name__)


class AttributeEnrichmentWorker:
    """Worker that polls the database for unenriched detections and processes them."""
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize the worker.
        
        Parameters
        ----------
        config : dict
            Full configuration dictionary with database, worker, and color_provider sections
        """
        self.config = config
        self.db = DatabaseClient(config['database'])
        
        # Initialize color provider with config
        provider_config = config.get('color_provider', {})
        self.color_provider = ColorAttributeProvider(
            include_details=provider_config.get('include_details', False),
            s_min=provider_config.get('s_min', 0.05),
            v_min=provider_config.get('v_min', 0.02),
            v_max=provider_config.get('v_max', 0.98),
            gamma=provider_config.get('gamma', 1.0),
            equalize=provider_config.get('equalize', False),
            white_balance=provider_config.get('white_balance', True),
            blur_radius=provider_config.get('blur_radius', 1.0),
            mask_erode_px=provider_config.get('mask_erode_px', 2),
            min_k=provider_config.get('min_k', 1),
            max_k=provider_config.get('max_k', 3),
            sample_pixels=provider_config.get('sample_pixels', 5000),
            achro_s_th=provider_config.get('achro_s_th', 0.18),
            achro_frac_th=provider_config.get('achro_frac_th', 0.60),
            white_v_th=provider_config.get('white_v_th', 0.78),
            white_v_strong_th=provider_config.get('white_v_strong_th', 0.90),
            black_v_th=provider_config.get('black_v_th', 0.25),
            achro_margin=provider_config.get('achro_margin', 0.08),
            save_cluster_images=provider_config.get('save_cluster_images', False),
            use_css3_names=provider_config.get('use_css3_names', False),
        )
        
        self.poll_interval = config['worker']['poll_interval_sec']
        self.batch_size = config['worker']['batch_size']
        self.frames_base_path = config['worker']['frames_base_path']
        self.running = False
        
    def start(self):
        """Start the worker loop."""
        logger.info("Starting attribute enrichment worker")
        
        # Connect to database
        self.db.connect()
        
        self.running = True
        
        try:
            while self.running:
                try:
                    self._process_batch()
                except Exception as e:
                    logger.error(f"Error processing batch: {e}", exc_info=True)
                
                time.sleep(self.poll_interval)
        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
        finally:
            self.stop()
    
    def stop(self):
        """Stop the worker and cleanup."""
        logger.info("Stopping attribute enrichment worker")
        self.running = False
        self.db.close()
    
    def _process_batch(self):
        """Process a batch of unenriched detections."""
        detections = self.db.get_unenriched_detections(limit=self.batch_size)
        
        if not detections:
            logger.debug("No unenriched detections found")
            return
        
        logger.info(f"Processing {len(detections)} unenriched detections")
        
        for detection in detections:
            try:
                self._process_detection(detection)
            except Exception as e:
                logger.error(
                    f"Failed to process detection {detection['session_id']}/{detection['track_id']}: {e}",
                    exc_info=True
                )
                # Mark as enriched with error
                self.db.mark_detection_error(
                    detection['session_id'],
                    detection['track_id'],
                    str(e)
                )
    
    def _process_detection(self, detection: Dict[str, Any]):
        """Process a single detection.
        
        Parameters
        ----------
        detection : dict
            Detection record from database
        """
        session_id = detection['session_id']
        track_id = detection['track_id']
        bbox = detection['bbox']
        url_frame = detection['url_frame']
        conf = float(detection['conf'])
        
        logger.debug(f"Processing detection {session_id}/{track_id}")
        
        # Construct frame path
        if not url_frame:
            raise ValueError(f"No url_frame for detection {session_id}/{track_id}")
        
        # Remove leading slash and 'frames/' prefix if present
        # url_frame format: /frames/session_id/track_X.jpg
        # We want: /data/frames/session_id/track_X.jpg
        clean_path = url_frame.lstrip('/')
        if clean_path.startswith('frames/'):
            clean_path = clean_path[7:]  # Remove 'frames/' prefix
        
        frame_path = os.path.join(self.frames_base_path, clean_path)
        
        if not os.path.exists(frame_path):
            raise FileNotFoundError(f"Frame not found: {frame_path}")
        
        # Load full image
        logger.debug(f"Loading frame: {frame_path}")
        full_image = load_image(frame_path)
        h, w = full_image.shape[:2]
        
        # Crop to bbox
        cropped_image = crop_bbox(full_image, bbox, w, h)
        
        if cropped_image.size == 0:
            raise ValueError(f"Empty crop for detection {session_id}/{track_id}")
        
        # Extract color attributes
        logger.debug(f"Extracting color from crop (size: {cropped_image.shape})")
        color_attr = self.color_provider.enrich(cropped_image, conf=conf)
        
        if not color_attr:
            raise ValueError(f"Failed to extract color for detection {session_id}/{track_id}")
        
        # Build attributes dict
        attributes = {
            "color": color_attr
        }
        
        # Update database
        success = self.db.update_detection_attributes(session_id, track_id, attributes)
        
        if success:
            logger.info(
                f"Enriched detection {session_id}/{track_id} with color: {color_attr['name']}"
            )
            
            # Optionally redraw frame with bbox
            try:
                output_frame_path = frame_path  # Overwrite original
                draw_bbox_on_image(frame_path, bbox, output_frame_path, color_attr)
                logger.debug(f"Updated frame with annotated bbox: {output_frame_path}")
            except Exception as e:
                logger.warning(f"Failed to draw bbox on frame: {e}")
        else:
            raise Exception("Database update failed")

