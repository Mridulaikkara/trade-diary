/**
 * Trade Diary — Offline-First PWA Service Worker Engine
 * Provides deterministic 100% offline capability for iPhone, Android, and Desktop browsers.
 *
 * Strategies:
 * 1. App Shell (HTML & Core Views): Network-First with 2.5s timeout, falling back to cached shell
 * 2. Static Assets (Icons, Manifest, Images): Cache-First with runtime caching & background refresh
 * 3. External Web Fonts (Google Fonts & Material Symbols): Cache-First with runtime caching
 */

const CACHE_VERSION = 'trade-diary-v1.3.1';
const STATIC_CACHE = `trade-diary-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `trade-diary-runtime-${CACHE_VERSION}`;

// Core local assets required for complete offline operation
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
  './icons/favicon-64.png',
  './icons/apple-touch-icon.png',
  './icons/header-brand.png',
  './icons/header-logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo-1024.png',
  './icons/icon.svg'
];

// External assets to pre-cache optimistically
const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Inter:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
];

// 1. Install Event: Pre-cache App Shell and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      console.log('[SW] Pre-caching core offline assets...');
      try {
        await cache.addAll(CORE_ASSETS);
      } catch (err) {
        console.warn('[SW] Core pre-cache fallback:', err);
        // Fallback: cache items individually if addAll hits an edge-case
        for (const item of CORE_ASSETS) {
          try {
            await cache.add(item);
          } catch (e) {
            console.warn('[SW] Could not pre-cache:', item, e.message);
          }
        }
      }

      // Optimistically attempt external font assets without failing installation if offline
      for (const url of EXTERNAL_ASSETS) {
        try {
          const resp = await fetch(url, { mode: 'cors' });
          if (resp && resp.ok) {
            await cache.put(url, resp);
          }
        } catch (e) {
          console.warn('[SW] Non-critical font pre-cache skipped:', url, e.message);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up legacy caches and claim active clients immediately
self.addEventListener('activate', (event) => {
  const currentCaches = [STATIC_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!currentCaches.includes(cacheName)) {
            console.log('[SW] Purging stale cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: Network request with timeout
function fetchWithTimeout(request, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Network timeout after ' + timeoutMs + 'ms'));
    }, timeoutMs);

    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// 3. Fetch Event: Deterministic Offline Interception
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Strategy A: Navigation / HTML documents (Single Page App Shell)
  if (req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetchWithTimeout(req, 2500)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log('[SW] Offline detected: serving cached app shell for navigation to', req.url);
          const cached = await caches.match(req);
          if (cached) return cached;
          const indexCached = (await caches.match('./')) || (await caches.match('./index.html')) || (await caches.match('index.html'));
          if (indexCached) return indexCached;
          return new Response('Trade Diary is offline. Please connect to the internet to load for the first time.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Strategy B: Google Fonts & Font Files (Cache First with Runtime Caching)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
            }
            return networkResponse;
          })
          .catch(() => {
            return new Response('', { status: 408, statusText: 'Font request timed out' });
          });
      })
    );
    return;
  }

  // Strategy C: Same-Origin Static Assets (Icons, Manifest, Images)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          // Revalidate in background when online
          fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, networkResponse));
            }
          }).catch(() => {});
          return cached;
        }

        return fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            }
            return networkResponse;
          })
          .catch(async () => {
            console.log('[SW] Offline asset fallback for:', req.url);
            // If requesting an image offline, return the standard icon fallback
            if (req.destination === 'image') {
              return (await caches.match('./icons/icon-192.png')) || (await caches.match('./favicon.png'));
            }
          });
      })
    );
    return;
  }

  // Strategy D: Other requests (Network with Runtime Cache fallback)
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(req, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});
