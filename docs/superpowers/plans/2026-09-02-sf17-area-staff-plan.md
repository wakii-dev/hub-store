# Plan: SF-17 — Khu vực hoạt động NV
Date: 2026-09-02 | Linear: FI-262 | Worktree: sf-17-area-staff (branch VuHoi/sf-17-area-staff)
Spec: docs/superpowers/specs/2026-09-02-sf17-area-staff-design.md (spec-critic PROCEED)

## 0. Root cause analysis
### Root cause
Hệ thống chưa có model "NV phụ trách khu vực": thiếu bảng, thiếu API, thiếu role Admin (chỉ 3 role view/ops), thiếu màn UI.
### Current state
Không có khái niệm service employee anywhere (`delivery_staff` là shipper seed, không liên quan). BFF không có per-route role check. fulfillment DB chỉ có Flyway V1.
### Expected outcome
Admin tạo/sửa/bật-tắt định nghĩa NV + khu vực + TK nhận tiền (verify dual-mode); role khác xem được list; E2E phủ.
### Constraints
- V4 là số migration CHỦ Ý (V2/V3 epic reserve SF-7/SF-14) — KHÔNG đổi thành V2 dù branch này chưa thấy V2/V3.
- Backend Java gRPC-only → API mới phải qua proto additive (file mới, regen java+ts).
- antd4: TreeSelect không có maxCount → tự chặn onSelect.
### High-level strategy
Vertical slice theo tầng: schema → proto+gRPC → BFF → FE → E2E; role Admin thêm đồng bộ 4 lớp trong 1 task riêng để tránh state nửa vời.

## 1. Problem
Admin cần quản lý nhân viên và khu vực họ phụ trách (tỉnh/phường) + TK nhận tiền; hiện không có chỗ nào nhập/xem dữ liệu này.

## 2. Scope
- In: Flyway V4 (service_employees + service_employee_regions + master regions mở rộng), gRPC StaffAreaService (proto mới `hubstore/staffarea/v1`), BFF REST `/service-employees/*` + Admin gate, FE shell-local list + form, role Admin (realm/BFF/shared/e2e), E2E `05-area.spec.ts`, verify dual-mode (mock mặc định).
- Out: HR thật, auto-assign vào đơn, D1/D2, Kafka, delete API (toggle active là off-switch).
- Success criteria (từ ACCEPTANCE context pack): admin tạo (2 tỉnh, 1 NV, verify mock xanh) → list hiện + expand thấy wards; toggle off → row mờ + tag; non-admin không thấy nút + API 403; E2E cũ + mới xanh.

## 3. Touch map
Modify/Create:
- `services/fulfillment-service/src/main/resources/db/migration/V4__area_staff_schema.sql` (mới)
- `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/{ServiceEmployeeRepository,PostgresServiceEmployeeRepository}.java` (mới)
- `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/StaffAreaServiceImpl.java` (mới)
- `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/payment/{PaymentAccountVerifier,MockPaymentAccountVerifier,ZalopayPaymentAccountVerifier}.java` (mới)
- `services/fulfillment-service/src/main/resources/application.yml` (payment.verify.provider wiring)
- `api/proto/hubstore/staffarea/v1/staffarea.proto` (mới) + `api/proto/gen/{java,ts}/...` (regen)
- `services/bff-gateway/src/routes/serviceEmployees.ts`, `src/clients/staffArea.ts`, `src/plugins/auth.ts` (KNOWN_ROLES+=Admin), `src/app.ts` (register)
- `packages/shared/src/hooks/usePermissions.tsx` (ROLES/PERMISSIONS/MATRIX)
- `docker/keycloak/hubstore-realm.json` (role + user admin)
- `apps/shell/src/App.tsx`, `src/nav.ts`, `src/pages/area-staff/*` (mới), `src/i18n.ts` resources
- `e2e/auth.setup.ts` (USERS += admin), `e2e/tests/05-area.spec.ts` (mới)
- Tests: `services/fulfillment-service/src/test/java/com/hubstore/fulfillment/{ServiceEmployeeValidationTest,PostgresServiceEmployeeRepositoryIT}.java`, `services/bff-gateway/test/bff.contract.test.ts`
READ-ONLY: `api/proto/hubstore/{fulfillment,batching,print}` cũ, apps/orders, apps/fulfillment, batching-service, canonical-seed.

