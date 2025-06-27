#!/usr/bin/env node
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_TOKEN = process.env.PRINTIFY_API_TOKEN || process.env.PRINTIFY_API_KEY;
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;

if (!API_TOKEN || !SHOP_ID) {
  console.error('PRINTIFY_API_TOKEN/PRINTIFY_API_KEY and PRINTIFY_SHOP_ID environment variables are required.');
  process.exit(1);
}

const [productId, ...titleParts] = process.argv.slice(2);
if (!productId || titleParts.length === 0) {
  console.log('Usage: printifyTitleFix.js <productId> <new title>');
  process.exit(1);
}
const title = titleParts.join(' ');

async function updateTitle() {
  const url = `https://api.printify.com/v1/shops/${SHOP_ID}/products/${productId}.json`;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await axios.put(
        url,
        { title },
        { headers: { Authorization: `Bearer ${API_TOKEN}` } }
      );
      console.log(`Product ${productId} title updated to "${title}".`);
      return;
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      const code = data?.code || data?.errors?.code;
      if (status === 400 && code === 8252) {
        console.warn(
          `Attempt ${attempt} failed: Product is disabled for editing. Retrying in 5 seconds...`
        );
        if (attempt < 10) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
      }
      console.error(`Failed to update product ${productId} (status: ${status}):`, data);
      process.exit(1);
    }
  }
  console.error(`Unable to update product ${productId} after 10 attempts.`);
  process.exit(1);
}

updateTitle();
