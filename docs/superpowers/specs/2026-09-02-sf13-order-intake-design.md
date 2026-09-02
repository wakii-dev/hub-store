# SF-13 — Order intake + delivery exceptions — Design Spec

- **Linear:** FI-258 (epic FI-245) · **Tier:** 2 (deps SF-2 + SF-3 — Done)
- **Epic spec:** docs/superpowers/specs/ict-service-support-postgres-prod-spec.md §3.13
- **Context pack:** docs/superpowers/contexts/fi245-sf-13.md
- **Status:** Approved (autonomous self-review passed — epic-level questions đã trả lời bởi context pack; quyết định cấp SF tự trả lời có rationale bên dưới)
- **Date:** 2026-09-02

## 1. Problem

Đơn chỉ có 27 đơn seed (ORD-3001..3027) nạp 1 lần — không có đường nhập đơn mới (import CSV/Excel hay tạo tay), và khi giao thất bại không có cách ghi nhận lý do FAILED hay giao lại. SF-13 bổ sung: (1) import đơn CSV/Excel có preview lỗi, (2) tạo đơn thủ công trên D1, (3) fulfillCode tiếp dải ORD-* atomic, (4) mark-fail per-order + lý do, (5) giao lại = tạo đơn retry link đơn cũ, (6) audit mọi mutation.

## 2. Scope

**In:**
- `api/proto/hubstore/intake/v1/intake.proto` (file MỚI): service `IntakeService` (Java) — `ValidateImportOrders`, `ConfirmImportOrders`, `CreateManualOrder`, `MarkOrderFailed`, `RedeliverOrder`, `GetOrderAudit`. Message mới hoàn toàn.
- BFF route đọc audit: `GET /orders/{code}/audit` — trả entries `{actor, action, target, detail, createdAt}` (SF-7 contract fields), mọi role authenticated (read-only); 404 khi code lạ.
- Additive fields trên `HubStoreOrderFilterItem` (fulfillment.proto): `customer_name`, `customer_phone`, `fail_reason`, `fail_note`, `old_fulfill_code` — wire-safe (field mới, không đổi field cũ); buf breaking=FILE pass.
- Flyway `V2__intake_schema.sql` (DB fulfillment): cột mới trên `orders` (customer_name, customer_phone, old_fulfill_code, fail_reason, fail_note, failed_at, created_time) + bảng `activity_log` theo contract SF-7 (actor/action/target/detail JSONB/created_at).
- Java: OrderRepository interface mở rộng (insertOrders, markFailed, redeliver, nextFulfillCode, audit) — cả InMemory + Postgres impl.
- BFF (Fastify): `GET /orders/import/template` (CSV), `POST /orders/import/preview` (multipart upload → parse → validate), `POST /orders/import/confirm`, `POST /orders` (manual), `POST /orders/{code}/fail`, `POST /orders/{code}/redeliver`.
- FE `apps/orders` (D1): nút "Tạo đơn" (modal form) + nút "Nhập đơn" (upload → preview modal → confirm).
- FE `apps/fulfillment` (D2): trong batch detail — mark-fail per-order (chọn lý do + ghi chú) + nút "Giao lại" trên đơn FAILED.
- E2E mới: `05-intake.spec.ts`, `06-exception.spec.ts`.
- Audit: activity_log ghi tại intake/mark-fail/redeliver (actor = preferred_username, truyền qua gRPC metadata `x-user-name` — additive).

**Out (boundary):** webhook sàn TMĐT (SF-26); COD settlement (SF-14); đổi batch flow; sửa/break proto cũ; Kafka (SF-27 side-channel, không blocking); external-int adapters (SF-13 không chạm Ahamove/Zalopay/OneSignal/GA).

## 3. Decisions (self-answered, rationale)

