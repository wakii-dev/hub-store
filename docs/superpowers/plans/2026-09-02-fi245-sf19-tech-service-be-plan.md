# Plan: SF-19 Đơn dịch vụ kỹ thuật BE

Date: 2026-09-02 | Linear: FI-264 | Worktree: sf-19-tech-be | Spec: docs/superpowers/specs/2026-09-02-fi245-sf19-tech-service-be-design.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BE module đơn dịch vụ kỹ thuật trên stack Postgres mới — 4 bảng (Flyway V6), gRPC TechService (proto additive), BFF REST, seed riêng, buttons flags BE-authoritative.

**Architecture:** Theo pattern SF-2: Java Spring fulfillment-service (Flyway + JdbcTemplate + net.devh gRPC) sở hữu data; BFF Fastify gọi gRPC; seed qua script psql (emptiness-gate). Proto file MỚI additive — không đụng fulfillment.proto.

**Tech Stack:** Java 17/21 + Spring Boot 3.5.5 + Flyway + protobuf 29.3; Node Fastify 5 + ts-proto 2.7.7; Postgres 16.

---

## 0. Root cause analysis

### Root cause
App gốc có module dịch vụ kỹ thuật; stack mới (Postgres + gRPC + BFF) được rebuild từ 0 — module này chưa có BE.

### Current state
Không có bảng/API nào cho đơn giao kỹ thuật + lắp đặt + KTV. SF-20 (FE 3 tab) blocked.

### Expected outcome
List/filter delivery + installation, assign/re-assign KTV + history, suggest theo vùng+workload, buttons flags — data thấy qua psql, tests xanh.

### Constraints & hardships
Proto hiện có bị pin (SF-2); seed-db.sh/reset-db.sh SF-1-owned (chỉ additive); codegen toolchain pins chặt (spike doc).

### High-level strategy
Vertical slice theo pattern đã chứng minh: schema → proto → repo (in-memory trước, postgres sau) → gRPC → seed → BFF → verify end-to-end.

## 1. Problem
BE thiếu toàn bộ data model + APIs cho đơn dịch vụ kỹ thuật; SF-20 không thể build.

## 2. Scope
- **In:** V6 schema (4 bảng); TechService gRPC + regen 4 langs; BFF 4 endpoints; buttons flags; suggest; seed tech-sample.json + seed-db.sh/reset-db.sh additive; unit + IT + contract tests.
- **Out:** FE (SF-20), mobile (SF-25), route optimization, adjust-fee API, Kafka.
- **Success criteria:** ACCEPTANCE context pack — list delivery filter (trạng thái + today default) đúng seed; assign → ghi nhận, re-assign → đổi + history; suggest theo vùng; flags đúng theo trạng thái; psql thấy data; tests xanh.

## 3. Touch map
- Create: `api/proto/hubstore/fulfillment/v1/tech_service.proto` + regen `api/proto/gen/{java,go,ts,python}/**`
- Create: `services/fulfillment-service/src/main/resources/db/migration/V6__tech_service_schema.sql`
- Create: `store/TechModels.java`, `store/TechOrderRepository.java`, `store/InMemoryTechOrderRepository.java`, `store/PostgresTechOrderRepository.java`, `service/TechServiceImpl.java`, `config/TechRepositoryConfig.java`
- Modify: `config/OrderRepositoryConfig.java` (KHÔNG — giữ nguyên; tech beans file riêng `TechRepositoryConfig`)
- Create: `api/seed/tech-sample.json`; Modify additive: `scripts/seed-db.sh`, `scripts/reset-db.sh`
- Create: `services/bff-gateway/src/clients/tech.ts`, `src/routes/tech.ts`, `src/mappers/tech.ts`; Modify: `src/clients/index.ts`, `src/app.ts` (register routes), `src/config.ts` (không cần — dùng grpc.fulfillment addr), `test/harness.ts` + contract test mới
- Consumers/regression: SF-20 FE (sẽ consume); compose flyway CLI + orders-migrate tự nhặt V6; boot-all E2E specs KHÔNG đụng (endpoint mới).

## 4. Design
- **Approach:** proto file mới additive cùng package `hubstore.fulfillment.v1`, service `TechService` — dismiss extend fulfillment.proto (pin SF-2) và BFF-talk-DB trực tiếp (phá layering).
- **10 mã trạng thái** (assumption, REQUIREMENT-GAP đã post FI-245): NEW=0, CONFIRMED=1, PROCESSING=2, SHIPPING=3, DELIVERED=4, FAILED=5, REDELIVERY=6, RESCHEDULED=7, CANCELLED=8, RETURNED=9.
- **Today default:** Java-side — date_from+date_to đều absent → `delivery_date = CURRENT_DATE`; timezone `Asia/Ho_Chi_Minh` qua JVM `-Duser.timezone` (compose env `JAVA_TOOL_OPTIONS`). Seed dùng placeholder `TODAY`/`TODAY-1` → seed-db.sh substitute `CURRENT_DATE [± N]`.
- **Buttons matrix** — xem spec §5. Delivery chỉ trả allowCancel/allowReschedule; assign/reassign/accept chỉ installation. Server ENFORCE assign precondition → FAILED_PRECONDITION.
- **History:** insert CẢ lần đầu (from NULL) — 1 transaction với update.
- **Suggest:** region + activeCount = count(status NOT IN DELIVERED/CANCELLED/RETURNED) asc, seq asc.
- **Edge cases:** page<1→1, pageSize≤0→10; installation date filter → NULL expected_time excluded; JSONB filter via EXISTS jsonb_array_elements; ILIKE ESCAPE '\' cho driver_name.
- **Non-functional:** seed-only writes từ script; index cho các cột filter; phân trang 1 query pattern LATERAL (copy PostgresOrderRepository).

