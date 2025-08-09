#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
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

function listSkus() {
  initDb();
  try {
    const output = execSync(
      `sqlite3 ${dbPath} "SELECT id || ': ' || sku || ' - ' || COALESCE(title, '') FROM skus ORDER BY id"`
    )
      .toString()
      .trim();
    if (output) {
      console.log(output);
    } else {
      console.log('No SKUs found.');
    }
  } catch (err) {
    console.error('Error listing SKUs:', err.message);
  }
}

async function addSku(sku) {
  initDb();
  if (!sku) {
    console.error('Please provide a SKU to add.');
    process.exit(1);
  }
  const escapedSku = sku.replace(/'/g, "''");
  try {
    const title = await fetchTitle(sku);
    const escapedTitle = title ? title.replace(/'/g, "''") : '';
    execSync(
      `sqlite3 ${dbPath} "INSERT INTO skus (sku, title) VALUES ('${escapedSku}', '${escapedTitle}')"`
    );
    console.log(`Added SKU ${sku} (${title}).`);
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim() : err.message;
    console.error('Failed to add SKU:', msg);
    process.exit(1);
  }
}

const [, , command, value] = process.argv;

(async () => {
  switch (command) {
    case 'list':
      listSkus();
      break;
    case 'add':
      await addSku(value);
      break;
    default:
      console.log('Usage: node sku-tracker.js [list | add <sku>]');
  }
})();
