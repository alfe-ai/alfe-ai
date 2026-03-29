const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const express = require('express');
const http = require('http');

const dotenvCandidates = [
  process.env.ALFECODE_DOTENV_PATH,
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '..', '.env'),
].filter(Boolean);
const loadedDotenvPaths = new Set();
dotenvCandidates.forEach((candidate) => {
  if (loadedDotenvPaths.has(candidate)) return;
  loadedDotenvPaths.add(candidate);
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate, override: true });
  }
});
if (!loadedDotenvPaths.size) {
  dotenv.config({ override: true });
}

const app = express();
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FRONTEND_PORT = Number.parseInt(process.env.FRONTEND_PORT, 10) || 3000;
const BACKEND_ORIGIN = (process.env.BACKEND_ORIGIN || '').trim();

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (BACKEND_ORIGIN) {
    res.setHeader('Content-Security-Policy', `default-src 'self'; connect-src 'self' ${BACKEND_ORIGIN}; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:;`);
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'frontend', backendOrigin: BACKEND_ORIGIN || null });
});

app.get('/config/frontend.json', (_req, res) => {
  res.json({ backendOrigin: BACKEND_ORIGIN || '' });
});

app.use(express.static(path.join(PROJECT_ROOT, 'public')));
app.use(express.static(path.join(PROJECT_ROOT, 'images')));

app.get('*', (_req, res) => {
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'about.html'));
});

http.createServer(app).listen(FRONTEND_PORT, () => {
  console.log(`[frontend] Server running on http://localhost:${FRONTEND_PORT}`);
  if (BACKEND_ORIGIN) {
    console.log(`[frontend] Backend origin configured as ${BACKEND_ORIGIN}`);
  } else {
    console.log('[frontend] WARNING: BACKEND_ORIGIN is not set. Frontend API calls must set absolute URLs manually.');
  }
});