## 5. Implementation outline

Tasks (ordered, DAG):
```
T1 proto+codegen ──┬── T5 grpc-impl ──┐
T2 schema V6 ──────┼── T4 postgres-repo├─ T7 bff ── T8 verify-e2e
T3 models+inmemory ┘                  │
T6 seed (độc lập) ────────────────────┘
```

- **T1** proto + buf lint + regen 4 langs + compile checks
- **T2** Flyway V6 (4 bảng + indexes)
- **T3** TechModels + TechOrderRepository interface + InMemory impl + flags/suggest/assign logic + unit tests
- **T4** PostgresTechOrderRepository (filter SQL 1-query LATERAL, assign transaction) + IT skip-when-no-DB
- **T5** TechServiceImpl @GrpcService (validation, FAILED_PRECONDITION, x-error-details) + unit tests
- **T6** tech-sample.json + seed-db.sh tech block + reset-db.sh 4 bảng
- **T7** BFF client/routes/mappers + harness mock TechService + contract tests
- **T8** Verify ACCEPTANCE: compose up → psql thấy seed → curl filter/assign/suggest → flags matrix → tests full suite

File structure: Java thêm package `store` + `service` hiện có (không package mới). BFF theo routes/clients/mappers hiện có. Seed theo api/seed.

Testing strategy: unit `mvn test` (InMemory + flags matrix + validation); IT `mvn test -Dtest=...IT` skip-when-no-DB; BFF `vitest run` contract qua harness; manual: compose up + psql + curl.

## 6. Risks & unknowns
- Codegen lần đầu chạy ngoài sandbox — binary đã verify có sẵn: `/opt/homebrew/bin/protoc` (29.3), plugins `/tmp/sf1-spikes/bin`, jars `/tmp/sf1-spikes/spike4/jars/`. Nếu thiếu → theo spike doc cài lại.
- ts-proto plugin bin `protoc-gen-ts_proto` — tìm trong node_modules (bff-gateway hoặc root) hoặc `npm i -D ts-proto@2.7.7`.
- Python regen cần venv grpcio-tools 1.83.1 (spike: venv riêng).
- V6 numbering conflict: V2-V5 chưa tồn tại trên nhánh này; Flyway apply V6 ngay sau V1 — hợp lệ.
- 10 mã = assumption (đã ghi REQUIREMENT-GAP).

---

# Tasks

### Task 1: Proto tech_service.proto + codegen 4 languages

**Files:**
- Create: `api/proto/hubstore/fulfillment/v1/tech_service.proto`
- Regen (commit output): `api/proto/gen/{java,go,ts,python}/hubstore/fulfillment/v1/tech_service*`

- [ ] **Step 1: Viết proto file**

```proto
syntax = "proto3";

package hubstore.fulfillment.v1;

option go_package = "hubstore/gen/go/hubstore/fulfillment/v1;fulfillmentv1";
option java_multiple_files = true;
option java_package = "com.hubstore.fulfillment.v1";

// SF-19 (FI-264) — Đơn dịch vụ kỹ thuật. Additive file — KHÔNG đụng fulfillment.proto.
// 10 mã trạng thái (REQUIREMENT-GAP FI-245: assumption, xem spec SF-19 §4).
enum DeliveryStatus {
  NEW = 0;
  CONFIRMED = 1;
  PROCESSING = 2;
  SHIPPING = 3;
  DELIVERED = 4;
  FAILED = 5;
  REDELIVERY = 6;
  RESCHEDULED = 7;
  CANCELLED = 8;
  RETURNED = 9;
}

message GeoPoint {
  double lat = 1;
  double long = 2;
}

message TechItem {
  string code = 1;
  string name = 2;
  int32 quantity = 3;
  string category_l1 = 4;
  string category_l2 = 5;
}

message Contact {
  string name = 1;
  string phone = 2;
  GeoPoint location = 3;
}

// Buttons BE-authoritative — FE render theo flag, không tự suy.
message TechButtons {
  bool allow_cancel = 1;
  bool allow_assign = 2;
  bool allow_reassign = 3;
  bool allow_accept = 4;
  bool allow_reschedule = 5;
}

message DeliveryOrder {
  string code = 1;
  DeliveryStatus status = 2;
  string driver_name = 3;
  string driver_phone = 4;
  Contact receiver = 5;
  Contact sender = 6;
  double fee = 7;
  double tip = 8;
  repeated TechItem items = 9;
  string region_code = 10;
  string province = 11;
  string coordination_json = 12; // JSONB passthrough
  string delivery_date = 13;     // ISO date YYYY-MM-DD
  string created_at = 14;        // ISO-8601
  TechButtons buttons = 15;
}

message InstallationOrder {
  string service_order_code = 1;
  string delivery_order_code = 2;
  string technician_code = 3;
  DeliveryStatus status = 4;
  string expected_time = 5;      // ISO-8601
  string timeline_json = 6;      // JSONB passthrough
  double service_fee = 7;
  double fee_adjust = 8;
  repeated TechItem items = 9;
  string region_code = 10;
  string province = 11;
  string created_at = 12;
  TechButtons buttons = 13;
}

message Technician {
  string code = 1;
  string name = 2;
  string type = 3; // KTV | CTV
  string region_code = 4;
}

message FilterDeliveryOrdersRequest {
  repeated DeliveryStatus statuses = 1;
  string driver_name = 2;
  repeated string category_l1 = 3;
  repeated string category_l2 = 4;
  string region_code = 5;
  string province = 6;
  string date_from = 7; // YYYY-MM-DD; cả from+to absent → today default (server-side)
  string date_to = 8;
  int32 page = 9;
  int32 page_size = 10;
}

message FilterDeliveryOrdersResponse {
  repeated DeliveryOrder items = 1;
  int64 total = 2;
  int32 page = 3;
  int32 page_size = 4;
}

message FilterInstallationOrdersRequest {
  repeated DeliveryStatus statuses = 1;
  string technician_code = 2;
  repeated string category_l1 = 3;
  repeated string category_l2 = 4;
  string region_code = 5;
  string province = 6;
  string date_from = 7; // trên expected_time::date; KHÔNG có today default
  string date_to = 8;
  int32 page = 9;
  int32 page_size = 10;
}

message FilterInstallationOrdersResponse {
  repeated InstallationOrder items = 1;
  int64 total = 2;
  int32 page = 3;
  int32 page_size = 4;
}

message AssignTechnicianRequest {
  string service_order_code = 1;
  string technician_code = 2;
}

message AssignTechnicianResponse {
  InstallationOrder order = 1; // flags re-computed sau assign
}

message SuggestTechniciansRequest {
  string region_code = 1;
}

message SuggestedTechnician {
  string code = 1;
  string name = 2;
  string type = 3;
  int32 active_count = 4;
}

message SuggestTechniciansResponse {
  repeated SuggestedTechnician items = 1;
}

service TechService {
  rpc FilterDeliveryOrders(FilterDeliveryOrdersRequest) returns (FilterDeliveryOrdersResponse);
  rpc FilterInstallationOrders(FilterInstallationOrdersRequest) returns (FilterInstallationOrdersResponse);
  rpc AssignTechnician(AssignTechnicianRequest) returns (AssignTechnicianResponse);
  rpc SuggestTechnicians(SuggestTechniciansRequest) returns (SuggestTechniciansResponse);
}
```

