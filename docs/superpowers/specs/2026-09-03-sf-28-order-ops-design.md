# SF-28 D1 order ops — Design (chuyển kho CN + delivery time + criteria presets)

- **Linear**: FI-279 · Epic FI-245 · Bracket `docs/superpowers/brackets/fi245-postgres-production.md`
- **Context pack**: `docs/superpowers/contexts/fi245-sf-28.md` · Epic spec §3.28
- **Date**: 2026-09-03 · **Status**: Approved (autonomous self-review — brainstorm self-answered từ Phase 0 impact analysis; spec-critic chạy sau)
- **Worktree**: `sf-28-d1-order-ops` (base `story/fi245-postgres-production` @ 74cfbb1)

## 0. Codebase reality (đã verify bằng probe, không giả định)

Phase 0 impact analysis (phase0-impact-analyst, probe 43 tool-calls) xác nhận:

| Feature context pack | Codebase reality | Hành động |
|---|---|---|
| 4. Order note endpoint | **ĐÃ CÓ**: RPC `UpdateNote` (proto:182), `PUT /fulfillment/:code/note` (routes/fulfillment.ts:369, audit `order.update_note`), Java `updateNote` | **Verify-only** + e2e coverage. KHÔNG làm lại |
| 2. Delivery-time adjust | **ĐÃ CÓ endpoint**: RPC `UpdateDeliveryTime` + `PUT /fulfillment/:code/delivery-time` (audit có sẵn); NHƯNG slots chỉ là spike 1 khung (`GetTimeDelivery` → `suggested_time` duy nhất), FE `DeliveryTimeCell` RangePicker không chặn ngày quá khứ | Bổ sung slots API + FE slot picker + past-date guard; Java publish `order.updated` best-effort |
| 1. Transfer hub | CHƯA CÓ ticket flow. Đã có luồng **assign ngay lập tức** (`AssignShopHub` + `shop_assignment_history` + modal D1c `HubStoreTransferModal`) — E2E 01-main-flow/04-regression-8b phụ thuộc | Ticket flow **MỚI hoàn toàn**, song song KHÔNG thay thế luồng assign (giữ nguyên modal + nút + testid cũ) |
| 3. Criteria presets | `GetBatchCriteria` hiện tại là RPC khác (trạng thái hủy) — không liên quan | Endpoint mới BFF static; batching READ-ONLY |
| 5. Roles | Matrix chỉ có `Coordinator/WarehouseOps/Manager/Admin/WarehouseEmployee`. **SubCoordinator/FulfillmentStaff KHÔNG tồn tại** | "Coordinator nhóm" ≙ **Coordinator + Manager + Admin** (các role có `orders.view`). Ghi decision + REQUIREMENT-GAP note lên epic |

Flyway fulfillment: V1, V2, V4, V5, V6, V7 — **V3 reserved (SF-14), migration mới = V8**.
BFF ↔ Java/Go: chỉ gRPC → RPC mới = **additive proto** + regen 4 ngôn ngữ (toolchain đã có từ FI-233).

## 1. Root cause / problem

D1 thiếu 4 nghiệp vụ vận hành mà app gốc có: yêu cầu chuyển kho CN (có duyệt), chỉnh giờ giao theo slot, tiêu chí preset khi soạn phiếu, ghi chú đơn. Rebuild hiện chỉ có assign-nhanh + delivery-time thô. Real problem = thiếu capability, không phải UI.

## 2. Scope

**IN:**
1. Transfer tickets: Flyway **V8 `transfer_tickets`**, RPC additive `CreateTransferTicket` + `ListTransferTickets`, BFF routes + audit, FE modal + badge trên D1 row + history modal, suggest kho đích qua `/master-data/shops` (+ `?q=` filter BFF-side, debounce FE)
2. Delivery time: BFF `GET /fulfillment/time-slots?date=` (synthesize slots tĩnh theo ngày, TZ Asia/Ho_Chi_Minh, chặn quá khứ server-side), FE `DeliveryTimeCell` widen (DatePicker disabledDate + slot radio), Java publish `order.updated` (best-effort, KAFKA_ENABLED=false → no-op)
3. Criteria presets: BFF `GET /batching/criteria-presets` (static list), wizard step 1 radio preset trong `CreateBatchingModal` stepper
4. Order note: verify endpoint + e2e API coverage
5. Roles: BFF `requireRole('Coordinator','Manager','Admin')` cho mutation mới **VÀ thêm gate cho 2 PUT cũ hiện chỉ `requireUser`**: `PUT /fulfillment/:code/note` + `PUT /fulfillment/:code/delivery-time` (BFF-only, không proto change). Plan-time check: đọc `02-role-matrix.spec.ts` + `01-main-flow.spec.ts` xem có role non-gated nào đang gọi 2 route này không trước khi thêm gate. FE ẩn nút qua `usePermissions`; non-role → 403
6. E2E `e2e/tests/07-order-ops.spec.ts` mới (numeric-prefix convention, tests/ dir)

