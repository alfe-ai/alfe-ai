#!/usr/bin/env node

/**
 * Standalone replacement redirect server.
 *
 * Starts:
 *  - HTTP listener (default: 80) that redirects to https://chat.alfe.bot
 *  - HTTPS listener (default: 443) that redirects to https://chat.alfe.bot
 *
 * Environment variables:
 *  - REDIRECT_TARGET=https://chat.alfe.bot
 *  - HTTP_PORT=80
 *  - HTTPS_PORT=443
 *  - HTTPS_KEY_PATH=/path/to/key.pem
 *  - HTTPS_CERT_PATH=/path/to/cert.pem
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { execSync } = require('node:child_process');

function loadEnvFile(envPath) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

const dotenvPathCandidates = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '.env.local'),
];

for (const dotenvPath of dotenvPathCandidates) {
  if (fs.existsSync(dotenvPath)) {
    loadEnvFile(dotenvPath);
  }
}

const REDIRECT_TARGET = String(process.env.REDIRECT_TARGET || 'https://code.alfe.bot').trim();
const HTTP_PORT = Number.parseInt(process.env.HTTP_PORT || '80', 10);
const HTTPS_PORT = Number.parseInt(process.env.HTTPS_PORT || '443', 10);

const CERT_DIR = path.join(__dirname, 'data', 'config');
const DEFAULT_KEY_PATH = path.join(CERT_DIR, 'redirect-selfsigned-key.pem');
const DEFAULT_CERT_PATH = path.join(CERT_DIR, 'redirect-selfsigned-cert.pem');
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH || DEFAULT_KEY_PATH;
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH || DEFAULT_CERT_PATH;

function normalizeTarget(target) {
  if (!target) return 'https://code.alfe.bot';
  try {
    const url = new URL(target);
    if (!url.protocol || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      return 'https://code.alfe.bot';
    }
    return url.toString().replace(/\/$/, '');
  } catch (_err) {
    return 'https://code.alfe.bot';
  }
}

const NORMALIZED_TARGET = normalizeTarget(REDIRECT_TARGET);

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureSelfSignedCert() {
  ensureDir(CERT_DIR);

  if (fs.existsSync(HTTPS_KEY_PATH) && fs.existsSync(HTTPS_CERT_PATH)) {
    return;
  }

  const cn = process.env.SELFSIGNED_COMMON_NAME || os.hostname() || 'localhost';
  const tempConfigPath = path.join(CERT_DIR, `redirect-selfsigned-${Date.now()}.cnf`);
  const configContent = [
    '[req]',
    'default_bits = 2048',
    'prompt = no',
    'default_md = sha256',
    'x509_extensions = v3_req',
    'distinguished_name = dn',
    '',
    '[dn]',
    `CN = ${cn}`,
    '',
    '[v3_req]',
    'subjectAltName = @alt_names',
    '',
    '[alt_names]',
    `DNS.1 = ${cn}`,
    'DNS.2 = localhost',
    'IP.1 = 127.0.0.1',
    'IP.2 = ::1',
    '',
  ].join('\n');

  fs.writeFileSync(tempConfigPath, configContent, 'utf8');

  try {
    execSync(
      `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${HTTPS_KEY_PATH}" -out "${HTTPS_CERT_PATH}" -config "${tempConfigPath}"`,
      { stdio: 'ignore' },
    );
    fs.chmodSync(HTTPS_KEY_PATH, 0o600);
    console.log(`[redirect] Generated self-signed cert at ${HTTPS_CERT_PATH}`);
  } finally {
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  }
}

function buildRedirectLocation(req) {
  const suffix = req.url || '/';
  return `${NORMALIZED_TARGET}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

function redirectHandler(req, res) {
  const location = buildRedirectLocation(req);
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

function listenWithDualStack(server, port, label) {
  const tryIpv4 = () => {
    server.listen({ port, host: '0.0.0.0' }, () => {
      console.log(`[redirect] ${label} listening on 0.0.0.0:${port} -> ${NORMALIZED_TARGET}`);
    });
  };

  server.once('error', (error) => {
    if (error.code === 'EAFNOSUPPORT') {
      tryIpv4();
      return;
    }
    throw error;
  });

  server.listen({ port, host: '::', ipv6Only: false }, () => {
    console.log(`[redirect] ${label} listening on [::]:${port} -> ${NORMALIZED_TARGET}`);
  });
}

function start() {
  if (!Number.isFinite(HTTP_PORT) || HTTP_PORT <= 0) {
    throw new Error(`Invalid HTTP_PORT: ${HTTP_PORT}`);
  }
  if (!Number.isFinite(HTTPS_PORT) || HTTPS_PORT <= 0) {
    throw new Error(`Invalid HTTPS_PORT: ${HTTPS_PORT}`);
  }

  ensureSelfSignedCert();

  const httpsOptions = {
    key: fs.readFileSync(HTTPS_KEY_PATH),
    cert: fs.readFileSync(HTTPS_CERT_PATH),
  };

  listenWithDualStack(http.createServer(redirectHandler), HTTP_PORT, 'HTTP ');
  listenWithDualStack(https.createServer(httpsOptions, redirectHandler), HTTPS_PORT, 'HTTPS');
}

start();
