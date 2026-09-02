# FI-245 SF-7 Design — BE foundation: audit log + export + pagination

- Linear: FI-252 · Story: FI-245 · Bracket task: SF-7 (Tier 2, deps SF-2 Done)
- Context pack: `docs/superpowers/contexts/fi245-sf-7.md` (spec slice + ACCEPTANCE + boundary — contract nguồn)
- Epic spec: `docs/superpowers/specs/ict-service-support-postgres-prod-spec.md` §3.7
- Status: Approved (autonomous self-review passed — epic-level questions pre-answered per run directive)

## 0. Root cause + strategy

Hệ thống chưa có audit trail (assignShopHub hardcode actor `"fulfillment-service"`), không có export,
batches paginate in-memory. Chiến lược: **thêm nền tảng BE dọc theo kiến trúc hiện có** — BFF là cổng
duy nhất của mọi mutation user-facing → ghi audit tại MỘT chỗ nhất quán ở BFF (spec slice §2 cho phép
"qua BFF plugin nếu dễ hơn; chọn 1 chỗ nhất quán"). Schema `activity_log` thuộc sở hữu fulfillment-service
(SF-2 owns schema dir; SF-7 THÊM V2, không sửa V1).

## 1. Problem

- Mutate đơn (assign/status/note/deliveryTime; batch create/transition) không lưu ai làm gì khi nào.
- SF-11 cần GET /audit (viewer Manager) + export UI — BE chưa có.
- Manager cần tải danh sách orders theo filter hiện tại ra CSV mở được bằng Excel.
- Pagination: orders đã server-side (scalar count subquery); batches paginate in-memory trong Go server
  (`FilterBatches` → `store.List` → slice) — cần đẩy xuống SQL để scale.

## 2. Scope

**In:**
1. Flyway `V2__activity_log.sql` (DB fulfillment): bảng `activity_log` — `id BIGSERIAL PK, actor VARCHAR NOT NULL, action VARCHAR NOT NULL, target_type VARCHAR NOT NULL, target_id VARCHAR NOT NULL, detail JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()` + index `(actor, created_at DESC)`, `(action)`, `(target_type, target_id)`.
2. Audit write tại BFF SAU MỖI mutation thành công: orders `assignShopHub`, `mutateOrderStatus` (cancel/complete), `updateDeliveryTime`, `updateNote`; batches `createBatch`, `transitionBatch`. Fail-open (lỗi ghi audit log + không fail mutation).
3. `GET /fulfillment/audit` — filter `actor`, `action`, `targetType`, `targetId`, `dateFrom`, `dateTo` + `page/pageSize`, envelope `{items,total,page,pageSize}` (fail-closed auth: requireUser).
4. `GET /fulfillment/orders/export.csv` — cùng filter params list orders; stream theo chunk qua FilterOrders (pageSize 500/page); `text/csv; charset=utf-8` + UTF-8 BOM (Excel); `Content-Disposition: orders-export-<yyyyMMdd-HHmmss>.csv`; escape formula (`= + - @ \t` prefix `'`).
5. Pagination batches server-side SQL: PostgresStore method MỚI (offset/limit, giữ `ORDER BY created_at ASC, batch_code ASC`), `List()` KHÔNG đổi (test pin ordering không vỡ); Go `FilterBatches` dùng SQL pagination.
6. Legacy compat: KHÔNG đổi shape response endpoint cũ; E2E specs cũ xanh KHÔNG sửa.

**Out:** UI (SF-11/SF-6), auth (SF-4), compose (SF-1), proto changes, outbox/sync guarantees cho audit
(best-effort, log khi fail), Kafka side-channel.

## 3. Touch map

| File/service | Thay đổi |
|---|---|
| `services/fulfillment-service/src/main/resources/db/migration/V2__activity_log.sql` | MỚI |
| `services/bff-gateway/src/lib/audit.ts` (pg Pool + `logActivity()` + query) | MỚI |
| `services/bff-gateway/src/plugins/audit.ts` hoặc hook trong routes | MỚI — ghi sau mutation |
| `services/bff-gateway/src/routes/fulfillment.ts` | + audit hook, + `/fulfillment/audit`, + `/fulfillment/orders/export.csv` |
| `services/bff-gateway/package.json` | + `pg`, `@types/pg` |
| `services/batching-service/internal/store/store.go` + test | + method pagination SQL |
| `services/batching-service/internal/server/batching_server.go` | FilterBatches dùng SQL pagination |
| Consumers/READ-ONLY: `apps/**`, e2e specs cũ, compose, seed JSON | KHÔNG đụng |

