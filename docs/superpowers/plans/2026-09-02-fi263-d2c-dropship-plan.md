# Plan: SF-18 D2C/Dropship module
Date: 2026-09-02 | Linear: FI-263 | Worktree: sf-18-d2c | Spec: docs/superpowers/specs/2026-09-02-fi263-d2c-dropship-design.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Module D2C/Dropship read-only-ngoài-note: list + filter đa chiều + expand + note + export CSV ≤31 ngày, BE fulfillment (Flyway V5 + gRPC) → BFF Fastify → FE orders-mf.

**Architecture:** fulfillment-service (Spring Boot gRPC-only, JdbcTemplate) owns DB `fulfillment`; BFF proxy qua gRPC (ts-proto); FE orders-mf (antd4) expose D2CPage qua MF; role WarehouseEmployee mới; seed file riêng + reset-db update.

**Tech Stack:** Java 17/Spring Boot 3.5.5 + Flyway + JdbcTemplate; Fastify 5 + grpc-js + ts-proto; React 18 + antd 4.24.16 + RTKQ; Playwright; Postgres.

---

## 0. Root cause analysis

### Root cause
Rebuild hệ thống hub-store theo kiến trúc mới (gRPC polyglot + MF) — module D2C/Dropship của hệ gốc chưa được dựng lại; FI-245 dựng nền tảng persistence (SF-2 Postgres done), giờ mới đủ deps thêm module domain mới.

### Current state (before feature)
Không có bảng/API/UI nào cho D2C. fulfillment chỉ có orders/batches domain. NHV kho không xem được đơn đẩy sàn.

### Expected outcome
NHV kho (WarehouseEmployee/WarehouseOps/Manager) lọc + xem + ghi chú + export đơn D2C đúng ACCEPTANCE context pack.

### Constraints & hardships
Export pattern SF-7 chỉ là mô tả (chưa có code) → code mới. Proto chỉ additive. Role WarehouseEmployee phải thêm 3 nơi (realm/BFF/FE). Kafka KHÔNG vào path nghiệp vụ.

### High-level strategy
Vertical slice theo tầng có sẵn: schema → repo+gRPC → BFF route → FE → E2E; seed sample riêng; export BFF-assemble (không streaming proto).

## 1. Problem
NV kho cần theo dõi đơn D2C đẩy sang NVC (lọc đa chiều, ghi chú, xuất báo cáo ≤31 ngày) — hiện không có màn nào.

## 2. Scope
- **In:** V5__d2c_orders.sql; proto RPC FilterD2cOrders + UpdateD2cOrderNote (additive); D2cOrderRepository (Postgres); BFF /d2c-orders/filter|:orderCode/note|export; FE D2CPage (/hub-store-order/d2c) expand + note modal + export guard; role WarehouseEmployee (realm+KNOWN_ROLES+FE matrix+auth.setup); seed d2c-sample.json + seed-db.sh section + reset-db.sh d2c_orders; e2e 05-d2c.spec.ts; unit tests cập nhật (usePermissions/tokenGetter/App/bff.contract).
- **Out:** tạo/sửa đơn từ FE; sync tự động; Kafka blocking path; canonical-seed.json; đổi message proto cũ; E2E assertions cũ; Coordinator perm.
- **Success criteria:** 4 dòng ACCEPTANCE context pack (filter carrier+khung giờ đúng + expand đủ; note lưu+hiện lại; export 40 chặn/31 OK mở Excel; E2E cũ+mới xanh).

## 3. Touch map
- Modify: `services/fulfillment-service/src/main/resources/db/migration/` (thêm V5), `src/main/java/com/hubstore/fulfillment/...` (repo + grpc service), `api/proto/hubstore/fulfillment/v1/fulfillment.proto` + `api/proto/gen/{ts,java,go}`, `services/bff-gateway/src/` (routes/d2c.ts, clients/fulfillment.ts, plugins/auth.ts), `apps/orders/` (D2CPage, vite.config, remotes.config.json), `apps/shell/src/` (App.tsx, nav.ts, i18n.ts, AppLayout icon), `packages/shared/src/hooks/usePermissions.tsx`, `packages/api-client/src/` (api.ts/d2c slice), `docker/keycloak/hubstore-realm.json`, `scripts/seed-db.sh`, `scripts/reset-db.sh`, `e2e/auth.setup.ts`, unit tests liên quan.
- Consumers/regression: D1Page (không đụng), role-matrix E2E spec 02 (check assertion role list), bff.contract.test (KNOWN_ROLES), usePermissions.test.
- Shared surfaces: DB fulfillment (bảng mới V5), proto (additive), FE permission matrix (thêm key d2c.view + role), realm JSON (role+user), KNOWN_ROLES.

