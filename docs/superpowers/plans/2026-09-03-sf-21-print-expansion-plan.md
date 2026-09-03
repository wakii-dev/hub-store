# SF-21 Print expansion + platform polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mở rộng D3 print (printers DB-backed + CRUD, print errors per-đơn, zoom 25–200, print-all gate) + platform polish (hotkeys, empty-states, avatar, font-slider, helper modal, fullscreen, version check) — additive, KHÔNG vỡ E2E cũ.

**Architecture:** fulfillment-service (Java/Spring gRPC) sở hữu `printers`/`print_errors`/`user_avatars` qua Flyway V8/V9/V10 + proto additive rpcs; BFF (Fastify) proxy + validate printerId + record lỗi print-thật + sở hữu avatar/version routes (direct-DB pg Pool precedent `lib/audit.ts`); print-service KHÔNG đổi. FE: PrintPage (apps/fulfillment) + AppLayout/platform (apps/shell) + shared hooks/components (packages/shared).

**Tech Stack:** Java 17 Spring Boot 3 + Flyway + gRPC · Node Fastify + pg · React 18 antd4 + Module Federation (shell :3000 host, fulfillment :3002) · Playwright e2e.

**Linear Issue:** FI-266 (epic FI-245)

**Spec:** docs/superpowers/specs/2026-09-03-sf-21-print-expansion-design.md

---

## Hard rules cho mọi task

- `pnpm install` trước khi typecheck/build (node_modules có thể chưa có trong worktree).
- KHÔNG đổi: testids `app-header`, `nav-*`, `lang-toggle`, `logout-button`, `header-user`, `data-probe="fulfillment-print"`; selector `.print-preview-area canvas`; react-pdf worker wiring (PdfPreview.tsx:8-21 load-bearing).
- Proto additive-only; sau regen luôn build-verify: `cd api/proto/gen/go && go build ./...` (nếu đụng go) — fulfillment.proto chỉ cần java + ts stubs.
- PERMISSION_MATRIX: chỉ additive entry.
- Commit per task: `<type>(sf-21): <summary>`; KHÔNG `git add -A`.
- Proto regen toolchain (đã verify có mặt): protoc 29.3 `/opt/homebrew/bin/protoc`; java plugin `/tmp/sf1-spikes/spike4/jars/protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe`; ts: `npm i ts-proto@2.7.7` vào /tmp dir rồi `--plugin` trỏ vào đó, opts `outputServices=grpc-js,forceLong=number,esModuleInterop=true`. Chi tiết: memory worktree-merge-patterns.md + docs/superpowers/spikes/grpc-codegen-multilang.md.

## Task DAG (orca orchestration run_729984938a5b — dispatch schedule ĐIỀU CHỈNH theo plan-critic)

```
Track A (print):     T1 → T2 → T3 → T4 → T5 ─┐
Track B (platform):                           ├→ T12 (e2e)
  T6 (sau T2 — cần PrintersPage) → T10        │
  T8 → T9 → T11 (chain — cùng AppLayout.tsx)  │
  T7 (sau T5 — tránh window sửa PrintPage) ───┘
```

Dispatch discipline (orca task deps không sửa được — coordinator enforce):
- Tier 0: T1, T8 (max 2 song song — T2 là long pole, không ghép task chậm khác)
- Sau T2: T6 (song song T3), T9 sau T8, T11 sau T9, T10 sau T6, T7 sau T5
- T12 cuối: deps hiệu dụng [T5, T6..T11]

---

### Task 1: print-types-5 — verify 5 loại chứng từ + pin contracts

**Files:**
- Modify: `apps/fulfillment/src/pages/PrintPage.test.tsx` (thêm test assert 5 tab + 5 type gọi print)
- Modify: `packages/shared/src/api-contracts/print.ts` — additive `PrinterDto.printerIp?/mac?/type?`

