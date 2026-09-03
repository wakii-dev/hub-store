# SF-14 — COD đối soát: Design Spec (FI-259)

**Story:** FI-245 (Production persistence) · **Linear:** FI-259 · **Tier:** 3 · **Deps:** SF-7 (audit/export/pagination pattern), SF-13 (FAILED/retry) — đã merge.
**Context pack:** `docs/superpowers/contexts/fi245-sf-14.md` · **Epic spec:** §3.14.
**Status:** Approved (autonomous self-review + spec-critic passed).

## 1. Problem

Đơn có `cod_amount` nhưng hệ thống không ghi tiền COD đã thu thật → không đối soát được kỳ vọng vs thực thu theo shop. SF-14 thêm flow xác nhận thu (per-order + bulk theo batch) + màn đối soát Manager + export CSV.

## 2. Scope

**In:** xác nhận thu COD per-order + bulk per batch; Flyway V3 bảng `cod_confirmations` (DB fulfillment); aggregate API GROUP BY shop theo kỳ; màn Settlement (Manager) + "chờ thu" badge/confirm trên D2; export CSV pattern SF-7; E2E spec mới.
**Out (boundary context pack):** thanh toán online/gateway; đối soát đa kỳ phức tạp; batching DB (READ-ONLY); sửa specs E2E cũ.

## 3. Design decisions (brainstorm self-answered — autonomous)

| # | Câu hỏi | Quyết định | Lý do |
|---|---------|-----------|-------|
| D1 | Kỳ đối soát anchor vào timestamp nào? (orders KHÔNG có completed_at; batching DB READ-ONLY) | **Eager PENDING row**: khi đơn hoàn tất phiếu (batch_status = 2 `PREPARED`/"Đã soạn" — KHÔNG có event giao hàng thật trong hệ thống) & `cod_amount > 0` → INSERT `cod_confirmations` (status=PENDING, expected_amount = snapshot cod_amount, shop_name snapshot, completed_at = now()). Atomicity: **service-layer `@Transactional`** trong FulfillmentServiceImpl span orders repo + cod repo (KHÔNG nhét cod-write vào PostgresOrderRepository — giữ repo tách interface theo precedent D2cOrderRepository/TechOrderRepository; InMemory twin impl song song) | Anchor kỳ = `completed_at` trên chính bảng confirmations; snapshot expected để phát hiện lệch tiền. Không đụng batching DB, không thêm cột orders |
| D2 | Bảng riêng vs fields trên orders | **Bảng riêng `cod_confirmations`** — repo riêng `CodConfirmationRepository` (Postgres + InMemory twin) | Context pack chỉ định "giữ orders schema ổn định"; V3 slot đã được reserve (V5 comment: "V3 dành SF-14"); precedent repo-per-domain (SF-18/SF-19) |
| D3 | Re-confirm một đơn đã CONFIRMED | UPDATE last-write-wins (không duplicate, không 422) + ghi activity_log mỗi lần confirm. **Số tiền thực thu: `optional int64 collected_amount` trong proto (presence semantics — precedent `Region.parent_code` fulfillment.proto:91) — KHÔNG dùng sentinel 0** (0 VND là case lệch tiền thật: KH không trả); REST DTO `collectedAmount?: number` optional — absence = lấy expected | Proto3 int64 default=0 → sentinel 0 làm mất case "thu 0 đồng"; spec-critic P0 |
| D4 | Proto: additive fulfillment.proto vs file cod.proto mới | **Additive vào `fulfillment.proto`** (message/rpc mới, số field chỉ tăng) | Confirm/settlement thao tác trên orders — cùng service FulfillmentService; tránh wiring service mới. Nhớ rule "NO shared wrapper response — mỗi RPC owns its own" |
| D5 | Aggregate SQL vs BFF-side | **SQL GROUP BY trong Java repo** (pattern SF-9: KHÔNG N+1) | 1 round-trip; convention codebase |
| D6 | Ai được confirm? Ai xem settlement? | Confirm: **Coordinator + WarehouseOps + Manager + Admin** (D2 là màn ops). Settlement + export: **Manager + Admin** | Spec slice: confirm trên D2 (ops), settlement "màn (Manager)"; bảo vệ server-side bằng **role-array guard** theo precedent `requireD2cRole` + `D2C_ROLES` (`routes/d2c.ts:77-85`) — KHÔNG dùng `isManager()` (chỉ check Manager, không express được multi-role; `authz.ts:24-26`). FE nav-hide không phải guard |
| D7 | FAILED/retry tính thế nào? | Filter `o.fail_reason IS NULL` áp dụng **mọi path đọc/ghi batch**: aggregate, detail, GetCodPending (badge), ConfirmBatchCod. Retry thành công = đơn retry mới có fulfill_code riêng → confirmation riêng → tự nhiên "tính 1 lần trên đơn retry" | Context pack dòng 5; đơn có thể bị FAILED SAU hoàn tất (SF-13 exception flow) → phải lọc ở mọi path |
| D8 | Batch cancel sau hoàn tất thì PENDING rows thế nào? | Khi `mutateBatchStatus` revert target=0 → **DELETE** các confirmation PENDING của orders đó; CONFIRMED giữ nguyên (tiền đã thu là dữ liệu lịch sử — giữ). Re-complete → tạo lại row mới với batch_code/completed_at mới | Tránh stale batch_code + anchor cũ (P0-adjacent: `mutateBatchStatus` target=0 clears batch_code — PostgresOrderRepository.java:183) |
| D9 | Kỳ `from/to` format + timezone? | **Date-only string** (`YYYY-MM-DD`), wrap full-day tại **Asia/Ho_Chi_Minh (+07:00)** — precedent d2c export (`routes/d2c.ts:264-265`); KHÔNG dùng UTC na | Tránh lệch kỳ âm thầm giữa implement và psql verify |

