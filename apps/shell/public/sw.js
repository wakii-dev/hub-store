// SF-23 (FI-268) T1 — hand-rolled service worker (Direction B, zero new npm dep).
// Fetch-guard THỨ TỰ BẮT BUỘC (spec §4.1): non-GET → cross-origin → /api/ TUYỆT ĐỐI
// pass-through (SSE sống ở /api — breaking guard này vỡ 07-realtime) → cache-first
// immutable → network-first (navigation + remoteEntry) → còn lại pass-through.
const CACHE = 'hubstore-v1';
const PRECACHE = ['/', '/offline.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // guard 1
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // guard 2: cross-origin (MF dev remotes, CDN)
  if (url.pathname.startsWith('/api/')) return; // guard 3: SSE + REST pass-through TUYỆT ĐỐI

  const accept = req.headers.get('accept') ?? '';
  const isNav = req.mode === 'navigate' || accept.includes('text/html');
  const isRemoteEntry = url.pathname.endsWith('remoteEntry.js');
  const isImmutable =
    url.pathname.startsWith('/assets/') ||
    url.pathname.includes('fontsource') ||
    url.pathname.startsWith('/icons/');

  if (isImmutable) {
    // cache-first
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (!res.ok) return res; // 500/404 tạm — KHÔNG pin vào cache
            const copy = res.clone();
            void caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .catch(() => {});
            return res;
          }),
      ),
    );
    return;
  }

  if (isNav || isRemoteEntry) {
    // network-first, offline → offline.html (precache) khi miss cache
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) return res; // 500/404 tạm — KHÔNG pin vào cache
          const copy = res.clone();
          void caches
            .open(CACHE)
            .then((c) => c.put(req, copy))
            .catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit ?? caches.match('/offline.html')),
        ),
    );
  }
  // còn lại: pass-through (không respondWith)
});