**Steps:**
- [x] Đọc `packages/shared/src/enums.ts` PRINT_TYPES (5 loại: bill/delivery/handover_receipt/goods_handover/installation_acceptance) + `PrintPage.tsx` — xác nhận 5 tab render từ mảng này (đã có từ SF-10, KHÔNG build mới).
- [x] Thêm unit test PrintPage: render với batchCode → expect đúng 5 tab text; mock printApi → click từng tab → `printDocument` được gọi với đúng printType + `printerId: ''` (preview seam).
- [x] Additive `PrinterDto`: `printerIp?: string; mac?: string; type?: 'bill' | 'a4';` — KHÔNG xóa field nào.
- [x] Run: `pnpm -F fulfillment test -- PrintPage` + `pnpm -F shared test -- api-contracts` → PASS.
- [x] Commit `test(sf-21): pin 5 print types render + additive printer dto fields`.

### Task 2: printer-management — V8 + proto additive + CRUD + FE

**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V8__printers.sql`
- Modify: `api/proto/hubstore/fulfillment/v1/fulfillment.proto` (additive rpcs + messages)
- Regen stubs java + ts (toolchain trên)
- Create: `services/fulfillment-service/.../store/PrinterRepository.java` + `PostgresPrinterRepository.java` (+ InMemory cho unit test, pattern `PostgresServiceEmployeeRepository`)
- Modify: `services/fulfillment-service/.../service/FulfillmentServiceImpl.java` (impl 3 rpc mới)
- Modify: `services/bff-gateway/src/clients/fulfillment.ts` (client methods) + `src/routes/print.ts` (đổi nguồn GET /fulfillment/print/printers sang fulfillment client; validate printerId: `''` pass-through; CRUD routes `/fulfillment/printers` GET+POST+PUT, Admin gate `requireUser(..., ['Admin'])` + permission `printers.manage`)
- Modify: `packages/shared/src/hooks/usePermissions.tsx` PERMISSIONS + MATRIX: thêm `'printers.manage'` chỉ Admin (additive; Coordinator/WarehouseOps/Manager/WarehouseEmployee KHÔNG có)
- Create: `apps/shell/src/pages/PrintersPage.tsx` (+ route/nav Admin-gated, theo pattern UsersPage) — bảng printers theo shop + modal thêm/sửa (fields: shopCode, printerId, name, printerIp, mac, type bill|a4; identity shopCode+printerId KHÔNG sửa sau tạo; duplicate → 409)
- Modify: `apps/fulfillment/src/pages/PrintPage.tsx` — Select máy in: filter theo shop + cho chọn type (bill vs A4 group); dùng printers list mới (có type)
- Modify: `apps/shell/src/nav.ts` + route table (pattern SF-8 users)

**Steps:**
- [x] V8 SQL: bảng `printers(shop_code varchar, printer_id varchar, name varchar, printer_ip varchar, mac varchar, type varchar CHECK (type IN ('bill','a4')), PRIMARY KEY (shop_code, printer_id))` + INSERT 6 rows canonical-seed (lấy từ `services/print-service/print_service/printers.py` seed registry — 2× shop 30201 + 4 shop khác; gán type: 30201 1 bill + 1 a4, shop 1-row gán `a4`) ON CONFLICT DO NOTHING.
- [x] Proto additive (đặt cuối service block, follow style hiện có): `message Printer { string shop_code; string printer_id; string name; string printer_ip; string mac; string type; }` + rpc `ListPrinters(ListPrintersRequest{shop_code}) → ListPrintersResponse{repeat Printer}` / `CreatePrinter(CreatePrinterRequest{Printer}) → CreatePrinterResponse` / `UpdatePrinter(UpdatePrinterRequest{shop_code, printer_id, Printer fields}) → UpdatePrinterResponse`. Lint giữ ENUM rule như buf.yaml chú thích.
- [x] Audit integration: CreatePrinter/UpdatePrinter ghi activity_log (pattern SF-7 audit — actor/action/target/detail, theo cách FulfillmentServiceImpl ghi audit cho mutation có sẵn — đọc trước khi viết).
- [x] Regen stubs: java (protoc + plugin path trên, out `services/fulfillment-service` theo đúng flag pattern đã dùng — xem git log các lần regen trước hoặc spike doc) + ts (ts-proto vào `api/proto/gen/ts/`). Verify: grep symbol mới trong gen files.
- [x] Java: PrinterRepository interface + PostgresPrinterRepository (JdbcTemplate, pattern PostgresServiceEmployeeRepository) + impl 3 rpc trong FulfillmentServiceImpl (role check server-side: Create/Update chỉ Admin — xem cách SF-8/17 check role trong impl) + duplicate → ALREADY_EXISTS (map 409 ở BFF). Unit test repo với InMemory impl.
- [x] BFF: `deps.fulfillment.listPrinters/createPrinter/updatePrinter` client methods (pattern staffArea client); routes: `GET /fulfillment/print/printers?shopCode=` ĐỔI NGUỒN sang `deps.fulfillment.listPrinters` (giữ nguyên response shape `{ items }` — api-contracts.test.ts pin); `POST/PUT /fulfillment/printers` Admin-gated (`requireUser(request, ['Admin'])` — plugin auth.ts:99) → map ALREADY_EXISTS→409.
- [x] FE PrintersPage + nav (Admin) + PrintPage select filter type. Modal dùng antd4 Form + EmptyState cho bảng rỗng (Task 7 sẽ thay bằng shared EmptyState nếu chưa merge — dùng `packages/shared/src/components/EmptyState` ngay từ đầu).
- [x] Tests: Java unit (repo + rpc impl), BFF route test (nếu pattern có — check `services/bff-gateway/src/**/*.test.ts`), FE test PrintersPage (render + create flow mocked). `pnpm -F fulfillment test`, `pnpm -F shell test`, mvn test cho fulfillment.
- [x] Run unit suite đầy đủ touched packages → PASS. Commit `feat(sf-21): printer management — V8 + proto additive + CRUD + FE`.

### Task 3: print-errors — V9 + record + badge/sort

**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V9__print_errors.sql`
- Modify: `fulfillment.proto` (additive: `RecordPrintError`, `ListPrintErrors`/counts rpc) + regen java/ts
- Create: `.../store/PrintErrorRepository.java` + Postgres impl + rpc impl
- Modify: `services/bff-gateway/src/routes/print.ts` — try/catch quanh print-thật flow (printerId ≠ ''): record khi (a) invalid printerId (trước khi proxy), (b) batching getBatchDetail fail, (c) print-service fail. `printerId === ''` preview: KHÔNG validate, KHÔNG record. Record-write fail → log-and-continue, KHÔNG mask lỗi gốc. Proxy invalid printerId → 400.
- Create: route `GET /fulfillment/print-errors?codes=` (counts per orderCode) trong print.ts
- Modify: `apps/fulfillment/src/pages/PrintPage.tsx` + `BatchListPage.tsx` — badge count lỗi per đơn (antd Badge/Tag), sort danh sách đơn: nhiều lỗi nhất lên đầu (stable: rồi theo code), PrintPage hiển thị error list per order trong panel
- Modify: `apps/fulfillment/src/api/printApi.ts` (client cho counts)
- Modify: `packages/shared/src/api-contracts/print.ts` — additive `PrintErrorCountDto { orderCode: string; count: number }` + response type cho counts endpoint

