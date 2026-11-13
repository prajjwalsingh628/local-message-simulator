const CACHE_NAME = 'local-message-simulator-eb797f26d4a2';
const APP_FILES = ["./aashna-mam-apple-touch-icon.png","./aashna-mam-icon-192.png","./aashna-mam-icon-512.png","./index-B2Yw5hKi.css","./index-CyxnXfdo.js","./favicon-v2.svg","./index.html","./manifest.webmanifest","./viewport-height.js"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES.map((path) => new URL(path, self.registration.scope).href)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('local-message-simulator-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(async () => {
        if (request.mode === 'navigate') {
          const shell = await caches.match(new URL('./index.html', self.registration.scope));
          if (shell) return shell;
        }
        throw new Error('This item is not cached for offline use.');
      });
    })
  );
});

