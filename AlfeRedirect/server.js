const fs = require('fs');
const https = require('https');
const express = require('express');

const PORT = process.env.PORT || 3001;
const keyPath = process.env.HTTPS_KEY_PATH;
const certPath = process.env.HTTPS_CERT_PATH;

const app = express();

app.use((req, res) => {
  res.redirect('https://app.alfe.sh');
});

if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  https.createServer(options, app).listen(PORT, () => {
    console.log(`Redirect server running on https://alfe.sh:${PORT}`);
  });
} else {
  console.error('Missing SSL certificates. Set HTTPS_KEY_PATH and HTTPS_CERT_PATH');
  process.exit(1);
}
