# Plan: SF-25 KTV/CTV Mobile Web App

Date: 2026-09-03 | Linear: FI-270 | Worktree: sf-25-ktv-mobile
Spec: `docs/superpowers/specs/2026-09-03-sf25-ktv-mobile-design.md` (spec-critic PASS sau fix 2 P0)

## 0. Root cause analysis

### Root cause
KTV/CTV là user di động nhưng hệ thống chỉ có desktop shell (MF host breakpoint desktop). Thao tác accept/complete/reschedule chưa từng tồn tại ở BE (SF-19 dừng ở assign — REQUIREMENT-GAP `e1a6b608` FI-245).

### Current state
KTV xem đơn qua desktop StaffTab (SF-20) — table + modal, không dùng được màn 375px; không có PWA; không thao tác được.

### Expected outcome
Điện thoại mở app → login KTV → thấy đúng đơn hôm nay của mình → accept/complete (ghi giờ)/reschedule (thời gian + note) → cài PWA lên màn hình chính.

### Constraints & hardships
services/** gốc READ-ONLY nhưng acceptance phụ thuộc BE mutations → mở rộng additive có chủ đích (flag epic). Realm import no-op trên volume cũ. Port-war với SF-21/26 đang chạy e2e.

### High-level strategy
Standalone Vite app (không MF) + BE additive theo pattern SF-19 sẵn có + private-port seam e2e sf-25-*.

## 1. Problem
KTV/CTV không thao tác được đơn của mình trên điện thoại; acceptance FI-245 yêu cầu mobile web PWA.

## 2. Scope
- **In:** apps/ktv-mobile standalone PWA (375px, bottom-nav); my-orders hôm nay (Lắp đặt theo technicianCode / Giao hàng theo driverName); accept/complete/reschedule theo flags BE; detail timeline + địa chỉ + MapView deep-link + tel:; realm roles InsideTechnician/OutsideTechnician + users KTV-001/CTV-001 + client hubstore-mobile; e2e mobile viewport.
- **Out:** native app; offline sync; chat/notify riêng; docker-compose.yml; delivery mutations; SHIPPING dead-end (ghi nhận).
- **Success criteria (ACCEPTANCE user-visible):**
  - A1: Điện thoại mở app → login KTV → thấy đúng đơn hôm nay của mình.
  - A2: Accept → đơn chuyển trạng thái; complete ghi giờ; reschedule đổi thời gian + note.
  - A3: Bấm địa chỉ → mở bản đồ; bấm SĐT → dialer.
  - A4: Cài được lên màn hình chính (PWA).

## 3. Touch map
- MỚI: `apps/ktv-mobile/**`, `e2e/tests/09-ktv-mobile.spec.ts`, `e2e/scripts/run-ktv-private.sh`, `e2e/playwright.ktv.config.ts`
- SỬA: `api/proto/hubstore/fulfillment/v1/tech_service.proto` (+gen), `services/fulfillment-service/**/TechServiceImpl.java`, `TechModels.java`, `services/bff-gateway/src/routes/tech.ts`, `services/bff-gateway/src/plugins/auth.ts`, `docker/keycloak/hubstore-realm.json`, `api/seed/tech-sample.json`, `scripts/seed-db.sh`
- READ-ONLY: docker-compose.yml, apps/shell, apps/orders, packages/** (chỉ import)
- Regression candidates: desktop e2e 05-tech-service.spec.ts (flags matrix mở rộng — assert theo flag nên không vỡ), seed emptiness-gate (bảng có data → không re-seed — an toàn).

## 4. Design
- **Approach A (chọn):** standalone app, direct-import `@hub-store/shared` + `@hub-store/api-client`; OIDC `hubstore-mobile` public PKCE (oidc-client-ts 3.5.0 pattern shell); PWA copy pattern shell (cache `ktv-mobile-v1`, readyState fast-path).
- **Alternatives:** (B) responsive shell — loại: desktop MF host, UX 375px cần riêng, PWA riêng theo acceptance.
- **Matrix mở rộng (spec-critic P0 fix):** `reschedulable` += PROCESSING; `allowAccept` = assigned && (CONFIRMED|RESCHEDULED); `allowComplete` = assigned && PROCESSING (flag mới). Timeline append reuse `{at,status,note,actor}`.
- **Auth:** mutations — request kèm `technician_code`, Java self-check (not-owner → FAILED_PRECONDITION→409); read-side — BFF override technicianCode/driverName từ token khi role ∈ {InsideTechnician, OutsideTechnician}.
- **Edge cases:** reschedule chặn thời gian quá khứ (FE validate + BE reject expected_time quá khứ INVALID_ARGUMENT); antd vi locale; empty states; offline fallback tĩnh.
- **Non-functional:** i18n namespace `ktvMobile` vi/en (SF-22); tokens SF-6 (không hex cứng); security: bearer token localStorage (pattern shell), roles least-privilege.

## 5. Implementation outline

Testing strategy: unit (vitest app + Java + BFF) → browser verify 3 tầng per task có UI → e2e private seam cuối.

**Mid-task browser-verify recipe (plan-critic P1 — cho Task 4/5/6/7):** seam runner là deliverable Task 8 — KHÔNG tồn tại khi T4-T7 chạy. Verify recipe per task: (1) boot mini-stack dùng ports riêng sf-25: postgres docker `sf-25-postgres` :56443 (fresh), keycloak :8082 với **named volume fresh** `sf-25-kc-data` (realm mới — KHÔNG dùng shared :8081 vì realm import no-op trên volume cũ), flyway+seed one-shot, fulfillment :52073, bff :4286, app dev :3010 (hoặc 4220); (2) script hóa boot này vào `/tmp/sf25/mini-stack.sh` ngay tại Task 4 (không commit — T8 sẽ viết runner chuẩn từ nó); (3) browser qua `orca tab create` + screenshot 3 tầng (DOM → VISUAL → FLOW). Port-guard trước boot (lsof check 4220/4286/52073/56443/8082 — SF-21/26 đang chạy stack riêng).

### Task 1: realm-ktv-roles — realm JSON + BFF KNOWN_ROLES
**Files:** `docker/keycloak/hubstore-realm.json`, `services/bff-gateway/src/plugins/auth.ts`, test BFF auth roles.
- [x] Thêm realm roles `InsideTechnician`, `OutsideTechnician` (mục `roles.realm`).
- [x] Thêm client `hubstore-mobile`: public, PKCE S256, `redirectUris`: `http://localhost:3010/*`, `http://127.0.0.1:4220/*`, `webOrigins` +, attr `pkce.code.challenge.method` = S256 (copy pattern `hubstore-web`), audience mapper `hubstore-api` + `preferred_username` mapper (copy từ hubstore-web protocolMappers).
- [x] Thêm users: username `KTV-001` (firstName "Nguyễn", lastName "Văn An", email `ktv-001@hubstore.dev`, credentials password literal `Password123!` temporary:false, realmRoles `[InsideTechnician]`), `CTV-001` (firstName "Hoàng", lastName "Văn Em", realmRoles `[OutsideTechnician]`).
- [x] `auth.ts` KNOWN_ROLES += 2 roles; verify role claim map test (unit test BFF auth nếu có — extend).
- [x] **Done-signal (plan-critic P2):** realm JSON import sạch vào keycloak 26.0 (`docker run --rm -v ./docker/keycloak:/import keycloak:26.0` optimize/import dry hoặc tối thiểu `python3 -m json.tool` parse + schema fields khớp pattern users/clients hiện có) — import thật sẽ được T8 keycloak boot xác nhận.
- [x] Commit: `feat(realm): SF-25 InsideTechnician/OutsideTechnician roles + hubstore-mobile client`

