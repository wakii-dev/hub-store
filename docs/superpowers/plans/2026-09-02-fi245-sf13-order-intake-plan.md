# Plan: SF-13 Order intake + delivery exceptions (FI-258)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-09-02 | Linear: FI-258 (epic FI-245) | Worktree: sf-13-order-intake | Branch: VuHoi/sf-13-order-intake
Spec: docs/superpowers/specs/2026-09-02-sf13-order-intake-design.md (D1-D11 decisions + boundary) · Context pack: docs/superpowers/contexts/fi245-sf-13.md

## 0. Root cause / current state / outcome / constraints / strategy
- **Root cause:** hệ thống chỉ có 27 đơn seed nạp 1 lần — không đường nhập đơn mới; giao thất bại không có state FAILED/lý do/redo.
- **Current state:** orders chỉ mutate qua batching chain (Go→Java); đơn bị kẹt khi giao lỗi.
- **Outcome:** Coordinator nhập 10 đơn có 2 lỗi → preview đúng 2 lỗi → confirm 8 đơn vào D1; WarehouseOps mark-fail có lý do + giao lại tạo đơn retry link cũ; audit mọi mutation.
- **Constraints:** proto additive only; seed JSON/compose/batch flow READ-ONLY; không đụng BATCH-*.
- **Strategy:** vertical slices BE→BFF→FE→E2E; tất cả mutation đi qua Java IntakeService (MỚI, service riêng trong fulfillment-service) — Go batching KHÔNG đổi.

## 1. Problem / 2. Scope / 3. Touch map
Xem spec §1-§2 (đã critic PROCEED). Touch map owned bởi SF-13:
```
api/proto/hubstore/intake/v1/intake.proto (MỚI) + gen/{ts,java} regen + fulfillment.proto additive fields 16-20
services/fulfillment-service/  SeedModels mở rộng + OrderRepository mở rộng (InMemory+Postgres) + IntakeServiceImpl + V2 migration
services/bff-gateway/          clients/intake.ts + routes/intake.ts + mappers/intake.ts + deps (@fastify/multipart, xlsx)
packages/shared/               types/order.ts (fields mới) + enums.ts (DeliveryFailReason) + api-contracts/intake.ts (MỚI)
packages/api-client/           slices/intake.ts (MỚI) + tags
apps/orders/src/               features/CreateOrderModal + ImportOrdersModal + D1Page nút + OrdersExpandContent retry-link
apps/fulfillment/src/          features/MarkFailModal + RedeliverButton + api/batchesApi mutations
e2e/tests/05-intake.spec.ts, 06-exception.spec.ts (MỚI)
```
Consumers/regression: Go batching (imports fulfillment.proto — chỉ đọc, additive fields không vỡ), E2E cũ 01-04 (KHÔNG đổi testid/DOM cũ), SF-7 tương lai (activity_log — merge rule trong spec D9).

## 4. Design
Chốt trong spec §3 (D1-D11) + §4. Điểm mấu chốt cho executor:
- **FAILED** = cột `fail_reason/fail_note/failed_at` (NULL = không fail). KHÔNG đụng enum cũ.
- **Codegen** `ORD-xxxx`: 1 transaction — `SELECT pg_advisory_xact_lock(hashtext('fulfill_code_gen'));` rồi `SELECT COALESCE(MAX((substring(fulfill_code FROM 5))::INT), 3000) FROM orders WHERE fulfill_code ~ '^ORD-[0-9]+$'` → +1. (ORD-3027 → substring từ vị trí 5 = "3027". `~ '^ORD-[0-9]+$'` chặn BATCH-*/RSA-*.)
- **Audit** bảng `activity_log(id BIGSERIAL PK, actor VARCHAR, action VARCHAR, target VARCHAR, detail JSONB, created_at TIMESTAMPTZ DEFAULT now())`; Java ghi tại mọi mutation intake; action ∈ {order.imported, order.created, order.failed, order.redelivered}; actor từ gRPC metadata `x-user-name` (BFF truyền `request.user.sub` — KHÔNG phải authn).
- **Roles (BFF enforce):** Coordinator → preview/confirm/create-manual; WarehouseOps → fail/redeliver; mọi role authenticated → GET audit. Mutation sai role → 403 envelope.
- **Validation (Java, dùng chung):** customerName/address non-blank; phone `^(\+84|0)\d{9}$`; ≥1 item, item code+name non-blank qty≥1; `quantity == sum(items.qty)` (lệch = lỗi cột quantity); codAmount ≥ 0; shopHint nếu điền phải ∈ distinct shops (nếu không → lỗi cột shopHint). Import lỗi trả theo row 1-based của file + column = tên header template.
- **Confirm:** gửi lại full list, Java re-validate; 1 row invalid → INVALID_ARGUMENT kèm mô tả, không insert cục phần. Insert all-or-nothing 1 transaction.
- **Redeliver gate:** `fail_reason IS NOT NULL` AND chưa có đơn nào `old_fulfill_code = code`; vi phạm → INVALID_ARGUMENT.
- **Đơn mới:** statusCode=0, orderStatus=1 (APPROVED), batchStatus=0, batchCode=NULL, times=NULL (FE render '-'), note retry = "Giao lại từ ORD-xxxx".
- **E2E determinism:** DB persist giữa run → specs 05/06 dùng relative assertions (delta count, code > max hiện có).

## 5. Tasks (DAG — deps ghi trong `Depends`)

### Task 1 — Proto intake.proto + additive fields + codegen ts/java + shared types
**Depends:** —
**Files:**
- Create: `api/proto/hubstore/intake/v1/intake.proto`
- Modify: `api/proto/hubstore/fulfillment/v1/fulfillment.proto` (additive: 5 field HubStoreOrderFilterItem)
- Regen: `api/proto/gen/ts/hubstore/**`, `api/proto/gen/java/com/hubstore/**` (commit artifacts — pattern SF-2)
- Modify: `packages/shared/src/types/order.ts` (5 fields optional), `packages/shared/src/enums.ts` (DeliveryFailReason), `packages/shared/src/api-contracts/intake.ts` (MỚI) + export index
- Modify: `packages/shared/src/types/index.ts`, `packages/shared/src/api-contracts/index.ts`

