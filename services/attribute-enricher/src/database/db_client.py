"""PostgreSQL database client for attribute enrichment."""

import psycopg2
import psycopg2.extras
import json
import logging
from typing import List, Dict, Any, Optional
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class DatabaseClient:
    """Client for interacting with the session_store database."""
    
    def __init__(self, config: Dict[str, Any]):
        """Initialize database client.
        
        Parameters
        ----------
        config : dict
            Database configuration with keys: host, port, name, user, password
        """
        self.config = config
        self.conn = None
        
    def connect(self):
        """Establish database connection."""
        try:
            self.conn = psycopg2.connect(
                host=self.config['host'],
                port=self.config['port'],
                dbname=self.config['name'],
                user=self.config['user'],
                password=self.config['password']
            )
            logger.info(f"Connected to database at {self.config['host']}:{self.config['port']}")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def close(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")
    
    @contextmanager
    def cursor(self):
        """Context manager for database cursor."""
        if not self.conn:
            self.connect()
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            yield cur
            self.conn.commit()
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Database error: {e}")
            raise
        finally:
            cur.close()
    
    def get_unenriched_detections(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Fetch detections that haven't been enriched yet.
        
        Parameters
        ----------
        limit : int
            Maximum number of detections to fetch
            
        Returns
        -------
        list of dict
            List of detection records with all fields
        """
        with self.cursor() as cur:
            cur.execute("""
                SELECT 
                    session_id, track_id, cls, conf, bbox, url_frame,
                    first_ts, last_ts, capture_ts, ingest_ts,
                    created_at, updated_at, attributes, enriched
                FROM detections
                WHERE enriched = FALSE
                ORDER BY created_at ASC
                LIMIT %s
            """, (limit,))
            return [dict(row) for row in cur.fetchall()]
    
    def update_detection_attributes(self, session_id: str, track_id: str, 
                                   attributes: Dict[str, Any]) -> bool:
        """Update the attributes field for a detection and mark as enriched.
        
        Parameters
        ----------
        session_id : str
            Session ID of the detection
        track_id : str
            Track ID of the detection
        attributes : dict
            Attributes dictionary to store (will be converted to JSON)
            
        Returns
        -------
        bool
            True if update was successful
        """
        try:
            with self.cursor() as cur:
                cur.execute("""
                    UPDATE detections
                    SET attributes = %s::jsonb,
                        enriched = TRUE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE session_id = %s AND track_id = %s
                """, (json.dumps(attributes), session_id, track_id))
                
                if cur.rowcount > 0:
                    logger.info(f"Updated detection {session_id}/{track_id} with attributes")
                    return True
                else:
                    logger.warning(f"No detection found for {session_id}/{track_id}")
                    return False
        except Exception as e:
            logger.error(f"Failed to update detection {session_id}/{track_id}: {e}")
            return False
    
    def mark_detection_error(self, session_id: str, track_id: str, error_msg: str) -> bool:
        """Mark a detection as enriched but with error info in attributes.
        
        Parameters
        ----------
        session_id : str
            Session ID of the detection
        track_id : str
            Track ID of the detection
        error_msg : str
            Error message to store
            
        Returns
        -------
        bool
            True if update was successful
        """
        try:
            with self.cursor() as cur:
                attributes = {
                    "error": error_msg,
                    "enrichment_failed": True
                }
                cur.execute("""
                    UPDATE detections
                    SET attributes = %s::jsonb,
                        enriched = TRUE,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE session_id = %s AND track_id = %s
                """, (json.dumps(attributes), session_id, track_id))
                
                if cur.rowcount > 0:
                    logger.warning(f"Marked detection {session_id}/{track_id} as failed: {error_msg}")
                    return True
                else:
                    logger.warning(f"No detection found for {session_id}/{track_id}")
                    return False
        except Exception as e:
            logger.error(f"Failed to mark error for detection {session_id}/{track_id}: {e}")
            return False
    


