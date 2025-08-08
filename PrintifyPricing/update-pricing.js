const axios = require('axios');

const PRINTIFY_API_BASE = 'https://api.printify.com/v1';
const STORE_ID = '18663958';

const PRICE_MAP = {
  'S': 23.97,
  'M': 23.97,
  'L': 23.97,
  'XL': 23.97,
  '2XL': 23.97,
  '3XL': 26.01,
  '4XL': 27.38,
  '5XL': 27.38
};

const API_TOKEN = process.env.PRINTIFY_API_TOKEN;

if (!API_TOKEN) {
  console.error('Error: Please set the PRINTIFY_API_TOKEN environment variable.');
  process.exit(1);
}

const [, , productId] = process.argv;
if (!productId) {
  console.error('Usage: node update-pricing.js <product-sku>');
  process.exit(1);
}

async function updatePricing(id) {
  try {
    const { data: product } = await axios.get(
      `${PRINTIFY_API_BASE}/shops/${STORE_ID}/products/${id}.json`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );

    const variantsPayload = product.variants.map(variant => {
      const sizeOption = variant.options.find(opt => opt.name === 'size');
      const size = sizeOption?.value;
      const price = PRICE_MAP[size];

      if (!price) {
        console.warn(`No price mapping for size ${size}; keeping current price for variant ${variant.id}`);
        return { id: variant.id, price: variant.price };
      }

      return { id: variant.id, price: Math.round(price * 100) };
    });

    const payload = { variants: variantsPayload };

    const { data: updated } = await axios.put(
      `${PRINTIFY_API_BASE}/shops/${STORE_ID}/products/${id}.json`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Successfully updated variant prices:', updated);
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('Failed to update prices:', msg);
    process.exit(1);
  }
}

updatePricing(productId);
