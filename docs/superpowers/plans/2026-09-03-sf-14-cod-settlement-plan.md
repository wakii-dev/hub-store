# SF-14 COD đối soát — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xác nhận thu COD per-order + bulk per batch; đối soát theo shop theo kỳ (Manager); export CSV; e2e mới.

**Architecture:** Bảng `cod_confirmations` (Flyway V3, DB fulfillment) — eager PENDING row chèn lúc đơn hoàn tất phiếu (batch_status=2 PREPARED, cod_amount>0), completed_at = anchor kỳ. gRPC additive vào `fulfillment.proto` → BFF REST `/cod/*` role-array guards → FE D2 badge/confirm + shell Settlement page (direction B) + CSV stream pattern SF-7.

**Tech Stack:** Java (Spring gRPC FulfillmentService, Flyway, JdbcClient-style `jdbc.update/query` như PostgresOrderRepository), protoc + ts-proto + protoc-gen-grpc-java, Fastify BFF, React antd4 + RTKQ, Playwright.

**Linear Issue:** FI-259 · **Spec:** `docs/superpowers/specs/2026-09-03-sf-14-cod-settlement-design.md` (đọc TRƯỚC — decisions D1-D9 binding) · **Design hand-off:** `docs/superpowers/designs/sf-14-direction.md` (direction B) + `docs/superpowers/designs/sf-14/direction-b.html` (fidelity target).

**Convention cam kết:** mỗi task 1 atomic commit, message `feat(cod): ...` / `test(cod): ...`; KHÔNG `git add -A`; KHÔNG sửa spec cũ / e2e cũ / batching DB; proto additive-only (không đổi field số hiện có).

---

### Task 1: settlement-table — V3 migration + CodConfirmationRepository (Postgres + InMemory)

**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V3__cod_settlement.sql`
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/CodConfirmationRepository.java`
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/PostgresCodConfirmationRepository.java`
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/InMemoryCodConfirmationRepository.java` (+ record `CodConfirmation` trong cùng package hoặc `store/CodConfirmationRecord.java`)
- Test: `services/fulfillment-service/src/test/java/...` (unit test InMemory + integration test DB, skip-when-no-DB như SF-2)

**Model (record):**
```java
public record CodConfirmation(String fulfillCode, String batchCode, String shopCode, String shopName,
        long expectedAmount, Long collectedAmount /* null khi PENDING */, String collectedBy,
        Instant collectedAt, Instant completedAt, int status /* 0=PENDING 1=CONFIRMED */) {}
```

**Interface methods:**
```java
public interface CodConfirmationRepository {
    void insertPendingIfAbsent(CodConfirmation c);            // ON CONFLICT (fulfill_code) DO NOTHING
    List<CodConfirmation> findPendingByBatch(String batchCode); // JOIN orders, fail_reason IS NULL
    int confirmBatch(String batchCode, String collectedBy, Instant collectedAt); // UPDATE PENDING → CONFIRMED, collected=expected; trả số row
    Optional<CodConfirmation> findByFulfillCode(String fulfillCode);
    int confirmOne(String fulfillCode, Long collectedAmount /* null = lấy expected */, String collectedBy, Instant collectedAt);
    int deletePendingByFulfillCodes(List<String> fulfillCodes); // revert hoàn tất (D8)
    List<SettlementShopRow> aggregate(Instant from, Instant to); // GROUP BY shop + JOIN fail_reason IS NULL (SQL ở Task 1 luôn, service RPC ở Task 3)
    List<CodConfirmation> detail(String shopCode, Instant from, Instant to, boolean onlyMismatch); // onlyMismatch = status=0 OR collected<>expected
}
```

- [ ] Step 1: V3 migration — đúng schema spec §4 (có shop_name snapshot + 3 indexes + header comment "V3 slot reserved bởi V5 header"). KHÔNG `IF NOT EXISTS`.
- [ ] Step 2: Viết unit test InMemory TRƯỚC (TDD): insertPendingIfAbsent idempotent; confirmBatch chỉ touch PENDING; confirmOne với collectedAmount=null → collected=expected, =0L → collected=0; deletePendingByFulfillCodes không xóa CONFIRMED.
- [ ] Step 3: Implement InMemory (thread-safe theo pattern InMemoryOrderRepository — synchronized collections).
- [ ] Step 4: Implement Postgres (`@Repository`, `jdbc.update/query` như PostgresOrderRepository:556-574; Instant ↔ `OffsetDateTime` qua helper `instant()`/`ts()` có sẵn trong PostgresOrderRepository — copy pattern, không import chéo private). `findPendingByBatch`/`confirmBatch` JOIN orders `o.fail_reason IS NULL` (D7).
- [ ] Step 5: Integration test với test DB (pattern SF-2 `skip-when-no-DB`): migrate V3 chạy qua Flyway test harness hiện có.
- [ ] Step 6: `cd services/fulfillment-service && ./mvnw -q test` (hoặc mvn wrapper hiện có) → PASS. Commit `feat(cod): V3 cod_confirmations table + CodConfirmationRepository (PG+InMemory)`.

