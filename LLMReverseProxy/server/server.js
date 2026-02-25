const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = process.env.PORT || 8080;
const CLIENT_TIMEOUT = 60000; // 60 seconds

// State management
const clients = new Map(); // clientId -> WebSocket connection
const clientHeartbeats = new Map(); // clientId -> last heartbeat timestamp

// Create Express app
const app = express();
const server = http.createServer(app);

// Serve static files (for any future web interface)
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>LLM Reverse Proxy Server</title>
    </head>
    <body>
        <h1>LLM Reverse Proxy Server</h1>
        <p>Connected clients: <span id="clientCount">0</span></p>
        <div id="clientList"></div>
        <script>
            // Simple client list update
            const ws = new WebSocket('ws://localhost:${PORT}/ws');
            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                if (data.type === 'client_list') {
                    document.getElementById('clientCount').textContent = data.clients.length;
                    const list = data.clients.map(c => 
                        '<div>' + c.id + ' - ' + (c.connected ? 'Connected' : 'Disconnected') + '</div>'
                    ).join('');
                    document.getElementById('clientList').innerHTML = list;
                }
            };
        </script>
    </body>
    </html>
  `);
});

// WebSocket server for proxy connections
const wss = new WebSocket.Server({ server });

// Handle new WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  // Handle messages from clients
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleClientMessage(ws, message);
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  
  // Handle connection close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle messages from connected clients
function handleClientMessage(ws, message) {
  switch (message.type) {
    case 'handshake':
      console.log(`Client ${message.clientId} connected`);
      clients.set(message.clientId, ws);
      clientHeartbeats.set(message.clientId, Date.now());
      
      // Send client list to updated
      broadcastClientList();
      break;
      
    case 'heartbeat':
      if (message.clientId && clients.has(message.clientId)) {
        clientHeartbeats.set(message.clientId, Date.now());
      }
      break;
      
    case 'ssh_request':
      console.log(`SSH request for client ${message.clientId}`);
      handleSSHRequest(message.clientId, message.sshPort, message.requestId);
      break;
      
    default:
      console.log('Unknown message type:', message.type);
      break;
  }
}

// Handle SSH connection requests
function handleSSHRequest(clientId, sshPort, requestId) {
  const clientWs = clients.get(clientId);
  
  // Validate the client exists and is connected
  if (!clientWs) {
    console.log(`Client ${clientId} not connected`); 
    return;
  }
  
  // Send SSH request to the client
  clientWs.send(JSON.stringify({
    type: 'ssh_request',
    sshPort: sshPort,
    requestId: requestId
  }));
}

// Periodic cleanup of inactive clients
function cleanupInactiveClients() {
  const now = Date.now();
  for (const [clientId, lastHeartbeat] of clientHeartbeats.entries()) {
    if (now - lastHeartbeat > CLIENT_TIMEOUT) {
      console.log(`Removing inactive client: ${clientId}`);
      clients.delete(clientId);
      clientHeartbeats.delete(clientId);
      
      // Broadcast updated client list
      broadcastClientList();
    }
  }
  
  // Schedule next cleanup
  setTimeout(cleanupInactiveClients, CLIENT_TIMEOUT);
}

// Broadcast current client list to all connected WebSocket clients
function broadcastClientList() {
  const activeClients = Array.from(clients.keys()).map(id => ({
    id,
    connected: true
  }));
  
  const message = JSON.stringify({
    type: 'client_list',
    clients: activeClients
  });
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Cleanup function 
function cleanupServer() {
  console.log('Shutting down server...');
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', cleanupServer);
process.on('SIGTERM', cleanupServer);

// Start periodic cleanup
cleanupInactiveClients();

// Start HTTP server
server.listen(PORT, () => {
  console.log(`LLM Reverse Proxy Server listening on port ${PORT}`);
});

module.exports = { 
  clients, 
  clientHeartbeats,
  handleClientMessage 
};