const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = Number(process.env.PORT) || 3005;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PORT_ATTEMPTS = Number(process.env.PORT_RETRY_ATTEMPTS) || 10;

const INDEX_PATH = path.join(__dirname, 'public', 'index.html');

function createServer() {
  return http.createServer((req, res) => {
    if (req.url !== '/' && req.url !== '/index.html') {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    fs.readFile(INDEX_PATH, 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Unable to load status page' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
  });
}

function startServer(port, attempt = 1) {
  const server = createServer();

  server.listen(port, HOST, () => {
    console.log(`Status page listening at http://${HOST}:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt <= MAX_PORT_ATTEMPTS) {
      const nextPort = port + 1;
      const nextAttempt = attempt + 1;
      console.warn(
        `Port ${port} is in use. Attempting to listen on ${nextPort} (attempt ${nextAttempt}).`
      );
      startServer(nextPort, nextAttempt);
      return;
    }

    throw err;
  });
}

startServer(DEFAULT_PORT);