**OUT (boundary):**
- KHÔNG flow duyệt ticket (status giữ `PENDING`; hiển thị "Chờ duyệt")
- KHÔNG thay/thu hồi luồng assign ngay (D1c, testid cũ nguyên vẹn)
- KHÔNG đổi DnD step 2/3 wizard, KHÔNG đổi proto cũ, KHÔNG đụng batching service (READ-ONLY)
- KHÔNG FE screen cho order note (đã đủ ở API + context pack không yêu cầu UI note)

## 3. Design quyết định (self-answered clarifying questions)

**Q1 — Tickets thay hay song song luồng assign?** SONG SONG. Luồng assign ngay = chuyển kho thực thi; ticket = yêu cầu chờ duyệt. E2E cũ phụ thuộc luồng assign → giữ nguyên tránh regression. Entry mới: nút "Yêu cầu chuyển kho" (per-order/bulk 1 đơn) trên D1.

**Q2 — Role map cho "Coordinator nhóm"?** Coordinator + Manager + Admin (holder của `orders.view`). SubCoordinator/FulfillmentStaff không tồn tại trong realm → REQUIREMENT-GAP comment lên FI-245, không block.

**Q3 — Preset có persist kèm phiếu?** KHÔNG (batching READ-ONLY, "KHÔNG đổi proto cũ"). Preset = FE state wizard, hiển thị ở header step 2/3. Audit selection qua **`POST /batching/criteria-preset-select`** (fire-and-forget `logActivity`, không đụng batching service). Persist thật = thay đổi batching proto/schema — cần quyết epic-level nếu muốn.

**Q3b — Wizard step insertion?** Insert preset selection as **first section với renumber 1→2, 2→3, 3→4** trong `CreateBatchingModal` stepper (state type `1|2|3` → `1|2|3|4`, footer `activeSection < 3` → `< 4`, scrollToSection union mở rộng). Giữ nguyên **Deviation D1** (content không bị ẩn — E2E-safe theo sf6-direction §0). Testid mới `wizard-step1-preset`; KHÔNG đổi testid control cũ (DnD list, shipper select, date picker).

**Q4 — Slots nguồn + contract?** BFF static config (slots 2h: 08-10 / 10-12 / 14-16 / 16-18, ngày mai→+7, TZ Asia/Ho_Chi_Minh). **Slot→PUT mapping**: chọn slot (date + slot) → FE gọi PUT `/fulfillment/:code/delivery-time` (endpoint CŨ) với `from`=slotStart, `to`=slotEnd, ISO string **offset +07:00** tường minh (không browser-TZ/UTC ngầm). **Chặn quá khứ ở mutation side**: BFF PUT delivery-time thêm guard (from/hoặc date < hôm nay VN → 422) TRƯỚC khi proxy sang Java — GET slots 422 chỉ là UX; guard thật nằm ở PUT. Java giữ nguyên (không proto change).

**Q5 — Badge ticket trên D1 row?** FE secondary fetch sau page load: `GET /fulfillment/transfer-tickets?codes=CODE1,CODE2` (comma-joined, skip khi page rỗng, 1 call/page) → map badge (đếm ticket PENDING; nếu order có ticket → badge "YC chuyển kho" status màu theo ticket mới nhất). RTKQ invalidates tag `transfer-tickets` khi tạo ticket mới → badge refresh. Tránh proto change trên filter response, tránh N+1.

