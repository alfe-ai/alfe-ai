const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');

const PORT = process.env.PORT || 3001;
const HTTP_PORT = process.env.HTTP_PORT || 80;
const keyPath = process.env.HTTPS_KEY_PATH;
const certPath = process.env.HTTPS_CERT_PATH;

const app = express();

app.use((req, res) => {
  res.redirect('https://mvp2.alfe.sh');
});

if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  https.createServer(options, app).listen(PORT, () => {
    console.log(`Redirect server running on https://alfe.sh:${PORT}`);
  });

  http.createServer((req, res) => {
    res.writeHead(301, { Location: 'https://mvp2.alfe.sh' });
    res.end();
  }).listen(HTTP_PORT, () => {
    console.log(`HTTP redirect server on port ${HTTP_PORT}`);
  });
} else {
  console.error('Missing SSL certificates. Set HTTPS_KEY_PATH and HTTPS_CERT_PATH');
  process.exit(1);
}
