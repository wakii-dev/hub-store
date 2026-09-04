// SF-25 (FI-270) T3 — hand-rolled service worker, COPY pattern shell (SF-23).
// Fetch-guard THỨ TỰ BẮT BUỘC: non-GET → cross-origin → /api/ pass-through
// (REST + realtime sống ở /api) → cache-first immutable → navigation
// network-first → còn lại pass-through.
const CACHE = 'ktv-mobile-v1';
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
  if (url.origin !== self.location.origin) return; // guard 2: cross-origin (Keycloak, CDN)
  if (url.pathname.startsWith('/api/')) return; // guard 3: REST pass-through TUYỆT ĐỐI

  const accept = req.headers.get('accept') ?? '';
  const isNav = req.mode === 'navigate' || accept.includes('text/html');
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

  if (isNav) {
    // network-first, offline → offline.html (precache) khi miss cache
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) return res; // 500/404 tạm — KHÔNG pin vào cache
          // Security P2-1 (shell SF-23): OIDC callback URLs (code/state/token
          // trong query) — KHÔNG persist vào cache (authorization codes là
          // one-time secret).
          if (/[?&](code|state|token)=/.test(url.search)) return res;
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
