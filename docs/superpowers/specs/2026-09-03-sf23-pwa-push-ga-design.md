# SF-23 — PWA + Push OneSignal + GA — Design (FI-268)

Status: Approved (autonomous self-review passed — brainstorm tự trả lời clarifying questions trên base Phase 0 analyst + codebase probe live)
Date: 2026-09-03
Epic: FI-245 · Linear: FI-268 · Tier 4 · Depends: SF-10 (SSE + Kafka bus) Done
Phase 0: Direction B — hand-rolled SW, zero new npm dep, push hook trên `bffEvents` bus

## 0. Root cause / context

App hiện là SPA thuần: không manifest, không service worker, không kênh push, không analytics. SF-10 vừa merge SSE realtime + BFF Kafka consumer (EventEmitter bridge `bffEvents`) — ta tái dụng đúng bus đó làm nguồn push event thay vì dựng source song song. Three additive legs, mỗi leg có off-switch env riêng (acceptance: env trống → app chạy bình thường, 0 console lỗi).

## 1. Problem

Người dùng cần: (a) cài app lên desktop/phone (installable) + offline fallback tĩnh đẹp; (b) nhận thông báo khi có đơn mới / batch hoàn tất / vận đơn đổi trạng thái — kể cả tab đóng (OneSignal) hoặc trong app (SSE + notification_log); (c) đo lường GA4. Không key → mock/log mode, không lỗi.

## 2. Scope