## 4. Data model — Flyway `V3__cod_settlement.sql` (DB fulfillment)

```sql
-- SF-14 (FI-259): COD confirmations + settlement. V3 slot reserved bởi V5 header
-- ("V3 dành SF-14"). Snapshot pattern: expected_amount/shop_name/... chụp lúc hoàn tất
-- phiếu (batch_status=2 PREPARED) — completed_at là anchor kỳ đối soát.
CREATE TABLE cod_confirmations (
  id              BIGSERIAL PRIMARY KEY,
  fulfill_code    VARCHAR UNIQUE NOT NULL,   -- FK logic sang orders (không FK cứng — orders seed pipeline xóa/nap lại)
  batch_code      VARCHAR,
  shop_code       VARCHAR,
  shop_name       VARCHAR,                   -- snapshot lúc hoàn tất (tránh lệch code/name khi shop rename/chuyển kho)
  expected_amount BIGINT NOT NULL,           -- snapshot cod_amount lúc hoàn tất
  collected_amount BIGINT,                   -- NULL khi PENDING
  collected_by    VARCHAR,                   -- username xác nhận
  collected_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ NOT NULL,      -- anchor kỳ đối soát
  status          INT NOT NULL DEFAULT 0     -- 0 = PENDING, 1 = CONFIRMED
);
CREATE INDEX idx_cod_confirmations_completed_at ON cod_confirmations (completed_at);
CREATE INDEX idx_cod_confirmations_batch ON cod_confirmations (batch_code);
CREATE INDEX idx_cod_confirmations_shop ON cod_confirmations (shop_code, completed_at);
```

Idempotent-friendly (CREATE TABLE không IF NOT EXISTS — V3 chạy đúng 1 lần trên DB sạch; migration Flyway track version).

## 5. API surface

### gRPC (additive `api/proto/hubstore/fulfillment/v1/fulfillment.proto`)

