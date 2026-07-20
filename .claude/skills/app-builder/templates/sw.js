/* Service worker — network-first HTML, cache-first static, never caches cross-origin.
   DEPLOY RITUAL: bump CACHE on every deploy or users get stale files. */
const CACHE = 'app-v1';                       // <-- BUMP THIS EVERY DEPLOY
const PRECACHE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();                         // paired with the page's update flow
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // allSettled: one missing file must not fail the whole install
      Promise.allSettled(PRECACHE.map(u => c.add(u)))
    )
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Let the page trigger activation of a waiting worker (manual or auto update).
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;        // never cache cross-origin
  if (req.url.includes('firestore') || req.url.includes('firebase')) return; // realtime stays live

  const path = new URL(req.url).pathname;

  // HTML shell: network-first so deploys reach users; cache fallback for offline.
  if (path === '/' || path.endsWith('/index.html') || path.endsWith('.html')) {
    e.respondWith(
      fetch(req)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then(c => c || caches.match('/')))
    );
    return;
  }

  // Static assets: cache-first, refresh in background.
  e.respondWith(
    caches.match(req).then(c => c || fetch(req).then(r => {
      const cp = r.clone(); caches.open(CACHE).then(cc => cc.put(req, cp)); return r;
    }))
  );
});
