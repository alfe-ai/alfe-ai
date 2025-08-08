# Printify Price Updater

This script updates pricing for all variants of a Printify product.

## Usage

```bash
PRINTIFY_SHOP_ID=your_shop_id PRINTIFY_API_TOKEN=your_api_token \
node update-pricing-by-size.js <product_id>
```

Prices are applied per size:

| Size | Price (USD) |
| --- | --- |
| S, M, L, XL, 2XL | 23.97 |
| 3XL | 26.01 |
| 4XL, 5XL | 27.38 |

