// Trade Diary Service Worker - Offline PWA Engine
const CACHE_NAME = 'tradediary-v1.0.4';
const RUNTIME_CACHE = 'tradediary-runtime-v1.0.4';

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
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for app assets; Cache-First for CDNs & fonts
self.addEventListener('fetch', (event) => {
  // Only process GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Strategy for Google Fonts & CDN assets (Tailwind, Material Symbols)
  if (url.origin.includes('fonts.googleapis.com') ||
      url.origin.includes('fonts.gstatic.com') ||
      url.origin.includes('cdn.tailwindcss.com')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // Asynchronously update in background if online
          fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
          }).catch(() => {/* ignore background fetch errors */});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return cachedResponse || new Response('', { status: 408, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // Strategy for local application assets: Stale-While-Revalidate with offline fallback
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
        // Network failed (offline)
        if (cachedResponse) return cachedResponse;
        // If navigating to an HTML page, return index.html
        if (event.request.mode === 'navigate') {
          return cache.match('./index.html');
        }
        return new Response('Offline: resource not available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      });

      return cachedResponse || fetchPromise;
    })
  );
});
