# PrintifyWeb

A lightweight Express application that surfaces your Printify product catalog in a simple, searchable web page.

## Prerequisites

- Node.js 18+
- A Printify API token and shop ID with access to your listings

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the sample environment file and fill in your Printify credentials:

   ```bash
   cp sample.env .env
   # edit .env to add PRINTIFY_SHOP_ID and PRINTIFY_API_TOKEN
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Visit [http://localhost:3000](http://localhost:3000) to browse your listings.

Use `npm run dev` for hot-reloading during development (requires the optional `nodemon` dev dependency).

## Environment variables

- `PRINTIFY_SHOP_ID` – The numeric ID of the Printify shop to query.
- `PRINTIFY_API_TOKEN` – A valid Printify API token.
- `PORT` (optional) – Port number for the Express server (defaults to `3000`).

## Notes

- The `/api/products` endpoint automatically paginates through your entire product catalog.
- Only a subset of the Printify product fields are returned to the browser to keep responses lightweight.
- Errors from the Printify API are surfaced in the UI to help diagnose authentication or networking issues.
- When Printify reports an eBay sales channel link or listing ID the UI now surfaces a "View on eBay" link automatically.
