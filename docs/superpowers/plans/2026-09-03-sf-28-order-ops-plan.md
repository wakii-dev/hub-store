# SF-28 D1 order ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** D1 order operations — transfer hub tickets (tạo + lịch sử + badge), delivery-time slots (API + FE guard), criteria presets (API + wizard step 1), order note verify — roles Coordinator/Manager/Admin, audit mọi mutation.

**Architecture:** Ticket flow MỚI (proto file riêng `transfer/v1/transfer.proto` — pattern SF-13 intake, KHÔNG đụng fulfillment.proto) + Java `TransferServiceImpl` trên fulfillment :50051 + Flyway **V8** `transfer_tickets` (V3 reserved SF-14) + BFF REST proxy + FE antd4 theo design system SF-6. Delivery-time + note: endpoints CŨ — chỉ thêm role gate + guard, không đổi contract.

**Tech Stack:** Java Spring gRPC + JDBC Postgres · Fastify BFF gRPC clients · React antd4 + RTKQ · Playwright E2E

**Linear Issue:** FI-279

**Spec:** `docs/superpowers/specs/2026-09-03-sf-28-order-ops-design.md` (contracts chi tiết ở §3 Q1-Q7)

**Conventions chung (áp mọi task):**
- pnpm install trước khi typecheck. Commit per task: `<type>(<scope>): <summary>` — stage từng file, KHÔNG `git add -A`.
- Roles gate = `requireRole(request, reply, 'Coordinator', 'Manager', 'Admin')` (variadic, plugins/auth.ts:103).
- Audit: `logActivity` (services/bff-gateway/src/lib/audit.ts) fire-and-forget.
- Test-verify sau mỗi task: đúng surface test suite + `pnpm -r typecheck` (hoặc lệnh repo quy định).
- KHÔNG đổi: fulfillment.proto cũ, DnD step 2/3, testid cũ, batching service.

---

### Task 1: transfer-hub-api — Flyway V8 + proto transfer + Java impl + BFF routes

**Files:**
- Create: `api/proto/hubstore/transfer/v1/transfer.proto`
- Create: `services/fulfillment-service/src/main/resources/db/migration/V8__transfer_tickets.sql`
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/TransferServiceImpl.java`
- Create: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/TransferTicketRepository.java` (pattern store/PostgresOrderRepository)
- Modify: `services/bff-gateway/src/lib/grpc-error.ts` (thêm case `ALREADY_EXISTS → 409` — hiện rơi default 500)
- Modify: Java gRPC server wiring (nơi register IntakeServiceImpl — thêm TransferServiceImpl)
- Create: `services/bff-gateway/src/clients/transfer.ts`, `services/bff-gateway/src/mappers/transfer.ts`, `services/bff-gateway/src/routes/transfer.ts`
- Modify: BFF route registration (file đăng ký routes — soát index/server entry)
- Test: Java unit test TransferServiceImpl + BFF contract test `test/transfer.route.test.ts`

- [x] **Step 1: Proto mới (pattern intake/v1/intake.proto)**

```proto
syntax = "proto3";
package hubstore.transfer.v1;
// option java_package theo pattern file intake.proto — SOÁT file cũ rồi chép style
service TransferService {
  rpc CreateTransferTicket(CreateTransferTicketRequest) returns (CreateTransferTicketResponse);
  rpc ListTransferTickets(ListTransferTicketsRequest) returns (ListTransferTicketsResponse);
}
message CreateTransferTicketRequest {
  string order_fulfill_code = 1;
  string from_hub = 2;
  string to_hub = 3;
  string reason = 4;
}
message CreateTransferTicketResponse { TransferTicket ticket = 1; }
message ListTransferTicketsRequest {
  repeated string order_fulfill_codes = 1; // comma không — repeated; BFF map từ ?codes=
  string status = 2; // optional filter
}
message ListTransferTicketsResponse { repeated TransferTicket tickets = 1; }
message TransferTicket {
  string ticket_code = 1; string order_fulfill_code = 2;
  string from_hub = 3; string to_hub = 4; string reason = 5;
  string status = 6; // PENDING | APPROVED | REJECTED
  string created_by = 7; string created_at = 8;
  string confirmed_by = 9; string confirmed_at = 10;
}
```