**Steps:**
- [x] V9 SQL: `print_errors(id bigserial PK, order_code varchar NOT NULL, batch_code varchar, print_type varchar NOT NULL, printer_id varchar, error_message text, occurred_at timestamptz NOT NULL DEFAULT now())` + index `(order_code)` + index `(batch_code, order_code)`.
- [x] Proto additive: `RecordPrintError(PrintErrorRecord) → Empty-ish response`; `GetPrintErrorCounts(batch_code, repeat order_codes) → map/repeated {order_code, count}`. Regen java + ts.
- [x] Java repo + impl (insert + group-count query). Unit test.
- [x] BFF print.ts: theo đúng semantic spec D2 (xem §4 spec) — record SAU KHI xác định printerId hợp lệ; failure nào cũng record (invalid → record + 400; batching fail → record + gRPC error; print-service fail → record + pass-through error). Fail-open record.
- [x] FE: counts API + Badge trên row đơn + sort desc count trong PrintPage order list; test PrintPage badge + sort (mock counts).
- [x] Run tests touched → PASS. Commit `feat(sf-21): print errors per-order — V9 + record at BFF + badge/sort`.

### Task 4: preview-improve — zoom 25–200%

**Files:**
- Modify: `apps/fulfillment/src/pages/PrintPage.tsx:248-250` — Slider `min={25} max={200} step={5}`
- Modify: `apps/fulfillment/src/pages/PrintPage.test.tsx`