- [ ] **Step 2: buf lint**

```bash
cd api/proto && npx @bufbuild/buf@1.72.0 lint .
```
Expected: 0 findings (ENUM_ZERO_VALUE_SUFFIX đã except trong buf.yaml).

- [ ] **Step 3: Regen Go + Java + TS + Python** (chỉ file mới)

```bash
cd api/proto
# Go
PATH=/tmp/sf1-spikes/bin:$PATH protoc -I . \
  --go_out=gen/go --go_opt=module=hubstore/gen/go \
  --go-grpc_out=gen/go --go-grpc_opt=module=hubstore/gen/go \
  hubstore/fulfillment/v1/tech_service.proto
# Java
protoc -I . --java_out=gen/java \
  --plugin=protoc-gen-grpc-java=/tmp/sf1-spikes/spike4/jars/protoc-gen-grpc-java-1.64.0-osx-aarch_64.exe \
  --grpc-java_out=gen/java hubstore/fulfillment/v1/tech_service.proto
# TS (ts-proto — tìm bin trong node_modules trước; fallback: npm i -D ts-proto@2.7.7 tại repo root)
protoc -I . --plugin=protoc-gen-ts_proto=<path>/protoc-gen-ts_proto \
  --ts_proto_out=gen/ts --ts_proto_opt=outputServices=grpc-js \
  --ts_proto_opt=forceLong=number --ts_proto_opt=esModuleInterop=true \
  hubstore/fulfillment/v1/tech_service.proto
# Python (venv grpcio-tools==1.83.1 — tạo nếu chưa có: python3 -m venv /tmp/ts-venv && /tmp/ts-venv/bin/pip install grpcio-tools==1.83.1)
/tmp/ts-venv/bin/python -m grpc_tools.protoc -I . \
  --python_out=gen/python --grpc_python_out=gen/python hubstore/fulfillment/v1/tech_service.proto
```

- [ ] **Step 4: Compile checks**

```bash
cd api/proto/gen/go && go build ./...
cd ../../.. && (cd services/bff-gateway && npm run build)   # tsc --noEmit nhặt tech_service.ts
find api/proto/gen/python -name 'tech_service*' -exec python3 -m py_compile {} +
# Java compile qua Task 5 mvn (chưa có impl) — tối thiểu: mvn -q compile trong fulfillment-service
(cd services/fulfillment-service && mvn -q compile)
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add api/proto/hubstore/fulfillment/v1/tech_service.proto api/proto/gen/
git commit -m "feat(fi245-sf19): proto TechService additive + regen 4 langs"
```

### Task 2: Flyway V6__tech_service_schema.sql

**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V6__tech_service_schema.sql`

- [ ] **Step 1: Viết migration** (conventions V1: BIGSERIAL PK, VARCHAR, TIMESTAMPTZ, JSONB, snake_case)

```sql
-- SF-19 (FI-264) — đơn dịch vụ kỹ thuật: delivery_orders + installation_orders
-- + installation_assignment_history + technicians. Conventions theo V1__orders_schema.sql.

