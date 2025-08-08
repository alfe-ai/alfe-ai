# Printify Price Updater

This script updates pricing for the enabled variants of a Printify product.
Sizes are inferred from each variant's title (e.g. `"Black / M"`), so
it works even if the size option metadata is missing. After updating, the
script retrieves the product again and prints the variant JSON with the new
prices for verification.

## Usage

1. Copy `sample.env` to `.env` and fill in your Printify credentials.
2. Run the script:

```bash
node update-pricing-by-size.js <product_id>
# or
./run.sh <product_id>
```

Prices are applied per size. Disabled variants are ignored to avoid
exceeding Printify's 100-variant limit:

| Size | Price (USD) |
| --- | --- |
| S, M, L, XL, 2XL | 23.97 |
| 3XL | 26.01 |
| 4XL, 5XL | 27.38 |

