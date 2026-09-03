# Plan: SF-23 — PWA + Push OneSignal + GA (FI-268)

Date: 2026-09-03 | Linear: FI-268 | Worktree: sf-23-pwa-push
Spec: `docs/superpowers/specs/2026-09-03-sf23-pwa-push-ga-design.md` (Direction B — hand-rolled SW, zero new npm dep)

## 0. Root cause analysis

### Root cause
App sinh trưởng từ rebuild SPA thuần — không có layer "platform" (installability/offline/notification/analytics). SF-10 vừa dựng Kafka→bffEvents bus + SSE; nền tảng event đã có, thiếu chân giao tới user.

### Current state
SPA network-only; tab đóng = mất mọi thông báo; không đo lường; offline = trắng trang. Chạy E2E qua boot-all.sh dev server.

### Expected outcome
Installable + offline fallback đẹp; nhận thông báo đơn/batch (mock: log DB + polling; real: OneSignal); GA4 đo pageview + 5 business events; env trống → 0 thay đổi hành vi, 0 console lỗi.

### Constraints & hardships
Envelope Kafka READ-ONLY (SF-27) → push targeting = broadcast; VITE_* là build-time → compose cần ARG; e2e chỉ che dev server (prod SW = manual walkthrough); Flyway V10 có thể race sibling SF.

### High-level strategy
Additive layer, mỗi leg 1 off-switch env; tái dụng bffEvents bus + audit.ts pool pattern; KHÔNG đụng SSE route, mutation routes, Kafka contract.

## 1. Problem
User cần cài app, nhận thông báo khi có đơn/batch mới, và đo lường sử dụng — cả 3 đều thiếu hoàn toàn.

## 2. Scope
- In: manifest+SW+offline.html+icons; OneSignal dual-mode; GA dual-mode; notification_log V10 + GET /api/notifications; subscribe-on-login; env wiring; e2e 08-pwa.
- Out: offline CRUD queue; preference center; GA user tracking; đổi envelope/SSE route; logic remotes.
- Success criteria: ACCEPTANCE 4 dòng trong context pack (installable; login→thông báo; env trống sạch; e2e xanh).

## 3. Touch map
Modify: `apps/shell/index.html`, `apps/shell/src/main.tsx`, `apps/shell/src/App.tsx`, `services/bff-gateway/src/{config.ts,app.ts,server.ts}`, `packages/shared/src/index.ts`, `apps/orders/src/features/{CreateOrderModal,ImportOrdersModal}.tsx`, `apps/orders/src/pages/D1Page.tsx`, `apps/fulfillment/src/pages/{BatchListPage,PrintPage}.tsx`, `.env.example`, `docker-compose.yml`, `Dockerfile.web`, `docker/nginx.conf`
Create: `apps/shell/public/{manifest.webmanifest,sw.js,offline.html,icons/icon-192.png,icons/icon-512.png}`, `apps/shell/src/lib/{pwa.ts,push.ts,notificationPoller.ts}`, `packages/shared/src/analytics/ga.ts`, `services/bff-gateway/src/lib/{notifications.ts,onesignal.ts,push-triggers.ts}`, `services/bff-gateway/src/routes/notifications.ts`, `services/fulfillment-service/src/main/resources/db/migration/V10__notification_log.sql`, `e2e/tests/08-pwa.spec.ts`
Regression candidates: e2e 01–07 (đặc biệt 07-realtime — SW phải pass-through `/api`), SSE route, intake/batches/fulfillment mutation routes (KHÔNG đụng), Dockerfile.web build.
Shared surfaces: env +3 vars; DB +1 table (V10); HTTP +1 GET endpoint; KHÔNG đổi proto/Kafka/SSE contract.

## 4. Design
- Approach: Direction B (xem spec §4 chi tiết đầy đủ — SW fetch-guard 5 tầng, broadcast targeting, polling delivery, dedupe ON CONFLICT, freeze exception shared).
- Alternatives dismissed: vite-plugin-pwa (×MF chưa chứng minh), SSE delivery (phải sửa route đã audit).
- Edge cases: SW stale-deploy (network-first index); Kafka redelivery (dedupe_key unique); session restore (login trên boot); env trống (early return mọi init); OneSignal CDN fail (catch silent).
- Non-functional: security (REST key server-only, KHÔNG VITE_), perf (SW cache-first immutable, poll 30s 1 request), a11y (offline.html semantic), i18n (text vi hardcoded trong static file — offline không có i18n runtime).