### Task 2: cod-confirm-flow — proto additive + regen + service RPCs (eager PENDING + confirm/pending + revert-delete)

**Files:**
- Modify: `api/proto/hubstore/fulfillment/v1/fulfillment.proto` (append-only: enum + messages + 4 rpc vào `service FulfillmentService`)
- Regen: `api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment.ts` + `api/proto/gen/java/com/hubstore/fulfillment/v1/{Fulfillment,FulfillmentServiceGrpc}.java`
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/FulfillmentServiceImpl.java`
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/InMemoryOrderRepository.java` (nếu mutateBatchStatus cần expose updated records — check signature đã trả `List<OrderSeed>` rồi, có thể KHÔNG cần)
- Test: unit + integration test confirm flow

**Proto additions (đúng spec §5 — chú ý optional presence cho collected_amount, KHÔNG wrapper message chung):**
```protobuf
enum CodCollectionStatus {
  COD_PENDING = 0;
  COD_CONFIRMED = 1;
}
message CodConfirmation { string fulfill_code=1; string batch_code=2; string shop_code=3; string shop_name=4;
  int64 expected_amount=5; optional int64 collected_amount=6; string collected_by=7;
  google.protobuf.Timestamp collected_at=8; google.protobuf.Timestamp completed_at=9; CodCollectionStatus status=10; }
message ConfirmCodItem { string fulfill_code=1; optional int64 collected_amount=2; }
message ConfirmCodRequest { repeated ConfirmCodItem items=1; }
message ConfirmCodResult { string fulfill_code=1; bool success=2; string message=3; }
message ConfirmCodResponse { repeated ConfirmCodResult results=1; }
message ConfirmBatchCodRequest { string batch_code=1; }
message ConfirmBatchCodResponse { int32 confirmed_count=1; int64 total_amount=2; }
message GetCodPendingRequest { string batch_code=1; }
message GetCodPendingResponse { int32 pending_count=1; int64 total_amount=2; }
// GetSettlement* định nghĩa ở Task 3 — proto có thể thêm CẢ HAI ở task này để regen 1 lần (khuyến nghị).
```
Service: `rpc ConfirmCod(ConfirmCodRequest)...; rpc ConfirmBatchCod(...); rpc GetCodPending(...);` (+ Task 3 rpcs nếu gộp regen).

**Proto regen toolchain (RISK đã flag — verify đầu task):**
- `protoc` có: `/opt/homebrew/bin/protoc`.
- TS: `cd api/proto && protoc --plugin=protoc-gen-ts_proto="$(pwd)/node_modules/.bin/protoc-gen-ts_proto" ...` — nếu chưa có, `npm install --prefix /tmp/tsproto ts-proto` rồi trỏ plugin vào đó (memory pattern /tmp npm dir). Đối chiếu flags với file gen hiện có (ts_proto_opt: output_typescript etc. — soi header comment file gen/ts hiện có nếu có).
- Java: cần `protoc-gen-grpc-java` binary — `curl -L -o /tmp/protoc-gen-grpc-java https://repo1.maven.org/maven2/io/grpc/protoc-gen-grpc-java/<VER>/protoc-gen-grpc-java-<VER>-osx-x86_64.exe && chmod +x` (VER = version grpc trong `services/fulfillment-service/pom.xml`; chip arm64 dùng `osx-x86_64` chạy qua Rosetta HOẶC tải `osx-aarch_64`). Java main messages gen bằng `protoc --java_out`.
- Regen xong: `git diff` chỉ THÊM code, không đổi code hiện có (additive guard).

