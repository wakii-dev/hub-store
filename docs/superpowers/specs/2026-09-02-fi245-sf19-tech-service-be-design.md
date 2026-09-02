# SF-19 — Đơn dịch vụ kỹ thuật BE — Design (FI-264, story FI-245)

Date: 2026-09-02 · Tier: Full · Deps: SF-2 (done) · Context pack: docs/superpowers/contexts/fi245-sf-19.md
Status: Approved (autonomous self-review passed — user pre-authorized full checklist run; epic questions closed, REQUIREMENT-GAP riêng đã post)

## 0. Root cause & strategy

App gốc có module "đơn dịch vụ kỹ thuật" (3 tab Giao hàng/Lắp đặt/KTV-CTV) nhưng stack mới (Postgres + gRPC + BFF) chưa có BE cho module này. SF-20 (FE) phụ thuộc. Strategy: tái dựng theo đúng pattern SF-2 đã thiết lập — Flyway migration trong DB `fulfillment`, gRPC service mới additive, BFF REST wrapper, seed file riêng.

## 1. Problem

BE thiếu toàn bộ data model + APIs cho đơn dịch vụ kỹ thuật: list giao hàng, list lắp đặt, assign/re-assign KTV, suggest KTV, timelines, buttons flags BE-authoritative.

## 2. Scope

**In:**
- Flyway `V6__tech_service_schema.sql` (DB fulfillment): `delivery_orders`, `installation_orders`, `installation_assignment_history`, `technicians`
- gRPC `TechService` (proto file MỚI additive) + Java impl + unit/IT tests
- BFF REST: `/delivery-orders/*`, `/service-orders/*`, `/technicians/*`
- Seed `api/seed/tech-sample.json` + extend `scripts/seed-db.sh` + `scripts/reset-db.sh` (additive)
- Buttons flags BE-authoritative per record

**Out (boundary):**
- FE (SF-20), app mobile KTV (SF-25) — accept/complete chỉ ở mức API + flags
- Tối ưu lộ trình KTV — suggest đơn giản (region + workload)
- Đổi fulfillment.proto / endpoint / shape hiện có
- Adjust service-fee API (chỉ schema fields + trả trong response)
- Kafka side-channel (SF-27 riêng; KHÔNG vào path nghiệp vụ)

## 3. Data model (V6, DB fulfillment — conventions theo V1)

### 3.1 delivery_orders
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| code | VARCHAR UNIQUE NOT NULL | e.g. `TD-0001` (đơn giao kỹ thuật) |
| status | VARCHAR NOT NULL | 1 trong 10 mã (mục 4) |
| driver_name, driver_phone | VARCHAR | NVC phụ trách giao |
| receiver_name, receiver_phone | VARCHAR NOT NULL | |
| receiver_lat, receiver_long | DOUBLE PRECISION | |
| sender_name, sender_phone | VARCHAR NOT NULL | |
| sender_lat, sender_long | DOUBLE PRECISION | |
| fee | DOUBLE PRECISION NOT NULL DEFAULT 0 | phí giao |
| tip | DOUBLE PRECISION NOT NULL DEFAULT 0 | khuyến khích |
| items | JSONB NOT NULL DEFAULT '[]' | `[{code, name, quantity, categoryL1, categoryL2}]` |
| region_code | VARCHAR | |
| province | VARCHAR | |
| coordination | JSONB NOT NULL DEFAULT '{}' | ghi chú phối hợp giao+lắp |
| delivery_date | DATE NOT NULL | mặc định filter "hôm nay" theo cột này |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
Indexes: status, delivery_date, region_code, province, driver_name.

