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

async function updatePricing() {
  try {
    const { data: product } = await axios.get(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );

    const sizeOptionIndex = product.options.findIndex(
      opt => opt.name && opt.name.toLowerCase() === 'size'
    );
    if (sizeOptionIndex === -1) {
      throw new Error('Unable to find size option on product');
    }

    const updatedVariants = product.variants.map(v => {
      const sizeIdx = v.options[sizeOptionIndex] - 1;
      const size = product.options[sizeOptionIndex].values[sizeIdx];
      const price = PRICE_TABLE[size];
      return {
        id: v.id,
        price: price ? Math.round(price * 100) : v.price
      };
    });

    await axios.put(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}.json`,
      { variants: updatedVariants },
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Successfully updated prices for product', productId);
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('Failed to update pricing:', msg);
    process.exit(1);
  }
}

updatePricing();