CREATE TABLE delivery_orders (
  id             BIGSERIAL PRIMARY KEY,
  code           VARCHAR NOT NULL UNIQUE,
  status         VARCHAR NOT NULL,
  driver_name    VARCHAR,
  driver_phone   VARCHAR,
  receiver_name  VARCHAR NOT NULL,
  receiver_phone VARCHAR NOT NULL,
  receiver_lat   DOUBLE PRECISION,
  receiver_long  DOUBLE PRECISION,
  sender_name    VARCHAR NOT NULL,
  sender_phone   VARCHAR NOT NULL,
  sender_lat     DOUBLE PRECISION,
  sender_long    DOUBLE PRECISION,
  fee            DOUBLE PRECISION NOT NULL DEFAULT 0,
  tip            DOUBLE PRECISION NOT NULL DEFAULT 0,
  items          JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_code    VARCHAR,
  province       VARCHAR,
  coordination   JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_date  DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_delivery_orders_status ON delivery_orders(status);
CREATE INDEX idx_delivery_orders_delivery_date ON delivery_orders(delivery_date);
CREATE INDEX idx_delivery_orders_region ON delivery_orders(region_code);
CREATE INDEX idx_delivery_orders_province ON delivery_orders(province);

CREATE TABLE installation_orders (
  id                  BIGSERIAL PRIMARY KEY,
  service_order_code  VARCHAR NOT NULL UNIQUE,
  delivery_order_code VARCHAR,
  technician_code     VARCHAR,
  status              VARCHAR NOT NULL,
  expected_time       TIMESTAMPTZ,
  timeline            JSONB NOT NULL DEFAULT '[]'::jsonb,
  service_fee         DOUBLE PRECISION NOT NULL DEFAULT 0,
  fee_adjust          DOUBLE PRECISION NOT NULL DEFAULT 0,
  items               JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_code         VARCHAR,
  province            VARCHAR,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_installation_orders_status ON installation_orders(status);
CREATE INDEX idx_installation_orders_technician ON installation_orders(technician_code);
CREATE INDEX idx_installation_orders_delivery_code ON installation_orders(delivery_order_code);
CREATE INDEX idx_installation_orders_region ON installation_orders(region_code);
CREATE INDEX idx_installation_orders_province ON installation_orders(province);

-- Deviation khỏi V1: không FK ON DELETE CASCADE (không có delete path) — xem spec §3.3.
CREATE TABLE installation_assignment_history (
  id                    BIGSERIAL PRIMARY KEY,
  service_order_code    VARCHAR NOT NULL,
  from_technician_code  VARCHAR,
  to_technician_code    VARCHAR NOT NULL,
  changed_by            VARCHAR NOT NULL,
  changed_at            TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_installation_assignment_history_so ON installation_assignment_history(service_order_code);

CREATE TABLE technicians (
  id          BIGSERIAL PRIMARY KEY,
  seq         BIGSERIAL UNIQUE,
  code        VARCHAR NOT NULL UNIQUE,
  name        VARCHAR NOT NULL,
  type        VARCHAR NOT NULL CHECK (type IN ('KTV','CTV')),
  region_code VARCHAR NOT NULL
);
```

- [ ] **Step 2: Verify apply thủ công**

```bash
docker compose up -d postgres && bash scripts/wait-db.sh
docker compose run --rm orders-migrate   # flyway CLI tự nhặt V6
docker compose exec -T postgres psql -U hubstore -d fulfillment -c '\dt' | grep -E 'delivery_orders|installation|technicians'
```
Expected: 4 bảng xuất hiện; flyway_schema_history có row version 6.

- [ ] **Step 3: Commit**

```bash
git add services/fulfillment-service/src/main/resources/db/migration/V6__tech_service_schema.sql
git commit -m "feat(fi245-sf19): Flyway V6 tech service schema (4 bảng)"
```

### Task 3: Java models + repository interface + InMemory impl + unit tests

**Files:**
- Create: `src/main/java/com/hubstore/fulfillment/store/TechModels.java`
- Create: `src/main/java/com/hubstore/fulfillment/store/TechOrderRepository.java`
- Create: `src/main/java/com/hubstore/fulfillment/store/InMemoryTechOrderRepository.java`
- Test: `src/test/java/com/hubstore/fulfillment/TechServiceLogicTest.java`

- [ ] **Step 1: TechModels.java** — records + flags matrix + suggest logic (pure, testable)

```java
package com.hubstore.fulfillment.store;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

/** Domain models + BE-authoritative button logic cho SF-19 (spec §5). */
public final class TechModels {
  private TechModels() {}

  public static final Set<String> ACTIVE_EXCLUDED = Set.of("DELIVERED", "CANCELLED", "RETURNED");

  public record TechItem(String code, String name, int quantity, String categoryL1, String categoryL2) {}
  public record Contact(String name, String phone, Double lat, Double lon) {}
  public record TechButtons(boolean allowCancel, boolean allowAssign, boolean allowReassign,
                            boolean allowAccept, boolean allowReschedule) {}
  public record DeliveryOrder(String code, String status, String driverName, String driverPhone,
      Contact receiver, Contact sender, double fee, double tip, List<TechItem> items,
      String regionCode, String province, String coordinationJson, LocalDate deliveryDate,
      OffsetDateTime createdAt) {}
  public record InstallationOrder(String serviceOrderCode, String deliveryOrderCode,
      String technicianCode, String status, OffsetDateTime expectedTime, String timelineJson,
      double serviceFee, double feeAdjust, List<TechItem> items, String regionCode,
      String province, OffsetDateTime createdAt) {}
  public record Technician(String code, String name, String type, String regionCode) {}
  public record AssignmentHistoryEntry(String serviceOrderCode, String fromTechnicianCode,
      String toTechnicianCode, String changedBy, OffsetDateTime changedAt) {}
  public record SuggestedTechnician(Technician technician, int activeCount) {}

  public record DeliveryFilter(List<String> statuses, String driverName, List<String> categoryL1,
      List<String> categoryL2, String regionCode, String province, LocalDate dateFrom,
      LocalDate dateTo, int page, int pageSize) {}
  public record InstallationFilter(List<String> statuses, String technicianCode,
      List<String> categoryL1, List<String> categoryL2, String regionCode, String province,
      LocalDate dateFrom, LocalDate dateTo, int page, int pageSize) {}
  public record DeliveryPage(List<DeliveryOrder> items, long total) {}
  public record InstallationPage(List<InstallationOrder> items, long total) {}

  /** Buttons matrix — spec §5. Delivery chỉ allowCancel/allowReschedule. */
  public static TechButtons deliveryButtons(DeliveryOrder o) {
    return new TechButtons(cancellable(o.status()), false, false, false,
        reschedulable(o.status()));
  }

  public static TechButtons installationButtons(InstallationOrder o) {
    boolean assigned = o.technicianCode() != null && !o.technicianCode().isBlank();
    return new TechButtons(
        cancellable(o.status()),
        !assigned && assignableStatus(o.status()),
        assigned && reassignableStatus(o.status()),
        assigned && "CONFIRMED".equals(o.status()),
        reschedulable(o.status()));
  }

  static boolean cancellable(String s) {
    return Set.of("NEW","CONFIRMED","PROCESSING","REDELIVERY","RESCHEDULED").contains(s);
  }
  static boolean reschedulable(String s) {
    return Set.of("NEW","CONFIRMED","REDELIVERY","RESCHEDULED").contains(s);
  }
  static boolean assignableStatus(String s) {
    return Set.of("NEW","CONFIRMED","REDELIVERY","RESCHEDULED").contains(s);
  }
  static boolean reassignableStatus(String s) {
    return Set.of("CONFIRMED","PROCESSING","REDELIVERY","RESCHEDULED").contains(s);
  }
}
```

- [ ] **Step 2: TechOrderRepository.java**

```java
package com.hubstore.fulfillment.store;

import java.util.List;
import java.util.Optional;

public interface TechOrderRepository {
  TechModels.DeliveryPage filterDelivery(TechModels.DeliveryFilter filter);
  TechModels.InstallationPage filterInstallation(TechModels.InstallationFilter filter);
  Optional<TechModels.InstallationOrder> findInstallation(String serviceOrderCode);
  Optional<TechModels.Technician> findTechnician(String code);
  /** Assign/re-assign: update technician_code + insert history (from NULL khi lần đầu) trong 1 transaction. Enforce assignableStatus → IllegalStateException. */
  TechModels.InstallationOrder assignTechnician(String serviceOrderCode, String technicianCode,
      String changedBy, java.time.Instant changedAt);
  List<TechModels.SuggestedTechnician> suggestTechnicians(String regionCode);
}
```

- [ ] **Step 3: InMemoryTechOrderRepository.java** — constructor nhận seed lists (test nạp từ tech-sample.json qua Jackson); logic filter/suggest/assign giữ đúng semantics (suggest: activeCount theo ACTIVE_EXCLUDED, sort activeCount asc rồi seq asc — InMemory giữ list order làm seq proxy; assign: kiểm findInstallation + findTechnician + assignableStatus, replace technician, append history).

Viết đủ ~150 lines theo interface; filter: status/date/region/province/driver ILIKE contains/category contains trong items — mọi filter null/empty = bỏ qua; page 1-based, pageSize default 10, total trước paginate.

- [ ] **Step 4: Failing tests trước** (`TechServiceLogicTest.java`) — load `../../api/seed/tech-sample.json` (Jackson → TechModels records; deliveryDate field hỗ trợ placeholder resolved ở seed script, unit test đọc trực tiếp giá trị TODAY sẽ fail → TechSeedLoader helper trong main `seed/TechSeedLoader.java` resolve TODAY/TODAY-N theo LocalDate.now() — dùng chung cho test):

Test cases (AssertJ, pattern FilterAndHydrationTest + CollectingObserver):
1. `filterDelivery_noDates_defaultsToToday` — filter không date → thấy đúng các đơn seed TODAY (resolve = today)
2. `filterDelivery_byStatus_and_dateRange` — statuses=[SHIPPING] + date from/to hôm nay → chỉ đơn SHIPPING
3. `filterDelivery_categoryL2_jsonb` — category L2 lọc đúng từ items JSON
4. `filterInstallation_byTechnician_and_nullExpectedTime_excluded` — date filter loại row expected_time NULL
5. `installationButtons_matrix` — bảng 10 trạng thái × assigned/not → assert từng flag (matrix spec §5)
6. `deliveryButtons_noAssignFlags` — delivery luôn false 3 flag assign
7. `assignTechnician_first_time_history_from_null` — history row from=NULL; technician_code đổi
8. `assignTechnician_reassign_history_from_to` — 2 rows, row 2 from→to
9. `assignTechnician_wrong_status_throws` — status DELIVERED → IllegalStateException
10. `suggest_by_region_workload_asc` — KTV vùng X có ít đơn active đứng trước; đơn DELIVERED/CANCELLED không tính

- [ ] **Step 5: Chạy `mvn test`** — InMemory impl pass; Postgres repo chưa có → config phải chưa wire (chưa tạo TechRepositoryConfig — để Task 4).
- [ ] **Step 6: Commit** `feat(fi245-sf19): tech domain models + in-memory repo + flags/suggest/assign logic + tests`

### Task 4: PostgresTechOrderRepository + IT

**Files:**
- Create: `src/main/java/com/hubstore/fulfillment/store/PostgresTechOrderRepository.java`
- Create: `src/main/java/com/hubstore/fulfillment/config/TechRepositoryConfig.java`
- Test: `src/test/java/com/hubstore/fulfillment/PostgresTechOrderRepositoryIT.java`

- [ ] **Step 1: PostgresTechOrderRepository** — JdbcTemplate, pattern PostgresOrderRepository:
  - Filter 1 query LATERAL: `SELECT c.total_all, d.* FROM (SELECT count(*) FROM delivery_orders <where>) c LEFT JOIN LATERAL (SELECT ... FROM delivery_orders <where> ORDER BY id OFFSET ? LIMIT ?) d ON TRUE`
  - WHERE builder: statuses IN, driver_name ILIKE ? ESCAPE '\', region/province =, date range trên delivery_date, category: `EXISTS (SELECT 1 FROM jsonb_array_elements(items) it WHERE it->>'categoryL1' = ANY(?))` (L2 tương ứng)
  - Delivery date params: `LocalDate` qua `java.sql.Date.valueOf`
  - Installation filter tương ứng + date trên `expected_time::date` (NULL excluded tự nhiên)
  - items JSONB: `items::text` → Jackson List<TechItem>; timeline/coordination passthrough text
  - assignTechnician `@Transactional`: SELECT ... FOR UPDATE installation, validate status → IllegalStateException, UPDATE technician_code, INSERT history (from = current hoặc NULL)
  - suggestTechnicians: 1 query `LEFT JOIN (SELECT technician_code, count(*) cnt FROM installation_orders WHERE technician_code IS NOT NULL AND status NOT IN ('DELIVERED','CANCELLED','RETURNED') GROUP BY technician_code) w ON ... WHERE t.region_code = ? ORDER BY COALESCE(w.cnt,0) ASC, t.seq ASC`
- [ ] **Step 2: TechRepositoryConfig.java** — 2 bean `@ConditionalOnProperty(name="fulfillment.store", havingValue="postgres", matchIfMissing=true)` / `inmemory` trả TechOrderRepository tương ứng (InMemory nhận seed tech-sample qua `TechSeedLoader`).
- [ ] **Step 3: IT** — copy pattern PostgresOrderRepositoryIT: `connectOrSkip()` (Assumptions.abort khi không DB/unmigrated/trống), parity vs InMemory trên cùng seed, mutating test snapshot/restore. Run: `mvn test -Dtest=PostgresTechOrderRepositoryIT` (cần postgres compose lên + migrated + seeded).
- [ ] **Step 4: `mvn test` toàn bộ PASS; commit** `feat(fi245-sf19): PostgresTechOrderRepository + config wiring + IT`

### Task 5: TechServiceImpl @GrpcService

**Files:**
- Create: `src/main/java/com/hubstore/fulfillment/service/TechServiceImpl.java`
- Test: mở rộng `TechServiceLogicTest` hoặc `TechGrpcValidationTest.java`

- [ ] **Step 1: TechServiceImpl** — `@GrpcService extends TechServiceGrpc.TechServiceImplBase`, constructor inject TechOrderRepository + ObjectMapper. Mapping proto ↔ models:
  - `filterDeliveryOrders`: request → DeliveryFilter (statuses enum→name, dates parse LocalDate hoặc null, defaults page/pageSize như FulfillmentServiceImpl); today-default áp REPO-side khi date_from+date_to null (repo nhận null/null → CURRENT_DATE); response items map + `TechModels.deliveryButtons`
  - `filterInstallationOrders`: tương tự + timelineJson passthrough
  - `assignTechnician`: SO blank hoặc technician blank → `GrpcErrors.invalidArgument`; catch IllegalStateException → `Status.FAILED_PRECONDITION.withDescription(...)`; repo not found → `GrpcErrors.notFound("serviceOrderCode", code)`; response = order + installationButtons re-computed
  - `suggestTechnicians`: region blank → invalidArgument; map SuggestedTechnician
  - Error pattern: try/catch StatusRuntimeException → onError; RuntimeException → INTERNAL (copy FulfillmentServiceImpl)
- [ ] **Step 2: Tests** — CollectingObserver pattern: invalidArgument cho blank params; FAILED_PRECONDITION cho assign sai trạng thái (InMemory repo seeded); NOT_FOUND cho SO lạ; happy-path assign response flags đúng.
- [ ] **Step 3: `mvn test` PASS; `mvn -q compile` sau codegen (Task 1) — TechServiceGrpc class có mặt; commit** `feat(fi245-sf19): TechServiceImpl gRPC + validation + tests`

### Task 6: Seed tech-sample.json + pipeline additive

**Files:**
- Create: `api/seed/tech-sample.json`
- Modify: `scripts/seed-db.sh` (thêm block cuối, KHÔNG đụng block cũ), `scripts/reset-db.sh` (thêm DO block 4 bảng)

- [ ] **Step 1: tech-sample.json** — 3 arrays:
  - `technicians`: 6 (KTV-001..004, CTV-001..002; vùng R1×4, R2×2; seq 1..6)
  - `deliveryOrders`: 10 — đủ 10 trạng thái (mỗi mã 1 đơn); code TD-0001..; receiver/sender tên+SĐT+lat/long quanh HCM (10.77/106.69 ±); items 1-2 món có categoryL1/categoryL2 (2 nhóm ngành); deliveryDate: 9 đơn `"TODAY"`, 1 đơn `"TODAY-1"`; coordination `{}` hoặc ghi chú phối hợp lắp
  - `installationOrders`: 8 — SO-0001..; 3 đơn chưa assign (status NEW/CONFIRMED/RESCHEDULED), 5 đã assign theo technician vùng tương ứng; 1 đơn expectedTime null; timeline JSONB mẫu 2-3 entry; serviceFee/feeAdjust số; deliveryOrderCode tham chiếu TD-* có thật
- [ ] **Step 2: seed-db.sh — thêm block sau block batching (additive):**

```bash
SEED_TECH_JSON="${SEED_TECH_JSON:-$ROOT/api/seed/tech-sample.json}"
if [[ -f "$SEED_TECH_JSON" ]]; then
echo "seed-db: nạp tech service ← $(basename "$SEED_TECH_JSON") ..."
psql_cmd -d fulfillment -v ON_ERROR_STOP=1 \
  -v tech_json="$(cat "$SEED_TECH_JSON")" <<'SQL'
SELECT to_regclass('public.technicians') IS NULL
    OR to_regclass('public.delivery_orders') IS NULL
    OR to_regclass('public.installation_orders') IS NULL AS missing \gset
\if :missing
DO $err$ BEGIN
  RAISE EXCEPTION 'fulfillment: thiếu bảng tech (technicians/delivery_orders/installation_orders) — chạy migration trước (Flyway V6)';
END $err$;
\endif
SELECT EXISTS (SELECT 1 FROM public.technicians) AS has_tech \gset
\if NOT :has_tech
INSERT INTO public.technicians (seq, code, name, type, region_code)
SELECT (t->>'seq')::bigint, t->>'code', t->>'name', t->>'type', t->>'regionCode'
FROM jsonb_array_elements(:'tech_json'::jsonb->'technicians') AS t;
\echo 'tech: seeded technicians'
\else
\echo 'tech: technicians đã có data — bỏ qua (emptiness-gate)'
\endif
SELECT EXISTS (SELECT 1 FROM public.delivery_orders) AS has_del \gset
\if NOT :has_del
INSERT INTO public.delivery_orders (
  code, status, driver_name, driver_phone,
  receiver_name, receiver_phone, receiver_lat, receiver_long,
  sender_name, sender_phone, sender_lat, sender_long,
  fee, tip, items, region_code, province, coordination, delivery_date)
SELECT
  o->>'code', o->>'status', o->>'driverName', o->>'driverPhone',
  o->'receiver'->>'name', o->'receiver'->>'phone',
  (o->'receiver'->>'lat')::double precision, (o->'receiver'->>'long')::double precision,
  o->'sender'->>'name', o->'sender'->>'phone',
  (o->'sender'->>'lat')::double precision, (o->'sender'->>'long')::double precision,
  (o->>'fee')::double precision, (o->>'tip')::double precision,
  o->'items', o->>'regionCode', o->>'province', o->'coordination',
  CASE o->>'deliveryDate'
    WHEN 'TODAY' THEN CURRENT_DATE
    WHEN 'TODAY-1' THEN CURRENT_DATE - 1
    ELSE (o->>'deliveryDate')::date END
FROM jsonb_array_elements(:'tech_json'::jsonb->'deliveryOrders') AS o;
\echo 'tech: seeded delivery_orders (deliveryDate TODAY → CURRENT_DATE)'
\else
\echo 'tech: delivery_orders đã có data — bỏ qua'
\endif
SELECT EXISTS (SELECT 1 FROM public.installation_orders) AS has_ins \gset
\if NOT :has_ins
INSERT INTO public.installation_orders (
  service_order_code, delivery_order_code, technician_code, status,
  expected_time, timeline, service_fee, fee_adjust, items, region_code, province)
SELECT
  i->>'serviceOrderCode', i->>'deliveryOrderCode', i->>'technicianCode', i->>'status',
  NULLIF(i->>'expectedTime','')::timestamptz,
  i->'timeline',
  (i->>'serviceFee')::double precision, (i->>'feeAdjust')::double precision,
  i->'items', i->>'regionCode', i->>'province'
FROM jsonb_array_elements(:'tech_json'::jsonb->'installationOrders') AS i;
\echo 'tech: seeded installation_orders'
\else
\echo 'tech: installation_orders đã có data — bỏ qua'
\endif
SQL
fi
```
Per-table emptiness gate + fail-loud to_regclass riêng (spec §7). KHÔNG sửa block cũ.

- [ ] **Step 3: reset-db.sh — thêm DO block trước keycloak section:**

```bash
echo "reset-db: TRUNCATE DB fulfillment (tech) ..."
psql_cmd -d fulfillment -v ON_ERROR_STOP=1 <<'SQL'
DO $reset$
BEGIN
  IF to_regclass('public.delivery_orders') IS NULL
     OR to_regclass('public.installation_orders') IS NULL
     OR to_regclass('public.installation_assignment_history') IS NULL
     OR to_regclass('public.technicians') IS NULL THEN
    RAISE EXCEPTION 'fulfillment: thiếu bảng tech — chạy migration trước (Flyway V6)';
  END IF;
  TRUNCATE public.delivery_orders, public.installation_orders,
           public.installation_assignment_history, public.technicians RESTART IDENTITY;
END
$reset$;
SQL
```

- [ ] **Step 4: Verify** — `bash scripts/reset-db.sh` → psql count: technicians=6, delivery_orders=10, installation_orders=8, history=0; `SELECT DISTINCT delivery_date FROM delivery_orders` = [hôm nay, hôm qua].
- [ ] **Step 5: Commit** `feat(fi245-sf19): seed tech-sample + pipeline additive (seed-db/reset-db)`

### Task 7: BFF client + routes + mappers + contract tests

**Files:**
- Create: `src/clients/tech.ts`, `src/routes/tech.ts`, `src/mappers/tech.ts`
- Modify: `src/clients/index.ts` (export), `src/app.ts` (register + harness deps), `test/harness.ts` (mock TechServiceService), `test/fixtures.ts`
- Test: `test/tech.contract.test.ts`

- [ ] **Step 1: clients/tech.ts** — pattern fulfillment.ts: interface `TechApi { filterDeliveryOrders(req, role); filterInstallationOrders(req, role); assignTechnician(req, role); suggestTechnicians(req, role); close(); }`; factory `createTechClient(addr, deadlineMs)` dùng `callUnary` từ grpc.ts, service def `TechServiceService` từ `../../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service.js`.
- [ ] **Step 2: mappers/tech.ts** — `mapDeliveryOrder`, `mapInstallationOrder` (timelineJson → `timeline: JSON.parse` guarded try), `mapSuggestedTechnician`, `mapTechButtons` (snake→camel).
- [ ] **Step 3: routes/tech.ts** — `registerTechRoutes(app, deps: { tech: TechApi })`:

```typescript
app.post("/delivery-orders/filter", async (req, reply) => {
  const { role } = requireUser(req);
  const resp = await deps.tech.filterDeliveryOrders(req.body ?? {}, role);
  return reply.send(paginated(resp.items.map(mapDeliveryOrder), Number(resp.total), resp.page, resp.pageSize));
});
app.post("/service-orders/filter", ...);   // installation
app.post("/service-orders/:code/assign", ...);  // body { technicianCode } → assignTechnician({ serviceOrderCode: code, technicianCode })
app.get("/technicians/suggest", ...);      // query regionCode → sendGrpcError / reply.send({ items: [...] })
```
Mọi route: try/catch `sendGrpcError(reply, err, SERVICE_NAMES.fulfillment)`. Register trong app.ts (deps tech client tạo từ `config.grpc.fulfillment` — cùng addr fulfillment service).
- [ ] **Step 4: harness.ts** — thêm mock server `TechServiceService` + `h.tech` (pattern h.fulfillment: override per-test). fixtures: `techResponses` (1 delivery item + buttons, 1 installation + timeline, suggest 2 items).
- [ ] **Step 5: tech.contract.test.ts** — auth 401 không token; POST /delivery-orders/filter → 200 paginated envelope `{items,total,page,pageSize}` buttons camelCase; POST /service-orders/filter timeline parse; assign → 200 + gọi đúng gRPC args; assign FAILED_PRECONDITION → 503? — NO: mapping grpc-error.ts hiện có: FAILED_PRECONDITION chưa có case → thêm explicit mapping **422 VALIDATION_ERROR**? Quy ước: FAILED_PRECONDITION = trạng thái sai → 409 CONFLICT (thêm 1 case vào sendGrpcError + test); INVALID_ARGUMENT → 422; NOT_FOUND SO → 404; suggest → 200 items; upstream chết → 503.
- [ ] **Step 6: `npm test` (vitest) PASS + `npm run build` PASS; commit** `feat(fi245-sf19): BFF tech client + routes + mappers + contract tests`

### Task 8: Verify ACCEPTANCE end-to-end

**Files:** không có code mới (chỉ verify + fix nếu bắt lỗi).

- [ ] **Step 1: Boot chain** — `docker compose up -d postgres keycloak && bash scripts/wait-db.sh && docker compose run --rm orders-migrate && bash scripts/seed-db.sh` → psql: `SELECT count(*) FROM delivery_orders` = 10; `technicians` = 6; `installation_orders` = 8.
- [ ] **Step 2: Boot fulfillment-service + BFF** — `cd services/fulfillment-service && ./run.sh run &` (Flyway on-boot idempotent), `cd services/bff-gateway && npm run dev &`. Health: grpc smoke qua `./run.sh smoke` nếu có.
- [ ] **Step 3: ACCEPTANCE 1 — list delivery filter:** POST /delivery-orders/filter `{}` (token Coordinator) → 10 items (today default), envelope có total/page/pageSize; `{"statuses":["SHIPPING"]}` → đúng đơn seed SHIPPING; so sánh từng field với seed JSON + psql row.
- [ ] **Step 4: ACCEPTANCE 2 — assign + re-assign + history:** POST /service-orders/SO-0003/assign `{technicianCode:"KTV-001"}` → 200, psql: installation_orders.technician_code đổi + history 1 row from NULL; assign lại KTV-002 → history 2 rows (from KTV-001 → KTV-002); assign trên đơn DELIVERED → 409.
- [ ] **Step 5: ACCEPTANCE 3 — suggest + flags:** GET /technicians/suggest?regionCode=R1 → candidates vùng R1 sort workload asc (activeCount đúng theo psql query đối chiếu); buttons flags: đơn NEW chưa assign → allowAssign=true; đơn đã assign CONFIRMED → allowReassign+allowAccept=true, allowAssign=false; delivery đơn PROCESSING → allowCancel=true, allowAssign=false.
- [ ] **Step 6: ACCEPTANCE 4 — tests xanh:** `cd services/fulfillment-service && mvn test` + `cd services/bff-gateway && npm test` + IT với DB: `mvn test -Dtest=PostgresTechOrderRepositoryIT`.
- [ ] **Step 7: Commit bất kỳ fix (nếu có); report evidence từng dòng ACCEPTANCE.**