```
enum CodCollectionStatus { COD_PENDING = 0; COD_CONFIRMED = 1; }
message CodConfirmation { fulfill_code, batch_code, shop_code, expected_amount, collected_amount, collected_by, collected_at, completed_at, status }
message ConfirmCodRequest { repeated ConfirmCodItem items }  // item: fulfill_code + optional int64 collected_amount (absence = lấy expected; presence kể cả 0 = thu thật 0)
message ConfirmCodResponse { results: ConfirmCodResult[] }    // per-code success + message
message ConfirmBatchCodRequest { batch_code }
message ConfirmBatchCodResponse { confirmed_count, total_amount }
message GetCodPendingRequest { batch_code }                   // badge D2 — lọc fail_reason IS NULL (D7)
message GetSettlementRequest { period_from, period_to (Timestamp — wrap full-day +07:00 theo D9), shop_code (optional) }
message SettlementShopRow { shop_code, shop_name, total_orders, total_expected, total_collected, diff_amount, pending_count, mismatch_count }
message GetSettlementResponse { rows: SettlementShopRow[] }
message GetSettlementDetailRequest { shop_code, period_from, period_to }
message GetSettlementDetailResponse { confirmations: CodConfirmation[] }
```

Side effects confirm: UPDATE status/collected_* + `appendAudit(actor, "cod.confirmed", fulfill_code, detail)` (pattern SF-7). ConfirmBatchCod chỉ confirm các PENDING của batch mà orders hiện tại `fail_reason IS NULL` (D7). Revert hoàn tất (target=0) → DELETE PENDING confirmations của orders (D8).

### REST BFF (routes mới — guard server-side)

| Method | Path | Role | Ghi chú |
|---|---|---|---|
| POST | `/cod/confirm` | Coord/WarehouseOps/Manager/Admin | per-order, body `{ fulfillCode, collectedAmount? }` — collectedAmount optional (absence = lấy expected; 0 = thu thật 0) |
| POST | `/cod/confirm-batch` | Coord/WarehouseOps/Manager/Admin | bulk, body `{ batchCode }` — confirm mọi PENDING của batch với collected = expected |
| GET | `/cod/pending?batchCode=` | Coord/WarehouseOps/Manager/Admin | badge "chờ thu" D2 |
| GET | `/cod/settlement?from=&to=` | Manager/Admin | rows per shop; from/to = date-only `YYYY-MM-DD`, wrap full-day +07:00 (D9) |
| GET | `/cod/settlement/detail?shopCode=&from=&to=` | Manager/Admin | drill-down |
| GET | `/cod/settlement.csv?from=&to=` | Manager/Admin | stream CSV, filename `settlement_<from>_<to>.csv`, pattern SF-7 (buffer-then-send mirror /fulfillment/orders/export.csv) |

Guards server-side: confirm paths = role array `[Coordinator, WarehouseOps, Manager, Admin]`; settlement paths = `[Manager, Admin]` — pattern `requireD2cRole`/`D2C_ROLES` (`routes/d2c.ts:77-85`).

Actor `collected_by` = preferred_username từ JWT (requireUser — verify shape lúc implement).

### Aggregate SQL (repo, 1 query GROUP BY)

```sql
SELECT c.shop_code, c.shop_name, COUNT(*), SUM(c.expected_amount),
       SUM(COALESCE(c.collected_amount,0)),
       SUM(c.expected_amount - COALESCE(c.collected_amount,0)),
       SUM(CASE WHEN c.status=0 THEN 1 ELSE 0 END),
       SUM(CASE WHEN c.status=1 AND c.collected_amount <> c.expected_amount THEN 1 ELSE 0 END)
FROM cod_confirmations c JOIN orders o ON o.fulfill_code = c.fulfill_code
WHERE c.completed_at >= ? AND c.completed_at < ? AND o.fail_reason IS NULL
GROUP BY c.shop_code, c.shop_name ORDER BY c.shop_code;
```

Drill-down lệch = confirmations (cùng JOIN) WHERE status=0 (chưa thu) OR (status=1 AND collected <> expected).