**Service wiring (FulfillmentServiceImpl):**
- Constructor inject thêm `CodConfirmationRepository codRepo` (UPDATE FulfillmentServiceImpl ctor — NOTE: đây là điểm semantic-conflict hay gặp khi merge; giữ signature cũ + param mới ở CUỐI).
- **Eager PENDING (D1):** trong `mutateOrderStatus`, sau `repo.mutateBatchStatus` thành công với target==2: trong `@Transactional` method mới `completeWithCod(List<OrderSeed> updated)` — với mỗi order `codAmount > 0` → `codRepo.insertPendingIfAbsent(new CodConfirmation(fulfillCode, batchCode, shopCode, shopName, codAmount, null, null, null, now(), 0))`. Với target==0 (revert): `codRepo.deletePendingByFulfillCodes(codes)` (D8).
- `confirmCod`: per item — tìm confirmation; confirm; `appendAudit(username, "cod.confirmed", fulfillCode, {expected, collected})`; trả result per-code (không tồn tại → success=false message rõ).
- `confirmBatchCod`: `codRepo.findPendingByBatch` → confirm tất → audit từng đơn (hoặc 1 audit per batch — chọn per-batch 1 entry với danh sách codes để tránh spam).
- `getCodPending`: count/sum PENDING theo batch (JOIN fail_reason IS NULL).
- [ ] Step 1: proto append + regen TS + Java (verify additive diff).
- [ ] Step 2: test TRƯỚC: unit test service-level confirm flow (InMemory repos, mock StreamObserver theo pattern test có sẵn trong fulfillment-service tests).
- [ ] Step 3: implement service wiring trên.
- [ ] Step 4: integration test: completePicking flow → PENDING row xuất hiện (InMemory assert); revert → row biến mất.
- [ ] Step 5: `./mvnw -q test` PASS + `pnpm --filter @hub-store/shared build` (hoặc turbo build shared) để typecheck TS gen mới. Commit `feat(cod): confirm flow — eager pending, per-order + batch confirm, revert cleanup`.

### Task 3: settlement-aggregate-api — aggregate/detail RPCs + BFF REST `/cod/*` + shared DTOs

**Files:**
- Modify: `PostgresCodConfirmationRepository.java` (aggregate + detail SQL — nếu chưa ở Task 1)
- Modify: `FulfillmentServiceImpl.java` (rpc GetSettlement + GetSettlementDetail — proto đã thêm ở Task 2)
- Modify: `services/bff-gateway/src/clients/fulfillment.ts` (client methods callUnary — pattern `clients/batching.ts:48`)
- Create: `services/bff-gateway/src/routes/cod.ts` (register trong server/app entry như d2c.ts)
- Modify: `packages/shared/src/api-contracts/` (+`settlement.ts`, export từ index.ts; enums CodCollectionStatus vào `enums.ts`)
- Test: BFF route tests (pattern có sẵn — `services/bff-gateway` test setup) + Java unit test aggregate (InMemory)

**REST surface (spec §5 bảng):** POST `/cod/confirm`, POST `/cod/confirm-batch`, GET `/cod/pending`, GET `/cod/settlement`, GET `/cod/settlement/detail`. Guards role-array:
```ts
export const COD_CONFIRM_ROLES = ['Coordinator', 'WarehouseOps', 'Manager', 'Admin'] as const;
export const COD_SETTLEMENT_ROLES = ['Manager', 'Admin'] as const;
function requireRoles(request, reply, roles): boolean { /* pattern requireD2cRole d2c.ts:77-85 */ }
```
Period: query `from`/`to` date-only `YYYY-MM-DD` → `Instant` wrap full-day +07:00 (`from` 00:00+07:00 inclusive, `to` ngày+1 00:00 exclusive — pattern d2c.ts:264-265).
Envelope: `reply.send(paginated(rows, total, page, pageSize))` cho `/cod/settlement` (page/pageSize chuẩn SF-7), detail tương tự.
- [ ] Step 1: shared DTOs + enums (wire-code mirror rules: `enums.ts` comment "0 = PENDING").
- [ ] Step 2: Java aggregate + detail impl + unit test (InMemory: 3 shops, đếm pending/mismatch đúng).
- [ ] Step 3: BFF client + routes + guards + tests (403 khi role sai — test cả 4 role confirm + 2 role settlement).
- [ ] Step 4: typecheck + tests toàn BFF. Commit `feat(cod): settlement aggregate API + BFF /cod/* routes with role guards`.

### Task 4: fe-settlement-screen — shell page (direction B) + nav/permission + D2 badge/confirm

**Files:**
- Modify: `packages/shared/src/hooks/usePermissions.tsx` (PERMISSION_MATRIX: thêm `'settlement.view'` cho Manager + Admin; Permission union)
- Modify: `apps/shell/src/nav.ts` (append CUỐI `{ path: '/settlement', labelKey: 'nav.settlement', permission: 'settlement.view' }` + i18n keys namespace shell)
- Create: `apps/shell/src/pages/settlement/SettlementPage.tsx` (+ components con nếu cần: KpiCards, ShopTable, ConfirmModal)
- Create: `apps/shell/src/api/settlementApi.ts` (RTKQ — pattern `apps/shell/src/api/areaStaffApi.ts`)
- Modify: `apps/fulfillment/src/pages/BatchListPage.tsx` (badge "COD chờ thu (n)" + nút xác nhận thu cho batch COMPLETED — fetch `/cod/pending`, modal → POST confirm-batch; KHÔNG đổi testid/DOM hiện có)
- **Đọc TRƯỚC khi code UI:** `docs/superpowers/designs/sf-14-direction.md` + fidelity target `direction-b.html` (KPI cards + progress + segmented filter + drill-down order cards + modal prefill expected / collected optional).

