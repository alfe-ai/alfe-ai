const WebSocket = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const PROXY_HOST = process.env.PROXY_HOST || 'localhost';
const PROXY_PORT = process.env.PROXY_PORT || 8080;
const CLIENT_ID = process.env.CLIENT_ID || 'default-client';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

// State management
let ws = null;
let heartBeatInterval = null;

// Function to establish connection to proxy server
function connectToProxy() {
  const url = `ws://${PROXY_HOST}:${PROXY_PORT}/proxy/${CLIENT_ID}`;
  
  ws = new WebSocket(url);
  
  ws.on('open', () => {
    console.log(`Connected to reverse proxy server at ${PROXY_HOST}:${PROXY_PORT}`);
    
    // Send initial handshake
    ws.send(JSON.stringify({
      type: 'handshake',
      clientId: CLIENT_ID,
      timestamp: Date.now()
    }));
    
    // Start heartbeat
    heartBeatInterval = setInterval(() => {
      ws.send(JSON.stringify({
        type: 'heartbeat',
        timestamp: Date.now()
      }));
    }, HEARTBEAT_INTERVAL);
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleProxyMessage(message);
    } catch (error) {
      console.error('Error parsing proxy message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('Disconnected from proxy server, attempting to reconnect...');
    clearInterval(heartBeatInterval);
    
    // Attempt reconnection after delay
    setTimeout(connectToProxy, 5000);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clearInterval(heartBeatInterval);
  });
}

// Handle messages from proxy server
function handleProxyMessage(message) {
  switch (message.type) {
    case 'ssh_request':
      console.log('Received SSH request, establishing tunnel...');
      handleSSHRequest(message);
      break;
    case 'ping':
      // Respond to ping
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      console.log('Received unknown message type:', message.type);
  }
}

// Handle SSH connection request
function handleSSHRequest(message) {
  const { sshPort } = message;
  console.log(`Establishing SSH tunnel to port ${sshPort}`);
  
  // Create SSH tunnel using local port forwarding
  const tunnelCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${sshPort} -R 0.0.0.0:0:localhost:22 user@localhost`;
  
  const child = exec(tunnelCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`SSH tunnel error: ${error}`);
      return;
    }
    console.log(`SSH tunnel established: ${stdout}`);
  });
  
  child.on('close', (code) => {
    console.log(`SSH tunnel closed with code ${code}`);
  });
}

// Initialize client
function initializeClient() {
  // Check if we have valid environment config
  if (!PROXY_HOST || PROXY_HOST === 'localhost') {
    console.error('PROXY_HOST environment variable not set or invalid');
    process.exit(1);
  }
  
  // Start connection to proxy
  connectToProxy();
}

// Handle process exit gracefully
process.on('SIGINT', () => {
  console.log('Shutting down client...');
  if (ws) {
    ws.close();
  }
  clearInterval(heartBeatInterval);
  process.exit(0);
});

// Start the client
initializeClient();