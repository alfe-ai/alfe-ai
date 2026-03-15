const fs = require('fs');
const https = require('https');
const express = require('express');

const PORT = process.env.PORT || 3001;
const keyPath = process.env.HTTPS_KEY_PATH;
const certPath = process.env.HTTPS_CERT_PATH;
const REDIRECT_TARGET = 'https://code.alfe.bot';

const app = express();

app.use((req, res) => {
  res.redirect(302, REDIRECT_TARGET);
});

if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };

  https.createServer(options, app).listen(PORT, () => {
    console.log(`Redirect server running on port ${PORT} -> ${REDIRECT_TARGET}`);
  });
} else {
  console.error('Missing SSL certificates. Set HTTPS_KEY_PATH and HTTPS_CERT_PATH');
  process.exit(1);
}
