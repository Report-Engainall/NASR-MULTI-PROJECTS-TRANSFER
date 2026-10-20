/* Aghbari offline shell. Financial data, auth responses and Supabase traffic are never cached. */
const CACHE_NAME = 'aghbari-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.ico'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Precache each asset independently: a missing optional manifest must not
        // cancel caching the usable offline document and favicon.
        await Promise.all(SHELL.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // A missing shell asset is non-fatal; other assets remain cached.
          }
        }));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('aghbari-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(rest|auth|api|rpc|storage|functions)\//i.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        // Only persist the public application shell. Never cache successful deep
        // navigations such as account, invoice or admin routes: those may contain
        // identity-bound data in future SSR changes.
        if (response.ok && url.pathname === '/') {
          const homeResponse = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put('/', homeResponse));
        }
        return response;
      }).catch(async () => (await caches.match('/')) || Response.error()),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic' && /\.(js|css|svg|png|jpe?g|webp|woff2?|ico)$/i.test(url.pathname)) {
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        }
        return response;
      });
      if (cached) {
        // The network promise is a background refresh; handle failure without
        // turning an offline refresh into an unhandled rejection.
        void network.catch(() => undefined);
        return cached;
      }
      return network.catch(() => Response.error());
    }),
  );
});
