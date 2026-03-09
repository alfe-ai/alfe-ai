#!/bin/bash

# LLM Reverse Proxy Server Startup Script
# This script runs the reverse proxy server on AWS

# Set the working directory
cd "$(dirname "$0")"

# Install dependencies if needed
echo "Installing dependencies..."
npm install

# Start the server
echo "Starting LLM Reverse Proxy Server..."
npm start