| # | Câu hỏi | Chốt | Lý do |
|---|---------|------|-------|
| D1 | FAILED biểu diễn thế nào? | Cột riêng `fail_reason`/`fail_note`/`failed_at` (NULL = không fail) — KHÔNG đụng enum `OrderStatus`/`BatchStatus` cũ | Boundary "proto additive"; đổi enum cũ vỡ message + E2E cũ |
| D2 | fulfillCode: max+1 hay sequence? | **max+1 atomic** trong 1 transaction: `pg_advisory_xact_lock(hashtext('fulfill_code'))` + `MAX(CAST(substring(fulfill_code FROM 6) AS INT))` trên `fulfill_code LIKE 'ORD-%'` | Sequence cần bootstrap setval phụ thuộc seed-db.sh (SF-1 owns, READ-ONLY); max+1 tự đúng với DB legacy/rỗng. KHÔNG đụng dải BATCH-* (Go owns, khác DB) |
| D3 | Validate import ở đâu? | Java `ValidateImportOrders` — BFF chỉ parse file (CSV/XLSX) → JSON | Java owns orders + validation là 1 nguồn truth; BFF thin |
| D4 | Excel hay chỉ CSV? | Cả hai: `.csv` (parse tự viết — quoted fields) + `.xlsx/.xls` (lib `xlsx` npm). Template tải về = CSV (mở bằng Excel được) | Spec "CSV/Excel"; CSV template đủ acceptance |
| D5 | items format trong template? | Cột `items` = `code:name:qty` nối `;` (VD `SKU1:Sản A:2;SKU2:Sản B:1`); cột `quantity` PHẢI = tổng qty các items — lệch = validation error (cột `quantity`) | 1 cột phẳng trong CSV; validate tách row/column rõ |
| D6 | Retry = new order (đã chốt epic) | Copy fields + `old_fulfill_code` link + code ORD mới + batchStatus=0, batchCode=NULL, fail fields NULL → hiện D1 queue | Giữ history đơn cũ nguyên vẹn |
| D7 | Mark-fail gate? | Cho phép khi order chưa FAILED (`fail_reason IS NULL`); KHÔNG chặn theo batchStatus (đơn batch hoàn tất vẫn mark-fail được — đúng acceptance) | Acceptance dòng 3 |
| D8 | orderStatus/statusCode đơn mới? | `orderStatus=1` (APPROVED), `statusCode=0`, batchStatus=0 | Đơn nhập vào là dùng được ngay cho batching (hydration gate batchStatus=0) |
| D9 | activity_log table ai tạo? | SF-13 tạo `V2__intake_schema.sql` với bảng `activity_log` đúng contract SF-7: `id BIGSERIAL PK, actor VARCHAR, action VARCHAR, target VARCHAR, detail JSONB, created_at TIMESTAMPTZ`. **Quy tắc merge với SF-7 (chốt): V2 này là canonical cho activity_log — khi SF-7 merge, migration `V2__activity_log.sql` của SF-7 phải DROP (bảng đã có) và SF-7 renumber sang version kế tiếp. Ghi improvements-log với đúng tên file** | SF-7 chưa merge; context pack: "ghi thẳng bảng, pattern thống nhất". Không chốt rule → Flyway fail boot "found more than one migration with version 2" sau merge |
| D10 | Role guard (enforcement tại BFF qua realm role JWT; `x-user-name` metadata CHỈ là audit attribution — Java không verify)? | `Coordinator`: import preview/confirm + tạo đơn. `WarehouseOps`: mark-fail + redeliver. `Manager`: read-only toàn bộ (gồm GET audit). Mutation sai role → 403 | Context pack: "Chỉ Coordinator" cho import; D2 (fail/redeliver) là WarehouseOps |
| D11 | Template headers + fields mới | `customerName, customerPhone, customerAddress, items, quantity, codAmount, shopHint` — **lưu ý: `customer_name`/`customer_phone` là fields MỚI hoàn toàn** (OrderSeed KHÔNG có khách/SĐT — 27 đơn seed sẽ NULL). D1 bảng cũ KHÔNG thêm cột (surgical, không vỡ E2E cũ; SF-11 harmonize sau) — name/phone chỉ hiển thị ở import preview + mở rộng expand sau này. shopHint = shopCode phải tồn tại trong distinct shops (lookup ListDistinctShops set shop_code/name/address) | Spec slice ghi "khớp fields OrderSeed" là bất chính xác — spec này sửa lại tường minh; D1 thêm cột = sửa assertions E2E cũ (cấm) |

## 4. Architecture & data flow

**Import:** D1 modal upload → BFF `POST /orders/import/preview` (multipart) → parse (csv tự parse / xlsx lib) → gRPC `ValidateImportOrders{orders[]}` → `{valid[], errors[{row,column,message}]}` → FE preview bảng: rows valid (xanh) + rows lỗi (đỏ, đúng cột) → confirm → `POST /orders/import/confirm` → gRPC `ConfirmImportOrders` → Java: 1 transaction, advisory lock, sinh ORD-* tiếp dải, insert + activity_log `order.imported` (detail: count, codes) → FE refetch D1.

**Manual create:** D1 modal form (customerName/phone/address + items dynamic rows + codAmount + shopHint select từ /master-data/shops) → `POST /orders` → gRPC `CreateManualOrder` → validate giống import → insert + audit `order.created` → đơn hiện ngay trong list (refetch).

**Mark-fail:** D2 batch detail row → modal chọn lý do (KHACH_VANG/SAI_DIA_CHI/KHACH_TU_CHOI/KHAC) + ghi chú → `POST /orders/{code}/fail` → gRPC `MarkOrderFailed` → update fail_* + audit `order.failed`. Nút "Giao lại" chỉ hiện trên đơn FAILED.

