const CACHE_NAME = 'alfe-cache-v3';
const URLS_TO_CACHE = [
  '/aurora.html',
  '/manifest.json',
  '/styles.css',
  '/styles-light.css',
  '/main.js',
  '/alfe_favicon_64x64.ico'
];

const STATIC_DESTINATIONS = new Set([
  'style',
  'script',
  'image',
  'font',
  'document'
]);

function shouldCacheRequest(request) {
  if (!request || request.method !== 'GET') {
    return false;
  }

  const url = new URL(request.url);

  // Never store cross-origin traffic, dynamic API calls, or browser extensions.
  if (url.origin !== self.location.origin) {
    return false;
  }
  if (url.pathname.startsWith('/api/')) {
    return false;
  }
  if (url.pathname.startsWith('/auth/')) {
    return false;
  }

  // Only cache static assets + documents.
  if (request.destination && !STATIC_DESTINATIONS.has(request.destination)) {
    return false;
  }

  return true;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (!shouldCacheRequest(event.request)) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      });
    }).catch(() => fetch(event.request))
  );
});
