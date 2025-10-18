# Printify Price Updater

This script updates pricing for the enabled variants of a Printify product and
sets a detailed product description. Sizes are inferred from each variant's
title (e.g. `"Black / M"`), so it works even if the size option metadata is
missing. After updating, the script retrieves the product again, prints the
variant JSON with the new prices for verification. Publishing to the connected
store (e.g. eBay) is optional and controlled by the `PRINTIFY_PUBLISH`
environment variable. If `PRINTIFY_PUBLISH` is set to `true`, the script will
publish after updating. By default, publishing is skipped.

## Usage

1. Copy `sample.env` to `.env` and fill in your Printify credentials. Set
   `PRINTIFY_PUBLISH=true` if you want the script to publish the product after
   updating; omit or set to `false` to skip publishing. If `EBAY_API_TOKEN` is
   provided (or retrievable via the ProgramaticPuppet token flow), the SKU
   tracker will query eBay for existing listings automatically.
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

Use the included CLI to maintain a list of Printify SKUs in a local SQLite database. The tracker reads your Printify credentials from a `.env` file in this directory, so ensure `PRINTIFY_SHOP_ID` and `PRINTIFY_API_TOKEN` are set before adding SKUs. When an eBay token is available—either via `EBAY_API_TOKEN` or retrieved through ProgramaticPuppet—the tracker will attempt to look up the eBay listing ID for the SKU automatically.

### Commands

List stored SKUs:

```bash
node sku-tracker.js list
```

Add a new SKU:

```bash
node sku-tracker.js add <sku>
```

The title for each SKU is fetched from the Printify API and saved alongside the SKU. When an eBay token is available—either provided explicitly or retrieved automatically—the tracker also queries the eBay Inventory API to capture the listing ID. Entries are persisted in `skus.db` inside this directory. Each SKU can still store an associated eBay listing ID, which may be managed from the web interface if needed.

### Web UI

Run the tracker without any arguments to start a small web server with a simple interface for adding and listing SKUs:

```bash
node sku-tracker.js
```

Then visit [http://localhost:3101](http://localhost:3101) in your browser.
Each SKU row includes buttons to update eBay ID, run a price update, set the shipping policy, or mark the entry as **Done**.