### 3.2 installation_orders
| column | type | notes |
|---|---|---|
| id | BIGSERIAL PK | |
| service_order_code | VARCHAR UNIQUE NOT NULL | mã SO, e.g. `SO-0001` |
| delivery_order_code | VARCHAR | liên quan đơn giao (nullable, index) |
| technician_code | VARCHAR | NULL = chưa assign |
| status | VARCHAR NOT NULL | cùng 10 mã lifecycle lắp đặt |
| expected_time | TIMESTAMPTZ | thời gian dự kiến lắp |
| timeline | JSONB NOT NULL DEFAULT '[]' | `[{at, status, note, actor}]` — READ-only ở SF-19 |
| service_fee | DOUBLE PRECISION NOT NULL DEFAULT 0 | payout KTV |
| fee_adjust | DOUBLE PRECISION NOT NULL DEFAULT 0 | điều chỉnh |
| items | JSONB NOT NULL DEFAULT '[]' | ngành hàng L1/L2 để filter |
| region_code, province | VARCHAR | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
Indexes: status, technician_code, service_order_code (unique), delivery_order_code, region_code, province.

### 3.3 installation_assignment_history
id BIGSERIAL PK · service_order_code VARCHAR NOT NULL · from_technician_code VARCHAR · to_technician_code VARCHAR NOT NULL · changed_by VARCHAR NOT NULL · changed_at TIMESTAMPTZ NOT NULL · index (service_order_code).

### 3.4 technicians
id BIGSERIAL PK · seq BIGSERIAL (giữ thứ tự seed, pattern V1 regions/delivery_staff) · code VARCHAR UNIQUE NOT NULL · name VARCHAR NOT NULL · type VARCHAR NOT NULL CHECK in ('KTV','CTV') · region_code VARCHAR NOT NULL.

## 4. 10 mã trạng thái giao (REQUIREMENT-GAP đã post FI-245)

`NEW → CONFIRMED → PROCESSING → SHIPPING → DELIVERED` · nhánh: `FAILED → REDELIVERY` · `RESCHEDULED` · `CANCELLED` · `RETURNED`

Proto enum `DeliveryStatus` (zero value = NEW, buf lint ENUM_ZERO_VALUE_SUFFIX đã tắt — zero values là domain codes). Applies cho cả delivery_orders.status và installation_orders.status.

## 5. Buttons flags BE-authoritative (computed trong service layer, trả kèm mỗi record)

| Flag | Điều kiện |
|---|---|
| allowCancel | status ∈ {NEW, CONFIRMED, PROCESSING, REDELIVERY, RESCHEDULED} |
| allowAssign | technician_code IS NULL (installation) / driver chưa có (delivery) AND status ∈ {NEW, CONFIRMED, REDELIVERY, RESCHEDULED} |
| allowReassign | technician_code IS NOT NULL AND status ∈ {CONFIRMED, PROCESSING, REDELIVERY, RESCHEDULED} |
| allowAccept | technician_code IS NOT NULL AND status = CONFIRMED (KTV nhận việc) |
| allowReschedule | status ∈ {NEW, CONFIRMED, REDELIVERY, RESCHEDULED} |

KHÔNG mutate status từ SF-19 (accept/complete flow là SF-25; SF-19 chỉ đọc + assign). Flags = boolean struct trả trong response.

## 6. APIs

### 6.1 gRPC — file mới `api/proto/hubstore/fulfillment/v1/tech_service.proto` (package giữ nguyên, service `TechService`)
- `FilterDeliveryOrders(FilterDeliveryOrdersRequest) → (items, total, page, page_size)` — filter: repeated statuses, driver_name (NV), repeated categoryL1/L2 (JSONB EXISTS), region_code, province, date_from/date_to (delivery_date), page/page_size. Item: mọi cột + buttons flags.
- `FilterInstallationOrders(...)` — filter: repeated statuses, technician_code, repeated categoryL1/L2, region_code, province, date_from/date_to (expected_time::date), page/page_size. Item: mọi cột + timeline + buttons.
- `AssignTechnician(AssignTechnicianRequest{service_order_code, technician_code}) → InstallationOrder` — insert history (from→to khi re-assign), update technician_code; validation: SO không tồn tại → NOT_FOUND; KTV không tồn tại → INVALID_ARGUMENT.
- `SuggestTechnicians(SuggestTechniciansRequest{region_code}) → repeated candidates {code, name, type, activeCount}` — technicians theo region, activeCount = count installation_orders có technician_code + status NOT IN (DELIVERED, CANCELLED, RETURNED), ORDER BY activeCount ASC, seq ASC.
- Pagination inline `{items, total, page, page_size}` (pattern SF-2/SF-7, map 1:1 `{items,total,page,pageSize}`).

