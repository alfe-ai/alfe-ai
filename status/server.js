const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3005;
const HOST = process.env.HOST || '0.0.0.0';

const INDEX_PATH = path.join(__dirname, 'public', 'index.html');

const server = http.createServer((req, res) => {
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

server.listen(PORT, HOST, () => {
  console.log(`Status page listening at http://${HOST}:${PORT}`);
});