## 4. Design
- **Approach:** BFF-assemble export (loop FilterD2cOrders pageSize 500) — không streaming proto; note khóa order_code; ORDER BY id ASC; slot filter TZ Asia/Ho_Chi_Minh; CSV BOM EF BB BF; guard date-only VN `> 31 ngày` chặn.
- **Alternatives dismissed:** streaming gRPC (overkill), xlsx lib (thêm dep không cần), note theo surrogate id (lệch precedent UpdateNote).
- **Edge cases:** export range biên 31/32 ngày; empty-page total (COUNT(*) OVER()); slot khi push_time NULL (không match); LIKE escape % _ \; multiselect filter rỗng = không lọc.
- **Non-functional:** i18n keys vi/en cho strings mới; a11y pattern antd4 có sẵn; SQL index cho filter chính.

## 5. Implementation outline — Tasks (7)

| # | Task | Files chính |
|---|------|-------------|
| 1 | Schema V5 + proto additive + buf regen | V5__d2c_orders.sql, fulfillment.proto, gen/ |
| 2 | Java D2cOrderRepository + gRPC impl + tests | store/D2c*.java, service/FulfillmentServiceImpl, tests |
| 3 | BFF route d2c + export guard + vitest | routes/d2c.ts, clients/fulfillment.ts, test/d2c.route.test.ts |
| 4 | Roles: WarehouseEmployee realm + BFF + FE + auth.setup | realm json, auth.ts, usePermissions, nav, auth.setup.ts |
| 5 | Seed d2c-sample + seed-db.sh + reset-db.sh | api/seed/d2c-sample.json, scripts/* |
| 6 | FE D2CPage list+filter+expand+note+export | apps/orders D2CPage, api-client d2c slice, shell nav/route |
| 7 | E2E 05-d2c + full E2E xanh | e2e/tests/05-d2c.spec.ts |

DAG: T1 → T2 → T3 → T6 → T7; T2 → T4 → T6; T2 → T5 → T7. T7 deps {T4, T5, T6} (T6b task_c1f2f602ec6a — deps T3+T4, thay task cũ task_3e6a0cce456f đã đánh dấu failed theo plan-critic P0).

### Task 1: Flyway V5 + proto additive + regen

**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V5__d2c_orders.sql`
- Modify: `api/proto/hubstore/fulfillment/v1/fulfillment.proto` (append-only)
- Regen: `api/proto/gen/{ts,java,go}`

**Steps:**
- [x] **Step 1: Verify free version** — `ls services/fulfillment-service/src/main/resources/db/migration/` → chỉ có V1__orders_schema.sql. Nếu đã có V5 (sibling SF merged) → STOP + escalate (collision).
- [x] **Step 2: Write V5__d2c_orders.sql:**

```sql
-- SF-18 (FI-263): D2C/Dropship orders.
-- Version 5 per FI-245 bracket contract (SF-7=V2, SF-14=V3, SF-17=V4 owned by sibling branches).
-- Flyway gap-tolerant; if a sibling merges V2-V4 later onto a DB that already applied V5,
-- set flyway.outOfOrder=true for that env or recreate dev DB.
CREATE TABLE d2c_orders (
  id                BIGSERIAL PRIMARY KEY,
  order_code        VARCHAR(64)  NOT NULL UNIQUE,
  order_id_inter    VARCHAR(64),
  delivery_id       VARCHAR(64),
  carrier           VARCHAR(64),
  shop              VARCHAR(128),
  export_employee   VARCHAR(128),
  export_time       TIMESTAMPTZ,
  push_time         TIMESTAMPTZ,
  receiver_name     VARCHAR(128),
  receiver_phone    VARCHAR(32),
  receiver_address  TEXT,
  service_type      VARCHAR(64),
  product_category  VARCHAR(128),
  product_type      VARCHAR(128),
  is_debt_splitting BOOLEAN NOT NULL DEFAULT FALSE,
  note              TEXT,
  status            VARCHAR(32) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_d2c_status ON d2c_orders(status);
CREATE INDEX idx_d2c_carrier ON d2c_orders(carrier);
CREATE INDEX idx_d2c_push_time ON d2c_orders(push_time);
CREATE INDEX idx_d2c_created_at ON d2c_orders(created_at);
```

- [x] **Step 3: Append proto messages + RPCs** (KHÔNG đổi message/RPC cũ — tìm section cuối service FulfillmentService và append):

```protobuf
// --- SF-18 D2C/Dropship (additive only) ---
message D2cOrder {
  string order_code = 1;
  string order_id_inter = 2;
  string delivery_id = 3;
  string carrier = 4;
  string shop = 5;
  string export_employee = 6;
  google.protobuf.Timestamp export_time = 7;
  google.protobuf.Timestamp push_time = 8;
  string receiver_name = 9;
  string receiver_phone = 10;
  string receiver_address = 11;
  string service_type = 12;
  string product_category = 13;
  string product_type = 14;
  bool is_debt_splitting = 15;
  string note = 16;
  string status = 17;
  google.protobuf.Timestamp created_at = 18;
  int64 id = 19;
}

message D2cFilterRequest {
  string search = 1;                 // orderCode/deliveryId LIKE
  repeated string statuses = 2;
  repeated string carriers = 3;
  repeated string shops = 4;
  repeated string export_employees = 5;
  string product_category = 6;
  string product_type = 7;
  google.protobuf.Timestamp created_from = 8;
  google.protobuf.Timestamp created_to = 9;
  google.protobuf.Timestamp push_from = 10;
  google.protobuf.Timestamp push_to = 11;
  string push_slot_from = 12;        // "HH:mm" time-of-day VN
  string push_slot_to = 13;
  int32 page = 14;
  int32 page_size = 15;
}

message D2cFilterResponse {
  repeated D2cOrder items = 1;
  int64 total = 2;
}

message UpdateD2cOrderNoteRequest {
  string order_code = 1;
  string note = 2;
  string actor_role = 3;
}
message UpdateD2cOrderNoteResponse {
  D2cOrder order = 1;
}
```
Thêm vào `service FulfillmentService`:
```protobuf
  rpc FilterD2cOrders(D2cFilterRequest) returns (D2cFilterResponse);
  rpc UpdateD2cOrderNote(UpdateD2cOrderNoteRequest) returns (UpdateD2cOrderNoteResponse);
```
(imports: đảm bảo `google/protobuf/timestamp.proto` đã import — có sẵn trong file.)

- [x] **Step 4: Buf regen cả 3 ngôn ngữ** — tìm lệnh regen hiện có (`grep -rn "buf generate" api/proto/ Makefile* package.json scripts/ 2>/dev/null`; thường là `cd api/proto && buf generate`). Verify gen ts/java/go chứa D2cOrder.
- [x] **Step 5: Boot check migration** — `docker compose up -d postgres && cd services/fulfillment-service && mvn -q compile` rồi boot nhanh (hoặc chạy flyway migrate qua app boot) → bảng d2c_orders tồn tại: `docker compose exec postgres psql -U <user> -d fulfillment -c '\d d2c_orders'`.
- [x] **Step 6: Commit** `feat(fi245-sf18): d2c_orders schema V5 + additive proto FilterD2cOrders/UpdateD2cOrderNote`

### Task 2: Java D2cOrderRepository + gRPC impl + tests

**Files:**
- Create: `src/main/java/com/hubstore/fulfillment/store/D2cOrderRepository.java` (interface), `PostgresD2cOrderRepository.java`, `D2cOrderFilter.java`, `D2cFilterResult.java` (records)
- Modify: `src/main/java/com/hubstore/fulfillment/service/FulfillmentServiceImpl.java` (2 RPC mới)
- Test: `src/test/java/.../D2cFilterAndNoteTest.java` (unit, in-memory list impl inline), `src/test/java/.../PostgresD2cRepositoryIT.java` (skip-when-no-DB)

**Steps:**
- [x] **Step 1: Interface + records** — mirror pattern OrderRepository:
```java
public interface D2cOrderRepository {
    D2cFilterResult filter(D2cOrderFilter filter);
    Optional<D2cOrderRecord> findByCode(String orderCode);
    Optional<D2cOrderRecord> updateNote(String orderCode, String note);
}
```
D2cOrderRecord = Java record 19 fields khớp proto D2cOrder. D2cOrderFilter = record (search, statuses, carriers, shops, exportEmployees, productCategory, productType, createdFrom/To, pushFrom/To Instant, pushSlotFrom/To String, page, pageSize) + normalize defaults (page<1→1, pageSize<=0→10, cap pageSize≤500).
- [x] **Step 2: Postgres impl** — copy pattern `PostgresOrderRepository.filter()` (PostgresOrderRepository.java:51-127): dynamic WHERE + `COUNT(*) OVER()` 1 statement + LATERAL OFFSET/LIMIT; **ORDER BY id ASC**; LIKE escape helper y hệt (escape `\ % _`). Slot filter: `AND (push_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= ?::time` / `<= ?::time` (chỉ áp khi push_time IS NOT NULL — NULL không match slot). updateNote: `UPDATE d2c_orders SET note=? WHERE order_code=? RETURNING *`.
- [x] **Step 3: gRPC impl** — FulfillmentServiceImpl thêm 2 method: map proto ↔ record (Timestamp helpers có sẵn trong file), FilterD2cOrders → repo.filter → response; UpdateD2cOrderNote → repo.updateNote, không thấy → GrpcErrors INVALID_ARGUMENT "Không tìm thấy đơn D2C <code>" (pattern GrpcErrors.java).
- [x] **Step 4: Unit test (TDD — viết trước)**: D2cFilterAndNoteTest dùng in-memory List impl (inline class trong test, sort id ASC): filter carrier single/multi, slot from/to (timestamp có +07 offset), search LIKE escaped (input `100%_` match literal), empty-page total (page 99), note update found/not-found.
- [x] **Step 5: IT**: PostgresD2cRepositoryIT — skip-when-no-DB (assumptions, pattern PostgresOrderRepositoryIT), parity vs in-memory trên filter case, insert fixture rows trong @BeforeEach + cleanup @AfterEach.
- [x] **Step 6: Run** `mvn -q test` (unit xanh; IT: `mvn test -Dtest=PostgresD2cRepositoryIT` khi DB sống).
- [x] **Step 7: Commit** `feat(fi245-sf18): D2cOrderRepository postgres + gRPC filter/note + tests`

### Task 3: BFF route /d2c-orders + export + vitest

**Files:**
- Create: `services/bff-gateway/src/routes/d2c.ts`
- Modify: `services/bff-gateway/src/clients/fulfillment.ts` (facade methods filterD2cOrders, updateD2cOrderNote), `services/bff-gateway/src/app.ts` (registerD2cRoutes)
- Test: `services/bff-gateway/test/d2c.route.test.ts`

**Steps:**
- [x] **Step 1: Facade methods** — FulfillmentApi thêm `filterD2cOrders(filter)` + `updateD2cOrderNote(orderCode, note, role)` gọi grpc client (pattern method có sẵn).
- [x] **Step 2: Guard helper** — export function `assertExportRange(from, to)`:
```ts
// date-only comparison; blocked when (to - from) > 31 days
export function exportRangeDays(from: string, to: string): number {
  const f = new Date(`${from}T00:00:00+07:00`);
  const t = new Date(`${to}T00:00:00+07:00`);
  return Math.round((t.getTime() - f.getTime()) / 86400000);
}
// blocked nếu exportRangeDays > 31 hoặc from > to
```
- [x] **Step 3: Route module d2c.ts** (pattern routes/fulfillment.ts — requireUser, envelope, sendGrpcError):
  - `POST /d2c-orders/filter` → map body → D2cFilterRequest → `paginated(items.map(mapD2cItem), total, page, pageSize)`
  - `PUT /d2c-orders/:orderCode/note` body `{note}` → updateD2cOrderNote → `{ item }`
  - `GET /d2c-orders/export?from&to` → guard: sai thiếu from/to hoặc `exportRangeDays > 31` → 400 envelope `{ error: { message: 'Khoảng thời gian export tối đa 31 ngày' } }` (from>to cũng 400). OK → loop filterD2cOrders (pageSize 500, page++ đến đủ total) → build CSV string: BOM `\uFEFF` + header tiếng Việt (`Mã đơn,Mã nội bộ,Mã vận đơn,Hãng vận chuyển,Shop,Người xuất,Thời gian xuất,Thời gian đẩy,Người nhận,Điện thoại,Địa chỉ,Loại dịch vụ,Ngành hàng,Loại sản phẩm,Tách nợ,Ghi chú,Trạng thái,Ngày tạo`) + rows (escape giá trị có `,` `"` `\n` bằng bọc `"..."` + `""`), timestamps format `yyyy-MM-dd HH:mm:ss` +07. Reply: header `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="D2C_Order_${from}_${to}.csv"`, `reply.send(csvBuffer)` (Buffer từ BOM+csv utf8).
  - **Role guard per-route:** helper `requireD2cRole(request, reply)` → role ∈ {WarehouseEmployee, WarehouseOps, Manager} else 403 envelope.
- [x] **Step 4: Vitest** (pattern test/harness.ts + startTestIdentity): d2c.route.test.ts — mock gRPC upstream (gen code); cases: filter 200 envelope paginated; export 40 ngày → 400 message đúng; **export biên 32 ngày → 400 / 31 ngày → 200**; 200 + body bắt đầu `\uFEFF` + Content-Disposition filename đúng; note 200 gọi upstream với order_code; role Coordinator → 403 cả 3 endpoint.
- [x] **Step 5: Run** `cd services/bff-gateway && npm test` xanh + `npm run build`/tsc không lỗi.
- [x] **Step 6: Commit** `feat(fi245-sf18): BFF /d2c-orders filter+note+export CSV guard 31 ngày`

### Task 4: WarehouseEmployee role (realm + BFF + FE + E2E setup)

**Files:**
- Modify: `docker/keycloak/hubstore-realm.json`, `services/bff-gateway/src/plugins/auth.ts` (KNOWN_ROLES), `packages/shared/src/hooks/usePermissions.tsx` (ROLES + PERMISSION_MATRIX + PERMISSIONS d2c.view), `apps/shell/src/nav.ts` (firstPathForRole WarehouseEmployee → /hub-store-order/d2c), `e2e/auth.setup.ts`
- Test: cập nhật `packages/shared/src/hooks/usePermissions.test.tsx`, `services/bff-gateway/test/bff.contract.test.ts` (KNOWN_ROLES), `apps/shell/src/auth/tokenGetter.test.ts` + `apps/shell/src/App.test.tsx` (nếu hard-code 3 roles — chỉ bổ sung)

**Steps:**
- [ ] **Step 1: Realm JSON** — thêm realm role `WarehouseEmployee` (mảng realm roles) + user `warehouse-emp` (enabled, password `Password123!` literal — dev-only, cùng style users cũ) + role mapping.
- [ ] **Step 2: BFF** — KNOWN_ROLES += 'WarehouseEmployee' (auth.ts:18).
- [ ] **Step 3: FE** — usePermissions: PERMISSIONS += 'd2c.view'; matrix: WarehouseEmployee {d2c.view}, WarehouseOps += d2c.view, Manager += d2c.view; Coordinator không. KHÔNG cấp orders.view cho WarehouseEmployee.
- [ ] **Step 4: nav.ts** — NAV_ROUTES thêm `{ path: '/hub-store-order/d2c', labelKey: 'nav.d2c', permission: 'd2c.view' }` (icon AppLayout nếu map theo path — thêm icon matching) + `firstPathForRole`: WarehouseEmployee → '/hub-store-order/d2c'.
- [ ] **Step 5: i18n** — `apps/shell/src/i18n.ts`: chỉ `nav.d2c` vi='D2C / Dropship' en='D2C / Dropship' (screen keys thuộc Task 6).
- [ ] **Step 6: auth.setup.ts** — thêm user `warehouse-emp` login flow → `.auth/warehouse-emp.json` (pattern users có sẵn; password/env cùng cơ chế).
- [ ] **Step 7: Unit tests update + run** — sửa assertions bổ sung role mới (không xóa case cũ); `cd packages/shared && npm test`, `cd apps/shell && npm test`, `cd services/bff-gateway && npm test` xanh. NOTE: storageState `.auth/warehouse-emp.json` chỉ verify được sau khi Keycloak re-import realm (dồn vào Task 7 Step 2 clean boot) — Task 4 chỉ commit realm JSON + setup code.
- [ ] **Step 8: Commit** `feat(fi245-sf18): WarehouseEmployee role — realm user + KNOWN_ROLES + FE matrix + e2e storageState`

### Task 5: Seed d2c-sample.json + seed-db.sh + reset-db.sh

**Files:**
- Create: `api/seed/d2c-sample.json` (~12 dòng)
- Modify: `scripts/seed-db.sh` (section D2C), `scripts/reset-db.sh` (TRUNCATE d2c_orders + gate)

**Steps:**
- [ ] **Step 1: d2c-sample.json** — top-level `{ "d2cOrders": [...] }`, camelCase keys khớp cột. Phủ: ≥3 carrier (GHN/GHTK/ViettelPost), ≥3 shop, 2 export employees, ≥2 product category + type, đủ 4 status, isDebtSplitting true/false, push_time trải ≥3 khung giờ khác nhau (VD `2026-08-15T08:30:00+07:00` vs `14:45` vs `20:10`) và nhiều ngày, note một số dòng có dấu tiếng Việt + dấu phẩy (test CSV escape). created_at trải ~30 ngày để export 31 ngày có data.
- [ ] **Step 2: seed-db.sh section D2C** — mirror section orders: biến `SEED_D2C_JSON` (default `$(dirname)/../api/seed/d2c-sample.json`); gate bảng `to_regclass('public.d2c_orders')` NULL → fail-loud "chạy migration trước (V5)"; emptiness-gate: đã có rows → skip; INSERT qua `jsonb_array_elements` (pattern có sẵn); map timestamp + boolean + text cột đúng tên.
- [ ] **Step 3: reset-db.sh** — thêm `d2c_orders` vào mảng TRUNCATE ... RESTART IDENTITY CASCADE + gate to_regclass (chỉ khi bảng tồn tại).
- [ ] **Step 4: Verify thực** — DB sống: `bash scripts/seed-db.sh` → psql count = 12; chạy lần 2 → skip; `bash scripts/reset-db.sh` → count = 0; seed lại OK.
- [ ] **Step 5: Commit** `feat(fi245-sf18): d2c-sample seed + seed-db section + reset-db d2c_orders`

### Task 6: FE D2CPage (list + filter + expand + note modal + export UI)

**Files:**
- Create: `apps/orders/src/pages/D2CPage.tsx`, `apps/orders/src/features/D2cExpandContent.tsx`, `apps/orders/src/features/D2cNoteModal.tsx`
- Modify: `apps/orders/vite.config.ts` (exposes ./D2CPage), `remotes.config.json`, `apps/shell/src/App.tsx` (lazy route `/hub-store-order/d2c` + RequirePermission d2c.view), `packages/api-client/src/slices/d2c.ts` (mới), `src/api.ts` (export d2c endpoints qua createListQuery)

**Steps:**
- [ ] **Step 1: api-client d2c slice** — RTKQ `useListD2cOrdersQuery` (createListQuery, envelope paginated), `useUpdateD2cNoteMutation`, export download (fetch blob với query params from/to + credentials).
- [ ] **Step 2: D2CPage.tsx** — pattern D1Page: self-wrap Provider (store riêng d2cStore), useUrlState filters, FilterBar components (TextSearch code/deliveryId, MultiSelect status/carrier/shop/NV xuất, Select ngành hàng + loại SP, DateTimeRange ngày tạo, DateTimeRange giờ đẩy + TimeRange slot), Table antd4 columns: orderCode, carrier, shop, pushTime (format +07), status (Tag màu), note icon; pagination object từ envelope (page/pageSize/total, onChange refetch); expandable controlled `expandedRowKeys` + `expandedRowRender → <D2cExpandContent>`.
- [ ] **Step 3: D2cExpandContent** — Descriptions 2 cột: push info (pushTime, exportEmployee, exportTime), người nhận (name/phone/address), serviceType, isDebtSplitting (Yes/No tag), note hiện tại + nút "Ghi chú" mở modal.
- [ ] **Step 4: D2cNoteModal** — pattern HubStoreTransferModal (open/order/onClose): TextArea, lưu → mutation → refetch list + message.success; lỗi → message.error từ envelope.
- [ ] **Step 5: Export UI** — panel/vùng export: DatePicker.RangePicker, validate client-side cùng công thức guard (diff days > 31 → message.error 'Khoảng thời gian export tối đa 31 ngày' KHÔNG gọi API); OK → fetch blob → tạo URL download `D2C_Order_{from}_{to}.csv`; loading state.
- [ ] **Step 6: Wire MF** — exposes './D2CPage', remotes.config.json, App.tsx lazy route `/hub-store-order/d2c` wrap `<RequirePermission permission="d2c.view"><RemoteBoundary>`, nav entry từ Task 4. Đăng ký i18n keys của screen (filter labels, expand labels, modal, export, status tags) vào `apps/shell/src/i18n.ts` vi/en.
- [ ] **Step 7: Verify build + browser thô** — `npm run build` các package liên quan không lỗi; boot stack → login warehouse-emp → landing /hub-store-order/d2c → bảng render 12 rows seed.
- [ ] **Step 8: Commit** `feat(fi245-sf18): FE D2CPage — list filter expand note modal export UI`

### Task 7: E2E 05-d2c.spec.ts + full E2E xanh

**Files:**
- Create: `e2e/tests/05-d2c.spec.ts`
- Modify: không (auth.setup đã có ở Task 4)

**Steps:**
- [ ] **Step 1: Spec** — dùng storageState warehouse-emp (test.use({ storageState: '.auth/warehouse-emp.json' })): (a) nav vào /hub-store-order/d2c → thấy bảng + rows; (b) filter carrier=GHN + khung giờ đẩy 08:00-09:00 → rows đúng theo seed (assert count + row content); (c) expand row → thấy push info + người nhận + tách nợ + service type; (d) note modal: nhập ghi chú tiếng Việt → lưu → mở lại thấy ghi chú; (e) export 40 ngày → message chặn hiện; export 31 ngày → download event + filename `D2C_Order_...csv` (đọc buffer assert BOM EF BB BF + header UTF-8); (f) login coordinator → nav không có D2C (role guard FE).
- [ ] **Step 2: Boot sạch** — reset-db + seed + compose up (keycloak re-import realm để có warehouse-emp — đây là lúc verify storageState Task 4) → `cd e2e && npx playwright test` **full suite** cũ + mới xanh. Nếu 02-role-matrix.spec.ts vỡ vì role mới (conditional fix nằm trong task này — được phép sửa spec 02 chỉ để bổ sung case WarehouseEmployee, không xóa case cũ).
- [ ] **Step 3: Browser walkthrough Rule 0** — mở app, đi luồng: login warehouse-emp → landing d2c → filter → expand → note → export; screenshots lưu `.claude/verify-sf18/`.
- [ ] **Step 4: Commit** `test(fi245-sf18): E2E 05-d2c — filter expand note export guard`

## 6. Risks & unknowns
- **Must verify:** free Flyway version trước khi commit V5 (ls migration dir); buf generate command thực tế trong repo; export encoding khi Excel mở (BOM); i18n file location (`apps/shell/src/i18n.ts` — verify tồn tại).
- **Unverified assumptions:** status enum 4 giá trị (thiết kế mới, declared trong spec); PERMISSION_MATRIX shape; seed-db.sh jsonb pattern copy được cho d2c (sẽ đọc trước khi sửa).
- **Loop caps:** mỗi task tối đa 3 lần retry; verify-fail 2 lần cùng nguyên nhân → STOP + escalate.
