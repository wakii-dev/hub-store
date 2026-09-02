# FI-263 / SF-18 — D2C/Dropship module — Design

Status: Approved (autonomous self-review passed — spec-critic gate run separately)
Story: FI-245 · Epic spec: ict-service-support-postgres-prod-spec.md §3.18 · Context pack: docs/superpowers/contexts/fi245-sf-18.md

## 1. Problem

Hệ thống gốc có màn D2C/Dropship theo dõi đơn đẩy từ sàn D2C sang hãng vận chuyển: lọc đa chiều, xem chi tiết (expand), ghi chú, export Excel ≤31 ngày. Rebuild chưa có module này. SF-18 thêm module CHỈ-ĐỌC-trừ-note: list + filter + expand + note + export.

## 2. Scope

**In:**
1. Flyway `V5__d2c_orders.sql` trong DB `fulfillment` (số V5 theo bracket contract: SF-7=V2, SF-14=V3, SF-17=V4 — Flyway gap-tolerant, ghi policy trong comment file).
2. Proto additive: RPC `FilterD2cOrders` + `UpdateD2cOrderNote` (message mới, KHÔNG đổi message cũ) + buf regen ts/java/go.
3. fulfillment-service: `D2cOrderRepository` (interface + Postgres impl theo pattern OrderRepository) + gRPC service impl.
4. BFF: `src/routes/d2c.ts` — `POST /d2c-orders/filter` (envelope paginated), `PUT /d2c-orders/:id/note`, `GET /d2c-orders/export` (CSV BOM stream, guard ≤31 ngày).
5. FE: `D2CPage` trong `apps/orders` (expose + shell route + nav), bảng + expand + note modal + FilterBar đầy đủ + nút export với date-range guard client-side.
6. Role `WarehouseEmployee` mới (realm JSON + user dev + BFF KNOWN_ROLES + FE ROLES/matrix) — REQUIREMENT-GAP đã log FI-245.
7. Seed `api/seed/d2c-sample.json` (riêng, KHÔNG đụng canonical-seed.json) + loader section trong `scripts/seed-db.sh` (emptiness-gate).
8. E2E `e2e/tests/05-d2c.spec.ts` + storageState user mới trong `auth.setup.ts`.

**Out (boundary):**
- Không tạo/sửa/xóa đơn D2C từ FE (chỉ list + note + export).
- Không đồng bộ tự động từ hệ thống bán hàng.
- Không Kafka trong path nghiệp vụ (side-channel thuộc SF-27).
- Không đụng canonical-seed.json, không đổi message proto cũ, không đổi D1/tests cũ.

## 3. Design

### 3.1 Schema — `d2c_orders` (DB fulfillment, V5)

```sql
CREATE TABLE d2c_orders (
  id                BIGSERIAL PRIMARY KEY,
  order_code        VARCHAR(64)  NOT NULL UNIQUE,          -- mã đơn D2C
  order_id_inter    VARCHAR(64),                            -- mã nội bộ hệ thống bán
  delivery_id       VARCHAR(64),                            -- mã vận đơn NVC
  carrier           VARCHAR(64),                            -- hãng vận chuyển
  shop              VARCHAR(128),                           -- shop D2C
  export_employee   VARCHAR(128),                           -- NV xuất
  export_time       TIMESTAMPTZ,
  push_time         TIMESTAMPTZ,                            -- thời điểm đẩy sang NVC
  receiver_name     VARCHAR(128),
  receiver_phone    VARCHAR(32),
  receiver_address  TEXT,
  service_type      VARCHAR(64),                            -- loại dịch vụ vận chuyển
  product_category  VARCHAR(128),                           -- ngành hàng
  product_type      VARCHAR(128),                           -- loại SP
  is_debt_splitting BOOLEAN NOT NULL DEFAULT FALSE,         -- tách nợ
  note              TEXT,
  status            VARCHAR(32) NOT NULL,                   -- pending|pushed|exported|cancelled
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_d2c_status ON d2c_orders(status);
CREATE INDEX idx_d2c_carrier ON d2c_orders(carrier);
CREATE INDEX idx_d2c_push_time ON d2c_orders(push_time);
CREATE INDEX idx_d2c_created_at ON d2c_orders(created_at);
```

Assumption ghi rõ: enum `status` 4 giá trị trên là thiết kế mới (dữ liệu gốc không có trong repo); seed + E2E dùng đúng enum này.

### 3.2 Filter đa chiều (khớp bộ lọc gốc)

`D2cOrderFilter` (proto message mới `D2cFilterRequest`): orderCode/deliveryId (search LIKE escaped), statuses (multi), carriers (multi), shops (multi), exportEmployees (multi), productCategory, productType, createdFrom/createdTo, pushFrom/pushTo (datetime range), pushSlotFrom/pushSlotTo (khung giờ — HH:mm, so với time-of-day của push_time), page/pageSize.

SQL pattern y hệt PostgresOrderRepository.filter: 1 statement `COUNT(*) OVER()` — giữ nguyên semantics SF-2 đã chuẩn hóa (LIKE escape, empty-page total).

### 3.3 API