### Task 2: tech-actions-be — proto additive + Java RPCs + BFF routes + seed
**Files:** `api/proto/hubstore/fulfillment/v1/tech_service.proto`, gen ts + java, `TechModels.java`, `TechServiceImpl.java`, repo/store layer nếu cần (mở `PostgresTechStore`/tương đương — đọc code trước), `services/bff-gateway/src/routes/tech.ts`, `api/seed/tech-sample.json`, `scripts/seed-db.sh`.
- [ ] **ĐẦU TIÊN — verify proto regen toolchain** (plan-critic P1: biggest-risk step): ts-proto + grpc-java plugin paths theo memory fi233 — `/tmp` dirs có thể đã biến mất → re-setup ngay nếu thiếu, TRƯỚC khi sửa proto. Regen fail → STOP report BLOCKED (downstream T5 phụ thuộc).
- [ ] Proto additive: `TechButtons.allow_complete = 6`; `AcceptOrderRequest {service_order_code=1, technician_code=2}`, `CompleteOrderRequest` tương tự, `RescheduleOrderRequest {service_order_code=1, new_expected_time=2, note=3, technician_code=4}`, `MutateTechOrderResponse {InstallationOrder order=1}`; service +3 RPCs. Regen ts-proto + grpc-java.
- [ ] Seed status assertion: SO-0004 phải giữ **PROCESSING** (nếu seed hiện tại khác → sửa) — e2e scenario 4 reschedule PROCESSING chính là path matrix-mở-rộng cần test.
- [ ] `TechModels.java`: record TechButtons thêm allowComplete; `installationButtons` → `allowAccept = assigned && (CONFIRMED||RESCHEDULED)`, `allowComplete = assigned && PROCESSING`; `reschedulable` += PROCESSING. Unit test matrix.
- [ ] `TechServiceImpl.java`: 3 RPCs — blank→INVALID_ARGUMENT, unknown SO→NOT_FOUND, wrong-state / not-owner (order.technicianCode != request.technician_code)→FAILED_PRECONDITION; accept CONFIRMED|RESCHEDULED→PROCESSING; complete PROCESSING→DELIVERED; reschedule CONFIRMED|PROCESSING|REDELIVERY|RESCHEDULED→RESCHEDULED + expected_time mới (quá khứ → INVALID_ARGUMENT). Timeline append `{at, status, note, actor}` (accept: status PROCESSING note "KTV nhận việc"; complete: status DELIVERED note "Hoàn tất lắp đặt"; reschedule: status RESCHEDULED note = request.note). Update assignment/timeline persistence qua store layer sẵn có (đọc TechServiceImpl assign để theo cùng path).
- [ ] Java unit tests cho 3 RPCs (happy + 4 error paths) — pattern test assign hiện có.
- [ ] BFF `routes/tech.ts`: `POST /service-orders/:code/accept` body `{technicianCode}` → grpc AcceptOrder; `/complete` tương tự; `/reschedule` body `{technicianCode, expectedTime, note}`; requireRole InsideTechnician, OutsideTechnician; FAILED_PRECONDITION→409, INVALID_ARGUMENT→422, NOT_FOUND→404 (pattern assign); read-side override: trong 2 filter routes, khi `request.user.role` ∈ technician roles → override body technicianCode/driverName từ token.
- [ ] BFF test route mapping (pattern test tech.ts hiện có nếu có).
- [ ] Seed: `tech-sample.json` — expectedTime hiện có đổi thành `TODAY@HH:MM` placeholder (SO-0001 08:00, SO-0002 09:00, SO-0004 10:00, SO-0005 11:00); +SO-0006 KTV-001 CONFIRMED `TODAY@14:00`, +SO-0007 CTV-001 CONFIRMED `TODAY@15:00` (copy shape SO-0004, items 1 món); +delivery TD-0007 driver_name "Nguyễn Văn An" status NEW deliveryDate "TODAY". `seed-db.sh` installation insert: CASE expectedTime `TODAY@HH:MM` → `CURRENT_DATE + time` (pattern delivery line 247-250).
- [ ] Commit: `feat(tech-be): SF-25 accept/complete/reschedule RPCs + flags + seed TODAY placeholder`

