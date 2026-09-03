# SF-16 NVC FE — carrier section + replan/rebook/tracking — Design

- **Linear**: FI-261 (story FI-245, bracket `fi245-postgres-production.md` SF-16)
- **Deps**: SF-15 (delivery-batch API — đã merge), SF-6 (design system — đã merge)
- **Status**: Approved (autonomous — self-review + spec-critic gate)
- **Context pack**: `docs/superpowers/contexts/fi245-sf-16.md` · Epic spec §3.16
- **Base**: `story/fi245-postgres-production` @ 74cfbb1

## 0. Root cause & hiện trạng

FE rebuild chưa có khái niệm NVC (nhà vận chuyển ngoài): D1b `CreateBatchingModal` chỉ gán shipper nội bộ; D2 `BatchListPage` không có replan/rebook/tracking/hủy vận đơn. BE SF-15 đã sẵn sàng toàn bộ surface `/delivery-batch/*` (quotes → planning/confirm → booking → cancel → searchbookingdetail), precondition fail → **422 PRECONDITION_FAILED**.

**Đã verify code** (không đoán): flow chuẩn SF-15 = `POST /fulfillment/batches/create` (legacy — tạo batch fulfillment, trả batchCode + items{stopOrder,orderCode,distance,codAmount}) → `POST /delivery-batch/quotes` → `POST /delivery-batch/planning/confirm` (batchCode, fee SERVER-persist) → `POST /delivery-batch/booking` (planningIds decimal string). `isShortaged`/`MRSA_PENDING_REPLAN`/`allowCancelDelivery`/`urltracking` **không tồn tại** trong rebuild — 4 REQUIREMENT-GAP đã post lên epic FI-245.

## 1. Scope

**In**: carrier section 3 nhóm (D1b) · quotes + recalc · addon selector · fee-limit gates · replan/rebook modes (D2) · hủy vận đơn per-đơn/batch + note · tracking modal timeline 2 cột · master map 15 trạng thái · e2e `07-nvc-fe.spec.ts`.

