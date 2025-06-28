#!/usr/bin/env node
import axios from 'axios';
import https from 'https';
import { inspect } from 'util';

const base = process.env.PROGRAMATIC_PUPPET_API_BASE || 'https://localhost:3005';
const puppet = process.argv[2];
const productUrl = process.argv[3];

console.debug('[RunPuppet Debug] Base URL =>', base);
console.debug('[RunPuppet Debug] Puppet =>', puppet);
if (productUrl) console.debug('[RunPuppet Debug] Product URL =>', productUrl);

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
    if (err.response) {
      console.error('[RunPuppet Debug] Response status:', err.response.status);
      if (err.response.data) {
        const data =
          typeof err.response.data === 'string'
            ? err.response.data
            : inspect(err.response.data, { depth: null });
        console.error('[RunPuppet Debug] Response body:', data);
      }
    }
    if (err.stack) {
      console.error('[RunPuppet Debug] Stack:', err.stack);
    }
    process.exit(1);
  }
})();
