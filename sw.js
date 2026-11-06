// Self-purging Service Worker for Trade Diary
// Immediately wipes all stale browser caches and routes directly to live network

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => {
        console.log('Purging cache:', key);
        return caches.delete(key);
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // Always fetch fresh from network to guarantee immediate UI & code updates
  event.respondWith(fetch(event.request));
});
