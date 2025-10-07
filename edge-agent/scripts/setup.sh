#!/bin/bash

echo "🚀 Setting up Edge Agent development environment..."

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
if [[ "$NODE_VERSION" == "not found" ]]; then
    echo "❌ Node.js not found. Please install Node.js 20+ first."
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build packages
echo "🔨 Building packages..."
npm run build

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL client not found. Please install PostgreSQL."
    echo "   Ubuntu/Debian: sudo apt install postgresql-client"
    echo "   macOS: brew install postgresql"
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your database configuration"
fi

# Check for ONNX model
if [ ! -f models/yolov8n.onnx ]; then
    echo "⚠️  ONNX model not found. Please download a YOLOv8 model:"
    echo "   1. Install ultralytics: pip install ultralytics"
    echo "   2. Export model: python -c \"from ultralytics import YOLO; YOLO('yolov8n.pt').export(format='onnx')\""
    echo "   3. Move yolov8n.onnx to models/ directory"
fi

# Check for opencv dependencies (Ubuntu/Debian)
if command -v apt &> /dev/null; then
    echo "📋 Checking OpenCV dependencies..."
    MISSING_DEPS=()
    
    if ! dpkg -l | grep -q libopencv-dev; then
        MISSING_DEPS+=("libopencv-dev")
    fi
    
    if ! dpkg -l | grep -q cmake; then
        MISSING_DEPS+=("cmake")
    fi
    
    if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
        echo "⚠️  Missing OpenCV dependencies: ${MISSING_DEPS[*]}"
        echo "   Install with: sudo apt install ${MISSING_DEPS[*]}"
        echo "   Or use FFmpeg capture provider instead"
    fi
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure PostgreSQL database in .env"
echo "   2. Run migrations: npm run db:migrate"
echo "   3. Download ONNX model to models/ directory"
echo "   4. Start development: npm run dev"
echo ""