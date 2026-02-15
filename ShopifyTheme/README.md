# ShopifyTheme

A lightweight Shopify Online Store 2.0 theme for **Alfe AI subscriptions**, styled with the **AlfeCode Dark Nexum** palette.

## Included structure

- `layout/theme.liquid` – global page shell and shared sections.
- `assets/nexum-subscriptions.css` – dark Nexum color tokens and UI styling.
- `sections/main-product-subscription.liquid` – subscription-focused product layout with quantity, add-to-cart, and buy-now actions.
- `templates/product.json` – uses the subscription product section.
- `templates/index.json` – subscription-focused landing section.

## Nexum color references used

- `--nexum-bg-outer: #050713`
- `--nexum-bg-inner: #111528`
- `--nexum-card: rgba(22, 28, 52, 0.94)`
- `--nexum-border: rgba(124, 144, 196, 0.24)`
- `--nexum-text: #e2e8f0`
- `--nexum-muted: #94a3b8`
- `--nexum-accent: #7c3aed`
- `--nexum-accent-bright: #8b5cf6`

## Usage

1. Copy the `ShopifyTheme` directory into your Shopify theme source repo.
2. Upload with Shopify CLI (`shopify theme push`) or via the theme code editor.
3. Assign your subscription product to `product.json` template.
4. Update section settings for menu links, announcement text, and CTA.