## 5. Implementation outline — 9 tasks

Tier DAG: T1,T3,T4,T7 → T2(T1),T5(T3+T4),T6(T1+T3+T7 — plan-critic P1: T7 trước T6 vì cả hai sửa App.tsx; T1 trước T6 vì cả hai sửa main.tsx) → T8(T5+T6+T7) → T9(all). Coordinator ENFORCE: T6 chỉ start sau khi T1+T7 commit xong (App.tsx/main.tsx shared files — executor chạy cùng worktree).

| # | Task | Scope |
|---|------|-------|
| T1 | pwa-manifest-sw | manifest + icons + sw.js core + registerSW + index.html |
| T2 | offline-fallback | offline.html + SW offline navigation fallback + precache |
| T3 | notification-log | V10 migration + lib/notifications.ts + GET /api/notifications + tests |
| T4 | onesignal-dual-mode | config block + lib/onesignal.ts + tests |
| T5 | push-events | lib/push-triggers.ts + server.ts wire + tests |
| T6 | subscribe-login | FE push.ts (OneSignal env-gated) + notificationPoller.ts + App.tsx wire |
| T7 | ga-dual-mode | shared/analytics/ga.ts + freeze exception + pageview + 5 trackEvent sites |
| T8 | env-wiring | .env.example + Dockerfile.web ARG + compose build args + nginx MIME |
| T9 | e2e-both-modes | e2e/tests/08-pwa.spec.ts + full-suite regression |

Testing strategy: vitest unit (BFF libs mirror audit.spec.ts pattern; ga off/on; sw rules qua e2e), integration GET route, e2e serial prefix 08; regression 01–07.

## 6. Risks & unknowns
- Verify trước T3: `ls services/fulfillment-service/src/main/resources/db/migration/` + sibling worktrees — V10 còn trống không (SF-28 ở V9); trùng → đổi V11 + header comment (V5 precedent).
- SW × 07-realtime: guard `/api` pass-through BẮT BUỘC đúng thứ tự guard; chạy 07 sau T1.
- VITE build-time: e2e chỉ chạy off-mode (env trống mặc định) — real mode compose = điền key + rebuild (ghi .env.example comment).
- BFF-audit-pool dùng chung FULFILLMENT_DB_* — notifications pool RIÊNG instance (không share pool audit) nhưng cùng env pattern.

---

## Tasks (chi tiết thực thi — executor đọc từ đây)

### Task T1: pwa-manifest-sw
**Files:** Create `apps/shell/public/manifest.webmanifest`, `apps/shell/public/sw.js`, `apps/shell/public/icons/icon-192.png`, `icon-512.png`, `apps/shell/src/lib/pwa.ts`; Modify `apps/shell/index.html`, `apps/shell/src/main.tsx`; Test `apps/shell/src/lib/__tests__/pwa.test.ts` (theme token assert — pattern `shared-theme.test.ts`).

- [x] **Step 1: Icons.** Script 1 lần /tmp (không vào repo): Node zlib viết PNG solid #EB6E09 (192/512, RGBA) — minimal PNG encoder ~30 dòng (IHDR+IDAT+IEND, CRC32 table). Commit 2 PNG kết quả vào `apps/shell/public/icons/`.
- [x] **Step 2: manifest.webmanifest**