### 6.2 BFF REST (routes/tech.ts + clients/tech.ts + mappers/tech.ts)
- `POST /delivery-orders/filter` → paginated envelope
- `POST /service-orders/filter` → paginated envelope
- `POST /service-orders/:code/assign` body `{ technicianCode }`
- `GET /technicians/suggest?regionCode=` → `{ items: [...] }`
Auth: `requireUser` + `sendGrpcError` như routes hiện có; role forward `x-user-role`.

## 7. Seed + pipeline

- `api/seed/tech-sample.json` — arrays: `technicians` (6: 4 KTV + 2 CTV, 2 vùng), `deliveryOrders` (10 đủ các trạng thái, lat/long quanh HCM), `installationOrders` (8, có/không technician, timeline mẫu). KHÔNG đụng canonical-seed.json.
- `scripts/seed-db.sh`: thêm block đọc `SEED_TECH_JSON` (default `api/seed/tech-sample.json`), insert 3 bảng nếu rỗng (giữ emptiness-gate + fail-loud khi thiếu bảng). CHỈ edit additive.
- `scripts/reset-db.sh`: thêm 3 bảng vào truncate list.
- validate.py KHÔNG đổi (chỉ validate canonical).

## 8. Java service

- `store/TechOrderRepository.java` (interface) + `store/InMemoryTechOrderRepository.java` + `store/PostgresTechOrderRepository.java` — conditional bean theo `fulfillment.store` (cùng property SF-2, matchIfMissing=postgres)
- `service/TechServiceImpl.java` `@GrpcService` — pattern FulfillmentServiceImpl: GrpcErrors.invalidArgument/notFound, x-error-details
- Buttons flags computed trong service layer (không SQL)
- Workload suggest: 1 query GROUP BY technician_code
- Unit tests: InMemory + tech-sample.json qua SeedLoader-path helper; IT: skip-when-no-DB pattern (`*IT.java`, connectOrSkip)

## 9. Proto codegen

Regen 4 languages theo pins `docs/superpowers/spikes/grpc-codegen-multilang.md`: protoc 29.3, protoc-gen-grpc-java 1.64.0, buf 1.72.0, @bufbuild/protoc-gen-es 2.14.0, ts-proto 2.7.7 (outputServices=grpc-js,forceLong=number,esModuleInterop=true), protoc-gen-go v1.28.1. File mới additive → buf breaking (FILE) pass.

## 10. Testing & acceptance

| ACCEPTANCE (context pack) | Verify |
|---|---|
| List delivery orders theo filter (trạng thái + hôm nay default) → đúng seed | BFF contract test + curl thật + psql cross-check |
| Assign KTV → ghi nhận; re-assign → đổi + history | unit + IT + curl → psql thấy history row |
| Suggest trả ứng viên theo vùng; buttons flags đúng theo trạng thái | unit test matrix flags + curl |
| psql thấy data; tests xanh | `docker compose exec postgres psql` + `mvn test` + `vitest run` |

## 11. Risks

1. Proto regen toolchain lần đầu chạy trong run — nếu thiếu binary → theo spike doc; fallback báo BLOCKED
2. seed-db.sh/reset-db.sh SF-1-owned — chỉ additive, không đụng logic bảng cũ
3. V6 numbering — V2-V5 để dành SF-7/14/17 (brackets confirm), Flyway apply đúng thứ tự khi các SF đó merge
4. 10 mã là assumption — đã post REQUIREMENT-GAP, đổi sau = 1 commit additive (enum + seed)
