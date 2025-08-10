#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const express = require('express');
const https = require('https');
// Allow requests to proceed even when using self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
    `sqlite3 ${dbPath} "CREATE TABLE IF NOT EXISTS skus (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT UNIQUE NOT NULL, title TEXT, ebay_id TEXT, status TEXT DEFAULT 'Init')"`
  );
  const columns = execSync(`sqlite3 ${dbPath} "PRAGMA table_info(skus);"`).toString();
  if (!columns.includes('|title|')) {
    execSync(`sqlite3 ${dbPath} "ALTER TABLE skus ADD COLUMN title TEXT"`);
  }
  if (!columns.includes('|ebay_id|')) {
    execSync(`sqlite3 ${dbPath} "ALTER TABLE skus ADD COLUMN ebay_id TEXT"`);
  }
  if (!columns.includes('|status|')) {
    execSync(`sqlite3 ${dbPath} "ALTER TABLE skus ADD COLUMN status TEXT DEFAULT 'Init'"`);
  }
}

function getSkus() {
  initDb();
  try {
    const output = execSync(
      `sqlite3 ${dbPath} "SELECT id, sku, COALESCE(title, ''), COALESCE(ebay_id, ''), COALESCE(status, 'Init') FROM skus ORDER BY id"`
    )
      .toString()
      .trim();
    if (!output) return [];
    return output.split('\n').map((line) => {
      const [id, sku, title, ebayId, status] = line.split('|');
      return { id: Number(id), sku, title, ebayId, status };
    });
  } catch (err) {
    throw new Error('Error listing SKUs: ' + err.message);
  }
}

function listSkus() {
  try {
    const skus = getSkus();
    if (skus.length) {
      skus.forEach((s) =>
        console.log(
          `${s.id}: ${s.sku} - ${s.title}` + (s.ebayId ? ` - eBay ID: ${s.ebayId}` : '') + ` - Status: ${s.status || 'Init'}`
        )
      );
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
    `sqlite3 ${dbPath} "INSERT INTO skus (sku, title, status) VALUES ('${escapedSku}', '${escapedTitle}', 'Init')"`
  );
  return { sku, title, status: 'Init' };
}

function setEbayId(id, ebayId) {
  initDb();
  if (!id || !ebayId) {
    throw new Error('ID and eBay ID are required');
  }
  const escaped = ebayId.replace(/'/g, "''");
  execSync(
    `sqlite3 ${dbPath} "UPDATE skus SET ebay_id='${escaped}' WHERE id=${Number(id)}"`
  );
  return { id: Number(id), ebayId };
}

async function setShippingPolicy(listingId) {
  if (!listingId) {
    throw new Error('Listing ID is required');
  }
  const shippingPolicyId = process.env.EBAY_SHIPPING_POLICY_ID;
  if (!shippingPolicyId) {
    throw new Error('EBAY_SHIPPING_POLICY_ID not set');
  }
  const base = process.env.PROGRAMATIC_PUPPET_API_BASE || 'https://localhost:3005';
  const url = `${base}/ebay/set-shipping-policy`;
  try {
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId, shippingPolicyId }),
    };
    if (base.startsWith('https://localhost')) {
      options.agent = new https.Agent({ rejectUnauthorized: false });
    }
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        text || `ProgramaticPuppet responded with ${res.status}`
      );
    }
    return res.json();
  } catch (err) {
    console.error('ProgramaticPuppet request failed', {
      url,
      listingId,
      shippingPolicyId,
      error: err,
    });
    throw new Error(
      `ProgramaticPuppet request failed for listing ${listingId}: ${err.message}`
    );
  }
}

function updateStatus(id, status) {
  initDb();
  const escaped = status.replace(/'/g, "''");
  execSync(
    `sqlite3 ${dbPath} "UPDATE skus SET status='${escaped}' WHERE id=${Number(id)}"`
  );
  return { id: Number(id), status };
}

function runPriceUpdate(id) {
  initDb();
  const sku = execSync(
    `sqlite3 ${dbPath} "SELECT sku FROM skus WHERE id=${Number(id)}"`
  )
    .toString()
    .trim();
  if (!sku) {
    throw new Error(`No SKU found for id ${id}`);
  }
  execSync(`node ${path.join(__dirname, 'update-pricing-by-size.js')} ${sku}`, {
    stdio: 'inherit',
  });
  updateStatus(id, 'Price Updated');
}

function startServer() {
  const app = express();
  const port = process.env.PORT || 3101;

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

  app.post('/api/skus/:id/ebay', (req, res) => {
    const { id } = req.params;
    const { ebayId } = req.body || {};
    if (!ebayId) {
      return res.status(400).json({ error: 'eBay ID required' });
    }
    try {
      const result = setEbayId(id, ebayId);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/skus/:id/price-update', async (req, res) => {
    const { id } = req.params;
    try {
      await runPriceUpdate(id);
      res.json({ id: Number(id), status: 'Price Updated' });
    } catch (err) {
      console.error('Error updating price', err);
      res.status(500).send(err.message);
    }
  });

  app.post('/api/skus/:id/shipping-policy', async (req, res) => {
    const { id } = req.params;
    const { listingId } = req.body || {};
    if (!listingId) {
      return res.status(400).send('Missing parameters');
    }
    try {
      const result = await setShippingPolicy(listingId);
      updateStatus(id, 'Shipping Policy Updated');
      res.json(result);
    } catch (err) {
      console.error('Error setting shipping policy', err);
      res.status(500).send(err.stack || err.message);
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
