// Trade Diary Service Worker - Offline PWA Engine
const CACHE_NAME = 'tradediary-v1.0.8';
const RUNTIME_CACHE = 'tradediary-runtime-v1.0.8';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/calculator.js',
  './js/db.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg'
];

// Install: Pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions and take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME && name !== RUNTIME_CACHE) {
            console.log('Purging old SW cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Strategy:
// 1. CDNs & Google Fonts: Cache-First with background revalidation
// 2. App Assets (HTML, CSS, JS): Network-First with Offline Cache Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Strategy for Google Fonts & CDN assets
  if (url.origin.includes('fonts.googleapis.com') ||
      url.origin.includes('fonts.gstatic.com') ||
      url.origin.includes('cdn.tailwindcss.com')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
          }).catch(() => {});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return cachedResponse || new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // Network-First for core application files
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(async () => {
        // Network offline: fall back to cache
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return cache.match('./index.html') || cache.match('/');
        }
        return new Response('', { status: 408, statusText: 'Offline' });
      })
  );
});