## 4. Design
- Approach: Direction A (proto additive + gRPC + adapter tầng Java) — chi tiết spec §4-§8. Alternatives B (BFF→Postgres) dismissed vì phá layering.
- Edge cases: list luôn gồm inactive (dim FE); PUT full-replace (employee_code immutable); region_codes cap 100 (message vượt); TreeSelect v4 tự chặn onSelect; verify mock `^\d{9,16}$` + tag [MOCK]; zalopay mode fail-loud khi thiếu creds.
- Non-functional: 403 server-side (không chỉ ẩn nút); i18n vi/en cho label mới; antd4 LESS tokens SF-6 (không hex cứng ngoài tokens).

## 5. Implementation outline
### Tasks (8, theo bracket — DAG chuỗi tuyến tính 1→2→3→4→5→6→7→8):
1. `area-staff-schema` — V4 migration + master regions INSERT + IT test schema
2. `area-staff-crud-api` — proto staffarea/v1 + regen + repository + gRPC impl + unit tests
3. `payment-verify-dual` — PaymentAccountVerifier dual-mode + wire vào gRPC impl
4. `fe-area-list` — shared permissions Admin + nav + list page + expand + filter + **BFF ĐẦY ĐỦ 6 routes (GET + 4 write — write routes pass-through chưa gate, gate ở task 7)**
5. `fe-area-form` — form page (tree single-surface, verify inline, cap 100) — deps task 4 (cùng file App.tsx/i18n)
6. `active-toggle` — Switch toggle trong list (Admin UI) + PUT active (route đã có từ task 4, verify thật được)
7. `role-guard` — Admin gate trên 4 write routes (403) + KNOWN_ROLES + Keycloak realm admin + e2e auth.setup user admin + contract tests
8. `e2e-area-spec` — `05-area.spec.ts` + all-green

### File structure
Java theo package `com.hubstore.fulfillment` hiện có (store/, service/, payment/, config/); BFF routes per-domain file; FE shell-local `pages/area-staff/` (AreaListPage.tsx, AreaFormPage.tsx).

### Testing strategy
- Java unit: validation + repository logic (PostgresIT skip-if-no-DB pattern `PostgresOrderRepositoryIT`); `cd services/fulfillment-service && mvn -q test`
- BFF contract: extend `test/bff.contract.test.ts` (mock gRPC, assert 403 + metadata); `cd services/bff-gateway && pnpm test`
- E2E: `cd e2e && pnpm exec playwright test`
- Rule 0: browser walkthrough 3 tầng trước merge.

## 6. Risks & unknowns
- protoc regen: `protoc --java_out` + `protoc-gen-ts_proto` (node_modules/.bin, ts-proto 2.7.7) — chạy từ `api/proto`, verify import paths khớp pattern file cũ (soát header file gen/ts hiện có).
- Keycloak realm JSON chỉ áp lúc init volume lần đầu → dev phải reset volume KC hoặc import tay; E2E dùng boot flow import → sạch. Ghi chú trong commit.
- TreeSelect v4: dùng `treeData` từ GET /master-data/regions (parent_code group); V4 rows sort sau seed rows — không giả định thứ tự.
- Command boot stack dev: `bash scripts/boot-all.sh` (hoặc compose) — port cross-worktree conflict → chỉ chạy 1 stack.

---
## Task detail (bổ sung điều hành — executor đọc spec + codebase pattern tương đương)

### Task 1: area-staff-schema
Files: `V4__area_staff_schema.sql` (mới), `PostgresServiceEmployeeRepositoryIT.java` (khung IT schema smoke).
- DDL đúng spec §3 (bigserial, unique employee_code, FK regions, UNIQUE(employee_code, region_code)).
- Master INSERT ON CONFLICT DO NOTHING: thêm ≥6 tỉnh/≥18 ward ngoài 11 rows seed (vd 25 T.Thiên Huế + wards, 92 Quảng Nam, 31 Gia Lai...; ward type 'ward', parent_code = tỉnh).
- Verify: `docker compose up -d postgres && docker compose run --rm orders-migrate` (flyway one-shot trỏ dir) → `docker compose exec postgres psql -U hubstore -d fulfillment -c '\dt'` thấy 2 bảng mới + `SELECT count(*) FROM regions` tăng. Sau đó `mvn -q test` xanh.
- Commit: `feat(fi245-sf17): area-staff schema V4 + master regions`

