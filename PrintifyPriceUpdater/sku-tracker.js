#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dbPath = path.join(__dirname, 'skus.db');

async function fetchTitle(sku) {
  const shopId = process.env.PRINTIFY_SHOP_ID;
  const token = process.env.PRINTIFY_API_TOKEN;
  if (!shopId || !token) {
    throw new Error('PRINTIFY_SHOP_ID and PRINTIFY_API_TOKEN must be set');
  }
  const res = await fetch(
    `https://api.printify.com/v1/shops/${shopId}/products/${sku}.json`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Printify API request failed with status ${res.status}`);
  }
  const data = await res.json();
  return data.title;
}

function initDb() {
  execSync(
    `sqlite3 ${dbPath} "CREATE TABLE IF NOT EXISTS skus (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT UNIQUE NOT NULL, title TEXT)"`
  );
  const columns = execSync(`sqlite3 ${dbPath} "PRAGMA table_info(skus);"`).toString();
  if (!columns.includes('|title|')) {
    execSync(`sqlite3 ${dbPath} "ALTER TABLE skus ADD COLUMN title TEXT"`);
  }
}

function getSkus() {
  initDb();
  try {
    const output = execSync(
      `sqlite3 ${dbPath} "SELECT id, sku, COALESCE(title, '') FROM skus ORDER BY id"`
    )
      .toString()
      .trim();
    if (!output) return [];
    return output.split('\n').map((line) => {
      const [id, sku, title] = line.split('|');
      return { id: Number(id), sku, title };
    });
  } catch (err) {
    throw new Error('Error listing SKUs: ' + err.message);
  }
}

function listSkus() {
  try {
    const skus = getSkus();
    if (skus.length) {
      skus.forEach((s) => console.log(`${s.id}: ${s.sku} - ${s.title}`));
    } else {
      console.log('No SKUs found.');
    }
  } catch (err) {
    console.error(err.message);
  }
}

async function addSku(sku) {
  initDb();
  if (!sku) {
    throw new Error('Please provide a SKU to add.');
  }
  const escapedSku = sku.replace(/'/g, "''");
  const title = await fetchTitle(sku);
  const escapedTitle = title ? title.replace(/'/g, "''") : '';
  execSync(
    `sqlite3 ${dbPath} "INSERT INTO skus (sku, title) VALUES ('${escapedSku}', '${escapedTitle}')"`
  );
  return { sku, title };
}

function startServer() {
  const app = express();
  const port = process.env.PORT || 3000;

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/skus', (req, res) => {
    try {
      res.json(getSkus());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/skus', async (req, res) => {
    const { sku } = req.body || {};
    if (!sku) {
      return res.status(400).json({ error: 'SKU required' });
    }
    try {
      const result = await addSku(sku);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

const [, , command, value] = process.argv;

(async () => {
  switch (command) {
    case 'list':
      listSkus();
      break;
    case 'add':
      try {
        const { sku, title } = await addSku(value);
        console.log(`Added SKU ${sku} (${title}).`);
      } catch (err) {
        console.error('Failed to add SKU:', err.message);
        process.exit(1);
      }
      break;
    case undefined:
      startServer();
      break;
    default:
      console.log('Usage: node sku-tracker.js [list | add <sku>]');
  }
})();