- [x] **Step 2: Regen 4 ngôn ngữ CHỈ file mới.** `protoc --java_out` + grpc-java plugin (`~/bin` hoặc /tmp/sf1-spikes — spike docs/superpowers/spikes/grpc-codegen-multilang.md) + ts-proto (pnpm dlx ts-proto 2.7.7 pin — xem plans/2026-09-02-sf17-area-staff-plan.md:69). Go không cần (fulfillment-only). Verify: `git status` sạch ngoài file gen mới.
- [x] **Step 3: V8 migration**

```sql
-- V8__transfer_tickets.sql — SF-28 (V3 reserved SF-14)
CREATE TABLE transfer_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_code VARCHAR(32) NOT NULL UNIQUE,
  order_fulfill_code VARCHAR(64) NOT NULL REFERENCES orders(fulfill_code),
  from_hub VARCHAR(128),
  to_hub VARCHAR(128) NOT NULL,
  reason TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  created_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by VARCHAR(128),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX idx_transfer_tickets_order ON transfer_tickets(order_fulfill_code);
CREATE SEQUENCE IF NOT EXISTS transfer_ticket_code_seq START 1;
```

- [x] **Step 4: Java TransferServiceImpl** — JDBC pattern store/PostgresOrderRepository. `CreateTransferTicket`: (1) SELECT order + `is_debt_splitting_order` → nếu tách nợ → `GrpcErrors.invalidArgument` (KHRÔNG dùng FAILED_PRECONDITION — mapper hiện tại default 409, sẽ trùng 409 của trùng-PENDING; INVALID_ARGUMENT khớp pattern `assignShopHub` FulfillmentServiceImpl:228 → 422 tự nhiên); (2) tồn tại ticket PENDING cùng order → `ALREADY_EXISTS` + **thêm case `ALREADY_EXISTS → 409 CONFLICT` vào grpc-error.ts** (file đã ở Files list); (3) INSERT với `ticket_code = 'TT-' || lpad(nextval('transfer_ticket_code_seq')::text, 4, '0')` trong 1 transaction. `ListTransferTickets`: SELECT WHERE code = ANY(?) [+ status] ORDER BY created_at DESC. Audit: BFF-side logActivity (Java không cần).
- [x] **Step 5: Java unit test** — pattern test SF-2 (InMemory/DB-skip): tách nợ reject, duplicate PENDING → ALREADY_EXISTS, happy path sinh TT-0001, list filter codes.
- [x] **Step 6: BFF clients/transfer.ts (pattern clients/intake.ts — callUnary + metadata {x-user-role, x-user-name}) + mappers/transfer.ts + routes/transfer.ts:**
  - `POST /fulfillment/:code/transfer-tickets` body `{toHub, reason, fromHub?}` — requireRole 3 role → client.createTransferTicket → 409 → HTTP 409, FAILED_PRECONDITION → 422; audit `order.transfer_ticket_create`
  - `GET /fulfillment/transfer-tickets?codes=a,b` — requireRole; map comma → repeated; audit không cần (read)
- [x] **Step 7: BFF contract test** — pattern test/intake.route.test.ts: 403 non-role, 422 tách nợ, 409 trùng, happy path envelope. Mock client theo pattern file test cũ.
- [x] **Step 8: Chạy test + commit** `feat(transfer): transfer tickets API — V8 + proto transfer + Java impl + BFF routes`

### Task 2: transfer-hub-modal — FE modal tạo ticket + nút D1 + badge

**Files:**
- Create: `apps/orders/src/features/TransferHubModal.tsx` (+ .test.tsx nếu repo có pattern FE test)
- Modify: `apps/orders/src/api/ordersApi.ts` (RTKQ endpoints transferTickets)
- Modify: `apps/orders/src/pages/D1Page.tsx` (nút bulk + modal mount + badge cột)
- Modify: `apps/shell/src` chỉ khi BFF proxy path cần — kiểm tra FE gọi BFF qua path nào (pattern existing useGetShopsQuery)