```json
{
  "name": "HubStore",
  "short_name": "HubStore",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#EB6E09",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [x] **Step 3: sw.js** — PRECACHE + fetch-guard ĐÚNG THỨ TỰ (guard 3 `/api` là biênemode sống-của-SSE):

```js
const CACHE = 'hubstore-v1';
const PRECACHE = ['/', '/offline.html'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // guard 1
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // guard 2: cross-origin (MF dev remotes, CDN)
  if (url.pathname.startsWith('/api/')) return;            // guard 3: SSE + REST pass-through TUYỆT ĐỐI
  const accept = req.headers.get('accept') ?? '';
  const isNav = e.request.mode === 'navigate' || accept.includes('text/html');
  const isRemoteEntry = url.pathname.endsWith('remoteEntry.js');
  const isImmutable = url.pathname.startsWith('/assets/') || url.pathname.includes('fontsource') || url.pathname.startsWith('/icons/');
  if (isImmutable) {                                       // cache-first
    e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      const copy = res.clone();
      void caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    })));
    return;
  }
  if (isNav || isRemoteEntry) {                            // network-first
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        void caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((hit) => hit ?? caches.match('/offline.html'))),
    );
  }
  // còn lại: pass-through (không respondWith)
});
```

- [x] **Step 4: pwa.ts**

```ts
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* env không hỗ trợ / đăng ký lỗi — no-op, không console lỗi */
    });
  });
}
```

- [x] **Step 5: index.html** — trong `<head>`: `<link rel="manifest" href="/manifest.webmanifest" />`, `<meta name="theme-color" content="#EB6E09" />`, `<link rel="apple-touch-icon" href="/icons/icon-192.png" />`. main.tsx: import + gọi `registerServiceWorker()` sau render.
- [x] **Step 6: test** — `pwa.test.ts` assert: manifest literal `theme_color` === design-tokens `primary` (import từ `@hub-store/shared`); sw.js source chứa guard `/api/` + `text/event-stream` không cần (guard 3 theo path đủ); index.html chứa link manifest.
- [x] **Step 7: Run** `pnpm --filter @hub-store/shell test` → PASS; **smoke curl-level**: boot shell dev server (hoặc boot-all) → `curl -s -o /dev/null -w "%{http_code} %{content_type}" http://localhost:3000/manifest.webmanifest` = `200 application/manifest+json` (hoặc JSON), `/sw.js` = 200 `text/javascript`.
- [x] **Step 8: Commit** `feat(pwa): manifest + service worker + icons (SF-23 T1)`

### Task T2: offline-fallback
**Files:** Create `apps/shell/public/offline.html`; Modify `apps/shell/public/sw.js` (precache offline.html — đã có từ T1; thêm fallback đã có ở network-first); Test qua e2e T9.

- [x] **Step 1: offline.html** — static semantic, inline CSS: gradient nền nhạt, logo-dot #EB6E09, `h1 Mất kết nối`, `p Vui lòng kiểm tra mạng và thử lại.`, nút "Thử lại" (`onclick="location.reload()"`), font stack Roboto. KHÔNG import JS bundle nào (mục đích: dùng được khi React chưa cache).
- [ ] **Step 2: Verify SW**: offline qua DevTools → navigate `/` → thấy offline.html; online → app trở lại. network-first navigation đã trả `caches.match('/offline.html')` khi miss cache (T1 code) — T2 chỉ thêm nội dung + precache list. *(defer sang e2e T9 — headless không DevTools được; T9 assert file này)*
- [x] **Step 3: Commit** `feat(pwa): offline fallback page (SF-23 T2)` *(a6a2f6d)*

### Task T3: notification-log
**Files:** Create `services/fulfillment-service/src/main/resources/db/migration/V10__notification_log.sql`, `services/bff-gateway/src/lib/notifications.ts`, `services/bff-gateway/src/routes/notifications.ts`; Modify `services/bff-gateway/src/app.ts`; Test `services/bff-gateway/test/notifications.spec.ts` (mirror audit.spec.ts vị trí + pattern — check path test hiện có).

**Step 0 (BLOCKER-CHECK):** `ls services/fulfillment-service/src/main/resources/db/migration/` — V10 bị chiếm → dùng số trống kế tiếp + ghi header comment lý do (V5 precedent).

- [x] **Step 1: V10__notification_log.sql**

```sql
-- SF-23 (FI-268): notification_log — push/notification trail (broadcast-by-design).
-- BFF ghi trực tiếp (pattern activity_log V5). dedupe_key unique = eventId envelope
-- → Kafka redelivery idempotent (ON CONFLICT DO NOTHING phía writer).
CREATE TABLE IF NOT EXISTS notification_log (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NOT NULL,
  payload JSONB,
  dedupe_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log (created_at DESC);
```

- [x] **Step 2: lib/notifications.ts** — mirror audit.ts CHÍNH XÁC về shape (lazy pool riêng instance, fail-open, `__setNotificationsPoolForTests`, page cap 100/20):