**Steps:**
- [x] Đổi slider min 50→25, step 10→5 (stops 25/50/75/.../200). KHÔNG đổi PdfPreview internals (canvas + worker wiring giữ nguyên).
- [x] Test: slider set 25 → preview container transform/zoom = 0.25 (theo cơ chế zoom hiện có trong file — đọc trước khi sửa).
- [x] Run `pnpm -F fulfillment test -- PrintPage` → PASS. Commit `feat(sf-21): preview zoom 25-200%`.

### Task 5: print-all — status gate

**Files:**
- Modify: `apps/fulfillment/src/pages/PrintPage.tsx` (`handlePrintAll` :146-167 + nút "In tất cả" + single-type print button)
- Modify: `apps/fulfillment/src/pages/PrintPage.test.tsx`

**Steps:**
- [ ] Gate: batch status = `BATCH_ENTITY_STATUS.CANCELLED` (enums.ts:42, =2) → disable cả "In tất cả" + nút in per-type, Tooltip lý do "Phiếu đã hủy — không in được". Batch khác (ASSIGNED/PREPARING/COMPLETED) → cho phép (re-print OK). Chỉ FE gate (server-side out of scope — noted).
- [ ] Test: status CANCELLED → buttons disabled; status PREPARING → enabled. KHÔNG vỡ test flow cũ (in khi PREPARING/ASSIGNED phải vẫn pass).
- [ ] Run PrintPage tests + `pnpm -F fulfillment test` full → PASS. Commit `feat(sf-21): print-all gate theo batch status`.

### Task 6: hotkeys — useHotkeys shared hook + wire F4/F6/F8

**Files:**
- Create: `packages/shared/src/hooks/useHotkeys.ts` + `useHotkeys.test.tsx`
- Modify: `packages/shared/src/hooks/index.ts` (export)
- Modify: `apps/fulfillment/src/pages/BatchListPage.tsx` hoặc orders create entry — F6 mở create (nếu form create nằm ở orders app, wire tại đó)
- Modify: form modals có save/cancel: users create/edit modal (`apps/shell/src/features/users` hoặc pages — tìm trước), manual order-create form (SF-13), printer modal (Task 2) — F4 = submit, F8 = cancel/close

**Hook contract:**
```ts
type HotkeyBinding = { key: 'F4'|'F6'|'F8'; handler: () => void; description: string };
function useHotkeys(bindings: HotkeyBinding[]): void
// window keydown, ignore khi target input/textarea/[contenteditable], preventDefault,
// unregister cleanup, StrictMode-safe (useEffect return)
```
- [x] Test hook: renderTestHook → dispatch keydown F4 → handler gọi; focus input → KHÔNG gọi; unmount → listener gỡ.
- [x] Wire từng form + register context cho Task 10 đọc (export module-level registry `hotkeyRegistry` — map id → bindings để helper modal list; keep nhẹ).
- [x] Run `pnpm -F shared test -- useHotkeys` + touched apps → PASS. Commit `feat(sf-21): useHotkeys hook + F4/F6/F8 wiring`.

### Task 7: empty-states-shared — áp EmptyState screens mới

**Files:**
- Modify: `apps/shell/src/pages/PrintersPage.tsx` (bảng rỗng → EmptyState), PrintPage error panel rỗng (apps/fulfillment)
- Verify: `packages/shared/src/components/EmptyState/EmptyState.tsx` API (đọc props trước khi dùng)

