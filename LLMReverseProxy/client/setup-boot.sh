#!/bin/bash

# Setup script to make the LLM Reverse Proxy client start at boot
# This script should be run as root

# Change to the client directory
cd "$(dirname "$0")"
CLIENT_DIR="$(pwd)"

# Create systemd service file
cat > /etc/systemd/system/llm-reverse-proxy-client.service << EOF
[Unit]
Description=LLM Reverse Proxy Client
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$CLIENT_DIR
Environment=PROXY_HOST=your-aws-host.example.com
Environment=PROXY_PORT=8080
Environment=CLIENT_ID=\$(hostname)-\$(date +%s)
ExecStart=$CLIENT_DIR/run-client.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable the service
systemctl daemon-reload
systemctl enable llm-reverse-proxy-client.service

echo "LLM Reverse Proxy Client service installed and enabled"
echo "To start it now: systemctl start llm-reverse-proxy-client.service"