**IN:**
- PWA: `manifest.webmanifest` (name HubStore, theme #EB6E09, icons 192/512 PNG) + hand-rolled `sw.js` (precache shell, network-first HTML/remoteEntry, cache-first immutable assets, offline fallback) + installable.
- OneSignal dual-mode: `VITE_ONESIGNAL_APP_ID` (FE) + `ONESIGNAL_REST_API_KEY` (BFF). Real: FE load SDK CDN, `OneSignal.login(username)` khi login + session-restore; BFF gọi REST broadcast "Subscribed Users". Mock: KHÔNG load SDK; BFF ghi `notification_log` (broadcast-by-design) + FE poll `/api/notifications`; FE hiện antd notification.
- GA dual-mode: `VITE_GA_MEASUREMENT_ID`. Real: gtag script + pageview route + business events. Off: log nội bộ (buffer + console.debug), không network call.
- `notification_log` DB (Flyway **V10** — V8/V9 là SF-28 sibling, re-check tại plan time).
- E2E: manifest + SW registration + offline.html; push/GA smoke off-mode.

**OUT (boundary context pack):** offline CRUD queue; push preference center; GA user tracking (chỉ anonymous GA4); đổi Kafka envelope contract SF-27; sửa apps khác ngoài 1-line `trackEvent` import (chỉ "nhận helper").

## 3. Touch map

```
apps/shell/public/                MỚI: manifest.webmanifest, sw.js, offline.html, icons/icon-192.png, icon-512.png
apps/shell/index.html             + link manifest, meta theme-color, apple-touch-icon
apps/shell/src/main.tsx           + registerSW(), initOneSignal(), initAnalytics()
apps/shell/src/lib/pwa.ts         MỚI: SW register + update flow (skipWaiting + clients.claim)
apps/shell/src/lib/push.ts        MỚI: OneSignal env-gated loader + login/logout hook
apps/shell/src/auth/oidc.ts       + emit auth event cho subscribe-on-login (hoặc hook tại main.tsx)
apps/shell/src/App.tsx            + pageview on route change + notification SSE listener (mock channel)
packages/shared/src/analytics/    MỚI: ga.ts (trackEvent, pageview, off-mode internal log) — freeze exception GHI RÕ (pattern SF-2/SF-27 amendment)
services/bff-gateway/src/config.ts           + onesignal/ga config block (pattern kafka.enabled 'true'-only)
services/bff-gateway/src/lib/onesignal.ts    MỚI: REST wrapper (real mode only)
services/bff-gateway/src/lib/notifications.ts MỚI: notification_log writer — mirror audit.ts fail-open pool
services/bff-gateway/src/lib/push-triggers.ts MỚI: bffEvents.on('kafka:event') → filter → notify
services/bff-gateway/src/routes/notifications.ts MỚI: GET /api/notifications (paged, JWT-guarded)
services/bff-gateway/src/app.ts              + register route
services/bff-gateway/src/server.ts           + wire push-triggers subscriber (cạnh startKafkaConsumer)
services/fulfillment-service/.../db/migration/V10__notification_log.sql  MỚI
.env.example                      + VITE_ONESIGNAL_APP_ID / VITE_GA_MEASUREMENT_ID / ONESIGNAL_REST_API_KEY (comment local-only style AHAMOVE)
docker-compose.yml + Dockerfile.web  + build args VITE_* (build-time!) + bff runtime env ONESIGNAL_REST_API_KEY
e2e/08-pwa.spec.ts                MỚI
apps/orders + apps/fulfillment    + 1-line trackEvent(...) tại mutation success points: CreateOrderModal.tsx (tạo đơn), ImportOrdersModal.tsx (import đơn), apps/orders D1Page.tsx (tạo phiếu — batchingApi.createBatch), apps/fulfillment BatchListPage.tsx (hoàn tất picking), PrintPage.tsx (in) — zero logic change
```
READ-ONLY: mọi thứ khác. SSE route `routes/events.ts` KHÔNG đổi.

## 4. Design

### 4.1 PWA (hand-rolled — Direction B)
- **manifest.webmanifest**: `{"name":"HubStore","short_name":"HubStore","start_url":"/","display":"standalone","background_color":"#ffffff","theme_color":"#EB6E09","icons":[192,512 PNG, purpose "any maskable"]}`. Theme color phải khớp token `#EB6E09` (shared/theme/design-tokens.ts:8) — test assert equality (pattern shared-theme.test.ts).
- **sw.js** (~100 dòng, scope `/`):
  - install: precache `['/', '/offline.html']`; activate: dọn cache cũ, `skipWaiting()`; đăng ký xong `clients.claim()`.
  - fetch handler, THỨ TỰ GUARD:
    1. `request.method !== 'GET'` → pass-through (không respondWith).
    2. URL cross-origin → pass-through (dev MF remotes :3001/:3002, OneSignal/GA CDN).
    3. Path bắt đầu `/api/` → **pass-through tuyệt đối** — EventSource/SSE qua `respondWith` vỡ stream (regression 07-realtime.spec.ts).
    4. `Accept: text/html` (navigations) hoặc `/` hoặc `/remotes/*/remoteEntry.js` → **network-first**, lỗi offline → cache, không có cache → `/offline.html`.
    5. `/assets/` (hashed immutable) + fontsource → **cache-first**.
  - Update flow: SW mới activate → skipWaiting+claim tự động; version const trong cache name (`hubstore-v1`) — bump tay khi deploy đổi shell. network-first cho index.html chính là deploy-safety: shell mới luôn được fetch khi online.
- **registerSW()** (pwa.ts): `navigator.serviceWorker.register('/sw.js')` — chạy mọi mode (E2E kiểm được: public/ được serve ở cả dev server lẫn prod build; localhost = secure context); catch silent (env không hỗ trợ → no-op, không console lỗi). **Lưu ý e2e chạy qua boot-all.sh = Vite dev server** — prod build (Dockerfile.web/nginx: cache headers, base path) KHÔNG được e2e che → verify bằng manual walkthrough trên compose build (bước Phase 5).
- **Icons**: 2 PNG commit thật (script generate 1 lần từ SVG chữ "H" nền #EB6E09 — throwaway script, không vào repo build).
- **offline.html**: static, inline CSS, Roboto system stack, gradient + màu #EB6E09 theo SF-6, text vi "Mất kết nối — Vui lòng kiểm tra mạng và thử lại", icon wifi-off đơn giản inline SVG.

### 4.2 OneSignal dual-mode
- **FE (push.ts)**: `VITE_ONESIGNAL_APP_ID` rỗng → return ngay (không load SDK, không lỗi — subscribe-login task ở mock mode = env-gated no-op, không có BFF endpoint). Có → inject `cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js` dynamic (deferred, one-shot), `OneSignal.init({ appId })`. Login hook 2 đường: (1) sau OIDC login thành công, (2) **boot khi session đã restore** (oidc-client-ts restore silent — không có login event trên reload; không có đường này external_id chết với mọi user quay lại) → `OneSignal.login(preferred_username)`; logout → `OneSignal.logout()`. Permission prompt = slidedown mặc định của SDK (không tự chế UI).
- **Targeting = BROADCAST (quyết định P0 spec-critic)**: Kafka payload KHÔNG mang username (verify: FulfillmentServiceImpl.java:248/197 — chỉ fulfillCode/shop) và envelope là contract SF-27 READ-ONLY → per-user targeting KHÔNG thể implement không phải sửa contract. Quyết định: real mode = `included_segments: ["Subscribed Users"]` — broadcast tới mọi user đã subscribe; chấp nhận cho ops dashboard 3-role (không có dữ liệu lương/quyền riêng trong push message — chỉ type + code). Mock mode tương tự: notification_log là broadcast-by-design — mọi user đăng nhập thấy chung (GET không lọc theo user; ghi rõ trong route comment).
- **BFF trigger (push-triggers.ts)**: subscriber ĐÚNG 1 chỗ `bffEvents.on('kafka:event', ...)` tại server.ts startup — cả 2 đường KAFKA_ENABLED true/false đều chảy qua bus này (realtime-publish.ts đảm bảo). Filter các type "quan trọng": `order.assigned` (đơn mới vào), `order.completed`, `order.failed`, `batch.completed`. KHÔNG đụng mutation routes (surgical — regression candidates intake/batches/fulfillment routes được bảo toàn).
- **notifications.ts (cả 2 mode — audit trail)**: mirror audit.ts — lazy pool từ FULFILLMENT_DB_* env, fail-open (thiếu env → disabled; INSERT lỗi → warn), test-injectable `__setPoolForTests`. Schema `notification_log(id serial, type, title, body, payload jsonb, dedupe_key unique, created_at)` — **dedupe_key = eventId từ envelope + UNIQUE index + INSERT ... ON CONFLICT DO NOTHING** (Kafka redelivery/restart phải idempotent — SF-27 chaos test pattern).
- **onesignal.ts (real mode)**: `ONESIGNAL_REST_API_KEY` có → POST https://onesignal.com/api/v1/notifications, `included_segments: ["Subscribed Users"]` (broadcast — xem quyết định P0 trên); timeout 5s + fail-open log (push không bao giờ làm vỡ mutation/event flow). Key rỗng → mock mode: chỉ DB + polling.
- **Route GET /api/notifications**: JWT-guarded, paged (page/pageSize cap 100 — pattern audit), ORDER created_at DESC, global (không lọc theo user — broadcast-by-design). Dùng cho polling + e2e assert.
- **Delivery mock mode = POLLING (quyết định, không SSE)**: FE poll GET /api/notifications mỗi 30s khi tab mở — KHÔNG đụng routes/events.ts (SSE hijack đã audit kỹ). Không emit 'notification' trên bffEvents.
- **FE hiển thị**: poll → row mới (id > max seen) → antd `notification.info` (SF-6 design system che phủ — KHÔNG cần designer direction mới); dedupe = set các id đã thấy trong localStorage (không chỉ lastSeenId — chống burst nhiều event trong 1 poll window).

### 4.3 GA dual-mode (packages/shared/src/analytics/ga.ts)
- `initAnalytics()`: `VITE_GA_MEASUREMENT_ID` rỗng → mode off: trackEvent/pageview chỉ push vào in-memory buffer + `console.debug('[ga:off]', ...)` — không network. Có → inject `googletagmanager.com/gtag/js?id=` + `gtag('config', id, { anonymize_ip: true })`.
- `pageview(path)` — shell App.tsx useEffect trên `location.pathname`.
- `trackEvent(name, params)` — export qua `@hub-store/shared` (freeze exception: package "FROZEN sau SF-1" — amendment pattern SF-2/SF-27, ghi vào PR note). Call sites (1 dòng mỗi chỗ, sau mutation thành công): `apps/orders` CreateOrderModal (tạo đơn) + ImportOrdersModal (import đơn) + D1Page (tạo phiếu — createBatch), `apps/fulfillment` BatchListPage (hoàn tất picking) + PrintPage (D3 in). Guard internal — off-mode no-op.
- GA4 anonymous only — KHÔNG set user_id.

### 4.4 env-wiring
- `.env.example`: 3 vars mới, comment style AHAMOVE (`# local-only, KHÔNG commit` cho REST key).
- **VITE_ vars là BUILD-TIME**: Dockerfile.web thêm `ARG VITE_ONESIGNAL_APP_ID` / `ARG VITE_GA_MEASUREMENT_ID` + ENV trước build; docker-compose build args pass từ .env. Real mode = điền key + rebuild image.
- BFF: `ONESIGNAL_REST_API_KEY` runtime env qua compose bff service.

### 4.5 E2E (e2e/08-pwa.spec.ts)
- Manifest: `<link rel="manifest">` present; fetch `/manifest.webmanifest` → 200 + theme_color #EB6E09; icons fetch 200.
- SW: `navigator.serviceWorker.getRegistration()` → registered; fetch `/sw.js` → 200 `text/javascript`.
- Offline fallback: fetch `/offline.html` → 200 + chứa text "Mất kết nối".
- Push mock smoke: `/api/notifications` — assert auth guard 401 khi không token; có token → 200 envelope; INSERT trùng dedupe_key (replay) → không duplicate row.
- GA off-mode: không script googletagmanager trong DOM; pageview buffer không lỗi console.
- Env trống (mặc định e2e local) → 0 console error trên login flow.
- **Installable (nút cài browser)**: KHÔNG assert được trong headless Chromium (`beforeinstallprompt` unreliable) → verify manual trong Chrome desktop walkthrough Phase 5 (manifest valid + SW active + HTTPS/localhost = đủ điều kiện install prompt).

## 5. Impl outline / test strategy
- Unit: notifications.ts (vitest, pool inject — mirror audit.spec), push-triggers filter mapping, ga.ts off/real mode (mock gtag), sw rules là vanilla JS — assert qua e2e; manifest theme khớp token (test assert literal).
- Integration: GET /api/notifications với DB test thật (pattern SF-7).
- E2E: 08-pwa.spec.ts (serial, prefix convention).
- Regression: 01–07 specs phải giữ xanh (SW pass-through /api; không đổi SSE).

## 6. Risks
- Flyway V10 race với sibling SF — re-check trước khi tạo migration; header-comment dễ rename (V5 precedent).
- SW stale-deploy → network-first index.html + cache-version const; verify bằng rebuild + reload trong walkthrough.
- SW×SSE — guard #3 pass-through; 07-realtime phải xanh.
- OneSignal CDN blocked/SPOF — off-mode không load; on-mode fail load → catch silent, app vẫn chạy.
- VITE build-time wiring sai → real mode "điền key" không có tác dụng qua compose — e2e chỉ smoke off-mode nên risk chấp nhận được, ghi rõ README/env comment "rebuild sau khi điền".

## 7. Designer flag
UI surface mới: offline.html + antd notification toast — cả hai che phủ bởi SF-6 design system (tokens + antd4) → per instructions: flag và bỏ qua designer agent (không 3-hướng gate).