### Task 2: area-staff-crud-api
Files: proto mới + regen gen/java + gen/ts; `ServiceEmployeeRepository.java` (interface: list/get/create/update/setActive); `PostgresServiceEmployeeRepository.java` (JdbcTemplate + RowMapper; list WHERE động title/query/region, LUÔN gồm inactive; update @Transactional full-replace + regions delete/insert); `StaffAreaServiceImpl.java` (@GrpcService, validate `^[A-Z0-9_-]{3,32}$` code, `^\d{9,16}$` account, title non-blank → gRPC INVALID_ARGUMENT); config bean registration kiểu `OrderRepositoryConfig`.
- Regen: **prerequisite `pnpm install` ở repo root trước** (ts-proto 2.7.7 khai báo trong `services/bff-gateway/package.json` → bin ở `services/bff-gateway/node_modules/.bin/protoc-gen-ts_proto` — KHÔNG có node_modules root). Lệnh chuẩn: làm theo `docs/superpowers/spikes/grpc-codegen-multilang.md` (§ invocation — gồm `--ts_proto_opt=outputServices=grpc-js,forceLong=number,esModuleInterop=true`), pattern: `protoc -I api/proto --java_out=api/proto/gen/java --plugin=protoc-gen-ts_proto=<path-to-bff-bin> --ts_proto_out=api/proto/gen/ts <opts> api/proto/hubstore/staffarea/v1/staffarea.proto`.
- Verify: `mvn -q test` xanh; verify runtime qua harness `e2e/backend-integration.ts` pattern (grpcurl cần reflection — tránh).
- Commit: `feat(fi245-sf17): staffarea gRPC API + Postgres repository`

### Task 3: payment-verify-dual
Files: `payment/PaymentAccountVerifier.java` (interface `VerifyResult verify(String account)` — record VerifyResult(boolean valid, String source, String message)), `MockPaymentAccountVerifier.java` (`@ConditionalOnProperty(name="payment.verify.provider", havingValue="mock", matchIfMissing=true)`, message chứa `[MOCK]`), `ZalopayPaymentAccountVerifier.java` (`havingValue="zalopay"`, khởi tạo đọc ZALOPAY_APP_ID/KEY1 — thiếu → throw lúc boot; RestClient call endpoint verify Zalopay; error/timeout → valid=false không crash), `application.yml` thêm `payment.verify.provider: ${PAYMENT_VERIFY_PROVIDER:mock}` + RPC `VerifyPaymentAccount` trong StaffAreaServiceImpl delegate adapter.
- Verify: unit test MockPaymentAccountVerifier (valid 10 digits → true + source MOCK + message chứa [MOCK]; invalid "abc" → false). `mvn -q test` xanh.
- Commit: `feat(fi245-sf17): payment-account verify dual-mode (mock default / zalopay env)`

### Task 4: fe-area-list
Files: `packages/shared/src/hooks/usePermissions.tsx` (ROLES+='Admin', PERMISSIONS+='areastaff.view'/'areastaff.manage', MATRIX: Admin→cả hai + giữ cũ, 3 role cũ→view; Admin thừa kế permission cũ — thêm vào matrix không xóa), `apps/shell/src/nav.ts` (+nav item /area-staff permission areastaff.view, icon), i18n vi/en (`nav.areaStaff` + list labels), `apps/shell/src/pages/area-staff/AreaListPage.tsx` (antd Table + FilterBar: Select chức danh [SHIPPER/WAREHOUSE/CSKH/KTV], TextSearch NV, Select tỉnh từ GET /master-data/regions; expand row → wards resolve từ region_codes + master (tỉnh→wards con, phường→chính nó, group tỉnh); inactive row style mờ + Tag "Ngừng hoạt động"; KHÔNG toggle ở task này; testids: `area-list`, `area-create-btn`, `area-row-<code>`, `area-expand-<code>`), `apps/shell/src/api/areaStaffApi.ts` (fetch wrapper gọi BFF REST), **BFF ĐẦY ĐỦ 6 routes pass-through** (GET /service-employees, GET /:code, POST /, PUT /:code, PUT /:code/active, POST /payment-account/verify — write routes CHƯA gate, gate ở task 7): `services/bff-gateway/src/routes/serviceEmployees.ts` + `src/clients/staffArea.ts` facade (pattern `fulfillment.ts`) + register trong `app.ts`, route + `RequirePermission permission="areastaff.view"` trong `App.tsx`. Lưu ý executor: `pages/area-staff/` là THƯ MỤC MỚI chủ đích (không phải convention `features/` hiện có — spec duyệt shell-local pages).
- Verify: `pnpm --filter shell build` (hoặc `turbo build --filter=shell`) + boot stack → login manager (admin user chưa có đến task 7) thấy nav + list rỗng không lỗi console.
- Commit: `feat(fi245-sf17): area-staff list page + Admin role shared permissions`

