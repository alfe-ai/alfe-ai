const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const axios = require('axios');

const API_BASE = 'https://api.printify.com/v1';
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;
const API_TOKEN = process.env.PRINTIFY_API_TOKEN;
const SHOULD_PUBLISH = (process.env.PRINTIFY_PUBLISH || '').toLowerCase() === 'true';

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

const DESCRIPTION = `Unisex Heavy Cotton Tee

Made with medium fabric (5.3 oz/yd² (180 g/m²)) consisting of 100% cotton for year-round comfort that is sustainable and highly durable.
The classic fit of this shirt ensures a comfy, relaxed wear.
The tear-away label means a scratch-free experience with no irritation or discomfort whatsoever.

Size Table

Size S: Width: 18.00 in, Length: 28.00 in, Sleeve length: 15.10 in, Size tolerance: 1.50 in

Size M: Width: 20.00 in, Length: 29.00 in, Sleeve length: 16.50 in, Size tolerance: 1.50 in

Size L: Width: 22.00 in, Length: 30.00 in, Sleeve length: 18.00 in, Size tolerance: 1.50 in

Size XL: Width: 24.00 in, Length: 31.00 in, Sleeve length: 19.50 in, Size tolerance: 1.50 in

Size 2XL: Width: 26.00 in, Length: 32.00 in, Sleeve length: 21.00 in, Size tolerance: 1.50 in

Size 3XL: Width: 28.00 in, Length: 33.00 in, Sleeve length: 22.40 in, Size tolerance: 1.50 in

Size 4XL: Width: 30.00 in, Length: 34.00 in, Sleeve length: 23.70 in, Size tolerance: 1.50 in

Size 5XL: Width: 32.00 in, Length: 35.00 in, Sleeve length: 25.00 in, Size tolerance: 1.50 in`;

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
      { variants: payloadVariants, description: DESCRIPTION },
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Successfully updated prices and description for product', productId);

    const { data: updatedProduct } = await axios.get(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );

    const updatedIds = new Set(payloadVariants.map(v => v.id));
    const refreshed = updatedProduct.variants
      .filter(v => updatedIds.has(v.id))
      .map(v => ({ title: v.title, id: v.id, price: v.price }));
    console.log('Updated variant data:', refreshed);
    console.log('Updated description:', updatedProduct.description);
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('Failed to update product:', msg);
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
  if (SHOULD_PUBLISH) {
    await publishProduct();
  } else {
    console.log('Skipping publish step; set PRINTIFY_PUBLISH=true to enable publishing.');
  }
}

main();

