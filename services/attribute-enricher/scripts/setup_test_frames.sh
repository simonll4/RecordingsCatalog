#!/bin/bash
# Script to copy test images from improved_project to the frames directory

set -e

echo "Setting up test frames for attribute enricher..."

# Paths
IMPROVED_PROJECT_DIR="../../../../improved_project/data/inputs"
FRAMES_DIR="../../../../data/frames/test_session_001"

# Create frames directory
mkdir -p "$FRAMES_DIR"

# Check if source images exist
if [ ! -f "$IMPROVED_PROJECT_DIR/01.jpg" ]; then
    echo "Error: Source images not found at $IMPROVED_PROJECT_DIR"
    exit 1
fi

# Copy images
echo "Copying test images..."
cp "$IMPROVED_PROJECT_DIR/01.jpg" "$FRAMES_DIR/track_001.jpg"
cp "$IMPROVED_PROJECT_DIR/02.jpg" "$FRAMES_DIR/track_002.jpg"
cp "$IMPROVED_PROJECT_DIR/03.jpg" "$FRAMES_DIR/track_003.jpg"

echo "Test frames copied successfully!"
echo "Created:"
ls -lh "$FRAMES_DIR"

echo ""
echo "Next steps:"
echo "1. Run the SQL script: psql -h localhost -p 15432 -U postgres -d session_store -f scripts/setup_test_data.sql"
echo "2. Start the attribute-enricher service"
echo "3. Check the database for enriched attributes"

