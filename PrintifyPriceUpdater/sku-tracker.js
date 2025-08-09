#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const dbPath = path.join(__dirname, 'skus.db');

function initDb() {
  execSync(
    `sqlite3 ${dbPath} "CREATE TABLE IF NOT EXISTS skus (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT UNIQUE NOT NULL)"`
  );
}

function listSkus() {
  initDb();
  try {
    const output = execSync(
      `sqlite3 ${dbPath} "SELECT id || ': ' || sku FROM skus ORDER BY id"`
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

function addSku(sku) {
  initDb();
  if (!sku) {
    console.error('Please provide a SKU to add.');
    process.exit(1);
  }
  const escapedSku = sku.replace(/'/g, "''");
  try {
    execSync(
      `sqlite3 ${dbPath} "INSERT INTO skus (sku) VALUES ('${escapedSku}')"`
    );
    console.log(`Added SKU ${sku}.`);
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim() : err.message;
    console.error('Failed to add SKU:', msg);
    process.exit(1);
  }
}

const [, , command, value] = process.argv;

switch (command) {
  case 'list':
    listSkus();
    break;
  case 'add':
    addSku(value);
    break;
  default:
    console.log('Usage: node sku-tracker.js [list | add <sku>]');
}