**Steps:**
- [ ] Áp EmptyState cho: PrintersPage khi shop chưa có printer (CTA "Thêm máy in"), PrintPage panel lỗi khi 0 errors, PrintPage khi batch không còn đơn hợp lệ để in.
- [ ] Test render empty state mỗi màn: `pnpm -F shell test` + `pnpm -F fulfillment test` → PASS.
- [ ] Commit `feat(sf-21): shared empty-states cho print screens`.

### Task 8: avatar-upload — V10 + BFF routes + FE crop

**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V10__user_avatars.sql`
- Create: `services/bff-gateway/src/routes/avatar.ts` + register trong `src/app.ts`
- Create: `apps/shell/src/features/layout/AvatarUpload.tsx` (+ integrate vào AppLayout user chip)

**Schema + API:**
```sql
-- V10__user_avatars.sql
CREATE TABLE user_avatars (
  user_id varchar PRIMARY KEY,
  content_type varchar NOT NULL CHECK (content_type IN ('image/jpeg','image/png')),
  data bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
- `POST /avatar` — multipart field `file`; auth `requireUser`; validate: content-type allowlist + magic bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`) + ≤5MB server-side; ghi DB qua pg Pool (pattern `lib/audit.ts` — lazy pool, connection string env giống audit).
- `GET /avatar/:userId` — auth; trả bytes + stored content-type + `X-Content-Type-Options: nosniff` + `Cache-Control: private, max-age=300`; 404 nếu chưa có.
- FE: upload input → load image → crop canvas native (drawImage với crop rect vuông giữa — KHÔNG thêm thư viện) → toBlob(jpeg/png) → POST. Sau upload thành công refresh avatar URL với cache-buster (`?v=updated_at`).

**Steps:**
- [x] V10 migration. [x] BFF routes + register + test (mock pg hoặc integration theo pattern test hiện có của bff — check `services/bff-gateway/src/**/*.test.ts`). [x] FE crop component + wire header avatar (img src `GET /avatar/<userId>` fallback initials khi 404). [x] Tests + run → PASS. Commit `feat(sf-21): avatar upload crop + persist`.

### Task 9: font-size-slider

**Files:**
- Create: `packages/shared/src/theme/fontScale.ts` (apply/persist/clamp util + test)
- Create: `apps/shell/src/features/layout/FontSizeSlider.tsx` + integrate AppLayout header (đặt cạnh language toggle; KHÔNG đổi testid có sẵn)
- Modify: `packages/shared/src/theme/` global stylesheet (file LESS/CSS mà shell import — tìm entry theme hiện có)

**Mechanism (antd4 — không runtime token):**
```css
/* global override — áp qua <html style="--app-font-size: Npx"> */
html { --app-font-size: 14px; }
body { font-size: var(--app-font-size); }
.ant-btn, .ant-table, .ant-form-item, .ant-modal, .ant-select,
.ant-menu, .ant-descriptions-item, .ant-card { font-size: inherit; }
```
- [x] Util: clamp(12, 20) + localStorage `sf.fontSize` + setProperty trên documentElement. Test util.
- [x] Slider 12–20 (step 1) trong header + apply ngay khi kéo + persist. Reload giữ (E2E sẽ assert).
- [x] Run shared + shell tests → PASS. Commit `feat(sf-21): font-size slider 12-20 persist`.

### Task 10: hotkey-helper-modal

**Files:**
- Create: `apps/shell/src/features/layout/HotkeyHelperModal.tsx` (antd Modal + Input.Search + bảng phím tắt)
- Modify: `apps/shell/src/features/layout/AppLayout.tsx` (nút mở modal — icon keyboard, cạnh fullscreen button)

**Steps:**
- [x] Đọc `hotkeyRegistry` (Task 6) → render bảng (phím | mô tả | context màn). Ô search filter theo text. KHÔNG đổi DOM/testid header hiện có — chỉ THÊM node mới.
- [x] Test: render modal qua click nút; search filter; `pnpm -F shell test` → PASS.
- [x] Commit `feat(sf-21): hotkey helper modal`.

### Task 11: fullscreen-version-check

**Files:**
- Modify: `services/bff-gateway/src/routes/auth.ts` hoặc tạo `src/routes/meta.ts`: `GET /version` → `{ version: process.env.APP_VERSION ?? null }` (register app.ts)
- Create: `apps/shell/src/features/layout/FullscreenToggle.tsx` + `VersionCheck.tsx`
- Modify: `apps/shell/src/features/layout/AppLayout.tsx` (nút fullscreen icon + version badge + prompt)

**Behavior:**
- Fullscreen: `document.documentElement.requestFullscreen()` / `document.exitFullscreen()` toggle; F11 keydown preventDefault (webkitRequestFullscreen fallback Safari); macOS Fn-intercept graceful — nút luôn hoạt động.
- Version: `APP_VERSION` unset → badge ẩn + check skip (không prompt-loop). Có version → so localStorage `sf.seenVersion`; khác → antd Modal "Phiên bản mới" + nút reload (reload set seenVersion TRƯỚC khi reload để không lặp). Check khi window focus + interval 5'.
- [x] Tests cho cả hai (mock fullscreen API + fetch): `pnpm -F shell test` → PASS.
- [x] Commit `feat(sf-21): fullscreen toggle + version check prompt`.

### Task 12: e2e-print-expansion

**Files:**
- Create: `e2e/tests/08-print-expansion.spec.ts`

**Context bắt buộc:** dùng PRIVATE-PORT/PRIVATE-CONTAINER seam như sibling SFs — postgres + keycloak container riêng tên `sf-21-*` + env override cho mọi service (memory fi245-sf15-nvc-adapter-patterns: runner /tmp/story/fi233/run-*.sh pattern; KHÔNG tranh port với SF-11/23/28 stacks). Login helper storageState (SF-4). KHÔNG sửa spec cũ.

**Coverage (assert từng ACCEPTANCE dòng):**
- [ ] In đủ 5 loại tại PrintPage (click từng tab → PDF request phát ra — assert network/response blob hoặc probe có sẵn).
- [ ] Preview zoom: set slider 25 → assert preview scale (DOM/computed).
- [ ] Printers: Admin login → tạo printer mới (bill) → PrintPage chọn được printer đó; WarehouseOps KHÔNG thấy nav Printers (role matrix).
- [ ] Print fail: stop print-service (hoặc invalid printerId path) → in thật → error count tăng; màn hiển thị badge; đơn nhiều lỗi nhất đứng đầu.
- [ ] Print-all gate: batch CANCELLED → nút disabled.
- [ ] Hotkeys: F6 mở create tại màn có create; F4 submit tại modal có save; F8 cancel modal; hotkey helper modal mở + search.
- [ ] Avatar: upload (fixture ảnh PNG <5MB) → header avatar thay đổi sau reload.
- [ ] Font slider: kéo → computed font-size table cell đổi; reload → giữ.
- [ ] Fullscreen: click nút → fullscreenElement != null → click nữa → null.
- [ ] Version: set APP_VERSION mới hơn seenVersion → prompt hiện.
- [ ] Chạy suite cũ 01-main-flow + 02-role-matrix + 03-audit (print-related assertions) → vẫn xanh.
- [ ] Commit `test(sf-21): e2e print expansion spec`.

---

## Verification (Phase 5 checklist)

- [ ] Từng dòng ACCEPTANCE spec §7 → evidence (test + browser).
- [ ] E2E cũ: 01-main-flow (print assertions :209-235), 02-role-matrix, 03-audit → xanh.
- [ ] Flyway pre-merge: `ls services/fulfillment-service/src/main/resources/db/migration/` trên parent story/fi245-postgres-production — renumber V8/V9/V10 nếu sibling đã chiếm.
- [ ] story-verify sf-21 sạch.
