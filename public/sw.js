// Bloom service worker.
// Strategy:
//  - HTML/navigation requests: network-first, fall back to cached index.html only when offline.
//  - Hashed /assets/* files: cache-first (filenames change per build, so this is safe).
//  - Everything else: network-first with cache fallback.
// VERSION is replaced at build time with the build timestamp; any change in this
// file forces browsers to install + activate the new worker on next visit.
const VERSION = '__BUILD_VERSION__';
// In dev mode (running via `vite`/`vercel dev`) the version stamp never gets
// replaced, so the SW used to cache forever and prevent updates. Detect dev by
// the placeholder shape (build replaces it with a numeric timestamp). In dev,
// we disable all caching so the PWA always pulls the latest code.
const IS_DEV = VERSION.startsWith('__');
const ASSET_CACHE = `bloom-assets-${VERSION}`;
const HTML_CACHE = `bloom-html-${VERSION}`;

self.addEventListener('install', (event) => {
  // Pre-cache the shell so offline still works after first load.
  event.waitUntil(
    caches.open(HTML_CACHE).then((c) => c.add('/index.html')).catch(() => {})
  );
  // Activate this worker immediately, replacing any older one.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // In dev: nuke ALL bloom caches so nothing stale survives across reloads.
    // In prod: keep only the current version's caches.
    await Promise.all(
      keys
        .filter((k) => IS_DEV
          ? k.startsWith('bloom-')
          : (k !== ASSET_CACHE && k !== HTML_CACHE))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

var restTimeout = null;
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();

  // Schedule a notification from the SW — survives page death briefly.
  if (event.data && event.data.type === 'SCHEDULE_REST') {
    if (restTimeout) clearTimeout(restTimeout);
    restTimeout = setTimeout(function () {
      self.registration.showNotification(event.data.title || 'Bloom', {
        body: event.data.body || 'Rest is over — next set!',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'bloom-rest',
        vibrate: [300, 100, 300, 100, 500],
        requireInteraction: true,
      });
      restTimeout = null;
    }, (event.data.delaySec || 90) * 1000);
  }
  if (event.data && event.data.type === 'CANCEL_REST') {
    if (restTimeout) { clearTimeout(restTimeout); restTimeout = null; }
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls.
  if (url.pathname.startsWith('/api/')) return;

  // Dev mode: don't intercept anything. The browser/dev server handles freshness
  // directly, and any caching here will mask local code changes on the phone.
  if (IS_DEV) return;

  // Navigations / HTML: always go to the network so deploys show up immediately.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const copy = fresh.clone();
        caches.open(HTML_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
        return fresh;
      } catch (_) {
        const cached = await caches.match('/index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Hashed build assets: cache-first (URLs change per deploy).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Default: network-first, fall back to cache when offline.
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      return res;
    } catch (_) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});

// ---------- Push notifications ----------
self.addEventListener('push', (event) => {
  let data = { title: 'Bloom', body: 'Next set!' };
  try { data = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Bloom', {
      body: data.body || 'Rest is over — next set!',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'bloom-rest',
      vibrate: [300, 100, 300, 100, 500],
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin)) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