**Redeliver:** đơn FAILED (D2) nút "Giao lại" → `POST /orders/{code}/redeliver` → gRPC `RedeliverOrder` → tạo đơn MỚI (old_fulfill_code link) + audit 2 entries (`order.failed` đã có, thêm `order.redelivered` target=code mới, detail.oldFulfillCode) → đơn mới trong D1 (batchStatus=0). **Gate redeliver: chỉ khi `fail_reason IS NOT NULL` VÀ chưa tồn tại đơn retry (`old_fulfill_code = code`) — chặn double-redeliver; vi phạm → FAILED_PRECONDITION.**

**Confirm contract:** confirm GỬI LẠI full list đơn valid — Java re-validate toàn bộ; có bất kỳ row invalid → FAILED_PRECONDITION kèm errors[] (FE bắt buộc re-preview), KHÔNG insert cục phần. Insert all-or-nothing trong 1 transaction.

**Validation rules (Java, dùng chung import + manual):** customerName/phone/address bắt buộc (phone regex `^(\+84|0)\d{9}$` — VN mobile 10 số); ≥1 item, mỗi item code+name+qty≥1; quantity = sum(items.qty) — lệch là lỗi cột `quantity`; codAmount ≥ 0; shopHint (nếu điền) phải là shop tồn tại (distinct shops). Lỗi trả `{row, column, message}`.

**Đơn mới không có thời gian (import/manual không có cột time):** `original_time`/`delivery_time` = NULL — D1/batching đã tolerant (filter overlap bỏ đơn NULL-range khi có time filter; hydration chỉ gate batchStatus=0). FE render `-` qua formatter hiện có.

**E2E determinism:** DB Postgres persist giữa các run (boot-all KHÔNG reset; `reuseExistingServer:false` chỉ boot lại app) → specs 05/06 dùng **relative assertions** (đếm delta trước/sau, code mới > max ORD hiện có), KHÔNG hardcode số tuyệt đối. E2E chạy trên Postgres impl thật (matchIfMissing) → V2 migration + advisory-lock được coverage đầy đủ.

## 5. Testing

- **Java unit** (InMemory): validation rules, codegen max+1, mark-fail gate, redeliver copy semantics.
- **Java IT** (Postgres, skip-when-no-DB): insert batch + codegen atomic, audit rows ghi đúng.
- **BFF contract test** (harness hiện có): template CSV headers, preview error shape, role guard 403.
- **E2E mới:** 05-intake (template tải được; upload 10 dòng/2 lỗi → preview đúng 2 lỗi đúng cột; confirm → 8 đơn mới trong D1 (delta +8); tạo tay → hiện ngay, code > max ORD cũ); 06-exception (tạo batch → hoàn tất → mark-fail 1 đơn + lý do → giao lại → đơn retry trong D1 link về đơn cũ; audit ghi cả 2 — verify qua `GET /orders/{code}/audit`).
- **E2E cũ 13 specs** không vỡ (additive UI, không đổi testid/DOM cũ).

## 6. Risks

- R1 (RESOLVED — D9): activity_log V2 đụng SF-7 khi merge → rule đã chốt: V2__intake_schema.sql canonical; SF-7 drop + renumber khi merge. Ghi improvements-log.
- R6 (P2 note): field numbers 16-20 trên `HubStoreOrderFilterItem` dành cho SF-13 (16 customer_name, 17 customer_phone, 18 fail_reason, 19 fail_note, 20 old_fulfill_code) — SF khác thêm field phải lấy từ 21+ để tránh wire-number collision khi merge. Ghi improvements-log.
- R2: `xlsx` lib thêm vào bff (dependency mới) → pin version, chỉ parse, không render.
- R3: multipart trong Fastify cần `@fastify/multipart` (dependency mới, pin).
- R4: proto regen 4 languages — Java gen qua pom context `../../api/proto/gen/java` (checked-in) → regen bằng buf/protoc local, commit gen artifacts (pattern SF-2). Cần xác nhận buf/protoc có sẵn trên máy; nếu không, viết gen script dùng docker `bufbuild/buf`.
- R5 (RESOLVED — xem §4 E2E determinism): DB Postgres persist giữa các run, boot-all KHÔNG reset → specs 05/06 dùng relative assertions; Java chạy Postgres impl thật dưới boot-all → V2 + advisory-lock có coverage.
- R7 (P2): link retry→đơn cũ hiển thị ở **OrdersExpandContent** (expand row D1 — nơi chính xác để thêm info intake mới, không đụng bảng/cột D1 cũ). Đơn retry cũng để `note` = "Giao lại từ ORD-xxxx" cho thấy nhanh trong list mà không thêm cột.