- [x] **Step 1: RTKQ endpoints** — `createTransferTicket` (mutation, invalidates `transfer-tickets`), `getTransferTickets` (query, arg codes string, skip khi rỗng). Pattern existing ordersApi.ts.
- [x] **Step 2: TransferHubModal** — props: `{order, open, onClose}`. Nội dung: info đơn (fulfill code, shop, address); nếu `order.isDebtSplittingOrder` → Alert warning + disable confirm (pattern transfer-debt-warning cũ — SOÁT HubStoreTransferModal.tsx để reuse style); Input search debounce 300ms → `getShops({q})` (endpoint GET /master-data/shops của Task 4 widen — nếu chưa có q, fallback fetch-all + client filter; Task 4 bổ sung q BFF-side) → Radio list kết quả; TextArea lý do (required); nút `data-testid="transfer-hub-confirm"` → mutation → success → message + onClose + invalidate.
- [x] **Step 3: D1Page wiring** — nút "YC chuyển kho" `data-testid="bulk-transfer-ticket"` (bên cạnh bulk-transfer cũ — GIỮ NGUYÊN nút cũ): **ẨN theo role qua `usePermissions`/`can` từ `@hub-store/shared` (role Coordinator/Manager/Admin — hiện D1Page chưa import hook này)**; khi hiện: enable khi đúng 1 đơn chọn và không tách nợ. Mở modal. Badge cột mới `data-testid="transfer-badge-${code}"`: từ `getTransferTickets(codes của page)` — order có ticket → badge hiện, màu theo ticket MỚI NHẤT (PENDING → Tag warning-pastel "YC chuyển kho"; tokens sf6). KHÔNG đụng testid cũ. **Chạy vitest apps/orders — cập nhật `apps/orders/src/pages/D1Page.test.tsx` cho DOM mới.**
- [ ] **Step 4: Verify browser** (Rule 0 tầng 1-2): boot app → chọn đơn → modal render → suggest list hiện → badge hiện sau khi tạo (dùng UI thật). Screenshot trước/sau.
- [ ] **Step 5: Commit** `feat(transfer): transfer hub modal + D1 badge + bulk button`
  - [x] Committed (worktree sf-28-d1-order-ops — T2 done, step 4 browser chờ Phase 5)

### Task 3: transfer-ticket-history — FE modal lịch sử

**Files:**
- Create: `apps/orders/src/features/TransferTicketHistoryModal.tsx`
- Modify: `apps/orders/src/pages/D1Page.tsx` (entry mở history — link/icon trên badge hoặc menu row)

- [ ] **Step 1: Modal bảng** — cột: ticket # (TT-xxxx), trạng thái duyệt (Tag: PENDING warning-pastel / APPROVED success / REJECTED error — tokens sf6 semantic), kho đích, lý do, thời gian (format VN), người xác nhận (created_by — confirmed_by null khi PENDING). Empty state `data-testid="transfer-history-empty"`: Empty component sf6. Table `data-testid="transfer-history-table"`. **Chạy vitest apps/orders sau khi sửa D1Page (entry mới) — cập nhật test nếu DOM thay đổi.**
- [ ] **Step 2: D1Page entry** — click badge → mở history modal cho order đó (reuse getTransferTickets). Modal `data-testid="transfer-ticket-history-modal"`.
- [ ] **Step 3: Verify browser** — tạo ticket qua modal Task 2 → mở history → thấy row đúng data. Screenshot.
- [ ] **Step 4: Commit** `feat(transfer): ticket history modal + D1 entry`

### Task 4: delivery-time-adjust-api — slots endpoint + PUT guard + role gates + Kafka order.updated

**Files:**
- Modify: `services/bff-gateway/src/routes/fulfillment.ts` (time-slots GET mới + guard + role gate 2 PUT cũ + shops `?q=`)
- Modify: `services/fulfillment-service/.../FulfillmentServiceImpl.java` (publish order.updated trong updateDeliveryTime — pattern order.assigned:248)

