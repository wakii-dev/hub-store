# SF-25 — KTV/CTV Mobile Web App — Design Spec

- **Story:** FI-245 (epic) · **Linear:** FI-270 · **Tier:** 5
- **Context pack:** `docs/superpowers/contexts/fi245-sf-25.md`
- **Status:** Approved (autonomous — spec-critic gate)
- **Date:** 2026-09-03

## 0. Root cause / strategy

KTV/CTV hiện dùng desktop shell (SF-20) — không dùng được trên điện thoại (sidebar+table breakpoint desktop), không có PWA riêng, và thao tác accept/complete/reschedule chưa tồn tại ở BE (SF-19 chỉ có assign — xem REQUIREMENT-GAP comment `e1a6b608` trên FI-245). Strategy: app mobile web riêng, standalone (KHÔNG MF remote), mở rộng BE **additive** theo pattern SF-19 sẵn có.

## 1. Problem

KTV/CTV cần xem đơn của mình trong ngày + thao tác (nhận / hoàn tất ghi giờ / dời lịch + ghi chú) trên điện thoại, cài được PWA lên màn hình chính. Đơn giao + lắp đặt, filter theo technician code.

## 2. Scope

**In:**
1. App mới `apps/ktv-mobile` — Vite standalone PWA (reuse SW/manifest pattern SF-23), breakpoint ~375px, bottom-nav đơn giản.
2. My orders hôm nay: tab **Lắp đặt** (installation orders filter `technicianCode` = login username, `expected_time` hôm nay) + tab **Giao hàng** (delivery orders filter `driverName` = tên technician login, `delivery_date` hôm nay) — BE-authoritative buttons.
3. Thao tác installation orders: accept / complete (ghi giờ hoàn tất) / reschedule (thời gian mới + ghi chú) — render theo flags BE (`allowAccept`/`allowComplete`/`allowReschedule`).
4. Chi tiết đơn: timeline, địa chỉ + deep-link mở map (SF-24 `MapView`), gọi KH `tel:`.
5. Auth: OIDC cùng realm `hubstore` — client mới `hubstore-mobile` (public PKCE); roles mới `InsideTechnician`/`OutsideTechnician` + users mẫu `KTV-001`/`CTV-001` (password literal dev-only `Password123!`).
6. Design tokens SF-6 mobile; e2e spec mobile viewport (375px) qua private-port seam sf-25-*.

**Out (boundary):** native app; offline sync (offline fallback tĩnh của PWA là đủ); chat/notify riêng; docker-compose.yml routing cho ktv-mobile (dev-only choran — flag follow-up); mutation trên delivery orders (reschedule delivery là concern coordinator — mobile chỉ view + tel + map).

## 3. Touch map

| File | Thay đổi |
|---|---|
| `apps/ktv-mobile/**` | MỚI — Vite standalone app (port 3010 dev / 4220 seam) |
| `api/proto/hubstore/fulfillment/v1/tech_service.proto` | Additive: `TechButtons.allow_complete = 6`; messages `AcceptOrderRequest{service_order_code}`, `CompleteOrderRequest{service_order_code}`, `RescheduleOrderRequest{service_order_code, new_expected_time, note}`, `MutateTechOrderResponse{InstallationOrder order}`; 3 RPCs trong service TechService |
| `api/proto/gen/ts/...` + Java gen | Regen theo toolchain pins (memory fi233: ts-proto + grpc-java plugin) |
| `services/fulfillment-service/.../TechServiceImpl.java` | +3 RPC impls (pattern AssignTechnician: blank→INVALID_ARGUMENT, unknown SO→NOT_FOUND, wrong state→FAILED_PRECONDITION) |
| `services/fulfillment-service/.../TechModels.java` | `allowComplete` (assigned && PROCESSING); matrix mở rộng: `reschedulable` += PROCESSING; `allowAccept` = assigned && (CONFIRMED \| RESCHEDULED) — §4.2 |
| `services/bff-gateway/src/routes/tech.ts` | +3 routes: `POST /service-orders/:code/accept`, `/complete`, `/reschedule` (409 cho FAILED_PRECONDITION, pattern assign); role gate `InsideTechnician, OutsideTechnician` |
| `services/bff-gateway/src/plugins/auth.ts` | `KNOWN_ROLES` += `InsideTechnician`, `OutsideTechnician` |
| `docker/keycloak/hubstore-realm.json` | roles `InsideTechnician`/`OutsideTechnician`; users `KTV-001` (role InsideTechnician, firstName "Nguyễn" lastName "Văn An" — KC compose `name` = "Nguyễn Văn An", acceptance criterion của task realm), `CTV-001` (role OutsideTechnician, tên "Hoàng Văn Em"), password literal; client `hubstore-mobile` (public PKCE S256, redirect `http://localhost:3010/*` + `http://127.0.0.1:4220/*` + `/callback`) |
| `api/seed/tech-sample.json` | +SO-0006 (KTV-001, CONFIRMED, `TODAY@14:00`) cho e2e accept; +SO-0007 (CTV-001, CONFIRMED, `TODAY@15:00`); SO-0004 giữ PROCESSING; expectedTime hiện có → `TODAY@HH:MM` placeholder; +1 delivery order TD-0007 driver_name = "Nguyễn Văn An" (KTV-001) `TODAY` |
| `scripts/seed-db.sh` | Resolve `TODAY@HH:MM` cho `installationOrders.expectedTime` (pattern y hệt delivery `TODAY` line 247-250) — additive CASE |
| `e2e/tests/09-ktv-mobile.spec.ts` | MỚI — mobile viewport spec |
| `e2e/scripts/run-ktv-private.sh` + `e2e/playwright.ktv.config.ts` | MỚI — private seam (postgres `sf-25-postgres` :56443, keycloak riêng sf-25 :8082 fresh volume, fulfillment, bff, ktv-mobile :4220) |

