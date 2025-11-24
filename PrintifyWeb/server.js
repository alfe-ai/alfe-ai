const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs/promises');
const dotenv = require('dotenv');

// Load environment variables from .env if available
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const SHOP_ID = process.env.PRINTIFY_SHOP_ID;
const API_TOKEN = process.env.PRINTIFY_API_TOKEN;
const PRINTIFY_API_BASE = 'https://api.printify.com/v1';
const PRODUCTS_ENDPOINT = `/shops/${SHOP_ID}/products.json`;
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'products.json');
const API_PAGE_SIZE = 50;

let productCache = new Map();
let productList = [];
let cacheMetadata = {
  lastSyncedAt: null,
  lastPersistedAt: null,
  latestKnownUpdatedAt: null,
};
let activeSyncPromise = null;
let initializePromise = null;

if (!SHOP_ID || !API_TOKEN) {
  console.warn('\n⚠️  PRINTIFY_SHOP_ID or PRINTIFY_API_TOKEN is not configured.');
  console.warn('    -> Create a .env file based on sample.env before starting the server.\n');
}

app.use(express.static(path.join(__dirname, 'public')));

function normalizeVariant(variant) {
  return {
    id: variant.id,
    sku: variant.sku,
    title: variant.title,
    price: variant.price,
    cost: variant.cost,
    quantity: variant.quantity,
    is_enabled: variant.is_enabled,
  };
}

