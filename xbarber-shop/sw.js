'use strict';

const CACHE_NAME = 'xbarber-app-shell-v28';
const APP_ENTRY = '/src/index.html';
const NETWORK_TIMEOUT_MS = 3500;
const CORE_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/app-mode.json',
  '/sw.js',
  '/precache-manifest.json',
  APP_ENTRY,
  '/src/css/style.css',
  '/src/js/i18n.js',
  '/src/js/auth.js',
  '/src/js/app.js',
  '/src/js/web-api.js',
  '/src/js/slots.js',
  '/database/schema.sql',
  '/assets/logo/logo.png',
  '/assets/logo/apple-touch-icon.png',
  '/assets/logo/pwa-192.png',
  '/assets/logo/pwa-512.png',
  '/assets/logo/logo.ico',
  '/vendor/sql-wasm.js',
  '/vendor/sql-wasm.wasm',
  '/vendor/SQLJS-LICENSE'
];

// App code is fetched fresh when online so updates arrive on the next load;
// the cached copy is used offline or when the network is slow.
const NETWORK_FIRST = /\.(?:html|js|css|json|sql)$/i;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    let files = CORE_FILES;
    try {
      const response = await fetch('/precache-manifest.json', { cache: 'no-store' });
      if (response.ok) {
        const manifest = await response.json();
        if (Array.isArray(manifest.files) && manifest.files.length) files = manifest.files;
      }
    } catch (error) {
      console.warn('Using the core offline file list:', error.message);
    }
    // One missing file must not stop the rest of the app from working offline.
    await Promise.all([...new Set(files)].map(file =>
      cache.add(new Request(file, { cache: 'reload' })).catch(error => {
        console.warn(`Could not cache ${file} for offline use:`, error.message);
      })
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('xbarber-app-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(request).then(async response => {
    if (response.ok) await cache.put(key, response.clone());
    return response;
  });
  network.catch(() => {});

  const cached = await cache.match(key);
  if (!cached) return network;

  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    return (await Promise.race([network, timeout])) || cached;
  } catch {
    return cached;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname === '/app-mode.json') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(APP_ENTRY, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request, { ignoreSearch: true }))
          || (await caches.match(APP_ENTRY))
          || Response.error();
      }
    })());
    return;
  }

  if (NETWORK_FIRST.test(url.pathname) && !url.pathname.startsWith('/vendor/')) {
    event.respondWith(networkFirst(request, url.pathname));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