Env: BFF tái dùng `FULFILLMENT_DB_HOST/PORT/NAME/USER/PASSWORD` (đã có từ SF-1); audit DISABLE khi thiếu
config → fail-open + warn (unit-test env không DB vẫn xanh).

## 4. Design

**Audit writer (BFF, 1 chỗ):** pg Pool lazy-init từ env; `logActivity(entry)` INSERT best-effort
(`.catch(err => request.log.warn)`). Route mutation gọi sau khi gRPC thành công, TRƯỚC reply? — sau reply
thành công trong route handler (đồng bộ await INSERT nhưng fail-open). Actor = `request.user.sub`
(preferred_username từ JWT — SF-4 đã map). Action naming: `order.assign_shop`, `order.status_mutation`,
`order.update_delivery_time`, `order.update_note`, `batch.create`, `batch.transition`. detail = JSONB
giữ tham số nghiệp vụ chính (fromStatus/toStatus, shopCode, note length… — không PII thừa).

**Audit query:** BFF SQL trực tiếp (WHERE động + ILIKE escape `\` như SF-2 pattern + date range
`created_at >= / <`), ORDER `created_at DESC, id DESC`, OFFSET/LIMIT.

**Export CSV:** BFF route GET, requireUser; loop FilterOrders gRPC (page++ tới khi hết; pageSize 500);
header cột = các cột list D1 (fulfillCode, orderCode, batchStatus, shop, deliveryTime, region… — theo
`mapOrderItem`); ghi dòng stream ra reply (`reply.header(...).send(stream)` qua `Readable.from`); CSV
escape: bọc quote khi chứa `, " \n`, escape `"`→`""`, formula-guard prefix `'`.

**Batches pagination SQL (Go):** `Filter(ctx, BatchFilter{statuses, search, createdTime, page, pageSize})`
— WHERE động (parameterized), `ORDER BY created_at ASC, batch_code ASC OFFSET $n LIMIT $n`, COUNT trong
cùng query giữ pattern SF-2 (scalar subquery + LATERAL — server FilterBatches đã trả
`Items/Total/Page/PageSize`, proto KHÔNG đổi). Items vẫn attach qua `attachItems`.

**Error handling:** audit fail-open; export lỗi giữa stream → gRPC error envelope trước khi mở stream;
Go test DB skip-when-no-DB (pattern testdb hiện có).

## 5. Implementation outline

8 tasks (bracket): `activity-log-table` → `audit-write-mutations` + `audit-query-api` (song song được,
cùng lib audit.ts) → `export-csv-endpoint` → `pagination-orders` (verify-only + passthrough check) +
`pagination-batches` (song song, khác service) → `legacy-compat-check` + `unit-tests`.

Test strategy:
- BFF: vitest — audit query filter builder (pure), export CSV escaping (pure), audit hook fail-open
  (pg stub), route contract giữ nguyên envelope (test hiện có phải xanh không sửa).
- Go: testdb pattern — TestFilter SQL pagination (page traversal đúng, ordering giữ semantics), filter
  combos; test hiện có phải xanh không sửa.
- Java: migration V2 áp sạch trên DB có V1 (IT skip-when-no-DB nếu cần); `mvn test` unit phải xanh.
- Verification: `go test ./...`, `mvn test`, `cd services/bff-gateway && npx vitest run`; Rule 0 không
  áp (BE-only — KHÔNG chạm UI; verify qua curl + psql theo ACCEPTANCE).

## 6. Risks

- Audit fail-open nuốt lỗi cấu hình DB → warn log rõ + health không ảnh hưởng; verify bằng psql khi có stack.
- Export lớn: cap an toàn (dừng ở tổng ≤ FilterOrders total; không unbounded — page loop theo total trả về).
- LIKE/date filter sai múi giờ → date range nhận ISO local, so `timestamptz` trực tiếp.
- BFF nắm schema DB service khác — chấp nhận có chủ đích theo spec §2; ghi comment tại audit.ts.

## 7. ACCEPTANCE (từ context pack — verify từng dòng ở Phase 5)

1. Mutate đơn → psql SELECT activity_log thấy row đúng actor/action.
2. GET /audit lọc theo actor/date trả đúng.
3. Export CSV mở bằng Excel được, đúng số dòng theo filter.
4. List orders/batches hỗ trợ page/pageSize; endpoint cũ vẫn trả như trước (E2E cũ xanh).
5. `go test` + `mvn test` pass.