Steps:
- [x] Viết `intake.proto` — package `hubstore.intake.v1`, `import "hubstore/fulfillment/v1/fulfillment.proto"`, go_package `hubstore/gen/go/hubstore/intake/v1;intakev1`, java_package `com.hubstore.intake.v1`, java_multiple_files. Content:
```proto
package hubstore.intake.v1;

import "hubstore/fulfillment/v1/fulfillment.proto";

// DeliveryFailReason — enum lý do giao thất bại (SF-13, spec D1/D7).
enum DeliveryFailReason {
  DELIVERY_FAIL_REASON_KHACH_VANG = 0;
  DELIVERY_FAIL_REASON_SAI_DIA_CHI = 1;
  DELIVERY_FAIL_REASON_KHACH_TU_CHOI = 2;
  DELIVERY_FAIL_REASON_KHAC = 3;
}

// IntakeOrder — 1 đơn intake (import row hoặc tạo tay). KHÔNG có fulfillCode
// (server sinh). items shape tái dùng Product (fulfillment.v1).
message IntakeOrder {
  string customer_name = 1;
  string customer_phone = 2;
  string customer_address = 3;
  repeated hubstore.fulfillment.v1.Product items = 4;
  int32 quantity = 5;            // PHẢI = sum(items[].quantity)
  int64 cod_amount = 6;
  string shop_hint = 7;          // shopCode tùy chọn
}

// ImportError — 1 lỗi validation theo row/column template.
message ImportError {
  int32 row = 1;      // 1-based, theo thứ tự file (header không tính)
  string column = 2;  // tên cột template (customerName/.../shopHint)
  string message = 3;
}

message ValidateImportOrdersRequest { repeated IntakeOrder orders = 1; }
message ValidateImportOrdersResponse { repeated ImportError errors = 1; } // rỗng = valid hết

message ConfirmImportOrdersRequest { repeated IntakeOrder orders = 1; }
message ConfirmImportOrdersResponse {
  // Codes theo ĐÚNG THỨ TỰ orders input (atomic — thành công thì đủ).
  repeated string fulfill_codes = 1;
}

message CreateManualOrderRequest { IntakeOrder order = 1; }
message CreateManualOrderResponse { string fulfill_code = 1; }

message MarkOrderFailedRequest {
  string fulfill_code = 1;
  DeliveryFailReason reason = 2;
  string note = 3;   // ghi chú tự do; KHAC nên có note (KHÔNG bắt buộc — server chấp nhận rỗng)
}
message MarkOrderFailedResponse {}

message RedeliverOrderRequest { string fulfill_code = 1; } // code = đơn FAILED gốc
message RedeliverOrderResponse { string new_fulfill_code = 1; }

// AuditEntry — read model activity_log (SF-7 contract fields).
message AuditEntry {
  string actor = 1;
  string action = 2;
  string target = 3;
  string detail_json = 4;  // JSONB text
  string created_at = 5;   // ISO-8601
}

message GetOrderAuditRequest { string fulfill_code = 1; }
message GetOrderAuditResponse { repeated AuditEntry entries = 1; }

// IntakeService — SF-13 (Java fulfillment-service :50051, CÙNG DB orders).
service IntakeService {
  rpc ValidateImportOrders(ValidateImportOrdersRequest) returns (ValidateImportOrdersResponse);
  rpc ConfirmImportOrders(ConfirmImportOrdersRequest) returns (ConfirmImportOrdersResponse);
  rpc CreateManualOrder(CreateManualOrderRequest) returns (CreateManualOrderResponse);
  rpc MarkOrderFailed(MarkOrderFailedRequest) returns (MarkOrderFailedResponse);
  rpc RedeliverOrder(RedeliverOrderRequest) returns (RedeliverOrderResponse);
  rpc GetOrderAudit(GetOrderAuditRequest) returns (GetOrderAuditResponse);
}
```
- [x] `fulfillment.proto` — thêm vào `HubStoreOrderFilterItem` (fields 16-20, RESERVED cho SF-13 — ghi comment):
```proto
  // --- SF-13 intake/exception (additive, wire-safe; fields 21+ dành cho SF khác) ---
  string customer_name = 16;      // MỚI SF-13 — seed orders NULL → rỗng
  string customer_phone = 17;     // MỚI SF-13
  // Lý do giao thất bại (enum hubstore.intake.v1.DeliveryFailReason giữ dạng
  // STRING ở đây để KHÔNG import ngược intake.proto — additive string; rỗng = không fail)
  string fail_reason = 18;
  string fail_note = 19;
  // Đơn retry link về đơn gốc (đơn retry có giá trị; đơn gốc rỗng)
  string old_fulfill_code = 20;
```
- [x] Regen TS (BFF README pattern):
```bash
protoc -I api/proto \
  --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto \
  --ts_proto_out=api/proto/gen/ts \
  --ts_proto_opt=outputServices=grpc-js,forceLong=number,esModuleInterop=true \
  api/proto/hubstore/fulfillment/v1/fulfillment.proto api/proto/hubstore/intake/v1/intake.proto
```
Regen JAVA (spike docs/superpowers/spikes/grpc-codegen-multilang.md — protoc-gen-grpc-java 1.64.0 osx-aarch_64; nếu binary chưa có: `curl -LO https://repo1.maven.org/maven2/io/grpc/protoc-gen-grpc-java/1.64.0/protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe` → ~/bin):
```bash
protoc -I api/proto --java_out=api/proto/gen/java api/proto/hubstore/intake/v1/intake.proto
protoc -I api/proto --java_out=api/proto/gen/java --plugin=protoc-gen-grpc-java=$HOME/bin/protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe --grpc-java_out=api/proto/gen/java api/proto/hubstore/intake/v1/intake.proto
protoc -I api/proto --java_out=api/proto/gen/java api/proto/hubstore/fulfillment/v1/fulfillment.proto
```
KHÔNG regen go/python (Go batching không import intake.proto; print standalone). Verify buf lint: `cd api/proto && npx @bufbuild/buf lint` → PASS.
- [x] Shared TS: `enums.ts` thêm `export const DELIVERY_FAIL_REASON = { KHACH_VANG: 0, SAI_DIA_CHI: 1, KHACH_TU_CHOI: 2, KHAC: 3 } as const; export type DeliveryFailReason = 0|1|2|3;` + labels VI/EN (KHACH_VANG→"Khách vắng"/"Customer absent", SAI_DIA_CHI→"Sai địa chỉ"/"Wrong address", KHACH_TU_CHOI→"Khách từ chối"/"Customer refused", KHAC→"Khác"/"Other") trong STATUS_TAG_LABELS pattern nếu phù hợp, else export riêng `DELIVERY_FAIL_REASON_LABELS`.
- [x] `types/order.ts` — HubStoreOrderFilterItem thêm optional: `customerName?: string; customerPhone?: string; failReason?: string; failNote?: string; oldFulfillCode?: string;`
- [x] `api-contracts/intake.ts` (MỚI):
```ts
import type { Product } from '../types';
export interface IntakeOrderDto {
  customerName: string; customerPhone: string; customerAddress: string;
  items: Product[]; quantity: number; codAmount: number; shopHint?: string;
}
export interface ImportErrorDto { row: number; column: string; message: string; }
export interface ImportPreviewResponse { valid: IntakeOrderDto[]; errors: ImportErrorDto[]; }
export interface ImportConfirmRequest { orders: IntakeOrderDto[]; }
export interface ImportConfirmResponse { fulfillCodes: string[]; }
export interface AuditEntryDto { actor: string; action: string; target: string; detail: Record<string, unknown> | null; createdAt: string; }
```
- [x] Build + test: `pnpm --filter @hub-store/shared test && pnpm --filter @hub-store/shared build` → PASS.
- [x] Commit: `feat(fi245-sf13): proto intake additive + codegen ts/java + shared types`