- `POST /d2c-orders/filter` → `paginated(items,total,page,pageSize)` (envelope chuẩn packages/shared).
- `PUT /d2c-orders/:id/note` body `{note}` → trả item đã cập nhật; audit để dành SF-7 (không tự chế activity_log — SF-7 sở hữu).
- `GET /d2c-orders/export?from=&to=` (+ các filter params khác) → CSV stream UTF-8 **BOM** (Excel hiển thị tiếng Việt đúng), filename `D2C_Order_{from}_{to}.csv`; range > 31 ngày → HTTP 400 envelope lỗi message rõ ("Khoảng thời gian export tối đa 31 ngày"). BFF assemble bằng cách loop FilterD2cOrders (pageSize 500) — không cần streaming proto.
- Role guard BFF (per-route, mới — additive): list/export/update yêu cầu role ∈ {WarehouseEmployee, WarehouseOps, Manager}.

### 3.4 FE

- `apps/orders/src/pages/D2CPage.tsx` — self-wrap Provider (pattern D1Page), expose `./D2CPage`, đăng ký `remotes.config.json` + shell route `/d2c` + nav entry (`nav.ts`, labelKey `nav.d2c`, permission `d2c.view`).
- RTKQ slice `d2c.ts` trong packages/api-client (`createListQuery` cho list; mutations note/export).
- Bảng antd4: cột orderCode, carrier, shop, pushTime, status, note indicator; expandable rows (controlled, pattern D1) — expand hiện push/export info (pushTime, exportEmployee/exportTime), người nhận (name/phone/address), serviceType, isDebtSplitting, note.
- FilterBar: TextSearch (code/deliveryId), MultiSelect (status/carrier/shop/NV xuất), Select (ngành hàng, loại SP), DateTimeRange (ngày tạo), DateTimeRange (giờ đẩy) + khung giờ (slot time range). Filter↔URL qua `useUrlState`.
- Note modal (pattern HubStoreTransferModal): mở từ row action, textarea, lưu → refetch.
- Nút Export: 2 DatePicker from/to, client-side guard >31 ngày → message.error trước khi gọi; thành công → download blob.
- Permission `d2c.view` cho roles WarehouseEmployee, WarehouseOps, Manager (PERMISSION_MATRIX); Coordinator không thấy nav/route.

### 3.5 Roles & Keycloak

- Realm JSON: thêm realm role `WarehouseEmployee` + user `warehouse-emp` (password `Password123!` dev-only literal, cùng style user cũ) + gán role.
- BFF `KNOWN_ROLES` += `WarehouseEmployee`.
- FE `ROLES`/matrix += WarehouseEmployee: d2c.view + orders.view (không cần fulfillment.print).
- `auth.setup.ts`: thêm storageState `.auth/warehouse-emp.json`.
- E2E role-matrix spec cũ có thể list roles — thêm role mới phải không vỡ assertions cũ (check khi implement; nếu spec cũ assert hard-coded role list → chỉ bổ sung, không xóa case).

### 3.6 Seed

- `api/seed/d2c-sample.json`: ~12 dòng phủ mọi chiều lọc (≥3 carrier, ≥3 shop, 2 NV xuất, ≥2 ngành hàng/loại SP, status đủ 4 giá trị, isDebtSplitting true/false, push_time trải nhiều khung giờ/ngày).
- `scripts/seed-db.sh`: thêm section D2C — dùng `SEED_D2C_JSON` env (default `api/seed/d2c-sample.json`), emptiness-gate như section orders, insert sau khi V5 đã apply.

## 4. ACCEPTANCE → verification mapping

| AC | Verify |
|---|---|
| Lọc D2C theo carrier + khung giờ đẩy → đúng; expand đủ info | E2E 05-d2c + Rule 0 browser walkthrough |
| Ghi chú → lưu + hiện lại | E2E + browser |
| Export 40 ngày → chặn message; 31 ngày → file mở Excel OK | E2E download + unit test guard + mở file kiểm tra |
| E2E cũ + mới xanh | full playwright run |

## 5. Test strategy

- Java unit: D2cOrderRepositoryTest (in-memory list impl hoặc H2? — theo pattern hiện có: unit giữ InMemory, integration IT skip-when-no-DB) — filter logic + note update + slot filter.
- IT: PostgresD2cRepositoryIT — parity + slot filter SQL correctness.
- BFF vitest: d2c.route.test.ts — mock gRPC upstream (harness), export guard 31 ngày (400), CSV BOM + filename, role guard.
- E2E 05-d2c.spec.ts: warehouse-emp login → filter carrier + khung giờ → expand → note → export guard/export OK.
- Không sửa assertions E2E cũ.

## 6. Risks

1. V4-skip khi SF-17 merge sau (dev DB recreate nên thấp; policy comment trong V5 file).
2. Proto regen chạm gen/ của 3 ngôn ngữ — chỉ additive; java gencode wired qua build-helper.
3. Slot filter SQL (time-of-day): khung giờ là khái niệm nghiệp vụ VN → compare `push_time AT TIME ZONE 'Asia/Ho_Chi_Minh'` (EXTRACT hour/minute) — seed ghi timestamp có offset +07.
4. Seed script section mới phải fail-loud khi bảng chưa có (mirror contract hiện có).