**READ-ONLY:** docker-compose.yml, apps/shell, apps/orders, packages/** (chỉ import), services khác.

## 4. Design

### 4.1 App architecture (Direction A — standalone, đã chọn ở Phase 0)

```
apps/ktv-mobile/
  package.json        (@hub-store/ktv-mobile; deps: react 18.3.1, react-router-dom 6.30.6,
                       oidc-client-ts 3.5.0, antd 4.24.16, @hub-store/shared + api-client workspace:*)
  vite.config.ts      (KHÔNG federation plugin — standalone; port 3010; less modifyVars từ
                       packages/shared/src/theme/shared-theme; build target esnext)
  index.html          (viewport meta, theme-color #EB6E09, manifest link, lang="vi")
  public/             (sw.js — cache name ktv-mobile-v1, pattern shell; manifest.webmanifest
                       start_url "/"; offline.html; icons/ copy từ shell)
  src/
    main.tsx          (initI18n({resources: ktvMobileResources}) → registerTokenGetter →
                       installUnauthorizedInterceptor → registerServiceWorker() [readyState
                       fast-path] → dynamic import("./App"))
    App.tsx           (BrowserRouter: /callback → OIDC callback; / → MyOrdersPage; /order/:code
                       → OrderDetailPage; route guard: chưa login → signinRedirect)
    auth/oidc.ts      (copy pattern shell — UserManager PKCE, silent renew, localStorage store,
                       client_id = VITE_OIDC_CLIENT_ID default 'hubstore-mobile')
    features/
      my-orders/      (MyOrdersPage: header user + ngày; TabBar Lắp đặt/Giao hàng; OrderCard list
                       với status pill + address ngắn + nút thao tác theo flags; pull state empty)
      order-detail/   (OrderDetailPage: timeline từ timeline_json, địa chỉ + MapView deep-link
                       [MapView từ @hub-store/shared], PhoneLink tel:, nút thao tác)
      actions/        (AcceptButton/CompleteButton theo flags; RescheduleModal: DatePicker+
                       TimePicker + TextArea ghi chú → POST reschedule; validate chặn thời gian
                       quá khứ; antd vi locale wire theo SF-22 convention)
    api/ktvApi.ts     (axios singleton từ @hub-store/api-client; filterDeliveryOrders —
                       driverName, filterInstallationOrders — technicianCode+dateFrom/dateTo
                       hôm nay; accept/complete/reschedule)
  i18n namespace `ktvMobile` (vi đầy đủ + en) — SF-22 convention, không hardcode string
```

**Design system:** tokens SF-6 qua `DESIGN_TOKENS` + `sharedCssVariables` — mobile không cần user gate: app là card list + bottom nav đơn giản dùng đúng palette/radius/typography hiện có (breakpoint là layout mới, không phải token mới). Bottom-nav: [Đơn của tôi] [Tài khoản] — Tài khoản = user info + logout.

### 4.2 BE — status machine + buttons (additive, matrix mở rộng có chủ đích)

**Matrix mở rộng (spec-critic P0 fix — decision):**
- `reschedulable` += `PROCESSING` → `{NEW, CONFIRMED, PROCESSING, REDELIVERY, RESCHEDULED}` (KTV đang làm cần dời lịch — use case chính của mobile).
- `allowAccept` = assigned && (`CONFIRMED` || `RESCHEDULED`) — xử lý dead-end: sau reschedule (→ RESCHEDULED), KTV nhận việc lại → PROCESSING → complete → DELIVERED. Không trạng thái dead-end mới.
- Desktop SF-20 đọc cùng flags BE → thấy matrix mới tự động (BE-authoritative, không vỡ — desktop e2e 05 assert theo flag, matrix assign không đổi).

**RPC semantics:**
- **accept** (installation): CONFIRMED|RESCHEDULED → PROCESSING. Timeline append `{at, status:"PROCESSING", note:"KTV nhận việc", actor:<technician_code>}` — **reuse schema timeline hiện có** `{at,status,note,actor}` (spec-critic P0 fix; KHÔNG dùng vocabulary {type,by} mới).
- **complete** (installation, `allowComplete` = assigned && PROCESSING — **flag mới, proto field 6**): PROCESSING → DELIVERED. Timeline append `{at, status:"DELIVERED", note:"Hoàn tất lắp đặt", actor}` — `at` = giờ hoàn tất ("ghi giờ hoàn tất"). Mapping DELIVERED làm terminal-state lắp đặt là pragmatic pick (enum không có INSTALLED) — flag Linear.
- **reschedule** (installation): allowed từ CONFIRMED|PROCESSING|REDELIVERY|RESCHEDULED (matrix mở rộng) → status RESCHEDULED + `expected_time` = new time. Timeline append `{at, status:"RESCHEDULED", note:<ghi chú user>, actor}`.
- Guard: blank code→INVALID_ARGUMENT, unknown SO→NOT_FOUND, wrong state→FAILED_PRECONDITION (409), not-owner→FAILED_PRECONDITION (409 — trùng mapping với wrong-state là lựa chọn pattern-consistency, flag Linear cùng P2 notes).
- **Request ownership check:** request thêm field `technician_code` (proto field 2 cho accept/complete, field 4 cho reschedule); Java verify order.technicianCode == request.technicianCode else FAILED_PRECONDITION. **Decision (flag Linear):** authorization KTV-chỉ-sửa-đơn-của-mình ở BE, không trust FE.

**Read-side auth (spec-critic P1 fix):** BFF filter routes `tech.ts` — khi caller role ∈ {InsideTechnician, OutsideTechnician} → BFF **override** body `technicianCode` = preferred_username và `driverName` = profile.name từ token (không trust body). Role khác (Coordinator...) giữ nguyên body (desktop cần filter hộ).

### 4.3 Mapping login ↔ technician

Username Keycloak == technician code nguyên văn (`KTV-001`). FE: `sub` (preferred_username) → filter `technicianCode`. Giao hàng tab: filter `driverName` = tên technician — cần resolve tên: từ danh sách? KHÔNG có endpoint technician-by-code. **Decision đơn giản:** delivery tab filter `driverName` = display name lấy từ… không có. → Đổi: seed delivery orders cho KTV dùng driver_name trùng **tên** technician (Nguyễn Văn An). FE cần tên: thêm vào claim? Quá phức tạp. → **Final:** delivery tab dùng `driver_name` filter với giá trị lấy từ `user.profile.name` (Keycloak user KTV-001 có `name` = "Nguyễn Văn An" — set firstName/lastName trong realm JSON). Seed: TD-0007 driver "Nguyễn Văn An" TODAY. Ghi rõ: mapping driver↔KTV là convention seed dev, không phải contract production (flag Linear).

### 4.4 PWA

Copy `sw.js` shell: đổi cache name `ktv-mobile-v1`; precache `['/', '/offline.html']`; giữ fetch-guard order (non-GET pass, cross-origin pass, `/api/` pass, assets cache-first, navigation network-first → offline.html, OIDC params never cache). `registerServiceWorker()` với readyState fast-path. Manifest: name "HubStore KTV", short_name "KTV", display standalone, theme #EB6E09, icons 192/512 copy shell.

### 4.5 E2E (private seam sf-25-*)

Runner `run-ktv-private.sh` (pattern `run-map-private.sh`): postgres riêng `sf-25-postgres` :56443, keycloak riêng sf-25 port 8082 + **fresh volume** (realm mới có roles/users — shared :8081 không có), flyway+seed one-shot, fulfillment :52073, bff :4286, ktv-mobile :4220 (VITE_OIDC_AUTHORITY=:8082). **Mint 2 storageStates** (spec-critic P1 fix): `E2E_KTV_STORAGE` (KTV-001) + `E2E_CTV_STORAGE` (CTV-001) qua PKCE (pattern mint_sf16) — không UI-login trong spec. Config `playwright.ktv.config.ts`: `use: { viewport: {width:375, height:667} }`.

Scenarios:
1. Login KTV-001 → My Orders thấy đúng đơn hôm nay của mình (SO-0004 PROCESSING, SO-0006 CONFIRMED, TD-0007) — KHÔNG thấy SO-0005 (KTV-002).
2. Accept SO-0006 → status PROCESSING, nút Complete xuất hiện (flag mới BE).
3. Complete SO-0006 → status DELIVERED + timeline có entry `{status:"DELIVERED"}` mới (giờ hoàn tất).
4. Reschedule SO-0006 (sau complete? KHÔNG — dùng SO-0004 PROCESSING, matrix mở rộng cho phép reschedule PROCESSING) → modal thời gian + note → status RESCHEDULED + timeline entry `{status:"RESCHEDULED", note}`. Sau đó nút Accept xuất hiện lại trên SO-0004 (dead-end fix) — verify.
5. Detail SO-0004: timeline render, địa chỉ, tel: link (`tech-phone-link` testid pattern), map deep-link.
6. PWA: manifest fetch 200 + SW registered.
7. StorageState CTV-001 → chỉ thấy đơn CTV (SO-0007).

### 4.6 Unit tests

- Java: TechModels allowComplete matrix; TechServiceImpl 3 RPCs (happy + wrong-state FAILED_PRECONDITION + not-owner + unknown NOT_FOUND).
- BFF: route 409 mapping + role gate 403.
- ktv-mobile vitest: ktvApi compact filter, status helpers, buttons→UI mapping.

## 5. Implementation outline (task DAG)

1. `realm-ktv-roles` — realm JSON + KNOWN_ROLES + users (no deps)
2. `tech-actions-be` — proto additive + regen + Java RPCs + buttons + BFF routes + seed TODAY@ + SO-0006/7 + TD-0007 (no deps)
3. `pwa-shell` — app scaffold + OIDC + PWA + tokens + bottom-nav (deps: 1 — client_id contract)
4. `my-orders-today` — 2 tabs + cards + filter technicianCode/driverName (deps: 3)
5. `accept-complete` — FE actions + api client (deps: 2, 4)
6. `reschedule` — RescheduleModal + api (deps: 5)
7. `order-detail-map-tel` — detail + timeline + MapView + tel: (deps: 4)
8. `e2e-mobile-spec` — runner + config + spec (deps: 1-7)

## 6. Risks / unknowns

- **Realm import no-op trên volume cũ** → dev cần `docker compose down keycloak -v` reset; e2e dùng keycloak riêng fresh volume (đã thiết kế). ✔ mitigated
- **Proto regen toolchain** — pins theo memory fi233 (/tmp npm dir có thể biến mất → re-setup). Flag nếu fail.
- **Port war** SF-21/26 đang e2e → sf-25 block riêng (4220, 4286, 52073, 56443, 8082). ✔
- **`TODAY@HH:MM` placeholder** — seed script shared; additive CASE không đụng nhánh cũ. Empty-gate: DB cũ không re-seed → mobile dev trên stack cũ cần reset-db. Note README.
- **driver_name ↔ technician name mapping** — dev convention, không contract (flag Linear).
- **Keycloak username case** — tạo username `KTV-001` nguyên văn; login `ktv-001` vẫn vào được (KC case-insensitive) nhưng preferred_username = `KTV-001` (stored form) → filter khớp DB. Verify ở e2e.
- **Known gap ngoài scope (ghi nhận):** installation order SHIPPING (VD SO-0005) không có path về PROCESSING — KTV được assign không thao tác được gì trên nó. Không phải scope SF-25; mobile UI surface empty-action state.