### Task 2 — Flyway V2 migration (orders columns + activity_log)
**Depends:** — (chạy song song Task 1 được, khác file)
**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V2__intake_schema.sql`

Steps:
- [ ] Content:
```sql
-- FI-245 SF-13 — Flyway V2: intake + delivery exceptions (DB fulfillment).
-- ⚠ MERGE RULE (improvements-log 2026-09-02): file này là CANONICAL cho bảng
-- activity_log. Khi SF-7 merge: DROP V2__activity_log.sql của SF-7 (bảng đã
-- có, DDL trùng contract) + SF-7 renumber. Không drop → Flyway fail boot.

ALTER TABLE orders
  ADD COLUMN customer_name    VARCHAR,
  ADD COLUMN customer_phone   VARCHAR,
  ADD COLUMN old_fulfill_code VARCHAR REFERENCES orders(fulfill_code),
  ADD COLUMN fail_reason      VARCHAR,
  ADD COLUMN fail_note        VARCHAR,
  ADD COLUMN failed_at        TIMESTAMPTZ,
  ADD COLUMN created_time     TIMESTAMPTZ;

CREATE INDEX idx_orders_old_fulfill_code ON orders (old_fulfill_code);

-- Audit log — contract SF-7 (actor/action/target/detail JSONB/created_at).
CREATE TABLE activity_log (
  id         BIGSERIAL PRIMARY KEY,
  actor      VARCHAR NOT NULL,
  action     VARCHAR NOT NULL,
  target     VARCHAR NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_target ON activity_log (target);
```
- [ ] Verify migrate: `docker compose up -d postgres` rồi `cd services/fulfillment-service && ./run.sh` (boot thật — Flyway V2 applied trong log) hoặc tối thiểu psql sanity BẮT BUỘC: `docker compose exec postgres psql -U hubstore -d fulfillment -c '\d orders'` thấy 7 cột mới + `\d activity_log` đủ 6 cột. IT ở Task 4 cover thêm.
- [ ] Commit: `feat(fi245-sf13): Flyway V2 intake schema + activity_log (SF-7 contract, canonical)`

### Task 3 — Java: SeedModels mở rộng + OrderRepository mở rộng + InMemory impl + unit tests
**Depends:** Task 2 (thuần repo layer — proto gen của T1 không cần đến T5 mới dùng)
**Files:**
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/seed/SeedModels.java`
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/OrderRepository.java`
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/InMemoryOrderRepository.java`
- Test: `services/fulfillment-service/src/test/java/com/hubstore/fulfillment/IntakeRepositoryTest.java` (MỚI)

Steps:
- [ ] `SeedModels.OrderSeed` thêm 7 field cuối (đều object/nullable — Jackson seed JSON thiếu → null): `String customerName, String customerPhone, String oldFulfillCode, String failReason, String failNote, Instant failedAt, Instant createdTime`. Cập nhật TẤT CẢ `with*` methods (withBatchStatus/withShopAssignment/withDeliveryTime/withNote) truyền thêm 7 field mới; thêm `withFail(String reason, String note, Instant at)` và `withIntakeCodes(...)` nếu cần. Java record: thêm param cuối, TẤT CẢ caller construct phải sửa (compiler chỉ ra hết).
- [ ] `OrderRepository` thêm methods:
```java
/** Sinh fulfillCode ORD-* tiếp dải (atomic per impl); n= số đơn cần sinh. */
List<String> nextFulfillCodes(int n);
/** Insert batch đơn (đã gán codes) — all-or-nothing; trả các đơn như đã lưu. */
List<SeedModels.OrderSeed> insertOrders(List<SeedModels.OrderSeed> orders);
/** Mark-fail: yêu cầu order tồn tại + chưa FAILED — service validate, repo mutate. */
SeedModels.OrderSeed markFailed(String fulfillCode, String reason, String note, Instant at);
/** Tồn tại đơn retry của code? (chặn double-redeliver). */
boolean hasRetry(String fulfillCode);
/** Đơn gốc của 1 retry (oldFulfillCode). */
Optional<SeedModels.OrderSeed> findByExactFulfillCode(String fulfillCode);
SeedModels.OrderSeed appendAudit(String actor, String action, String target, String detailJson);
List<AuditEntry> getAudit(String fulfillCode); // record AuditEntry(String actor, String action, String target, String detailJson, Instant createdAt) — đặt trong OrderRepository hoặc FilterResult-style file riêng
```
(Chú ý: `findByExactFulfillCode` = chỉ match fulfill_code KHÔNG dual-match orderCode — cho lookup old code chính xác.)
- [ ] `InMemoryOrderRepository` implement: nextFulfillCodes dùng `synchronized` + scan max `^ORD-(\d+)$` từ list; insertOrders add-all; markFailed replace record `withFail`; hasRetry/findByExactFulfillCode stream; audit = `List<AuditEntry>` nội bộ synchronized append + filter theo target.
- [ ] Unit test `IntakeRepositoryTest` (dựng InMemory với seed path test như các test hiện có — xem `ValidationAndMutationTest` cách init): codegen tiếp 3028, 3029; insertOrders thấy trong filter; markFailed set fail fields; markFailed lần 2 trên đơn đã FAIL → IllegalArgumentException; hasRetry sau insert retry = true; audit append/get theo target.
- [ ] Run: `cd services/fulfillment-service && mvn -q test` → toàn xanh (test cũ vẫn pass — constructor OrderSeed mới phải sửa hết chỗ tạo test record).
- [ ] Commit: `feat(fi245-sf13): repo intake methods + OrderSeed mở rộng + in-memory impl + unit tests`

### Task 4 — Java: Postgres impl các method mới + IT
**Depends:** Task 2, Task 3
**Files:**
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/PostgresOrderRepository.java`
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/FilterResult.java` (nếu AuditEntry để file riêng thì tạo `AuditEntry.java`)
- Test: `services/fulfillment-service/src/test/java/com/hubstore/fulfillment/PostgresIntakeIT.java` (MỚI, pattern skip-when-no-DB của `PostgresOrderRepositoryIT`)

Steps:
- [ ] `ORDER_COLS` thêm `customer_name, customer_phone, old_fulfill_code, fail_reason, fail_note, failed_at, created_time`; `mapOrder` map đủ 7 (failed_at/created_time qua `ts(rs,col)` → Instant).
- [ ] Implement:
```java
@Override @Transactional
public List<SeedModels.OrderSeed> insertOrders(List<SeedModels.OrderSeed> orders) {
    List<SeedModels.OrderSeed> out = new ArrayList<>();
    for (SeedModels.OrderSeed o : orders) {
        jdbc.update("INSERT INTO orders (fulfill_code, order_code, status_code, batch_status, batch_code, "
            + "shop_code, shop_name, shop_address, original_time_from, original_time_to, "
            + "delivery_time_from, delivery_time_to, order_status, items, cod_amount, total_quantity, "
            + "is_debt_splitting_order, customer_address, distance, note, "
            + "customer_name, customer_phone, old_fulfill_code, created_time) "
            + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            /* 24 params — items qua OBJECT_MAPPER.writeValueAsString(o.items()) */);
        out.add(findByExactFulfillCode(o.fulfillCode()).orElseThrow());
    }
    return out;
}

@Override @Transactional
public List<String> nextFulfillCodes(int n) {
    jdbc.execute("SELECT pg_advisory_xact_lock(hashtext('fulfill_code_gen'))");
    Integer max = jdbc.queryForObject(
        "SELECT COALESCE(MAX((substring(fulfill_code FROM 5))::INT), 3000) "
        + "FROM orders WHERE fulfill_code ~ '^ORD-[0-9]+$'", Integer.class);
    List<String> codes = new ArrayList<>(n);
    for (int i = 1; i <= n; i++) codes.add(String.format("ORD-%04d", max + i));
    return codes;
}

@Override @Transactional
public SeedModels.OrderSeed markFailed(String fulfillCode, String reason, String note, Instant at) {
    OrderRow row = requireOrder(fulfillCode); // FOR UPDATE
    if (row.order().failReason() != null) throw new IllegalArgumentException("Đơn đã FAILED: " + fulfillCode);
    jdbc.update("UPDATE orders SET fail_reason=?, fail_note=?, failed_at=? WHERE id=?", reason, note, OffsetDateTime.ofInstant(at, ZoneOffset.UTC), row.id());
    return row.order().withFail(reason, note, at);
}

@Override
public boolean hasRetry(String fulfillCode) {
    Long c = jdbc.queryForObject("SELECT count(*) FROM orders WHERE old_fulfill_code = ?", Long.class, fulfillCode);
    return c != null && c > 0;
}

@Override
public Optional<SeedModels.OrderSeed> findByExactFulfillCode(String fulfillCode) {
    return jdbc.query("SELECT " + ORDER_COLS + " FROM orders WHERE fulfill_code = ? ORDER BY id ASC LIMIT 1",
            ORDER_ROW_MAPPER, fulfillCode).stream().findFirst();
}

@Override @Transactional
public void appendAudit(String actor, String action, String target, String detailJson) {
    jdbc.update("INSERT INTO activity_log (actor, action, target, detail, created_at) VALUES (?,?,?,?,now())",
            actor, action, target, detailJson); // detail cột JSONB — PostgreSQL cast implicit từ text param? KHÔNG: dùng CAST(?)::jsonb
}
```
(Chốt: `appendAudit` trả `void`; SQL dùng `VALUES (?,?,?,CAST(? AS jsonb),now())`.) `getAudit`:
```java
return jdbc.query("SELECT actor, action, target, detail::text AS detail, created_at FROM activity_log "
        + "WHERE target = ? ORDER BY id ASC", (rs, i) -> new AuditEntry(rs.getString("actor"),
        rs.getString("action"), rs.getString("target"), rs.getString("detail"), ...instant từ OffsetDateTime...), fulfillCode);
```
- [ ] IT `PostgresIntakeIT` (copy skeleton skip-when-no-DB từ `PostgresOrderRepositoryIT` — env `FULFILLMENT_DB_*` hay pattern nào IT cũ dùng): insert 3 đơn → codes trong filter; nextFulfillCodes 2 lần liên tiếp không trùng (atomic check đơn giản); markFailed + hasRetry; insert retry với old_fulfill_code; getAudit trả đúng entries.
- [ ] Run IT: `mvn -q test -Dtest=PostgresIntakeIT` (DB compose đang lên) + `mvn -q test` toàn bộ.
- [ ] Commit: `feat(fi245-sf13): postgres intake impl — advisory-lock codegen + audit + IT`

### Task 5 — Java: IntakeServiceImpl gRPC + audit wiring
**Depends:** Task 1, 3, 4
**Files:**
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/IntakeServiceImpl.java`
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/IntakeValidator.java`
- Test: mở rộng `IntakeRepositoryTest` hoặc `ValidationAndMutationTest` pattern (unit test validator thuần)

Steps:
- [ ] `IntakeValidator` — thuần static/instance không gRPC, trả `List<ErrorDetail>` dạng `(row, column, message)`:
```java
public final class IntakeValidator {
    private static final Pattern PHONE = Pattern.compile("^(\\+84|0)\\d{9}$");
    /** @param shopCodes null = bỏ check shopHint (unit test); row 1-based. */
    public static List<IntakeError> validate(List<SeedModels.OrderSeed> orders, Set<String> shopCodes) {
        // từng rule theo spec §4; column = tên header template:
        // customerName/customerPhone/customerAddress/items/quantity/codAmount/shopHint
        // — quantity lệch sum(items) → lỗi cột "quantity"
        // — item rỗng → lỗi cột "items"
    }
    public record IntakeError(int row, String column, String message) {}
}
```
- [ ] `IntakeServiceImpl extends IntakeServiceGrpc.IntakeServiceImplBase` (`@GrpcService`) — inject OrderRepository. Mỗi RPC đọc actor từ metadata `Context.current().getCallCredentials()`? — KHÔNG: pattern hiện có là BFF gửi metadata; đọc trong interceptor: dùng `io.grpc.Context` key đăng ký qua `ServerInterceptor` hoặc đơn giản: đọc `Metadata` từ `Context.current().call(...)`. Cách đúng theo codebase hiện có: kiểm tra `GrpcErrors`/interceptor hiện có (tìm `x-user-role` trong fulfillment-service — nếu đã có interceptor đọc metadata, làm y hệt với `x-user-name`; nếu KHÔNG có, tạo `ActorInterceptor implements ServerInterceptor` đặt `Context.key("x-user-name")`).
  - `validateImportOrders`: map proto IntakeOrder→OrderSeed tạm (fulfillCode="") → validate → errors[] TRONG RESPONSE BODY (không dùng metadata — BFF đọc resp.errors); rỗng = valid.
  - `confirmImportOrders`: validate lại; còn lỗi → `GrpcErrors.invalidArgument` (INVALID_ARGUMENT → BFF map 422 sẵn, KHÔNG dùng FAILED_PRECONDITION — grpc-error.ts không map status 9) description = "Import có N dòng lỗi". Pass → `repo.nextFulfillCodes(n)` → dựng orders đầy đủ (statusCode=0, orderStatus=1, batchStatus=0, batchCode=null, times=null, shopAssignment từ shopHint lookup distinctShops — shopHint rỗng → shopAssignment null, createdTime=now) → `insertOrders` → **appendAudit 1 entry PER ORDER** (actor, action "order.imported", target=code, detail {"importedAt":...}) → trả codes theo thứ tự. (Per-order target để GET /orders/:code/audit thấy được từng đơn — join-target sẽ trả 0 entries.)
  - `createManualOrder`: validate 1 đơn → nextFulfillCodes(1) → insert → audit order.created → trả code.
  - `markOrderFailed`: order tồn tại (NOT_FOUND) + chưa FAILED (INVALID_ARGUMENT "Đơn đã FAILED") → `markFailed` → audit order.failed (detail {"reason","note"} — reason là **enum name string** `KHACH_VANG|SAI_DIA_CHI|KHACH_TU_CHOI|KHAC`, khớp cột fail_reason + FE tag render) → EMPTY response.
  - `redeliverOrder`: gốc tồn tại + `failReason != null` + `!hasRetry(code)` (INVALID_ARGUMENT "Đơn đã được giao lại") → nextFulfillCodes(1) → đơn MỚI copy (customerName/Phone/Address, items, codAmount, totalQuantity, shopAssignment) + oldFulfillCode=code + note="Giao lại từ "+code → insert → audit order.redelivered target=code mới detail {"oldFulfillCode":code} → trả new code.
  - `getOrderAudit`: code lạ → `GrpcErrors.notFound` (404); trả entries (detail JSONB text giữ nguyên chuỗi).
- [ ] Unit test validator: các rule (phone sai định dạng, quantity lệch, items rỗng, shopHint lạ, hàng lỗi đúng cột).
- [ ] `mvn -q test` xanh toàn bộ.
- [ ] Commit: `feat(fi245-sf13): IntakeService gRPC — validate/confirm/manual/fail/redeliver/audit`

### Task 6 — BFF: intake client + routes + parse CSV/XLSX + contract tests
**Depends:** Task 1 (ts stubs), Task 5 (service chạy)
**Files:**
- Create: `services/bff-gateway/src/clients/intake.ts`
- Create: `services/bff-gateway/src/routes/intake.ts`
- Create: `services/bff-gateway/src/lib/parseOrdersFile.ts`
- Create: `services/bff-gateway/src/mappers/intake.ts`
- Modify: `services/bff-gateway/src/app.ts` (đăng ký routes + clients), `src/clients/index.ts`, `src/config.ts` (nếu cần addr intake = cùng addr fulfillment :50051)
- Modify: `services/bff-gateway/package.json` (deps: `@fastify/multipart` pin mới nhất 8.x, `xlsx` pin 0.18.5)
- Modify: `services/bff-gateway/test/bff.contract.test.ts` hoặc tạo `test/intake.route.test.ts` (MỚI, dùng harness)

Steps:
- [ ] `pnpm --filter bff-gateway add @fastify/multipart@8 xlsx@0.18.5` (đúng registry/pnpm workspace).
- [ ] `clients/intake.ts` — clone pattern `clients/fulfillment.ts`: `IntakeServiceClient` từ gen ts, interface `IntakeApi` 6 method, `callUnary(c.method.bind(c), req, role, deadlineMs)` — VÀ truyền thêm `x-user-name`: kiểm tra `callUnary` signature trong `clients/grpc.ts`; nếu chỉ nhận role → mở rộng optional param `actor?: string` (additive, các call cũ không vỡ) để metadata có `{ x-user-role: role, x-user-name: actor }`.
- [ ] `lib/parseOrdersFile.ts`:
```ts
export const TEMPLATE_HEADERS = ["customerName","customerPhone","customerAddress","items","quantity","codAmount","shopHint"] as const;
export function templateCsv(): string {
  return TEMPLATE_HEADERS.join(",") + "\r\n";
}
export function parseOrdersFile(filename: string, buffer: Buffer): { rows: RawRow[]; errors: ImportErrorDto[] } {
  // .csv → tự parse (hỗ trợ quoted fields "" escape); .xlsx/.xls → XLSX.read(buffer,{type:'buffer'}) sheet đầu → sheet_to_json(header:1)
  // header row: map cột theo TEMPLATE_HEADERS (tên cột sai → lỗi {row:0,column:<tên lạ>,message:"Cột không hợp lệ"})
  // từng data row → RawRow (string thô), số lượng cột sai → lỗi row đó
}
// items cell "SKU1:Sản A:2;SKU2:Sản B:1" → Product[]; cell items sai format → lỗi cột items
```
- [ ] Routes `routes/intake.ts` (đăng ký trong app.ts sau fulfillment):
  - `GET /orders/import/template` — role: Coordinator; `reply.type('text/csv').header('Content-Disposition','attachment; filename="order-import-template.csv"').send(templateCsv())`.
  - `POST /orders/import/preview` — Coordinator; `request.file()` (multipart) → parseOrdersFile → gRPC validateImportOrders(orders) → errors = resp.errors (response body) + parse errors gộp → `{ valid, errors }` (ImportPreviewResponse). **Row indexing: row parse-fail vẫn giữ vị trí bằng cách gửi IntakeOrder placeholder rỗng vào request — giữ 1-based indexing; BFF PHẢI track các index placeholder và DROP resp.errors của các row đó (placeholder rỗng sẽ sinh ~4 validation errors rác mỗi row — không lọc thì preview sai). Contract test thêm case mixed parse+validation errors.**
  - `POST /orders/import/confirm` — Coordinator; body `{orders: IntakeOrderDto[]}` → gRPC confirmImportOrders → `{ fulfillCodes }`; service trả INVALID_ARGUMENT khi re-validate fail → sendGrpcError tự map 422 (đã có sẵn, không đổi grpc-error.ts).
  - `POST /orders` — Coordinator; body IntakeOrderDto → createManualOrder → `{ fulfillCode }` 201.
  - `POST /orders/:code/fail` — WarehouseOps (check `user.role !== 'WarehouseOps'` → 403 envelope); body `{reason: number, note?: string}` → markOrderFailed → 204/`{}`.
  - `POST /orders/:code/redeliver` — WarehouseOps → redeliverOrder → `{ fulfillCode }` 201.
  - `GET /orders/:code/audit` — mọi role → getOrderAudit → `{ items: AuditEntryDto[] }` (detail JSON.parse an toàn — parse fail → null).
  - Role check helper: tạo `requireRole(request, ...roles)` trong route file hoặc plugins/auth.ts (additive export).
- [ ] Contract tests (harness hiện có — fake gRPC server stub per test như bff.contract.test.ts): template headers đúng; preview map lỗi; confirm 422 khi service INVALID_ARGUMENT; POST /orders 201; fail sai role 403; redeliver 201; audit envelope. Mỗi test assert pagination/envelope pattern như test cũ.
- [ ] `cd services/bff-gateway && pnpm build && pnpm test` → xanh.
- [ ] Commit: `feat(fi245-sf13): BFF intake routes — template/preview/confirm/manual/fail/redeliver/audit + csv/xlsx parse`

### Task 7 — FE D1 (apps/orders): Tạo đơn + Nhập đơn + expand retry-link
**Depends:** Task 6 (routes sống)
**Files:**
- Create: `apps/orders/src/features/CreateOrderModal.tsx` (+ `.test.tsx`)
- Create: `apps/orders/src/features/ImportOrdersModal.tsx` (+ `.test.tsx`)
- Modify: `apps/orders/src/pages/D1Page.tsx` (2 nút mới trên FilterBar/bulk area — KHÔNG đụng testid/DOM cột cũ)
- Modify: `apps/orders/src/features/OrdersExpandContent.tsx` (expand: khách/SĐT + oldFulfillCode link nếu có)
- Modify: `packages/api-client/src/slices/intake.ts` (MỚI — injectEndpoints: `previewImport` POST /orders/import/preview (FormData qua axios instance trực tiếp nếu axiosBaseQuery không hỗ trợ), `confirmImport` POST /orders/import/confirm, `createManualOrder` POST /orders — **CHỈ 3 endpoints này; fail/redeliver thuộc T8 (deconflict RTKQ singleton tránh duplicate endpoint khi merge)**) + invalidate `Fulfillment LIST` sau mutation.
- Modify: `packages/api-client/src/index.ts` (side-effect import `'./slices/intake'` — BẮT BUỘC, endpoints không được inject nếu thiếu; pattern imports hiện có trong file)
- Modify: `apps/orders/src/i18n.ts` (registerOrdersResources — keys orders.intake.*)

Steps:
- [ ] `CreateOrderModal`: antd Modal + Form (customerName, customerPhone, customerAddress, Form.List items {productCode, productName, quantity}, codAmount InputNumber, shopHint Select từ useGetShopsQuery). Submit → createManualOrder → message.success + invalidate list (RTKQ tag) + onClose. data-testid: `create-order-button`, `create-order-modal`, `create-order-submit`.
- [ ] `ImportOrdersModal`: bước 1 — `Upload.Dragger` accept `.csv,.xlsx,.xls` beforeUpload return false (không auto), nút "Tải template" `data-testid="download-template"` (axios GET blob → saveAs anchor). Bước 2 — chọn file → POST preview (FormData) → bảng preview: rows valid xanh (Icon CheckCircle) + rows lỗi đỏ kèm `{row, column, message}` — data-testid `import-preview`, `import-error-row-{n}`, nút Confirm disable khi errors>0 `data-testid="import-confirm"`. Confirm → confirmImport → success message hiện codes + invalidate.
- [ ] D1Page: hàng nút mới cạnh "Tạo phiếu soạn" (Space, trước bulk-bar): `<Button data-testid="create-order-button">Tạo đơn</Button><Button data-testid="import-orders-button">Nhập đơn</Button>` — mở 2 modal. KHÔNG đổi cột/bộ lọc/testid cũ.
- [ ] OrdersExpandContent: dòng "Khách" (customerName + customerPhone, ẩn nếu rỗng) + nếu `oldFulfillCode` → `Đơn gốc: <link copyable data-testid="old-order-link">{oldFulfillCode}</link>`.
- [ ] i18n keys VI/EN đủ cho cả 2 modal + expand mới (KHÔNG hardcode string — pattern SF-22 chuẩn bị).
- [ ] Unit tests: CreateOrderModal submit gọi mutation + close; ImportOrdersModal render lỗi preview đúng row/column; expand hiện oldFulfillCode.
- [ ] `pnpm --filter @hub-store/orders test && pnpm --filter @hub-store/orders build` → xanh (tên filter kiểm tra apps/orders/package.json).
- [ ] Commit: `feat(fi245-sf13): D1 tạo đơn + nhập đơn preview/confirm + expand retry-link`

### Task 8 — FE D2 (apps/fulfillment): mark-fail + giao lại
**Depends:** Task 6
**Files:**
- Create: `apps/fulfillment/src/features/MarkFailModal.tsx` (+ test)
- Modify: `apps/fulfillment/src/api/batchesApi.ts` (inject mutations `failOrder` POST /orders/:code/fail + `redeliverOrder` POST /orders/:code/redeliver — file này đã inject vào RTKQ singleton `api` từ '@hub-store/api-client' (đã verify — KHÔNG phải axios trực tiếp); **chỉ 2 endpoints này, getAudit không có FE — chỉ E2E gọi REST**)
- Modify: `apps/fulfillment/src/pages/BatchListPage.tsx` (expanded row: thêm 2 nút per-item "Mark thất bại" + khi FAILED → tag lý do + nút "Giao lại")
- Modify: `apps/fulfillment/src/i18n.ts` (keys fulfillment.exception.*)

**Vấn đề dữ liệu:** BatchingItem (D2 rows) KHÔNG có fulfillCode/failReason — D2 item chỉ có `orderCode` (RSA). Chốt: thêm route BFF MỚI **`GET /orders/by-batch/:batchCode`** trả `HubStoreOrderFilterItem[]` của batch (BFF owns aggregation: gọi batching getBatchDetail → codes → fulfillment getOrdersByCodes; additive). FE fetch khi expand + refetch sau mutation. (Prefix `/orders*` thống nhất cho cả intake surface theo context pack touch map `/orders/import, /orders, /orders/{id}/fail, /redeliver` — có lệch với convention `/fulfillment/*` hiện có, đây là chủ đích theo context pack; ghi 1 câu vào spec errata.)
- Modify: `services/bff-gateway/src/routes/intake.ts` (thêm route GET /orders/by-batch/:batchCode + contract test trong cùng test file T6)
Steps:
- [ ] Route BFF gộp (as BFF owns aggregation — spec §3.3 pattern).
- [ ] `MarkFailModal`: Select lý do (DELIVERY_FAIL_REASON labels) + TextArea note + submit → failOrder → message + invalidate. data-testid: `mark-fail-button-{orderCode}`, `mark-fail-modal`, `fail-reason-select`, `fail-note`, `fail-submit`, `redeliver-button-{orderCode}`.
- [ ] BatchListPage expanded row: fetch batch orders → mỗi item render failReason tag (nếu có, data-testid `fail-tag-{code}`) + nút Mark thất bại (ẩn khi đã FAILED) + nút Giao lại (chỉ khi FAILED && chưa có retry — server gate là chốt cuối, FE chỉ ẩn: check có `oldFulfillCode`-order trong list? — đơn giản: luôn hiện nút Giao lại trên đơn FAILED; double-redeliver server chặn INVALID_ARGUMENT → message lỗi).
- [ ] Sau redeliver thành công: message "Đã tạo đơn giao lại ORD-xxxx" + invalidate.
- [ ] Unit test MarkFailModal (chọn lý do + submit gọi mutation).
- [ ] `pnpm --filter @hub-store/fulfillment test && pnpm --filter @hub-store/fulfillment build` xanh.
- [ ] Commit: `feat(fi245-sf13): D2 mark-fail lý do + giao lại + batch orders hydration route`

### Task 9 — E2E specs 05/06 + toàn bộ specs xanh
**Depends:** Task 7, 8
**Files:**
- Create: `e2e/tests/05-intake.spec.ts`
- Create: `e2e/tests/06-exception.spec.ts`
- Modify (nếu cần): `scripts/boot-all.sh` chỉ khi phát hiện thiếu (additive, không phá)

**Pre-step (một lần):** `docker compose up -d postgres keycloak` + seed DB (seed-db.sh) nếu chưa; E2E cần DB Postgres + compose infra. Chạy: `cd e2e && npx playwright test` (boot-all tự chạy, reuseExistingServer=false).

Steps:
- [ ] `05-intake.spec.ts` (storageState coordinator mặc định):
```
test 1 — template: GET download qua UI nút "Tải template" trong modal nhập đơn → file tải về có 7 header đúng thứ tự.
test 2 — import preview + confirm: xây buffer CSV 10 dòng (8 hợp lệ, dòng 3 phone sai "12345", dòng 7 quantity lệch sum) → upload qua input file → preview: expect `import-error-row` hiển thị ĐÚNG 2 lỗi, đúng text cột customerPhone/quantity → nút Confirm disabled → đổi file chỉ 8 dòng hợp lệ → upload → confirm → expect D1 list tăng +8 (đếm trước/sau qua text total "Tổng" hoặc pagination total node) → thấy code mới ORD->max cũ.
test 3 — tạo đơn thủ công: click Tạo đơn → điền form (1 item) → submit → message → search mã mới trong filter → thấy row + code > max cũ.
```
CSV trong test viết bằng `Buffer.from(...)` + setInputFiles (Playwright) — không fixture file ngoài.
- [ ] `06-exception.spec.ts` (coordinator tạo batch — reuse helper `createBatch` pattern spec 01; test mark-fail/redeliver dùng warehouse storageState `test.use({ storageState: ".auth/warehouse.json" })`):
```
test 1 — chuẩn bị: từ D1 tick 2 đơn (chọn đơn batchStatus=0 chưa dùng — chọn qua tick hàng đầu filter shop như spec 01) → tạo phiếu → D2 hoàn tất soạn (complete-picking như spec 01).
test 2 — mark-fail: D2 expand batch → mark-fail 1 đơn lý do "Khách vắng" + note → thấy fail-tag; audit: GET /orders/{code}/audit qua `request.get('/api/orders/...')`? — E2E gọi BFF trực tiếp cần token; dùng context request của page (đã có Bearer qua localStorage? KHÔNG — axios interceptor gắn token từ oidc localStorage; Playwright request không tự gắn). → CÁCH: check audit qua UI? Không có màn. → Giải pháp duy nhất trong E2E: đánh dấu audit check qua API bằng cách đọc token từ page localStorage (page.evaluate lấy oidc user access_token) rồi request.get với header Bearer. (Pattern chấp nhận được — ghi comment rõ.)
test 3 — giao lại: nút Giao lại trên đơn FAILED → message + về D1 search đơn mới (note chứa "Giao lại từ") → expand thấy old-order-link → audit của đơn mới có entry order.redelivered + audit đơn cũ có order.failed.
test 4 — double-redeliver chặn: bấm Giao lại lần nữa trên cùng đơn (nếu nút còn) → message lỗi từ server.
```
- [ ] Chạy từng spec mới: `npx playwright test tests/05-intake.spec.ts` → xanh; `tests/06-exception.spec.ts` → xanh.
- [ ] Chạy TOÀN BỘ: `npx playwright test` → 13 test cũ + specs mới toàn xanh (6 file). Fix nếu vỡ (chỉ sửa specs mới, KHÔNG đụng assertions cũ).
- [ ] Rule 0 browser verify 3 tầng (coordinator tự làm, KHÔNG giao agent): mở :3000 login thật → D1 đi flow nhập 8 đơn → D2 đi flow fail+redeliver → screenshot từng màn → so với kỳ hành (không Figma cho SF này — so với acceptance lines).
- [ ] Commit: `test(fi245-sf13): E2E intake + exception specs — import/preview/manual/fail/redeliver/audit`

### Task 10 — Final verify + review + merge + close
**Depends:** Task 9
Steps:
- [ ] Verify improvements-log đã có 2 entries (R1 merge-rule V2 canonical + R6 field-numbers 16-20) — đã ghi ở spec round-2 (commit f99e1af); nếu thiếu do merge conflict → bổ sung trước khi review.
- [ ] Verify từng dòng ACCEPTANCE context pack (4 dòng) — ghi evidence từng dòng vào comment Linear.
- [ ] Dispatch code-reviewer ĐỘC LẬP trên toàn diff SF (`git diff <merge-base>..HEAD`), verdict → `/tmp/story/fi245/reviewer-sf13.md`; CHANGES-REQUESTED → fix → re-review đến APPROVED.
- [ ] MERGE (guard đúng thứ tự):
```bash
OLD_TIP=$(git rev-parse story/fi245-postgres-production)
git fetch . story/fi245-postgres-production 2>/dev/null
git merge story/fi245-postgres-production --no-edit   # merge parent VÀO sf-branch trước
# conflict improvements-log → GIỮ CẢ HAI (không chọn 1 phía)
mvn -q test -pl services/fulfillment-service 2>/dev/null || (cd services/fulfillment-service && mvn -q test)   # test lại sau merge
git merge-base --is-ancestor "$OLD_TIP" HEAD && echo GUARD-PASS || exit 1
git update-ref refs/heads/story/fi245-postgres-production "$(git rev-parse HEAD)"   # KHÔNG branch -f, KHÔNG tên ngắn
```
- [ ] Audit comment merge hash lên FI-258.
- [ ] story-verify sạch (chạy bin/story-verify — bracket FI-245). Nếu B3 verdict marker trượt (memory fi272) → post comment Linear chứa literal `VERDICT: APPROVED` marker từ reviewer file.
- [ ] RỒI mới set FI-258 Done. Linear Done TRƯỚC merge = run INCOMPLETE.

## 6. Risks & unknowns
- **Must verify at Task 1:** protoc-gen-grpc-java binary có sẵn không (spike ghi 1.64.0 osx-aarch_64); ts-proto gen ra intake stub đúng outputServices=grpc-js.
- **Must verify at Task 5:** cách đọc metadata x-user-role hiện có trong fulfillment-service (grep trước khi viết interceptor — dùng đúng pattern).
- **Unverified:** xlsx 0.18.5 parse trên Node 24 (nếu lỗi → fall back chỉ CSV + ghi REQUIREMENT-GAP comment); audit token-read pattern trong E2E (nếu localStorage oidc key khác — inspect page).
- R1 merge-rule + R6 field-numbers đã chốt trong spec §3 D9 + improvements-log.
