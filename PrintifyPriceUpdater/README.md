# Printify Price Updater

This script updates pricing for the enabled variants of a Printify product and
sets a detailed product description. Sizes are inferred from each variant's
title (e.g. `"Black / M"`), so it works even if the size option metadata is
missing. After updating, the script retrieves the product again, prints the
variant JSON with the new prices for verification, and publishes the product to
the connected store (e.g. eBay).

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


## SKU Tracker

Use the included CLI to maintain a list of Printify SKUs in a local SQLite database. The tracker reads your Printify credentials from a `.env` file in this directory, so ensure `PRINTIFY_SHOP_ID` and `PRINTIFY_API_TOKEN` are set before adding SKUs.

### Commands

List stored SKUs:

```bash
node sku-tracker.js list
```

Add a new SKU:

```bash
node sku-tracker.js add <sku>
```

The title for each SKU is fetched from the Printify API and saved alongside the SKU.
Entries are persisted in `skus.db` inside this directory.

### Web UI

Run the tracker without any arguments to start a small web server with a simple interface for adding and listing SKUs:

```bash
node sku-tracker.js
```

Then visit [http://localhost:3000](http://localhost:3000) in your browser.
