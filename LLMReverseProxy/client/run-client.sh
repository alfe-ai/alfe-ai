#!/bin/bash

# LLM Reverse Proxy Client Startup Script
# This script runs on boot to connect to the reverse proxy server

# Set the working directory
cd "$(dirname "$0")"

# Set environment variables (adjust these as needed for your setup)
export PROXY_HOST="your-aws-host.example.com"
export PROXY_PORT="8080"
export CLIENT_ID="$(hostname)-$(date +%s)"

# Install dependencies if needed
echo "Installing dependencies..."
npm install

# Start the client
echo "Starting LLM Reverse Proxy Client..."
npm start