**Q6 — Schema `transfer_tickets`** (V8): `id BIGSERIAL PK`, `ticket_code VARCHAR UNIQUE` (TT-0001, DB sequence), `order_fulfill_code VARCHAR NOT NULL` (FK `orders(fulfill_code)` đúng pattern `shop_assignment_history` V1), `from_hub VARCHAR`, `to_hub VARCHAR NOT NULL`, `reason TEXT`, `status VARCHAR NOT NULL DEFAULT 'PENDING'` — **enum: `PENDING` (duy nhất trong scope này; `APPROVED`/`REJECTED` reserved cho epic sau)**, `created_by VARCHAR`, `created_at TIMESTAMPTZ`, `confirmed_by VARCHAR NULL`, `confirmed_at TIMESTAMPTZ NULL`. Index trên `order_fulfill_code`. **Lifecycle: tối đa 1 ticket PENDING/order — tạo trùng khi đang PENDING → 409 CONFLICT** (order đã có ticket APPROVED/REJECTED thì tạo được ticket mới).

**Q7 — tách nợ chặn?** Server-side bắt buộc: `CreateTransferTicket` reject khi order `is_debt_splitting_order` (re-use cùng validation `assignShopHub` Impl:228) + FE disable/warning (pattern `transfer-debt-warning` cũ). Chặn cả chọn nhiều đơn (bulk chỉ cho phép 1).

## 4. Architecture

```
FE (apps/orders/src)                    BFF (services/bff-gateway)              Java (fulfillment-service)
D1Page: nút YC chuyển kho ──────────► POST /fulfillment/:code/transfer-tickets ─► CreateTransferTicket (chặn tách nợ, 409 trùng PENDING, audit)
TransferHubModal (mới)                    GET  /fulfillment/transfer-tickets      ListTransferTickets (filter codes)
TicketHistoryModal (mới)                    ?codes= (comma-joined)
Badge cột ticket ◄─────────────────────   GET  /master-data/shops?q=  (BFF in-memory filter: code OR name)
DeliveryTimeCell (widen) ◄──────────►    GET  /fulfillment/time-slots?date=   (BFF synthesize)
                                        PUT /fulfillment/:code/delivery-time (CŨ + thêm role gate + 422 quá-khứ guard)
CreateBatchingModal step1 ◄─────────►    GET  /batching/criteria-presets      (static list)
                                        POST /batching/criteria-preset-select (audit fire-and-forget)
                                        PUT /fulfillment/:code/note  (CŨ — verify-only)
Java: Kafka publish "order.updated" khi updateDeliveryTime (best-effort, pattern order.assigned:248)
```

Audit: mọi mutation mới qua BFF `logActivity` (pattern SF-7): `order.transfer_ticket_create`, `order.update_delivery_time` (có sẵn), `batching.criteria_preset_select`.

## 5. Testing

- Java: unit test service CreateTransferTicket (tách nợ reject + success + seq code) + ListTransferTickets; integration skip-when-no-DB (pattern SF-2)
- BFF: contract tests route mới (pattern `test/intake.route.test.ts`): 403 non-role, 422 tách nợ, happy path, slots quá khứ 422
- FE: existing vitest nếu có pattern; manual browser walkthrough Rule 0 (3 tầng)
- E2E: `e2e/tests/07-order-ops.spec.ts` — transfer ticket flow (Coordinator storageState), badge hiện, history có ticket, delivery-time slot chọn ngày mai + ngày quá khứ blocked, wizard step1 preset radio, order note PUT, role 403 (warehouse storageState). E2E cũ 01/02/04 phải vẫn xanh (regression chính cho DeliveryTimeCell widen = specs nào đụng testid `edit-delivery-*` — plan-time xác định, khả năng cao 01-main-flow).

## 6. Risks

1. Flyway V3 collision nếu SF-14 merge giữa chừng → guard: kiểm tra migration dir trước commit (memory: cross-SF Flyway collision)
2. Kafka consumer BFF phải bỏ qua event type lạ không crash → verify `services/bff-gateway/src/kafka/consumer.ts` trước publish
3. `DeliveryTimeCell` bị e2e regression nhắm → chạy 04-regression-8b sau widen
4. Proto regen 4 ngôn ngữ (ts-proto /tmp dir, grpc-java plugin /tmp/sf1-spikes — memory fi233)
5. Rate limit Linear 2500/h → retry READ-BACK, không tạo trùng
