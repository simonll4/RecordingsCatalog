# Copy the example environment file
cp .env.example .env

# Create the actual .env file with the correct database URL
cat > .env << 'EOF'
# Environment Configuration for Edge Agent

# Database Configuration
DATABASE_URL="postgresql://edge_user:edge_password@localhost:5432/edge_agent"

# Application Settings
NODE_ENV=development
LOG_LEVEL=info

# Capture settings
CAPTURE_PROVIDER=ffmpeg

# Detector settings  
DETECTOR=onnx
EOF

echo "✅ .env file created successfully!"
echo "📝 You can modify it if needed before running docker-compose"