- [x] **Step 1: GET /fulfillment/time-slots?date=YYYY-MM-DD** — static slots `08:00-10:00, 10:00-12:00, 14:00-16:00, 16:00-18:00` TZ +07:00; date < hôm nay (VN) → 422; date hôm nay → lọc slot đã qua; date hôm-mai→+7 OK; > +7 → 422. requireRole 3 role.
- [x] **Step 2: PUT delivery-time guard** — trước khi proxy: parse from/to, if from < hôm nay VN → 422 envelope code `PAST_DATE_NOT_ALLOWED`. Mapping từ slot: FE gửi from/to ISO +07:00 tường minh (contract spec Q4).
- [x] **Step 3: Role gates** — thêm `requireRole(request, reply, 'Coordinator','Manager','Admin')` cho `PUT /fulfillment/:code/note` (line ~372) + `PUT /fulfillment/:code/delivery-time` (line ~396). TRƯỚC KHI ĐÓ: đọc e2e/tests/01-main-flow.spec.ts + 02-role-matrix.spec.ts — xác nhận không có bước gọi 2 route này dưới role khác (warehouse storageState); nếu có → điều chỉnh spec test đó theo role đúng và GHI vào commit message.
- [x] **Step 4: GET /master-data/shops thêm `?q=`** — BFF in-memory filter (code OR name, case-insensitive) sau khi listDistinctShops — không proto change.
- [x] **Step 5: Java publish `order.updated`** — trong updateDeliveryTime sau mutate thành công: events.publish("order-events", envelope {type:"order.updated", source:"fulfillment", payload:{fulfillCode, deliveryTime}}) — best-effort try/catch log, pattern order.assigned (Impl:248). Verify consumer BFF (`src/kafka/consumer.ts` parseMessage → onEvent generic) không crash với type mới — đọc code, ghi nhận trong commit message.
- [x] **Step 6: Contract test** — slots: 422 quá khứ, lọc slot hôm nay, OK ngày mai; PUT guard 422; 403 warehouse trên 2 PUT cũ; shops ?q= filter.
- [x] **Step 7: Test + commit** `feat(delivery-time): slots API + past-date guard + role gates + order.updated event`

### Task 5: delivery-time-slots — FE DeliveryTimeCell widen

**Files:**
- Modify: `apps/orders/src/features/DeliveryTimeCell.tsx` (+ test file DeliveryTimeCell.test.tsx — cập nhật)
- Modify: `apps/orders/src/api/ordersApi.ts` (getDeliveryTimeSlots query)

- [x] **Step 1: RTKQ query** getDeliveryTimeSlots(date).
- [x] **Step 2: Widen modal** — GIỮ testid `edit-delivery-${code}` + hành vi editable-when-batchStatus-0. **Thêm role-hide: `usePermissions` — nút edit chỉ render cho Coordinator/Manager/Admin (D1Page/DeliveryTimeCell chưa import hook — thêm).** Thay RangePicker thô bằng: DatePicker (`disabledDate` = ngày < hôm nay, TZ Asia/Ho_Chi_Minh), chọn date → fetch slots → Radio chips slot (testid `delivery-slot-${index}`), disabled khi slot quá khứ (today). Confirm → mutation PUT delivery-time với from/to ISO +07:00 từ slot mapping (spec Q4). Testid control mới KHÔNG đụng testid assert cũ.
- [x] **Step 3: FE test** — cập nhật DeliveryTimeCell.test.tsx: past date disabled, slot render, confirm gọi đúng from/to.
- [ ] **Step 4: Verify browser** — chỉnh giờ đơn → chọn ngày mai + slot → row update. Ngày quá khứ không chọn được. Screenshot. (Phase 5 — coordinator)
- [x] **Step 5: Commit** `feat(delivery-time): FE slot picker + past-date guard`

### Task 6: criteria-presets-api — BFF presets endpoint

**Files:**
- Create: `services/bff-gateway/src/routes/batching-presets.ts` (hoặc thêm vào routes file batching hiện có — soát cấu trúc)
- Test: contract test

- [x] **Step 1: GET /batching/criteria-presets** — static list: `[{id:'shortest', name:'Ngắn nhất', description:'Ưu tiên tổng quãng đường/stop ngắn nhất'}, {id:'cod_priority', name:'Ưu tiên COD', ...}, {id:'fewest_stops', name:'Ưu tiên số dừng ít', ...}, {id:'balanced', name:'Cân bằng', ...}]`. requireRole 3 role. KHÔNG gọi batching service.
- [x] **Step 2: POST /batching/criteria-preset-select** body `{presetId, orderCount?}` — validate presetId ∈ list, audit `batching.criteria_preset_select` fire-and-forget, trả `{ok:true}`. requireRole.
- [x] **Step 3: Contract test** — GET shape, POST audit (spy logActivity theo pattern test cũ), 403.
- [x] **Step 4: Commit** `feat(batching): criteria presets API + select audit`

### Task 7: wizard-step1-preset — FE wizard step 1

**Files:**
- Modify: `apps/orders/src/batching/CreateBatchingModal.tsx` (stepper 3→4 bước, step 1 preset radio)
- Modify: `apps/orders/src/api/batchingApi.ts` (getCriteriaPresets query + selectCriteriaPreset mutation)

