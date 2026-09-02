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
- `api/proto/hubstore/intake/v1/intake.proto` (file MỚI): service `IntakeService` (Java) — `ValidateImportOrders`, `ConfirmImportOrders`, `CreateManualOrder`, `MarkOrderFailed`, `RedeliverOrder`. Message mới hoàn toàn.
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
| D5 | items format trong template? | Cột `items` = `code:name:qty` nối `;` (VD `SKU1:Sản A:2;SKU2:Sản B:1`); cột `quantity` = tổng số lượng (validate khớp hoặc tự tính) | 1 cột phẳng trong CSV; validate tách row/column rõ |
| D6 | Retry = new order (đã chốt epic) | Copy fields + `old_fulfill_code` link + code ORD mới + batchStatus=0, batchCode=NULL, fail fields NULL → hiện D1 queue | Giữ history đơn cũ nguyên vẹn |
| D7 | Mark-fail gate? | Cho phép khi order chưa FAILED (`fail_reason IS NULL`); KHÔNG chặn theo batchStatus (đơn batch hoàn tất vẫn mark-fail được — đúng acceptance) | Acceptance dòng 3 |
| D8 | orderStatus/statusCode đơn mới? | `orderStatus=1` (APPROVED), `statusCode=0`, batchStatus=0 | Đơn nhập vào là dùng được ngay cho batching (hydration gate batchStatus=0) |
| D9 | activity_log table ai tạo? | SF-13 tạo (V2) với đúng contract SF-7: `actor VARCHAR, action VARCHAR, target VARCHAR, detail JSONB, created_at TIMESTAMPTZ, id BIGSERIAL` | SF-7 chưa merge; context pack: "ghi thẳng bảng, pattern thống nhất". ⚠ merge-conflict risk với SF-7 V2 — ghi improvements-log |
| D10 | Role guard? | Import + tạo đơn: `Coordinator` (và Manager xem — chỉ Coordinator gọi được). Mark-fail + redeliver: `WarehouseOps` (+Manager? — KHÔNG, đúng matrix WarehouseOps) | Context pack: "Chỉ Coordinator" cho import; D2 là WarehouseOps |
| D11 | Template headers | `customerName, customerPhone, customerAddress, items, quantity, codAmount, shopHint` | Khớp spec slice: khách, SĐT, địa chỉ, items, quantity, COD, region/shopHint. shopHint = shopCode phải tồn tại trong distinct shops |

## 4. Architecture & data flow

**Import:** D1 modal upload → BFF `POST /orders/import/preview` (multipart) → parse (csv tự parse / xlsx lib) → gRPC `ValidateImportOrders{orders[]}` → `{valid[], errors[{row,column,message}]}` → FE preview bảng: rows valid (xanh) + rows lỗi (đỏ, đúng cột) → confirm → `POST /orders/import/confirm` → gRPC `ConfirmImportOrders` → Java: 1 transaction, advisory lock, sinh ORD-* tiếp dải, insert + activity_log `order.imported` (detail: count, codes) → FE refetch D1.

**Manual create:** D1 modal form (customerName/phone/address + items dynamic rows + codAmount + shopHint select từ /master-data/shops) → `POST /orders` → gRPC `CreateManualOrder` → validate giống import → insert + audit `order.created` → đơn hiện ngay trong list (refetch).

**Mark-fail:** D2 batch detail row → modal chọn lý do (KHACH_VANG/SAI_DIA_CHI/KHACH_TU_CHOI/KHAC) + ghi chú → `POST /orders/{code}/fail` → gRPC `MarkOrderFailed` → update fail_* + audit `order.failed`.

**Redeliver:** đơn FAILED (D2) nút "Giao lại" → `POST /orders/{code}/redeliver` → gRPC `RedeliverOrder` → tạo đơn MỚI (old_fulfill_code link) + audit 2 entries (`order.failed` đã có, thêm `order.redelivered` target=code mới, detail.oldFulfillCode) → đơn mới trong D1 (batchStatus=0).

**Validation rules (Java, dùng chung import + manual):** customerName/phone/address bắt buộc (phone VN format 9-11 số, cho phép +84/0 đầu); ≥1 item, mỗi item code+name+qty≥1; quantity = sum(items.qty); codAmount ≥ 0; shopHint (nếu điền) phải là shop tồn tại (distinct shops). Lỗi trả `{row, column, message}`.

## 5. Testing

- **Java unit** (InMemory): validation rules, codegen max+1, mark-fail gate, redeliver copy semantics.
- **Java IT** (Postgres, skip-when-no-DB): insert batch + codegen atomic, audit rows ghi đúng.
- **BFF contract test** (harness hiện có): template CSV headers, preview error shape, role guard 403.
- **E2E mới:** 05-intake (template tải được; upload 10 dòng/2 lỗi → preview đúng 2 lỗi đúng cột; confirm → 8 đơn trong D1; tạo tay → hiện ngay, code đúng dải); 06-exception (tạo batch → hoàn tất → mark-fail 1 đơn + lý do → giao lại → đơn retry trong D1, link về đơn cũ; audit ghi cả 2 — check qua UI audit viewer không có → check qua API activity query? **chốt: verify audit qua DB/API nội bộ trong spec 06 bằng cách GET /orders/{code}/audit (endpoint đọc audit mới, additive)**).
- **E2E cũ 13 specs** không vỡ (additive UI, không đổi testid/DOM cũ).

## 6. Risks

- R1: activity_log V2 đụng SF-7 khi merge → mitigation: đúng contract SF-7, ghi improvements-log, merge-resolve sau.
- R2: `xlsx` lib thêm vào bff (dependency mới) → pin version, chỉ parse, không render.
- R3: multipart trong Fastify cần `@fastify/multipart` (dependency mới, pin).
- R4: proto regen 4 languages — Java gen qua pom context `../../api/proto/gen/java` (checked-in) → regen bằng buf/protoc local, commit gen artifacts (pattern SF-2). Cần xác nhận buf/protoc có sẵn trên máy; nếu không, viết gen script dùng docker `bufbuild/buf`.
- R5: seed E2E mutation — specs 05/06 chạy sau 01-04 (tiền tố số), DB in-memory/compose reset mỗi boot (reuseExistingServer:false) — ổn.
