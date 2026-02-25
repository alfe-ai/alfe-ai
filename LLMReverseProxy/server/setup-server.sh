#!/bin/bash

# Setup script for LLM Reverse Proxy server on AWS
# This script should be run as root on the AWS instance

# Change to the server directory
cd "$(dirname "$0")"
SERVER_DIR="$(pwd)"

# Create systemd service file
cat > /etc/systemd/system/llm-reverse-proxy-server.service << EOF
[Unit]
Description=LLM Reverse Proxy Server
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$SERVER_DIR
Environment=PORT=8080
ExecStart=$SERVER_DIR/run-server.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable the service
systemctl daemon-reload
systemctl enable llm-reverse-proxy-server.service

echo "LLM Reverse Proxy Server service installed and enabled"
echo "To start it now: systemctl start llm-reverse-proxy-server.service"