```ts
import { Pool } from 'pg';
export interface NotificationRow { id: number; type: string; title: string; body: string; payload: Record<string, unknown> | null; createdAt: string; }
let pool: Pool | null = null;
export function getNotificationPool(env: NodeJS.ProcessEnv = process.env): Pool | null { /* như audit.ts — FULFILLMENT_DB_* env, max 5, timeout 3000 */ }
export function __setNotificationsPoolForTests(p: Pool | null): void { pool = p; }
/** Fire-and-forget, idempotent theo dedupe_key. */
export function logNotification(n: { type: string; title: string; body: string; payload?: Record<string, unknown>; dedupeKey?: string }, env = process.env): void {
  const p = getNotificationPool(env);
  if (!p) return;
  void p.query(
    'INSERT INTO notification_log (type, title, body, payload, dedupe_key) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dedupe_key) DO NOTHING',
    [n.type, n.title, n.body, n.payload ?? null, n.dedupeKey ?? null],
  ).catch((err: Error) => console.warn(`[notifications] write failed: ${err.message}`));
}
export async function listNotifications(page: number, pageSize: number, env = process.env): Promise<{ items: NotificationRow[]; total: number }> {
  const p = getNotificationPool(env);
  if (!p) return { items: [], total: 0 };
  const off = (page - 1) * pageSize;
  const items = await p.query('SELECT id, type, title, body, payload, created_at FROM notification_log ORDER BY created_at DESC LIMIT $1 OFFSET $2', [pageSize, off]);
  const total = await p.query('SELECT COUNT(*)::int AS c FROM notification_log');
  return { items: items.rows.map(/* map snake→camel */), total: total.rows[0].c };
}
```

