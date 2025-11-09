"""Main entry point for the Attribute Enricher Service."""

import os
import sys
import logging
from pathlib import Path

# Add src to path if running as module
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.config_loader import load_config
from src.worker import AttributeEnrichmentWorker


def setup_logging():
    """Configure logging for the service."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )


def main():
    """Main function to start the attribute enrichment service."""
    setup_logging()
    logger = logging.getLogger(__name__)
    
    logger.info("="*60)
    logger.info("Attribute Enricher Service")
    logger.info("="*60)
    
    # Load configuration
    config_path = os.environ.get('CONFIG_PATH', '/app/config.yaml')
    
    # For local development, use relative path
    if not os.path.exists(config_path):
        config_path = Path(__file__).parent.parent / 'config.yaml'
    
    if not os.path.exists(config_path):
        logger.error(f"Configuration file not found: {config_path}")
        sys.exit(1)
    
    logger.info(f"Loading configuration from: {config_path}")
    config = load_config(str(config_path))
    
    # Log configuration (without sensitive data)
    logger.info(f"Database: {config['database']['host']}:{config['database']['port']}/{config['database']['name']}")
    logger.info(f"Poll interval: {config['worker']['poll_interval_sec']} seconds")
    logger.info(f"Batch size: {config['worker']['batch_size']}")
    logger.info(f"Frames base path: {config['worker']['frames_base_path']}")
    
    # Create and start worker
    worker = AttributeEnrichmentWorker(config)
    
    try:
        worker.start()
    except Exception as e:
        logger.error(f"Worker failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()

