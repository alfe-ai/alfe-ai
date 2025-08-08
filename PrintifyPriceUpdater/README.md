# Printify Price Updater

This script updates pricing for the enabled variants of a Printify product.

## Usage

1. Copy `sample.env` to `.env` and fill in your Printify credentials.
2. Run the script:

```bash
node update-pricing-by-size.js <product_id>
```

Prices are applied per size. Disabled variants are ignored to avoid
exceeding Printify's 100-variant limit:

| Size | Price (USD) |
| --- | --- |
| S, M, L, XL, 2XL | 23.97 |
| 3XL | 26.01 |
| 4XL, 5XL | 27.38 |