function pickString(source, keys) {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    if (!key) continue;
    const value = source[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeSalesChannel(channel) {
  if (!channel || typeof channel !== 'object') {
    return null;
  }

  const normalized = {
    platform:
      pickString(channel, ['platform', 'channel', 'type', 'platform_name']) ||
      pickString(channel, ['name', 'title']),
    name: pickString(channel, ['name', 'title', 'shop_name']),
    status: pickString(channel, ['status', 'state', 'publication_status']),
    marketplace: pickString(channel, ['marketplace', 'marketplace_id', 'marketplaceId']) || null,
    externalId: null,
    url: null,
  };

  const possibleSources = [
    channel,
    channel.external,
    channel.details,
    channel.data,
    channel.meta,
    channel.metadata,
    channel.links,
  ].filter((value) => value && typeof value === 'object');

  for (const source of possibleSources) {
    if (!normalized.externalId) {
      normalized.externalId =
        pickString(source, [
          'external_id',
          'externalId',
          'listing_id',
          'listingId',
          'external_listing_id',
          'externalListingId',
          'external_item_id',
          'externalItemId',
          'item_id',
          'itemId',
          'id',
        ]) || null;
    }

    if (!normalized.url) {
      normalized.url =
        pickString(source, [
          'external_url',
          'externalUrl',
          'listing_url',
          'listingUrl',
          'url',
          'href',
          'link',
        ]) || null;
    }

    if (normalized.externalId && normalized.url) {
      break;
    }
  }

  return normalized;
}

function normalizeSalesChannels(value) {
  if (!value) {
    return [];
  }

  const rawChannels = Array.isArray(value)
    ? value
    : typeof value === 'object'
    ? Object.values(value)
    : [];

  return rawChannels
    .map((channel) => normalizeSalesChannel(channel))
    .filter(Boolean);
}

function findEbayUrlInValue(value, seen = new Set()) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const match = value.match(/https?:\/\/[^\s"'<>]*ebay\.[^\s"'<>]*/i);
    if (match) {
      return match[0];
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  const entries = Array.isArray(value) ? value : Object.values(value);
  for (const entry of entries) {
    const nested = findEbayUrlInValue(entry, seen);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function deriveEbayListingInfo(item, salesChannels) {
  const channels = Array.isArray(salesChannels) ? salesChannels : [];
  const ebayChannel = channels.find((channel) => {
    return [channel.platform, channel.name, channel.marketplace]
      .filter((value) => typeof value === 'string')
      .some((value) => value.toLowerCase().includes('ebay'));
  });

  let listingId = (ebayChannel?.externalId || '').trim() || null;
  let url = (ebayChannel?.url || '').trim() || null;

  if (url && !/^https?:/i.test(url) && listingId && /^\d{9,}$/.test(listingId)) {
    url = `https://www.ebay.com/itm/${listingId}`;
  }

  if (!url) {
    const discoveredUrl = findEbayUrlInValue(item);
    if (discoveredUrl) {
      url = discoveredUrl;
    }
  }

  if (!url && listingId && /^\d{9,}$/.test(listingId)) {
    url = `https://www.ebay.com/itm/${listingId}`;
  }

  if (!listingId && url) {
    const match = url.match(/(\d{9,})/);
    if (match) {
      listingId = match[1];
    }
  }

  return {
    url: url || null,
    id: listingId || null,
  };
}

function normalizeProduct(item) {
  const salesChannels = normalizeSalesChannels(item?.sales_channels);
  const ebayInfo = deriveEbayListingInfo(item, salesChannels);

  return {
    id: item.id,
    title: item.title,
    handle: item.handle,
    description: item.description,
    created_at: item.created_at,
    updated_at: item.updated_at,
    tags: item.tags || [],
    images: item.images || [],
    variants: Array.isArray(item.variants) ? item.variants.map(normalizeVariant) : [],
    sales_channels: salesChannels,
    ebay_listing_url: ebayInfo.url,
    ebay_listing_id: ebayInfo.id,
  };
}

function sortProducts(products) {
  return [...products].sort((a, b) => {
    const updatedA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const updatedB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    if (updatedA !== updatedB) {
      return updatedB - updatedA;
    }
    return a.title.localeCompare(b.title);
  });
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function persistCache() {
  await ensureCacheDir();
  cacheMetadata.lastPersistedAt = new Date().toISOString();
  const payload = {
    products: productList,
    meta: cacheMetadata,
  };
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

async function loadCacheFromDisk() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.products)) {
      productCache = new Map(parsed.products.map((item) => [item.id, item]));
      productList = sortProducts(parsed.products);
    }
    if (parsed?.meta) {
      cacheMetadata = { ...cacheMetadata, ...parsed.meta };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Unable to load cached products from disk:', error.message);
    }
  }
}

async function fetchAndCacheProducts({ incremental = false } = {}) {
  if (!SHOP_ID || !API_TOKEN) {
    const err = new Error('Missing Printify credentials');
    err.status = 500;
    throw err;
  }

  const headers = {
    Authorization: `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  let page = 1;
  let hasMore = true;
  const seenIds = new Set();
  let updatedCount = 0;

  while (hasMore) {
    const response = await axios.get(`${PRINTIFY_API_BASE}${PRODUCTS_ENDPOINT}`, {
      params: { page, per_page: API_PAGE_SIZE },
      headers,
    });

    const payload = response.data || {};
    const items = Array.isArray(payload.data) ? payload.data : [];
    let pageChanged = false;
    let pageNewestTimestamp = null;

    for (const item of items) {
      const normalized = normalizeProduct(item);
      seenIds.add(normalized.id);

      const previous = productCache.get(normalized.id);
      const wasKnown = Boolean(previous);
      const wasUpdated = previous && previous.updated_at !== normalized.updated_at;

      if (normalized.updated_at) {
        const ts = new Date(normalized.updated_at).getTime();
        if (!Number.isNaN(ts)) {
          if (pageNewestTimestamp === null || ts > pageNewestTimestamp) {
            pageNewestTimestamp = ts;
          }
        }
      }

      if (!wasKnown || wasUpdated) {
        updatedCount += 1;
        pageChanged = true;
      }

      productCache.set(normalized.id, normalized);
    }

    const nextPageUrl = payload.next_page_url;
    hasMore = Boolean(nextPageUrl);
    if (hasMore) {
      page += 1;
    }

    if (incremental && !pageChanged) {
      const knownLatest = cacheMetadata.latestKnownUpdatedAt
        ? new Date(cacheMetadata.latestKnownUpdatedAt).getTime()
        : null;

      const knownLatestIsValid = knownLatest !== null && !Number.isNaN(knownLatest);
      const pageNewestIsValid = pageNewestTimestamp !== null && !Number.isNaN(pageNewestTimestamp);

      if (!knownLatestIsValid || !pageNewestIsValid || pageNewestTimestamp > knownLatest) {
        continue;
      }

      break;
    }

    if (!hasMore) {
      break;
    }
  }

  if (!incremental) {
    for (const id of Array.from(productCache.keys())) {
      if (!seenIds.has(id)) {
        productCache.delete(id);
      }
    }
  }

  productList = sortProducts(Array.from(productCache.values()));
  cacheMetadata.latestKnownUpdatedAt = productList.length
    ? productList.reduce((latest, product) => {
        if (!product.updated_at) {
          return latest;
        }
        const ts = new Date(product.updated_at).getTime();
        if (Number.isNaN(ts)) {
          return latest;
        }
        if (!latest) {
          return product.updated_at;
        }
        const latestTs = new Date(latest).getTime();
        if (Number.isNaN(latestTs) || ts > latestTs) {
          return product.updated_at;
        }
        return latest;
      }, null)
    : null;
  cacheMetadata.lastSyncedAt = new Date().toISOString();
  await persistCache();

  return {
    total: productList.length,
    newOrUpdated: updatedCount,
    lastSyncedAt: cacheMetadata.lastSyncedAt,
  };
}

function synchronize(options) {
  if (!activeSyncPromise) {
    activeSyncPromise = (async () => {
      try {
        return await fetchAndCacheProducts(options);
      } finally {
        activeSyncPromise = null;
      }
    })();
  }

  return activeSyncPromise;
}

function initialize() {
  if (!initializePromise) {
    initializePromise = (async () => {
      await loadCacheFromDisk();

      try {
        const syncResult = await synchronize({ incremental: false });
        return { initialSyncError: null, syncResult };
      } catch (error) {
        const status = error.response?.status || error.status;
        const statusText = error.response?.statusText;
        const code = error.code;
        const message = error.message;
        const details = error.response?.data;
        const context = [
          status ? `status ${status}${statusText ? ` ${statusText}` : ''}` : null,
          code ? `code ${code}` : null,
          message && !status && !code ? message : null,
        ]
          .filter(Boolean)
          .join(', ');

        console.error('Initial Printify sync failed:', context || message || error);
        if (typeof details === 'string') {
          const trimmed = details.trim();
          if (trimmed.length > 0) {
            const maxLength = 500;
            const output = trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
            console.error('→', output);
          }
        }

        const hasCachedProducts = productList.length > 0;
        if (hasCachedProducts) {
          console.warn('Continuing with cached Printify data until a manual refresh succeeds.');
        } else {
          console.warn('No cached Printify data available; responses will be empty until the API recovers.');
        }

        return { initialSyncError: error, syncResult: null };
      }
    })();
  }

  return initializePromise;
}

function getCachedProducts() {
  return productList;
}

app.get('/api/products', async (req, res) => {
  try {
    await initialize();
    res.json({
      products: getCachedProducts(),
      meta: cacheMetadata,
    });
  } catch (error) {
    const status = error.response?.status || error.status || 500;
    const message = error.response?.data || error.message || 'Unknown error';
    console.error('Failed to provide cached products:', message);
    res.status(status).json({
      error: 'Unable to retrieve Printify products',
      details: typeof message === 'string' ? message : undefined,
    });
  }
});

app.post('/api/products/refresh', async (req, res) => {
  try {
    await initialize();
    const result = await synchronize({ incremental: true });
    res.json({
      ...result,
      total: getCachedProducts().length,
    });
  } catch (error) {
    const status = error.response?.status || error.status || 500;
    const message = error.response?.data || error.message || 'Unknown error';
    console.error('Failed to refresh products from Printify:', message);
    res.status(status).json({
      error: 'Unable to refresh Printify products',
      details: typeof message === 'string' ? message : undefined,
    });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initialize()
  .then((result) => {
    if (result?.initialSyncError) {
      console.warn('Server started without a successful initial Printify sync.');
    }

    app.listen(PORT, () => {
      console.log(`PrintifyWeb server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to prime Printify cache before starting server:', error);
    process.exit(1);
  });