### Task 3: pwa-shell — scaffold apps/ktv-mobile + OIDC + PWA
**Files:** `apps/ktv-mobile/**` (package.json, vite.config.ts, tsconfig, index.html, public/{sw.js,manifest.webmanifest,offline.html,icons/}, src/main.tsx, src/App.tsx, src/auth/oidc.ts, src/i18n.ts + ktvMobile resources, minimal placeholder page), root `pnpm-workspace.yaml` (đã glob apps/* — không cần sửa).
- [ ] Scaffold clone pattern apps/orders (bỏ federation): deps react 18.3.1, react-dom, react-router-dom 6.30.6, oidc-client-ts 3.5.0, antd 4.24.16, @hub-store/shared + @hub-store/api-client workspace:*, @fontsource/roboto; devDeps vite 5.4.19, vitest 3.2.7, @vitejs/plugin-react 4.7.0, less 4.9.0. Port 3010.
- [ ] vite.config: less modifyVars từ `../../packages/shared/src/theme/shared-theme` (import trực tiếp .ts), target esnext, KHÔNG federation plugin.
- [ ] main.tsx: initI18n → registerTokenGetter → installUnauthorizedInterceptor → registerServiceWorker (readyState fast-path) → dynamic import App.
- [ ] auth/oidc.ts: copy shell pattern, default clientId `hubstore-mobile`, scope openid, automaticSilentRenew, localStorage userStore, 401 interceptor.
- [ ] App.tsx: BrowserRouter `/callback` (signinCallback → navigate /), `/` MyOrdersPage placeholder, guard chưa-login → signinRedirect; role gate: user không có role technician → màn "Không có quyền".
- [ ] public/: sw.js (cache `ktv-mobile-v1`, pattern shell — giữ fetch-guard order), manifest.webmanifest (name "HubStore KTV", standalone, theme #EB6E09, icons 192/512 copy shell), offline.html, index.html meta viewport + theme-color + manifest link.
- [ ] **Bottom-nav [Đơn của tôi][Tài khoản] + Account page (plan-critic P0 fix — spec §4.1):** route `/account` — user info (sub, role, tên) + nút Đăng xuất (signoutRedirect → về login). Empty shell đủ dùng, Task 4 nạp danh sách vào tab Đơn.
- [ ] i18n: namespace `ktvMobile`, vi + en, register trong component (trap App static-import — memory SF-20).
- [ ] `pnpm install` + `pnpm --filter @hub-store/ktv-mobile build` pass + vitest smoke (App render placeholder). Browser check: dev server boot, redirect Keycloak login hiện.
- [ ] Commit: `feat(ktv-mobile): SF-25 standalone PWA shell — OIDC + SW/manifest + tokens`

### Task 4: my-orders-today — danh sách đơn hôm nay
**Files:** `apps/ktv-mobile/src/features/my-orders/**` (MyOrdersPage, OrderCard, StatusPill, TabBar), `apps/ktv-mobile/src/api/ktvApi.ts`, unit tests.
- [ ] ktvApi.ts: axios singleton từ @hub-store/api-client; `fetchMyInstallations(username, today)` = POST `/service-orders/filter` `{technicianCode: username, dateFrom: today, dateTo: today, page:1, pageSize:50}`; `fetchMyDeliveries(name, today)` = POST `/delivery-orders/filter` `{driverName: name, dateFrom: today, dateTo: today}` (BE có today default nhưng gửi explicit cho chắc); DTO mirror mappers/tech.ts.
- [ ] MyOrdersPage: header (chào user + ngày hôm nay vi-VN), segmented control Lắp đặt/Giao hàng (state URL param `tab` — pattern useUrlState shared), OrderCard list: code + status pill (TechStatusTag palette tokens) + địa chỉ ngắn + khung giờ + items count + nút thao tác theo `buttons` (chỉ render flag true — BE-authoritative; card tap → navigate `/order/:code`).
- [ ] Empty state (EmptyState shared) cho tab trống; loading skeleton.
- [ ] Unit tests: compact filter body, render flags mapping (mock data: card có nút Accept khi allowAccept, không khi false).
- [ ] Browser verify 3 tầng (DOM→VISUAL→FLOW) trên seam local: login KTV-001 → thấy SO-0004/SO-0006, không thấy SO-0005.
- [ ] Commit: `feat(ktv-mobile): SF-25 my-orders hôm nay — 2 tabs + cards BE-authoritative`

### Task 5: accept-complete — FE thao tác theo flags
**Files:** `apps/ktv-mobile/src/features/actions/**` (AcceptButton, CompleteButton, useTechAction), `apps/ktv-mobile/src/api/ktvApi.ts` (+3 mutations), unit tests.
- [ ] ktvApi: `acceptOrder(code, technicianCode)` POST `/service-orders/:code/accept`; `completeOrder(code, technicianCode)`; response `{order}` → cập nhật state.
- [ ] AcceptButton/CompleteButton: render theo order.buttons (flag true), loading state, sau mutate → cập nhật card/page state (status pill + flags mới từ response), success message antd.
- [ ] Flow: accept SO-0006 → PROCESSING + CompleteButton hiện; complete → DELIVERED + timeline mới. Complete confirm modal (Modal.confirm "Xác nhận hoàn tất — ghi giờ hiện tại").
- [ ] Unit tests: buttons render matrix + api payloads.
- [ ] Browser verify: accept + complete thật trên seam.
- [ ] Commit: `feat(ktv-mobile): SF-25 accept/complete actions theo flags BE`

### Task 6: reschedule — modal dời lịch + ghi chú
**Files:** `apps/ktv-mobile/src/features/actions/RescheduleModal.tsx`, ktvApi `rescheduleOrder`, unit tests.
- [ ] Modal: DatePicker + TimePicker (antd vi locale) + TextArea ghi chú; validate: thời gian mới > hiện tại (chặn quá khứ), note optional; submit → POST `/service-orders/:code/reschedule` `{technicianCode, expectedTime, note}`.
- [ ] Render từ RescheduleButton theo `buttons.allowReschedule`; sau mutate → status RESCHEDULED + expectedTime mới hiển thị; sau đó AcceptButton xuất hiện lại (dead-end fix — verify).
- [ ] Unit tests: validation quá khứ, payload shape.
- [ ] Browser verify: reschedule SO-0004 → status + note trong timeline + nút Accept lại.
- [ ] Commit: `feat(ktv-mobile): SF-25 reschedule modal — thời gian mới + ghi chú`

### Task 7: order-detail-map-tel — chi tiết đơn + map + gọi KH
**Files:** `apps/ktv-mobile/src/features/order-detail/**` (OrderDetailPage, Timeline, AddressMapCard), unit tests.
- [ ] OrderDetailPage route `/order/:code`: fetch detail từ my-orders list state (nếu thiếu → refetch filter theo code… filter endpoint không có code param — fetch 2 filters hôm nay rồi tìm code; đơn giản, đủ). Header code + status; nút thao tác dùng chung components Task 5/6.
- [ ] Timeline: render timeline_json `{at,status,note,actor}` sắp theo at — status pill + note + giờ (vi-VN).
- [ ] AddressMapCard: địa chỉ (province + coordination lat/long nếu có) — tap → mở MapView inline (MapView từ @hub-store/shared, height 220, marker stop từ lat/long; **chú ý plan-critic P2: MapView built cho desktop — check horizontal overflow 375px trong browser verify**) + nút "Mở bản đồ" → deep-link `https://www.openstreetmap.org/?mlat=<lat>&mlon=<long>#map=17/<lat>/<long>` (target _blank).
- [ ] PhoneLink: `tel:` (pattern shell PhoneLink, testid `tech-phone-link`).
- [ ] Unit tests: timeline sort + render, map deep-link URL build (escapeHtml cho mọi interpolation).
- [ ] Browser verify 3 tầng: detail → timeline → tap map → OSM tab; tap SĐT → dialer intent (mobile emulation).
- [ ] Commit: `feat(ktv-mobile): SF-25 order detail — timeline + MapView deep-link + tel:`

### Task 8: e2e-mobile-spec — private seam + spec mobile viewport
**Files:** `e2e/scripts/run-ktv-private.sh`, `e2e/playwright.ktv.config.ts`, `e2e/tests/09-ktv-mobile.spec.ts`, storageState mint helper.
- [ ] Runner (pattern run-map-private.sh): containers `sf-25-postgres` :56443 + `sf-25-keycloak` :8082 fresh volume (`docker run` keycloak 26.0 `--import-realm` mount realm JSON) + flyway orders/batches one-shot + seed-db.sh (fresh DB → seed đầy đủ kèm tech TODAY) + fulfillment Java :52073 + bff :4286 + ktv-mobile :4220 (VITE_OIDC_AUTHORITY=http://127.0.0.1:8082/realms/hubstore, VITE_API_BASE_URL=http://127.0.0.1:4286); trap cleanup; port-guard trước khi boot.
- [ ] storageState mint: PKCE mint KTV-001 + CTV-001 (pattern mint_sf16 secure-cookie hack) → `.auth/ktv-001.json`, `.auth/ctv-001.json`.
- [ ] playwright.ktv.config.ts: viewport 375x667, testMatch 09-ktv-mobile.spec.ts, workers 1, baseURL http://127.0.0.1:4220.
- [ ] Spec (testid prefix `ktv-`): 7 scenarios theo spec §4.5 — my-orders đúng đơn của mình; accept SO-0006; complete SO-0006 + timeline DELIVERED; reschedule SO-0004 + note + Accept lại; detail timeline/map/tel:; PWA manifest+SW; CTV-001 chỉ thấy SO-0007.
- [ ] Chạy spec xanh trên seam (retry 1 lần nếu flake load — triage ma trận spec×run nếu flake >1).
- [ ] Commit: `test(e2e): SF-25 mobile spec 375px + private seam sf-25`

## 6. Risks & unknowns
- **Verify trước khi code:** TechServiceImpl assign persistence path (đọc trước Task 2); BFF test pattern cho tech.ts; mint script path còn tồn tại `/tmp/story/fi233/mint_sf16_v2.py` (nếu mất → viết mint helper mới trong e2e/scripts).
- **Assumptions:** gen proto toolchain paths từ memory (re-setup được); KC preferred_username giữ case username stored; `name` claim = firstName + " " + lastName.
- **Rollback unit:** mỗi task 1 commit — BE (Task 2) tách riêng FE để revert chọn lọc nếu epic owner phản đối REQUIREMENT-GAP resolution.
- **README không đụng (plan-critic P2 resolution):** reset-db note cho dev trên stack cũ ghi ở đây thay vì README — DB cũ không re-seed (emptiness-gate) → mobile dev cần `reset-db.sh` trước. Note này là tài liệu chạy, không phải deliverable.

## 7. Execution DAG (sau plan-critic fix)
Orca run `run_33cb5ca71e4c` — task ids sau replacement (task cũ T4-T8 đầu = SUPERSEDED, giữ làm audit trail):
- T1 `task_edb2d7da83f2` realm-ktv-roles (no deps)
- T2 `task_b4819de14640` tech-actions-be (no deps)
- T3 `task_80579c261515` pwa-shell ← T1 (+ Account page)
- T4b `task_7317f9659660` my-orders-today ← T3, T2
- T5b `task_b92f672fb7a8` accept-complete ← T2, T4b
- T6b `task_265013f6548d` reschedule ← T5b
- T7b `task_283f956534c4` order-detail-map-tel ← T4b, T2
- T8b `task_4b4160e4313c` e2e-mobile-spec ← T6b, T7b
Tiers: {T1,T2} → {T3} → {T4b} → {T5b,T7b} → {T6b} → {T8b}. Max width 2. Critical path T2→T4b→T5b→T6b→T8b.