### Task 5: fe-area-form
Files: `apps/shell/src/pages/area-staff/AreaFormPage.tsx` (dùng cho /area-staff/new và /area-staff/:code/edit), routes App.tsx (`/area-staff/new` + `/area-staff/:code/edit`, RequirePermission="areastaff.manage"), i18n labels.
- Form theo spec §8: chức danh Select tĩnh; mã NV (`^[A-Z0-9_-]{3,32}$` rule) + họ tên; TK nhận tiền + nút "Kiểm tra" → POST verify → hiển thị badge nguồn (source MOCK → Tag `[MOCK]`) + valid/invalid màu; TreeSelect DUY NHẤT (treeData tỉnh→phường từ /master-data/regions, parent_code), chọn node tỉnh = whole province (checkable), cap 100 tổng selection — `onSelect`/`onChange` chặn vượt + `message.warning` i18n; submit → POST/PUT → navigate về list.
- Verify: build xanh; thủ tục tạo draft qua UI bằng login manager (write routes pass-through đã có từ task 4 — gate chưa có nhưng dev realm mọi role đều qua được đến task 7).
- Commit: `feat(fi245-sf17): area-staff define/edit form (tree + inline verify)`

### Task 6: active-toggle
Files: `AreaListPage.tsx` (Switch render khi `can('areastaff.manage')`, `data-testid="area-active-toggle-<code>"`, onChange → PUT active (route pass-through đã có từ task 4) → refresh row; off → mờ + tag), i18n.
- Verify: build + tay toggle (login manager) → row mờ ngay (không biến mất) + refresh trang vẫn off.
- Commit: `feat(fi245-sf17): active toggle on area list`

### Task 7: role-guard
Files: `services/bff-gateway/src/plugins/auth.ts` (KNOWN_ROLES+='Admin'), `src/routes/serviceEmployees.ts` THÊM Admin gate lên 4 write routes có sẵn từ task 4 (helper `requireRole(request,'Admin')` → 403 envelope code FORBIDDEN), `docker/keycloak/hubstore-realm.json` (realm role Admin + user `admin` enabled, password `Password123!` literal dev-only, realmRoles ["Admin"]), `e2e/auth.setup.ts` (USERS+='admin'), `apps/shell` form/toggle đã gate theo `areastaff.manage` (task 4-6) — non-admin vào trực tiếp /area-staff/new → RequirePermission 403 Result.
- BFF contract tests: extend `test/bff.contract.test.ts` — 4 write routes: coordinator token → 403 FORBIDDEN envelope; admin token → pass-through metadata x-user-role tới mock gRPC; GET list coordinator → 200.
- Verify: `cd services/bff-gateway && pnpm test` xanh; realm json valid JSON.
- Commit: `feat(fi245-sf17): Admin role end-to-end (realm/BFF gate/shared) + 403 writes`

### Task 8: e2e-area-spec
Files: `e2e/tests/05-area.spec.ts` — theo pattern `02-role-matrix.spec.ts` (test.use storageState per describe).
- Admin flow: nav → /area-staff → tạo (2 tỉnh, 1 NV, verify mock xanh [MOCK] tag) → thấy list → expand thấy wards → toggle off → row mờ + tag ngừng.
- Coordinator: `test.use({ storageState: ".auth/coordinator.json" })` — không thấy `area-create-btn`; `request.post('/service-employees', ...)` token coordinator → 403.
- Chạy: boot stack (`bash scripts/boot-all.sh` hoặc compose theo setup hiện tại — KHÔNG chạy 2 stack do port conflict) → `cd e2e && pnpm exec playwright test` — specs 01-05 đều xanh.
- Commit: `test(fi245-sf17): e2e area-staff spec`

## Merge & verify (sau Task 8 — coordinator chạy)
1. Rolling code-reviewer trên diff cả SF → fix verdict.
2. Rule 0 browser: admin login → tạo → list → expand → toggle; coordinator → 403.
3. Merge: `git merge VuHoi/sf-17-area-staff` vào story/fi245-postgres-production via `git update-ref refs/heads/story/fi245-postgres-production HEAD` với guard `git merge-base --is-ancestor <old-dest-tip> HEAD` + conflict improvements-log giữ CẢ HAI + audit comment merge-hash.
4. story-verify sạch → FI-262 Done.
