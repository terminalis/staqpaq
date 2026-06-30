const CACHE_VERSION = 'staqpaq-shell-v8';
const SHELL_PATHS = Object.freeze([
  './',
  './index.html',
  './assets/manifest.webmanifest',
  './assets/favicon.svg',
  './assets/favicon-32.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/logo.svg',
  './assets/og-image.png',
  './src/ui/fonts/share-tech-mono-latin.woff2',
  './src/ui/fonts/vt323-latin.woff2',
  './src/ui/fonts/vt323-latin-ext.woff2',
  './src/ui/fonts/vt323-vietnamese.woff2',
  './src/ui/main.js',
  './src/ui/app.js',
  './src/ui/download.js',
  './src/ui/styles/fonts.css',
  './src/ui/styles/tokens.css',
  './src/ui/styles/base.css',
  './src/ui/styles/components.css',
  './src/ui/styles/screens.css',
  './src/ui/icons/sq-icon.js',
  './src/ui/icons/icon-data.js',
  './src/ui/components/sq-elements.js',
  './src/ui/components/sq-field.js',
  './src/ui/components/sq-modal.js',
  './src/ui/components/sq-option.js',
  './src/ui/components/sq-readiness.js',
  './src/ui/components/sq-section-nav.js',
  './src/ui/components/sq-yaml-preview.js',
  './src/ui/screens/configurator.js',
  './src/ui/screens/review-export.js',
  './vendor/lit-core.min.js',
  './vendor/idb-keyval.js',
  './vendor/fflate.js',
  './data/catalogue.json',
  './data/derivation.json',
  './data/sample.json'
]);

function scopeUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

function isScopedSameOrigin(url) {
  const scope = new URL(self.registration.scope);
  return url.origin === scope.origin && url.href.startsWith(scope.href);
}

function normalizedCacheKey(input) {
  const url = new URL(input, self.registration.scope);
  url.hash = '';
  return url.toString();
}

async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.all(urls.map(async (input) => {
    const url = new URL(input, self.registration.scope);
    if (!isScopedSameOrigin(url)) return;
    try {
      const request = new Request(url, { credentials: 'same-origin' });
      const response = await fetch(request);
      if (response.ok) await cache.put(normalizedCacheKey(url), response);
    } catch {
      /* Network failures are expected when offline; keep existing cache. */
    }
  }));
}

self.addEventListener('install', (event) => {
  const shellUrls = SHELL_PATHS.map(scopeUrl);
  event.waitUntil(cacheUrls(shellUrls).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('staqpaq-shell-') && key !== CACHE_VERSION)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'STAQPAQ_CACHE_URLS') return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil(cacheUrls(urls));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isScopedSameOrigin(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(scopeUrl('./index.html'), response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(scopeUrl('./index.html'));
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const key = normalizedCacheKey(url);
    const cached = await cache.match(key);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  })());
});
