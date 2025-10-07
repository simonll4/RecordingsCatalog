#!/bin/bash

# Setup script for Python YOLOv8 + ByteTrack environment

echo "🐍 Setting up Python environment for YOLOv8 + ByteTrack..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"

# Create virtual environment if it doesn't exist
if [ ! -d "python/.venv" ]; then
    echo "📦 Creating Python virtual environment..."
    cd python
    python3 -m venv .venv
    cd ..
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment and install dependencies
echo "📦 Installing Python dependencies..."
cd python
source .venv/bin/activate

# Upgrade pip first
pip install --upgrade pip

# Install requirements
pip install -r requirements.txt

echo "✅ Python environment setup complete!"
echo ""
echo "📋 To manually activate the environment:"
echo "   cd python && source .venv/bin/activate"
echo ""
echo "🧪 To test the setup:"
echo "   python yolo_tracker.py --help"