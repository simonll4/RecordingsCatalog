#!/bin/bash
# Setup v4l2loopback for video recording without device conflicts

set -e

echo "🎥 Setting up v4l2loopback for EdgeAgent..."
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "⚠️  This script requires sudo privileges"
   echo "   Run with: sudo ./scripts/setup-v4l2loopback.sh"
   exit 1
fi

# Install v4l2loopback
echo "📦 Installing v4l2loopback-dkms..."
apt-get update -qq
apt-get install -y v4l2loopback-dkms v4l2loopback-utils

# Load module
echo "🔧 Loading v4l2loopback kernel module..."
modprobe -r v4l2loopback 2>/dev/null || true
modprobe v4l2loopback devices=1 video_nr=2 card_label="EdgeAgent Virtual Camera" exclusive_caps=1

# Verify
if [ -e "/dev/video2" ]; then
    echo "✅ Virtual device created: /dev/video2"
    ls -la /dev/video2
else
    echo "❌ Failed to create /dev/video2"
    exit 1
fi

# Create systemd service for cloning
echo "📝 Creating systemd service for stream cloning..."
cat > /etc/systemd/system/edge-agent-video-clone.service <<EOF
[Unit]
Description=EdgeAgent Video Stream Clone (v4l2loopback)
After=network.target

[Service]
Type=simple
User=$SUDO_USER
ExecStart=/usr/bin/ffmpeg -f v4l2 -i /dev/video0 -codec copy -f v4l2 /dev/video2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
echo "🚀 Enabling and starting video clone service..."
systemctl daemon-reload
systemctl enable edge-agent-video-clone.service
systemctl start edge-agent-video-clone.service

# Check status
sleep 2
if systemctl is-active --quiet edge-agent-video-clone.service; then
    echo "✅ Video clone service is running"
else
    echo "⚠️  Service failed to start, checking logs:"
    systemctl status edge-agent-video-clone.service --no-pager
    exit 1
fi

# Make persistent on boot
echo "💾 Making v4l2loopback persistent on boot..."
cat > /etc/modprobe.d/v4l2loopback.conf <<EOF
options v4l2loopback devices=1 video_nr=2 card_label="EdgeAgent Virtual Camera" exclusive_caps=1
EOF

if ! grep -q "^v4l2loopback" /etc/modules; then
    echo "v4l2loopback" >> /etc/modules
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Update configs/cameras.json:"
echo "      Change: \"device\": 0 → \"device\": 2"
echo ""
echo "   2. Uncomment VideoRecorder code in packages/agent/src/index.ts"
echo "      (Search for 'TODO: Fix device busy conflict')"
echo ""
echo "   3. Rebuild project:"
echo "      npm run build"
echo ""
echo "   4. Test:"
echo "      npm run dev"
echo ""
echo "🔍 Verify devices:"
echo "   ls -la /dev/video*"
echo ""
echo "🛠️  Service management:"
echo "   sudo systemctl status edge-agent-video-clone"
echo "   sudo systemctl stop edge-agent-video-clone"
echo "   sudo systemctl start edge-agent-video-clone"
echo ""
