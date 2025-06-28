#!/usr/bin/env node
import axios from 'axios';
import https from 'https';

const base = process.env.PROGRAMATIC_PUPPET_API_BASE || 'https://localhost:3005';
const puppet = process.argv[2];
const productUrl = process.argv[3];

if (!puppet) {
  console.error('Usage: runPuppet.js <puppetName> [productUrl]');
  process.exit(1);
}

const agent = base.startsWith('https://')
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

(async () => {
  try {
    const resp = await axios.post(
      base + '/runPuppet',
      productUrl ? { puppetName: puppet, printifyProductURL: productUrl } : { puppetName: puppet },
      { responseType: 'stream', httpsAgent: agent }
    );
    await new Promise((resolve, reject) => {
      resp.data.on('data', chunk => process.stdout.write(chunk));
      resp.data.on('end', resolve);
      resp.data.on('error', reject);
    });
  } catch (err) {
    console.error('Failed to run puppet:', err.message || err);
    process.exit(1);
  }
})();
