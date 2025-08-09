const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const axios = require('axios');

const API_BASE = 'https://api.printify.com/v1';
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;
const API_TOKEN = process.env.PRINTIFY_API_TOKEN;

if (!SHOP_ID || !API_TOKEN) {
  console.error('Please set PRINTIFY_SHOP_ID and PRINTIFY_API_TOKEN environment variables.');
  process.exit(1);
}

const productId = process.argv[2];
if (!productId) {
  console.error('Usage: node update-pricing-by-size.js <product-id>');
  process.exit(1);
}

// Price table in USD
const PRICE_TABLE = {
  S: 23.97,
  M: 23.97,
  L: 23.97,
  XL: 23.97,
  '2XL': 23.97,
  '3XL': 26.01,
  '4XL': 27.38,
  '5XL': 27.38
};

function cents(usd) {
  return Math.round(Number(usd) * 100);
}

function normalizeSizeLabel(label) {
  if (!label) return label;
  // Normalize common variants like "XXL" -> "2XL"
  const t = String(label).trim().toUpperCase();
  if (t === 'XS') return 'XS'; // not in table but keep mapping behavior
  if (t === 'S') return 'S';
  if (t === 'M') return 'M';
  if (t === 'L') return 'L';
  if (t === 'XL') return 'XL';
  if (t === 'XXL' || t === '2XL') return '2XL';
  if (t === 'XXXL' || t === '3XL') return '3XL';
  if (t === 'XXXXL' || t === '4XL') return '4XL';
  if (t === 'XXXXXL' || t === '5XL') return '5XL';
  return t;
}

function sizeFromTitle(title) {
  if (!title) return undefined;
  const parts = String(title).split('/').map(p => p.trim());
  return normalizeSizeLabel(parts[parts.length - 1]);
}

async function updatePricing() {
  try {
    const { data: product } = await axios.get(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );

    console.log('Product title:', product.title);

    const updatedVariants = product.variants
      .filter(v => v.is_enabled)
      .map(v => {
        const sizeLabel = sizeFromTitle(v.title);

        let price = PRICE_TABLE[sizeLabel];
        if (price == null) {
          const alt = {
            SMALL: 'S',
            MEDIUM: 'M',
            LARGE: 'L',
            'X-LARGE': 'XL',
            '2X-LARGE': '2XL',
            '3X-LARGE': '3XL',
            '4X-LARGE': '4XL',
            '5X-LARGE': '5XL'
          }[String(sizeLabel).toUpperCase()];
          if (alt) price = PRICE_TABLE[alt];
        }

        return {
          title: v.title,
          id: v.id,
          price: price != null ? cents(price) : v.price
        };
      });

    const payloadVariants = updatedVariants.map(({ id, price }) => ({ id, price }));

    console.log(`Updating ${payloadVariants.length} enabled variants:`, updatedVariants);

    await axios.put(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}.json`,
      { variants: payloadVariants },
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Successfully updated prices for product', productId);

    const { data: updatedProduct } = await axios.get(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );

    const updatedIds = new Set(payloadVariants.map(v => v.id));
    const refreshed = updatedProduct.variants
      .filter(v => updatedIds.has(v.id))
      .map(v => ({ title: v.title, id: v.id, price: v.price }));
    console.log('Updated variant data:', refreshed);
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('Failed to update pricing:', msg);
    process.exit(1);
  }
}

async function publishProduct() {
  try {
    await axios.post(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}/publish.json`,
      {
        title: true,
        description: true,
        images: true,
        variants: true,
        tags: true,
        key_features: true,
        shipping_template: false
      },
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('Published product', productId, 'to store');
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('Failed to publish product:', msg);
    process.exit(1);
  }
}

async function main() {
  await updatePricing();
  await publishProduct();
}

main();

