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

async function updatePricing() {
  try {
    const { data: product } = await axios.get(
      `${API_BASE}/shops/${SHOP_ID}/products/${productId}.json`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );

    if (!product.options || !Array.isArray(product.options) || product.options.length === 0) {
      throw new Error('Product has no options; cannot locate size option');
    }

    // Prefer type === 'size', fallback to name contains 'size'
    const sizeOptionIndex = product.options.findIndex(opt => {
      const typeMatch = (opt.type && String(opt.type).toLowerCase() === 'size');
      const nameMatch = (opt.name && String(opt.name).toLowerCase().includes('size'));
      return typeMatch || nameMatch;
    });

    if (sizeOptionIndex === -1) {
      console.error('Product options:', product.options.map(o => ({ name: o.name, type: o.type })));
      throw new Error('Unable to find size option on product');
    }

    const sizeOption = product.options[sizeOptionIndex];

    // Values can be strings or objects with title
    function getValueLabel(valuesArray, indexOneBased) {
      const idx = Number(indexOneBased) - 1;
      const v = valuesArray?.[idx];
      if (v == null) return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'object') {
        return v.title || v.name || v.value || v.id || '';
      }
      return String(v);
    }

    // Build updated variants for currently enabled options only.
    // The Printify API counts any variant included in the payload as
    // enabled. Some catalogs expose dozens of color/size combos that
    // are disabled in the product, but the API still returns them.
    // Filtering avoids accidentally enabling more than 100 variants
    // and triggering validation errors.
    const updatedVariants = product.variants
      .filter(v => v.is_enabled) // only update enabled variants
      .map(v => {
      const variantSizeIdxOneBased = v.options?.[sizeOptionIndex];
      const rawLabel = getValueLabel(sizeOption.values, variantSizeIdxOneBased);
      const sizeLabel = normalizeSizeLabel(rawLabel);

      let price = PRICE_TABLE[sizeLabel];
      if (price == null) {
        // Some Gildan 5000 catalogs include sizes like "Small", "Medium", etc.
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
        id: v.id,
        price: price != null ? cents(price) : v.price // leave unchanged if not in table
      };
    });

    // Log all updated variants for verification
    console.log('Found size option:', { index: sizeOptionIndex, name: sizeOption.name, type: sizeOption.type });
    console.log(`Updating ${updatedVariants.length} enabled variants:`, updatedVariants);

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