- [ ] Step 1: permission + nav + i18n keys.
- [ ] Step 2: RTKQ api slice (getSettlement, getSettlementDetail, confirmCod, confirmBatch, export URL).
- [ ] Step 3: SettlementPage theo direction B (KPI 4 cards, segmented filter, expandable table, ConfirmModal, empty-state + skeleton SF-6).
- [ ] Step 4: D2 BatchListPage badge + bulk confirm modal (chỉ batch COMPLETED; polling nhẹ hoặc refetch on focus).
- [ ] Step 5: `pnpm typecheck` (turbo) + `pnpm test` FE unit hiện tại không vỡ; nếu có vitest cho pages thì thêm smoke test render. Commit `feat(cod): settlement screen (direction B) + D2 COD badge + bulk confirm`.

### Task 5: settlement-export — CSV endpoint + FE button

**Files:**
- Modify: `services/bff-gateway/src/routes/cod.ts` (GET `/cod/settlement.csv`)
- Modify: `apps/shell/src/pages/settlement/SettlementPage.tsx` (nút Export → window.open với query kỳ hiện tại)
- Test: BFF test CSV (content-type `text/csv; charset=utf-8`, `Content-Disposition` filename `settlement_<from>_<to>.csv`, số dòng = shops + header)

**CSV shape:** mirror `/fulfillment/orders/export.csv` pattern (`routes/fulfillment.ts:171-214` buffer-then-send): header `shop_code,shop_name,total_orders,total_expected,total_collected,diff_amount,pending_count,mismatch_count` + section `# Drilled mismatch orders` (fulfill_code,batch_code,expected,collected,status) khi có. UTF-8 BOM để Excel mở tiếng Việt đúng (check export.csv hiện có đã làm BOM chưa — mirror).
- [ ] Step 1: endpoint + guard `[Manager, Admin]` + test.
- [ ] Step 2: FE button wiring. Commit `feat(cod): settlement CSV export`.

### Task 6: e2e-settlement-spec — `e2e/tests/05-settlement.spec.ts`

**Files:**
- Create: `e2e/tests/05-settlement.spec.ts` (KHÔNG sửa spec cũ)

**Flow (spec §7):**
1. Setup: truncate orders + cod_confirmations + reseed qua `docker compose exec -T postgres psql` (pattern `05-dashboard.spec.ts:39`) — nhớ truncate cả cod_confirmations (không FK cascade).
2. Coordinator storageState: tạo batch có đơn COD qua API DnD existing helpers (pattern 05-d2c) → completePicking.
3. Assert D2 (UI): batch COMPLETED hiện "COD chờ thu (n)" → click Xác nhận thu → confirm → badge biến mất.
4. Tạo case lệch: per-order confirm 1 đơn với số tiền sai (API `/cod/confirm` collectedAmount khác expected).
5. Manager storageState (`test.use` override): mở `/settlement` → assert KPI + row shop (tổng khớp DB) + segmented filter Lệch tiền hiện đúng đơn.
6. Assert psql GROUP BY khớp số UI (API/DB assert theo convention).
7. Export CSV: fetch `/cod/settlement.csv` → assert header + số khớp.
- [ ] Step 1: viết spec, chạy `E2E=1 pnpm --filter e2e test -- 05-settlement` (lệnh chính xác soi `e2e/package.json`).
- [ ] Step 2: chạy toàn bộ suite cũ (`01-`→`06-`) — KHÔNG spec cũ nào vỡ (nav append cuối phải trong suốt với 02-role-matrix).
- [ ] Step 3: Commit `test(cod): e2e settlement spec — confirm flow + settlement totals + csv`.

---

## Verification checklist (Phase 5 — từng dòng ACCEPTANCE context pack)

1. Hoàn tất chuyến có COD → D2 "chờ thu" → confirm cả chuyến → trạng thái đổi (e2e step 2-3 + browser walkthrough).
2. Manager đối soát: tổng theo shop khớp psql GROUP BY; đơn lệch hiện rõ (e2e step 5-6 + screenshot).
3. Export CSV mở Excel được, số khớp màn hình (e2e step 7 + mở file).
4. E2E cũ + mới toàn xanh (full suite).