## 6. FE

- **D2 confirm (apps/fulfillment — path thật, KHÔNG phải `apps/fulfillment-mf` như context pack ghi):** BatchListPage — batch status COMPLETED → fetch `/cod/pending` → tag "COD chờ thu (n)" + nút "Xác nhận thu" → Modal.confirm (pattern sẵn line ~252) → POST confirm-batch → refresh.
- **Màn Settlement (apps/shell):** route `/settlement` mới, NAV_ROUTES **append CUỐI** (invariant `firstPathForRole` — không đổi landing path), permission mới `settlement.view` (Manager + Admin) thêm PERMISSION_MATRIX; period picker (RangePicker), Table per shop + expandable drill-down (lệch rows; per-order confirm cho PENDING), nút Export CSV. antd4 + design system SF-6; **designer gate: 3 hướng HTML → user chọn → hand-off `docs/superpowers/designs/sf-14-direction.md` TRƯỚC khi code UI**.
- Shared: DTO mới `packages/shared/src/api-contracts/` (settlement.ts), enums CodCollectionStatus.

## 7. E2E — `e2e/tests/05-settlement.spec.ts` (mới, KHÔNG sửa spec cũ)

Flow: setup batch có COD (seed orders có cod_amount > 0; truncate + reseed pattern `05-dashboard.spec.ts:39` — lưu ý cleanup cả cod_confirmations khi truncate orders vì không có FK cascade) → coordinator complete picking → D2 thấy "chờ thu" → confirm cả chuyến (collected=expected) → **tạo 1 case lệch: per-order confirm 1 đơn với số tiền sai** (để assert mismatch_count + "đơn lệch hiện rõ") → manager login → settlement screen số khớp → export CSV → verify psql GROUP BY (docker compose exec psql theo convention 05-*). Manager storageState override `test.use({ storageState })` theo 05-d2c.spec.ts:15.

## 8. Acceptance (user-visible — từ context pack)

1. Hoàn tất chuyến có COD → D2 hiện "chờ thu" → confirm cả chuyến 1 lần → trạng thái đổi.
2. Manager mở đối soát: tổng theo shop khớp psql GROUP BY (verify tay được); đơn lệch hiện rõ.
3. Export CSV mở Excel được, số khớp màn hình.
4. E2E cũ + mới toàn xanh.

## 9. Risks

- **Proto regen toolchain:** protoc có (homebrew) nhưng ts-proto/grpc-java plugins /tmp của phiên trước đã mất → task BE đầu phải re-provision (`npx ts-proto`; curl `protoc-gen-grpc-java` từ maven central). Nếu regen chết → fallback: gen thủ công theo file gen/ hiện có (LAST resort, phải flag).
- Nav append + permission matrix ripple vào `02-role-matrix.spec.ts` — append CUỐI bắt buộc.
- InMemory twin repo phải impl cùng interface (unit tests chạy không DB — convention SF-2).
- Cross-SF Flyway: V3 slot trống đã verify; KHÔNG cưỡng số khác.
- `expected_amount` là snapshot tại hoàn tất — nếu cod_amount đổi sau đó (hiện không có path), lệch tính trên snapshot (đúng nghiệp vụ đối soát).

## 10. Tasks (6)

`settlement-table` (V3 migration + CodConfirmationRepository 2 impls — **chạy trước**, cod-confirm-flow phụ thuộc bảng) → `cod-confirm-flow` (proto + service-layer @Transactional + eager PENDING + confirm/pending RPCs) → `settlement-aggregate-api` (GROUP BY + detail + BFF REST + guards) → `fe-settlement-screen` (designer gate + shell page + nav/permission) → `settlement-export` (CSV) → `e2e-settlement-spec`. Lưu ý: per-order confirm trong drill-down Settlement là mở rộng nhẹ so với context pack (confirm chỉ trên D2) — chấp nhận, Manager cũng có quyền confirm.