- [ ] **Step 1: RTKQ endpoints** presets + select.
- [ ] **Step 2: Renumber stepper** — state `1|2|3` → `1|2|3|4`; footer `activeSection < 3` → `< 4`; scrollToSection union mở rộng. Step 1 MỚI: Radio group `data-testid="wizard-step1-preset"` — mỗi preset: name + description; default chọn `balanced`; Next → step 2 (DnD NGUYÊN — KHÔNG đổi logic). Header step 2/3 hiện preset đã chọn (Chip nhỏ — chỉ hiển thị). GIỮ nguyên Deviation D1: content step cũ không bị ẩn ngầm (sf6-direction §0 — kiểm tra cách modal hiện tại render sections rồi giữ pattern). KHÔNG đổi testid control cũ (DnD list, shipper select, date picker).
- [ ] **Step 3: FE test** — CreateBatchingModal.test.tsx cập nhật: step 1 render 4 preset, chọn → step 2 DnD hoạt động như cũ (test cũ phải vẫn pass).
- [ ] **Step 4: Verify browser** — mở wizard → thấy 4 bước → chọn preset → DnD như cũ. Screenshot.
- [ ] **Step 5: Commit** `feat(batching): wizard step 1 criteria preset`

### Task 8: order-note-endpoint — verify-only

**Files:**
- Test: bổ sung contract test role-gate note (đã trong Task 4 Step 3) — task này VERIFY + ghi nhận, không code mới.

- [x] **Step 1: Verify** — `PUT /fulfillment/:code/note` hoạt động: boot stack → curl/BFF test happy path + audit row `order.update_note` trong activity_log. Ghi kết quả (đã tồn tại từ SF-2 — proto:182, route :369, Java updateNote).
- [x] **Step 2: Commit** `test(order-note): verify existing note endpoint — no changes needed` (chỉ khi có test thêm; nếu thuần verify → ghi kết quả vào Linear comment thay commit rỗng).

### Task 9: e2e-order-ops — Playwright spec mới

**Files:**
- Create: `e2e/tests/07-order-ops.spec.ts`

- [ ] **Step 1: Spec** — dùng storageState pattern e2e/auth.setup.ts (coordinator + warehouse):
  1. Coordinator: chọn 1 đơn → mở transfer hub modal → suggest → confirm → badge `transfer-badge-*` hiện → mở history → row PENDING với lý do
  2. Chặn tách nợ: đơn tách nợ → modal disable (nếu seed có đơn tách nợ — soát seed; không → skip + note)
  3. Delivery time: chọn ngày mai + slot → row update; DatePicker ngày quá khứ disabled
  4. Wizard: mở tạo phiếu → step 1 preset radio → chọn → DnD step như cũ
  5. Role 403: warehouse storageState → PUT note + PUT delivery-time + POST transfer-tickets → 403; FE ẩn nút
  6. Note: PUT note happy path
- [ ] **Step 2: Chạy E2E=1** — spec mới xanh + specs cũ 01/02/04 vẫn xanh (regression DeliveryTimeCell + role gates).
- [ ] **Step 3: Commit** `test(e2e): 07-order-ops — transfer/delivery/preset/roles`

---

## Dependency DAG

```
T1 transfer-hub-api ──► T2 transfer-hub-modal ──► T3 transfer-ticket-history ─┐
                                                                              ├─► T9 e2e-order-ops
T4 delivery-time-adjust-api ──► T5 delivery-time-slots ───────────────────────┤
T6 criteria-presets-api ──► T7 wizard-step1-preset ───────────────────────────┤
T8 order-note-endpoint (verify) ──────────────────────────────────────────────┘
```

T4 phụ thuộc nhẹ T1? KHÔNG — shops ?q= nằm ở T4, T2 fallback client-filter nếu chạy trước T4. Thứ tự chạy khuyến nghị: T1 → T4 → T6 → T2 → T3 → T5 → T7 → T8 → T9 (nhóm review: [T1,T4,T6,T8] BE — [T2,T3,T5,T7] FE — T9 riêng).

## Rollback

Mỗi task 1 commit → `git revert <hash>`. V8 migration rollback = revert commit (Flyway không drop tự động — ghi chú nếu cần manual rollback DB).