- [x] **Step 3: routes/notifications.ts** — `GET /api/notifications?page=&pageSize=` JWT-guarded (app-level guard tự áp); reuse `normalizeAuditPage` pattern (Number.isFinite guard — input rác → default, KHÔNG 500). Pool thiếu → `{items:[],total:0}` 200 (fail-open như audit disabled). Comment đầu route: broadcast-by-design — KHÔNG lọc theo user.
- [x] **Step 4: app.ts** — import + `registerNotificationsRoutes(app);` cạnh registerEventsRoutes.
- [x] **Step 5: tests** — vitest: pool inject giả → logNotification INSERT params đúng + dedupe conflict không throw; listNotifications map camel; route integration (app.inject) 401 khi không JWT / 200 envelope khi có (pattern spec auth hiện có — xem test dùng `signToken`/mock JWKS nào trong test/*.spec.ts và làm y hệt).
- [x] **Step 6: Run** `pnpm --filter @hub-store/bff-gateway test` → PASS. **Commit** `feat(bff): notification_log + GET /api/notifications (SF-23 T3)`

### Task T4: onesignal-dual-mode (BFF)
**Files:** Modify `services/bff-gateway/src/config.ts` (BffConfig + loadConfig); Create `services/bff-gateway/src/lib/onesignal.ts`; Test `services/bff-gateway/test/onesignal.spec.ts`.

- [x] **Step 1: config** — thêm vào BffConfig + loadConfig return:

```ts
onesignal: {
  // 'restApiKey' rỗng = mock mode (chỉ notification_log; KHÔNG gọi OneSignal).
  restApiKey: env.ONESIGNAL_REST_API_KEY ?? '',
},
```

- [x] **Step 2: lib/onesignal.ts**

```ts
export interface PushPayload { title: string; body: string; }
/** Best-effort broadcast "Subscribed Users". Return true nếu OneSignal accept (id trả về). */
export async function sendOneSignalPush(restApiKey: string, payload: PushPayload): Promise<boolean> {
  if (!restApiKey) return false; // mock mode — caller tự quyết log-only
  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restApiKey}` },
      body: JSON.stringify({
        app_id: /* appId không cần cho REST với key? CẦN app_id — thêm env.ONESIGNAL_APP_ID (BFF side) vào config.onesignal */,
        included_segments: ['Subscribed Users'],
        headings: { en: payload.title },
        contents: { en: payload.body },
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.warn(`[onesignal] push failed: ${(err as Error).message}`);
    return false;
  }
}
```

⚠ LƯU Ý EXECUTOR: REST API cần `app_id` → config block phải là `{ restApiKey: env.ONESIGNAL_REST_API_KEY ?? '', appId: env.ONESIGNAL_APP_ID ?? '' }` (BFF-side APP_ID, KHÔNG nhầm VITE_ONESIGNAL_APP_ID build-time của FE — 2 env khác nhau, .env.example ghi rõ cả hai). Mock mode khi THIẾU restApiKey HOẶC appId.
- [x] **Step 3: test** — inject global fetch mock: có key → POST đúng shape (segments, headings/contents, Authorization Basic) + timeout path; thiếu key → return false KHÔNG fetch; fetch reject → false + không throw.
- [x] **Step 4: Run + Commit** `feat(bff): OneSignal REST adapter dual-mode (SF-23 T4)`

### Task T5: push-events
**Files:** Create `services/bff-gateway/src/lib/push-triggers.ts`; Modify `services/bff-gateway/src/server.ts`; Test `services/bff-gateway/test/push-triggers.spec.ts`.

- [x] **Step 1: push-triggers.ts**

```ts
import { bffEvents, type KafkaEventMessage } from '../kafka/events.js';
import { logNotification } from './notifications.js';
import { sendOneSignalPush } from './onesignal.js';
import type { BffConfig } from '../config.js';

/** Types "quan trọng" → push (spec §4.2). KHÔNG đổi allow-list REALTIME_EVENT_TYPES của SSE. */
const PUSH_EVENT_COPY: Record<string, { title: string; body: (p: Record<string, unknown>) => string }> = {
  'order.assigned':  { title: 'Đơn mới vào', body: (p) => `Đơn ${p.fulfillCode ?? ''} đã được phân công.` },
  'order.completed': { title: 'Đơn hoàn tất', body: (p) => `Đơn ${p.fulfillCode ?? ''} hoàn tất giao.` },
  'order.failed':    { title: 'Giao thất bại', body: (p) => `Đơn ${p.fulfillCode ?? ''} giao thất bại — cần xử lý.` },
  'batch.completed': { title: 'Phiếu hoàn tất', body: (p) => `Phiếu soạn ${p.batchCode ?? p.code ?? ''} hoàn tất.` },
};

export function startPushTriggers(config: BffConfig, env: NodeJS.ProcessEnv = process.env): () => void {
  const handler = (m: KafkaEventMessage) => {
    const env2 = m.envelope as { eventId?: string; type?: string; payload?: Record<string, unknown> } | null;
    if (!env2?.type) return;
    const copy = PUSH_EVENT_COPY[env2.type];
    if (!copy) return;
    const payload = env2.payload ?? {};
    const title = copy.title;
    const body = copy.body(payload);
    logNotification({ type: env2.type, title, body, payload, dedupeKey: env2.eventId }, env);
    // real mode (có key + appId) → thêm Web Push; mock → log-only. KHÔNG await.
    void sendOneSignalPush(config.onesignal, { title, body });
  };
  bffEvents.on('kafka:event', handler);
  return () => bffEvents.off('kafka:event', handler);
}
```

(Executor: điều chỉnh signature sendOneSignalPush nhận cả config.onesignal object — nhất quán T4.)
- [x] **Step 2: server.ts** — import + wire cạnh kafka consumer:

```ts
const stopPushTriggers = startPushTriggers(config);
// signal handler: gọi stopPushTriggers() trong chuỗi shutdown
```

- [x] **Step 3: test** — bffEvents.emit('kafka:event', {topic:'order-events', envelope:{eventId:'evt-1',type:'order.assigned',payload:{fulfillCode:'ORD-1'}}}) → pool giả nhận 1 INSERT với dedupeKey 'evt-1'; type không trong map (vd order.cancelled) → 0 INSERT; emit trùng eventId → 1 INSERT (ON CONFLICT do SQL — assert không throw + chỉ intent); mock mode (key rỗng) → sendOneSignalPush false path.
- [x] **Step 4: Run + Commit** `feat(bff): push triggers trên bffEvents bus (SF-23 T5)`

### Task T6: subscribe-login (FE push + polling)
**Files:** Create `apps/shell/src/lib/push.ts`, `apps/shell/src/lib/notificationPoller.ts`; Modify `apps/shell/src/main.tsx`, `apps/shell/src/App.tsx`; Test `apps/shell/src/lib/__tests__/push.test.ts`.

- [x] **Step 1: push.ts** — env-gated OneSignal init + login/logout:

```ts
declare const OneSignal: { init(o: { appId: string }): Promise<void>; login(id: string): Promise<void>; logout(): Promise<void>; slidedown?: unknown } | undefined;
const APP_ID = (import.meta as any).env?.VITE_ONESIGNAL_APP_ID as string | undefined;
let started = false;
export function initOneSignal(): void {
  if (!APP_ID || started) return; // env trống → no-op KHÔNG lỗi (acceptance)
  started = true;
  const s = document.createElement('script');
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  s.defer = true; s.async = true;
  s.onerror = () => { /* CDN fail — app vẫn chạy */ };
  s.onload = () => { void (window as any).OneSignal?.init({ appId: APP_ID }); };
  document.head.appendChild(s);
}
export function pushLogin(username: string | undefined): void {
  if (!APP_ID || !username || !(window as any).OneSignal) return;
  void (window as any).OneSignal.login(username); // external_id = preferred_username
}
export function pushLogout(): void {
  if (!APP_ID || !(window as any).OneSignal) return;
  void (window as any).OneSignal.logout();
}
```

- [x] **Step 2: login + session-restore hook** — trong `main.tsx` gọi `initOneSignal()`. Trong `App.tsx` nơi đã có `onSessionChange`/`loadCurrentUser` (xem sessionFromUser): tại useEffect session — `pushLogin(session?.user?.profile?.preferred_username)` khi có user, `pushLogout()` khi null. **ĐƯỜNG BOOT BẮT BUỘC**: onSessionChange fire cả khi restore từ storage → external_id sống qua reload (spec-critic P1).
- [x] **Step 3: notificationPoller.ts** — KHÔNG import axios thô (shell không có dep đó): dùng `getAxiosInstance()` từ `@hub-store/api-client` — baseURL `VITE_API_BASE_URL ?? 'http://localhost:8080'` + tự gắn Bearer qua token getter đã register:

```ts
import { getAxiosInstance } from '@hub-store/api-client';
const SEEN_KEY = 'sf23.notification.seenIds';
export function seenIds(): Set<number> { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as number[]); } catch { return new Set(); } }
function saveSeen(ids: Set<number>): void { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200))); }
export interface NewNotification { id: number; title: string; body: string; }
/** Poll 1 lần — trả về rows mới (chưa thấy) để caller hiện antd notification. */
export async function pollNotifications(): Promise<NewNotification[]> {
  const { data } = await getAxiosInstance().get('/api/notifications?page=1&pageSize=10');
  const seen = seenIds();
  const fresh = (data?.items ?? []).filter((n: { id: number }) => !seen.has(n.id));
  fresh.forEach((n: { id: number }) => seen.add(n.id));
  saveSeen(seen);
  return fresh;
}
```

- [x] **Step 4: App.tsx wire** — ⚠ MECHANISM (plan-critic P1): `onSessionChange` KHÔNG fire khi restore từ storage (boot đi qua `loadCurrentUser()` → state, bypass manager events). Hook **`pushLogin(session.sub)` trong useEffect keyed trên `session` STATE của App** (App.tsx ~:120 set session từ loadCurrentUser + signinCallback) — che phủ cả login mới lẫn restore. `ShellSession = {sub, role}` (KHÔNG có .user.profile). useEffect khi session có sub: `const t = setInterval(() => void pollNotifications().then(showAntdNotifications).catch(() => {}), 30_000)` + poll ngay 1 lần; session null → pushLogout + clearInterval. showAntdNotifications = `notification.info({ message: n.title, description: n.body })` (check shell đã dùng static `notification` hay `App.useApp()` — làm theo pattern hiện có).
- [x] **Step 5: test** — vitest jsdom (LƯU Ý: APP_ID đọc module-scope → test env-on cần `vi.resetModules()` + stub `import.meta.env` trước import động — pattern readEnv comment oidc.ts:29-39): env trống → initOneSignal không inject script; pollNotifications: mock getAxiosInstance → filter unseen đúng, seen persist localStorage.
- [x] **Step 6: Run shell tests + Commit** `feat(shell): OneSignal init + subscribe-on-login + notification polling (SF-23 T6)`

### Task T7: ga-dual-mode
**Files:** Create `packages/shared/src/analytics/ga.ts` + `packages/shared/src/analytics/__tests__/ga.test.ts` (vị trí test theo pattern package); Modify `packages/shared/src/index.ts` (+1 export line), `apps/shell/src/App.tsx` (pageview), 5 call-site files (1 line mỗi file).

- [x] **Step 1: ga.ts** (readEnv có fallback process.env — pattern oidc.ts, vì import.meta.env trong vitest là per-module; commit 0f5090a)

```ts
type GtagFn = (...args: unknown[]) => void;
const MEASUREMENT_ID = (import.meta as any).env?.VITE_GA_MEASUREMENT_ID as string | undefined;
const buffer: Array<{ name: string; params?: Record<string, unknown> }> = [];
/** Off-mode: đọc được từ test/e2e (window.__gaBuffer). KHÔNG network. */
declare global { interface Window { __gaBuffer?: typeof buffer; dataLayer?: unknown[]; gtag?: GtagFn } }
export function initAnalytics(): void {
  if (!MEASUREMENT_ID || typeof window === 'undefined') return;
  const s = document.createElement('script');
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  s.async = true; s.onerror = () => {};
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) { window.dataLayer!.push(args); } as GtagFn;
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
}
export function pageview(path: string): void {
  if (!MEASUREMENT_ID || typeof window === 'undefined') { pushBuffer('page_view', { path }); return; }
  window.gtag?.('event', 'page_view', { page_path: path });
}
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!MEASUREMENT_ID || typeof window === 'undefined') { pushBuffer(name, params); return; }
  window.gtag?.('event', name, params);
}
function pushBuffer(name: string, params?: Record<string, unknown>): void {
  buffer.push({ name, params });
  if (typeof console !== 'undefined') console.debug(`[ga:off] ${name}`, params ?? '');
}
if (typeof window !== 'undefined') window.__gaBuffer = buffer;
```

- [x] **Step 2: export** — `packages/shared/src/index.ts` thêm `export * from './analytics/ga'; // SF-23 freeze exception (pattern SF-2/SF-27 amendment)` + sửa NOTE dòng 2 thành "trừ api-contracts/ + events/ + analytics/ (SF-23)".
- [x] **Step 3: pageview** — App.tsx: component nhỏ `RouteTracker()` dùng `useLocation()` + `useEffect(() => { pageview(location.pathname); }, [location.pathname])`, mount trong BrowserRouter (cạnh Routes).
- [x] **Step 4: call sites** (batch_created đặt tại CreateBatchingModal.tsx handleCreate — success thật, KHÔNG phải D1Page như plan đoán) — sau mutation THÀNH CÔNG (đúng dòng success — KHÔNG phải trong catch): `CreateOrderModal.tsx` `trackEvent('order_created')`; `ImportOrdersModal.tsx` `trackEvent('orders_imported', { count })`; `apps/orders/src/pages/D1Page.tsx` (createBatch success) `trackEvent('batch_created')`; `apps/fulfillment/src/pages/BatchListPage.tsx` (completePicking :262) `trackEvent('batch_completed')`; `apps/fulfillment/src/pages/PrintPage.tsx` (:136) `trackEvent('print')`. Import `import { trackEvent } from '@hub-store/shared';`.
- [x] **Step 5: test** — vitest jsdom: env trống → initAnalytics không inject script; trackEvent vào buffer; env giả lập có ID (mock import.meta.env theo pattern readEnv của shell) → dataLayer push.
- [x] **Step 6: Run** shared + shell + orders + fulfillment tests (call-site files) + Commit `feat(analytics): GA dual-mode + business trackEvent (SF-23 T7)` — 62/55/69/39 PASS, commit 0f5090a

### Task T8: env-wiring
**Files:** Modify `.env.example`, `docker-compose.yml` (bff env + web build args), `Dockerfile.web`, `docker/nginx.conf`.

- [x] **Step 1: .env.example** — block mới cạnh AHAMOVE:

```
# SF-23 — PWA push + analytics (dual-mode: điền key → thật, trống → mock/off)
# FE (BUILD-TIME — thay đổi phải REBUILD image web):
#VITE_ONESIGNAL_APP_ID=     # OneSignal app id (FE SDK init)
#VITE_GA_MEASUREMENT_ID=    # GA4 G-XXXXXXX
# BFF (RUNTIME):
#ONESIGNAL_APP_ID=          # OneSignal app id (REST API body)
#ONESIGNAL_REST_API_KEY=    # REST API key — local-only, KHÔNG commit
```

- [x] **Step 2: Dockerfile.web** — fe-build stage: 2 `ARG VITE_ONESIGNAL_APP_ID` + `ARG VITE_GA_MEASUREMENT_ID` + 2 `ENV` cùng tên TRƯỚC `RUN pnpm build` (vite nhúng build-time).
- [x] **Step 3: docker-compose.yml** — service web (xác định tên service thật trong compose): `build.args` 2 VITE_ (từ `${VITE_ONESIGNAL_APP_ID:-}`); service bff: environment thêm `ONESIGNAL_APP_ID` + `ONESIGNAL_REST_API_KEY` (pattern env hiện có).
- [x] **Step 4: nginx.conf** — ensure MIME webmanifest: trong server block thêm `include /etc/nginx/mime.types;` đã mặc định — thêm types entry nếu thiếu:

```nginx
# SF-23: manifest MIME (một số image nginx thiếu default)
types { application/manifest+json webmanifest; }
```

(đặt trong location / hoặc http context của conf.d — nếu nginx 1.27 mime.types đã có `manifest+json` thì bỏ bước này, kiểm bằng `grep manifest docker/nginx.conf` + kiến thức base image).
- [x] **Step 5: Verify** — `docker compose config` parse OK; `pnpm build` FE vẫn PASS với env trống. **Commit** `chore(env): wire VITE_/ONESIGNAL env cho dual-mode (SF-23 T8)`

### Task T9: e2e-both-modes
**Files:** Create `e2e/tests/08-pwa.spec.ts`.

- [x] **Step 1: spec** (pattern: storageState default coordinator, serial; **P0 plan-critic: mọi assert `/api/...` dùng BFF base `http://localhost:8080` — shell dev server KHÔNG có proxy, relative path SPA-fallback về index.html**; Bearer token pattern: `e2e/tests/07-realtime.spec.ts:32-72` — đọc cách 07 lấy token oidc từ localStorage và làm y hệt):

```ts
import { test, expect } from "@playwright/test";

const BFF = "http://localhost:8080"; // pattern 07-realtime.spec.ts:32 — shell dev KHÔNG proxy /api

test.describe("SF-23 PWA + push + GA (off-mode mặc định)", () => {
  test("manifest đăng ký + đầy đủ", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.theme_color).toBe("#EB6E09");
    expect(m.icons.length).toBeGreaterThanOrEqual(2);
    const icon = await request.get(m.icons[0].src);
    expect(icon.ok()).toBeTruthy();
  });
  test("service worker đăng ký + phục vụ được", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 15_000 });
    const swRes = await page.request.get("/sw.js");
    expect(swRes.ok()).toBeTruthy();
  });
  test("offline.html fallback tồn tại", async ({ request }) => {
    const res = await request.get("/offline.html");
    expect(res.ok()).toBeTruthy();
    expect((await res.text())).toContain("Mất kết nối");
  });
  test("/api/notifications 401 không token + 200 có token (MANDATORY spec §4.5 — KHÔNG skip)", async ({ request }) => {
    const anon = await request.get(`${BFF}/api/notifications`);
    expect(anon.status()).toBe(401);
    // TODO executor: authed request theo pattern token 07-realtime → expect 200 + body {items,total}
  });
  test("GA off: không gtag script + 0 console error (spec §4.5)", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.goto("/");
    const hasGtm = await page.evaluate(() => Boolean(document.querySelector('script[src*="googletagmanager"]')));
    expect(hasGtm).toBeFalsy();
    expect(errors).toEqual([]);
  });
});
```

(Executor: 401 assert — đọc plugins/auth.ts xác nhận guard trả 401 hay envelope; hoàn thiện authed assert theo pattern token 07-realtime — MANDATORY, unit đã che BFF nhưng spec đòi hỏi e2e authed path.)
- [ ] **Step 2: Run** `pnpm --filter @hub-store/e2e e2e` (script tên `e2e` — xem e2e/package.json) → 08 xanh + 01–07 KHÔNG vỡ (đặc biệt 07-realtime — SW pass-through /api). **BLOCKED (env):** port 3000 + 8080 do stack SF khác (sf-28-d1-order-ops — vite PID 97639, BFF PID 97235) giữ; playwright `reuseExistingServer:false` từ chối boot ("http://localhost:3000 is already used"). Spec đã compile OK (`playwright test --list` = 60 tests/15 files, 08 có 5 tests) — re-run khi stack foreign dừng.
- [x] **Step 3: Commit** `test(e2e): 08-pwa manifest/sw/offline/notifications/GA-off (SF-23 T9)` — d587916

---

## Acceptance → verify mapping (Phase 5)
| ACCEPTANCE | Verify |
|---|---|
| Installable + offline fallback | e2e T9 manifest/SW/offline + **manual Chrome walkthrough** (install prompt + DevTools offline) — headless KHÔNG assert được install prompt |
| Login → nhận thông báo | mock mode: T5 trigger event → notification_log row → T6 poll → antd toast; verify qua unit + e2e API + manual |
| Env trống sạch | e2e T9 GA-off + login flow console sạch; mọi init early-return |
| E2E xanh | full suite 01–08 |