**Out**: sửa services/** (READ-ONLY — bug BE → REQUIREMENT-GAP) · map view (SF-24) · đổi business flow batch legacy · antd5 · đổi testid/DOM screens cũ · in chứng từ (SF-21).

## 2. Design decisions (Direction A — Phase 0 picked)

### 2.1 Carrier section trong CreateBatchingModal section 2
- `Radio.Group` 3 nhóm: **Tự giao (KHO_CN)** — default · **Xe tải (NVC)** — quotes · **FPT_DELIVERY** — disabled + tooltip "Sắp ra mắt" (acceptance yêu cầu thấy 3 nhóm; không có BE — REQUIREMENT-GAP đã post).
- Tách component `apps/orders/src/batching/CarrierSection.tsx` — modal chính là composer, giữ `batch-shipper-select`/`batch-submit` testid cũ nguyên vẹn.
- **Tự giao = default → flow cũ byte-for-byte**: submit vẫn chỉ `POST /fulfillment/batches/create`. FE chưa chọn gì thêm → hành vi không đổi, E2E cũ không vỡ.
- Shipper-select giữ hiển thị ở MỌI nhóm (batch fulfillment entity luôn cần shipperId — flow SF-15 e2e cũng tạo batch legacy trước).

### 2.2 Quotes + recalc (nhóm Xe tải)
- Chọn nhóm Xe tải → lazy `POST /delivery-batch/quotes` `{shopCode (rows[0]), stopOrders[]}`; debounce 300ms; loading skeleton.
- Danh sách quote: radio 6 tải trọng — hiển thị name, vehicleType, fee (formatVnd), etaMinutes, badge `[MOCK]` khi `meta.mock`.
- **Recalc**: đổi vehicle → quote mới được chọn, addon reset (stale-addon bug — quyết design cứng); tổng phí hiển thị = `quote.fee + Σ addon.fee` (client compute, BE-authoritative tại confirm). Đổi distance (batch-recalc-distance) → re-POST quotes.
- **Fee gates**: quote `isExceedFeeLimit=true` → radio disabled + tooltip "Vượt hạn mức phí"; nếu quote đang chọn bị vượt (sau recalc) → auto-clear selection. Submit blocked khi selection chứa quote vượt hạn mức. BE vẫn 422 authoritative → FE map message rõ (`details[].message`).
- Ghi chú: BE check limit trên quote.fee (KHÔNG gồm addon fee — §NVC 2 đã chứng minh `p.fee = feeOf(vehicle, distance)`); FE gate bám theo BE (isExceedFeeLimit), tổng-phí-có-addon chỉ là hiển thị.

### 2.3 Addon selector
- Theo `selectedQuote.addonServices` (grp: ROUTE/LOADING = radio exclusive; DOCUMENT/ROUND_TRIP = checkbox).
- Addon không khả năng cho xe đã chọn → không render (catalog embed theo quote).
- Tổng phí addon hiện cạnh từng addon (formatVnd) + dòng tổng ở sumbar/review.

### 2.4 Submit nhóm Xe tải (sequence verified từ 05-nvc-api.spec.ts)
1. `POST /fulfillment/batches/create` (orderCodes, shipperId, deliveryTime) → batchCode + items.
2. `POST /delivery-batch/planning/confirm` `{batchCode, plannings[{stopOrder, orderCode, vehicleType, serviceId, addons[]}]}` (mỗi stop 1 planning) → planningIds.
3. `POST /delivery-batch/booking` `{batchCode, shipmentPlannings[{planningId, codAmount, totalBill, stopOrder}]}` → bookings (driver "name - phone", licensePlate).
4. Lưu **planning map** `localStorage['nvc.plannings.<batchCode>'] = [{planningId, orderCode, stopOrder, serviceId, vehicleType, addons}]` — dùng cho tracking/rebook/cancel ở D2 (interim cho tới khi BE có list-plannings-by-batch — REQUIREMENT-GAP đã post; thiếu map → tracking EmptyState).
5. Review section hiển thị kết quả book (driver, biển số, carrierBookingId, `[MOCK]` badge).

### 2.5 Replan / Rebook (D2 BatchListPage actions)
- **Replan** — gate: `batch.status === BATCH_ENTITY_STATUS.CANCELLED (2)`. Action "Tạo lại phiếu" → fetch `getBatchOrders` → loại đơn FAILED (analog "đơn thiếu hàng" — REQUIREMENT-GAP đã post) → mở `CreateBatchingModal` `mode='replan'`: prefill section 1 rows, tiêu đề "Tạo lại phiếu giao", submit = create flow bình thường (batch MỚI).
- **Rebook** — gate: batch ACTIVE + có planning CANCELLED trong planning map (booking bị hủy/lỗi). Action "Book lại vận đơn" → `CreateBatchingModal` `mode='rebook'`: prefill rows (locked — không DnD), carrier section pre-select Xe tải + vehicle/addons cũ, submit = KHÔNG tạo batch mới → chỉ `planning/confirm` (planning CANCELLED → CONFIRMED, cùng planningId) + `booking` (row mới, carrierBookingId mới) trên **cùng batchCode**.
- `mode` prop default `'create'` — mọi chỗ gọi cũ không đổi.

### 2.6 Hủy vận đơn (D2)
- Per-đơn (expand row): nút "Hủy vận đơn" khi planning map có booking (status BOOKED/CONFIRMED) → reason modal (pattern cancel-batch hiện có) → `POST /delivery-batch/cancel-delivery-order {planningId, reason}` → refresh + toast.
- Cả batch: nút "Hủy vận đơn (cả phiếu)" → `POST /delivery-batch/cancel-batch {batchCode, reason}` → hiển thị per-planning results (CANCELLED/DRAFT) + cancelledCount; partial-failure hiển thị từng dòng.
- Nút Cancel legacy (fulfillment batch cancel) **giữ nguyên** — hai concept hủy khác nhau (phiếu vs vận đơn), label phân biệt rõ.
- `allowCancelDelivery` BE chưa có → derive từ trạng thái (có booking ACTIVE mới hiện nút) + 422 BE-authoritative → toast (REQUIREMENT-GAP đã post).

### 2.7 Tracking modal (fulfillment app)
- `TrackingModal.tsx` mới: mở từ batch actions "Tracking" (khi planning map có batchCode) hoặc per-order row.
- Header: status tag + driver ("name - phone" split display), licensePlate, carrierBookingId, bookedAt; slot link `urltracking` — chỉ render nếu field tồn tại trên booking detail (BE chưa có → ẩn, code sẵn sàng).
- **Timeline 2 cột**: cột BE (source=BE) | cột PARTNER (source=PARTNER) — antd Timeline, mỗi mốc: status label (master map) + occurredAt (formatPeriodOfTime) + note. Planning chưa book → booking null, timeline rỗng → EmptyState.
- Polling nhẹ: refresh searchbookingdetail khi mở modal (refetchOnMountOrArgChange default có sẵn).

### 2.8 Master map 15 trạng thái vận đơn
- `apps/fulfillment/src/delivery/shipmentStatuses.ts` — pattern `techHelpers.ts` (string-status local map, KHÔNG đụng shared numeric StatusTag):
  15 codes: `ORDER_CREATED, ASSIGNING, ASSIGN_FAILED, DRIVER_FOUND, DRIVER_REASSIGNING, ARRIVED, WAITING_CONFIRM, DELIVERING, DELIVERED, COMPLETED, FAILED, CANCELLED, RETURNING, RETURNED, LOST`.
- `shipmentStatusLabel(code, locale)` vi/en + `SHIPMENT_TONE_MAP` (tone từ DESIGN_TOKENS.color.status, unknown → info + hiển thị code gốc — BE real mode có thể emit mã mới).
- `ShipmentStatusTag` component (testid `shipment-status-${code}`, class `sf6-status-tag`).
- Label qua i18n (SF-22 — không hardcode string).

### 2.9 API layer
- `apps/orders/src/batching/deliveryBatchApi.ts` (mới) + `apps/fulfillment/src/api/deliveryBatchApi.ts` (mới) — `api.injectEndpoints` trên singleton `@hub-store/api-client`; DTOs import từ `packages/shared/src/api-contracts/delivery-batch.ts` (đã có sẵn — KHÔNG thêm field).
- 422 handling: axiosBaseQuery error `{status:422, data:{code:'PRECONDITION_FAILED', details[]}}` → map thông điệp vi/en qua i18n.

### 2.10 E2E — `e2e/tests/07-nvc-fe.spec.ts`
- UI spec qua browser (storageState coordinator): tạo batch nhóm Xe tải từ D1 → thấy quotes 6 xe → chọn 1T + addon DOCUMENT → tổng phí cập nhật → chọn 8T vượt hạn mức → radio disabled → submit → D2 thấy vận đơn (driver) → mở tracking modal thấy timeline 2 cột → hủy vận đơn per-đơn → rebook được.
- Replan: tạo batch → hủy (legacy) → replan loại đơn FAILED.
- Tái dùng đơn seed riêng (không đụng 01-06 specs) + cleanup sau test (pattern 05-nvc-api afterAll).
- E2E cũ phải còn xanh (Tự giao default không đổi flow).

## 3. Test strategy
- Unit: batchingHelpers fee-gate/addon-filter pure functions; shipmentStatuses mapping (vi/en/unknown); CreateBatchingModal mode prop (create/replan/rebook) — jsdom theo pattern test hiện có.
- Integration: RTKQ endpoints (mock BFF shape khớp DTO).
- E2E: 07-nvc-fe (UI flow thật) — chạy được cả khi `E2E=1` full stack mock mode.
- Browser verify (Rule 0): 3 tầng — D1b carrier flow, D2 tracking/cancel/rebook, E2E cũ regression.

## 4. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Regression E2E cũ | Tự giao default, DOM/testid cũ untouched; chạy full e2e trước merge |
| Stale addon khi đổi xe | Reset addon selection on vehicle change (design cứng) |
| Quote spam khi toggle | Debounce 300ms + chỉ fetch khi nhóm Xe tải active |
| localStorage planning map mồ côi (clear cache) | Tracking thiếu map → EmptyState hướng dẫn; REQUIREMENT-GAP list-by-batch đã post |
| 422 khó hiểu | Map `details[].message` → i18n message rõ từng gate |
| Partial cancel-batch | Hiển thị per-planning results |

## 5. ACCEPTANCE (user-visible — Phase 5 check từng dòng)
1. Tạo phiếu nhóm Xe tải: thấy quotes 6 xe, chọn xe + addon → tổng phí cập nhật; vượt hạn mức → radio disable + submit block với message rõ.
2. Book xong → D2 thấy vận đơn + tài xế; mở tracking → timeline 2 cột chạy; hủy vận đơn → book lại được (rebook, cùng batchCode).
3. Replan phiếu đã hủy → đơn FAILED bị loại đúng, batch mới tạo.
4. FPT_DELIVERY hiển thị disabled "Sắp ra mắt" (3 nhóm thấy đủ).
5. E2E cũ + mới xanh.
6. UI theo design system SF-6 (sf6-* classes, tokens, i18n) — verify browser.
