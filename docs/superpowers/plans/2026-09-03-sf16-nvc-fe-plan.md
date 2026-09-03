# SF-16 NVC FE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NVC FE — carrier section (3 nhóm) trong D1b + quotes/addon/fee-gates + replan/rebook/hủy vận đơn/tracking modal + master map 15 trạng thái + e2e.

**Architecture:** Direction A — carrier radio trong section 2 `CreateBatchingModal` (tách `CarrierSection.tsx`), Tự giao default giữ nguyên flow legacy; Xe tải = quotes → confirm → booking (sequence SF-15). Fulfillment side: D2 actions (replan/rebook/cancel/tracking) dùng planning map localStorage (interim) + `shipmentStatuses.ts` pattern `techHelpers.ts`. RTKQ injectEndpoints trên singleton `@hub-store/api-client`; DTO có sẵn `packages/shared/src/api-contracts/delivery-batch.ts`.

**Tech Stack:** React 18 + antd 4.24.16 + RTK Query 2.12 + i18next + vitest/jsdom + Playwright (e2e serial, storageState coordinator).

**Linear Issue:** FI-261 · **Spec:** `docs/superpowers/specs/2026-09-03-sf16-nvc-fe-design.md` · **Base:** `story/fi245-postgres-production`

**Conventions (mọi task):** i18n keys qua `apps/*/src/i18n.ts` (SF-22 — KHÔNG hardcode string); tokens từ `DESIGN_TOKENS`/LESS modifyVars (KHÔNG hex cứng); KHÔNG đổi testid/DOM screens cũ (chỉ thêm testid mới trong UI mới); commit per task `feat(sf16): ...`; chạy `pnpm --filter <app> test` + typecheck trước commit.

---

## 0. Root cause analysis

### Root cause
FE rebuild tách 2 app orders/fulfillment trước khi có NVC — D1b chỉ biết shipper nội bộ, D2 chỉ biết batch legacy. BE SF-15 (delivery-batch API) đi trước FE nên giờ thiếu toàn bộ carrier UI.

### Current state
Tạo phiếu chỉ gán shipper; không xem báo giá xe tải, không book carrier, không tracking/hủy/replan/rebook. User phải gọi API tay.

### Expected outcome
D1b chọn nhóm carrier → quotes 6 xe → addon → gates → book; D2 replan/rebook/hủy/tracking ngay trên batch list; E2E phủ.

### Constraints & hardships
services/** READ-ONLY (SF-15 không sửa); không có list-plannings-by-batch (localStorage map interim + RG #5); không có allowCancelDelivery/urltracking (RG #1/#2); isShortaged/MRSA không tồn tại (RG #4); limit amount không expose (RG #6).

### High-level strategy
Mở rộng modal hiện có (không wizard mới), FE-side derive trạng thái, BE-authoritative 422 làm lớp chặn cuối, e2e UI spec mới chạy trên stack mock.

## 1. Problem
Coordinator/warehouse tạo phiếu giao cần NVC (xe tải) nhưng FE không có đường — who/when: mọi user tạo phiếu + theo dõi vận đơn tại D2.

## 2. Scope
- **In:** carrier section 3 nhóm; quotes + recalc; addon selector; fee gates; replan/rebook; hủy vận đơn per-đơn/batch + note; tracking modal timeline 2 cột; master map 15 trạng thái; e2e `07-nvc-fe.spec.ts`.
- **Out:** services/** sửa; map view; flow batch legacy; antd5; testid/DOM cũ; SF-21 print.
- **Success criteria:** ACCEPTANCE §5 spec (6 dòng) + E2E cũ còn xanh.

## 3. Touch map
- **Modify:** `apps/orders/src/batching/CreateBatchingModal.tsx`, `batching-modal.css`, `apps/orders/src/i18n.ts`, `apps/fulfillment/src/pages/BatchListPage.tsx`, `apps/fulfillment/src/api/batchesApi.ts` (chỉ thêm — không đổi hook cũ), `apps/fulfillment/src/i18n.ts`.
- **Create:** `apps/orders/src/batching/CarrierSection.tsx`, `apps/orders/src/batching/deliveryBatchApi.ts`, `apps/orders/src/batching/carrierHelpers.ts(+test)`, `apps/fulfillment/src/delivery/shipmentStatuses.ts(+test)`, `apps/fulfillment/src/delivery/ShipmentStatusTag.tsx`, `apps/fulfillment/src/delivery/TrackingModal.tsx`, `apps/fulfillment/src/delivery/planningMap.ts(+test)`, `apps/fulfillment/src/api/deliveryBatchApi.ts`, `e2e/tests/07-nvc-fe.spec.ts`.
- **Consumers/regression:** `CreateBatchingModal.test.tsx`, `BatchListPage.test.tsx`, e2e 01-06 (batch-* testids), MF exports (không đổi).
- **Shared surfaces:** REST `/delivery-batch/*` (SF-15, 422 precondition), localStorage `nvc.plannings.<batchCode>`.

## 4. Design
- **Approach:** Direction A (spec §2) — carrier radio trong section 2; Direction B (wizard riêng) dismissed vì đụng DOM stepper.
- **Alternatives dismissed:** shared StatusTag extend (numeric kinds không khớp string statuses); BE sửa (READ-ONLY).
- **Edge cases:** đổi xe → reset addon; quote vượt hạn mức đang chọn → auto-clear; replan tất-cả-FAILED → EmptyState + submit disabled; cancel-batch partial results; planning map mồ côi → EmptyState; 422 → i18n message.
- **Non-functional:** debounce 300ms quotes; i18n vi/en; a11y tooltip cho disabled radio; mock badge `[MOCK]` từ `meta.mock`.

## 5. Implementation outline — Tasks + DAG

| # | Task | App | Deps |
|---|------|-----|------|
| 1 | carrier-section-d1b | orders | — |
| 2 | status-master-map | fulfillment | — |
| 3 | quotes-display-recalc | orders | 1 |
| 4 | addon-selector | orders | 3 |
| 5 | fee-limit-gates | orders | 4 |
| 6 | replan-rebook-flows | fulfillment + shared + orders(D1Page) | 1, 5 (same-file serialization với T3-T5 — dispatch serial) |
| 7 | cancel-shipment-ui | fulfillment | 6 |
| 8 | tracking-modal | fulfillment | 2, 7 (same-file BatchListPage — encode edge) |
| 9 | e2e-nvc-fe-spec | e2e | 5, 7, 8 |

- **Testing strategy:** unit (vitest) helpers/statuses/planningMap + modal modes; e2e UI thật (mock mode); browser walkthrough Rule 0 3 tầng trước merge.

## 6. Risks & unknowns
- **Must verify khi làm:** running stack trước browser verify (`scripts/boot-all.sh`); e2e order seed không đụng specs khác (dùng ORD-3018+/shop 30203 pattern cleanup afterAll).
- **Assumptions đã verify:** rebook semantic `confirmOne` (CANCELLED→CONFIRMED cùng id, CONFIRMED no-op — Go server); timeline `source: BE|PARTNER` có trong DTO; fixture 8T vượt limit (seed 150000 + ORD-3021 7.9km).

---

### Task 1: carrier-section-d1b — RTKQ api + carrier radio 3 nhóm trong D1b

**Files:**
- Create: `apps/orders/src/batching/deliveryBatchApi.ts`, `apps/orders/src/batching/CarrierSection.tsx`, `apps/orders/src/batching/carrierHelpers.ts`, `apps/orders/src/batching/carrierHelpers.test.ts`
- Modify: `apps/orders/src/batching/CreateBatchingModal.tsx` (section 2 — chèn CarrierSection trên shipper-select), `batching-modal.css`, `apps/orders/src/i18n.ts`

**Key types (import từ `@hub-store/shared` → `api-contracts/delivery-batch`):** `DeliveryQuoteDto`, `DeliveryQuotesRequest/Response`, `DeliveryConfirmPlanningRequest/Response`, `DeliveryBookingRequest/Response`, `DeliveryCancelOrderRequest/Response`, `DeliveryCancelBatchRequest/Response`, `DeliverySearchBookingDetailResponse`, `MetaDto`.

**Steps:**
- [x] 1.1 `deliveryBatchApi.ts`: `api.injectEndpoints` — mutation `getQuotes` (POST `/delivery-batch/quotes`), `confirmPlanning` (POST `/delivery-batch/planning/confirm`), `createBooking` (POST `/delivery-batch/booking`). Export hooks `useGetQuotesMutation` v.v. Pattern: copy error/typing style từ `batchingApi.ts` (axiosBaseQuery `{url, method, data}`).
- [x] 1.2 `carrierHelpers.ts`:
```ts
export const CARRIER_GROUPS = ['KHO_CN', 'TRUCK', 'FPT_DELIVERY'] as const;
export type CarrierGroup = (typeof CARRIER_GROUPS)[number];
/** FPT_DELIVERY chưa có BE — render disabled (RG epic). */
export const isGroupEnabled = (g: CarrierGroup) => g !== 'FPT_DELIVERY';
export function toStopOrders(rows: BatchingRow[]): DeliveryStopOrderDto[] {
  return rows.map((r) => ({ address: r.address, distance: r.distance ?? 0, codAmount: r.codAmount ?? 0, totalBill: r.totalBill ?? 0 }));
}
```
  (kiểm field thật của `BatchingRow` trong `batchingHelpers.ts` — dùng đúng tên field hiện có, KHÔNG bịa).
- [x] 1.3 `CarrierSection.tsx`: `Radio.Group` data-testid `carrier-group` với 3 option `carrier-group-KHO_CN` / `-TRUCK` / `-FPT_DELIVERY` (FPT: `disabled` + Tooltip "Sắp ra mắt"). Props: `{ value: CarrierGroup; onChange: (g: CarrierGroup) => void }`. CSS class `.sf6-form-card` + label i18n `orders:batching.carrierGroup.*`. Slot children cho phần quotes (Task 3).
- [x] 1.4 Modal wiring: state `carrierGroup: CarrierGroup = 'KHO_CN'` (default — flow cũ KHÔNG đổi); render `<CarrierSection>` trong section 2 trên `batch-shipper-select`; `mode` prop mới `mode?: 'create' | 'replan' | 'rebook'` (default `'create'`) — Task 1 chỉ thêm prop + tiêu đề i18n theo mode (behavior replan/rebook ở Task 6). Khi `carrierGroup !== 'KHO_CN'`: submit hiện chưa làm gì thêm (Task 3-5 nối tiếp) — **nhưng** `batch-submit` flow KHO_CN phải chạy y cũ.
- [x] 1.5 i18n keys `orders:batching.carrier*` (vi + en). CSS: `.carrier-section` dùng tokens.
- [x] 1.6 Test `carrierHelpers.test.ts`: `isGroupEnabled`, `toStopOrders` mapping. Update `CreateBatchingModal.test.tsx`: default KHO_CN → submit flow cũ không đổi (regression test).
- [x] 1.7 `pnpm --filter orders test && pnpm --filter orders exec tsc --noEmit` → commit `feat(sf16): carrier section 3 nhóm trong D1b + delivery-batch RTKQ api`.

### Task 2: status-master-map — 15 trạng thái vận đơn

**Files:**
- Create: `apps/fulfillment/src/delivery/shipmentStatuses.ts`, `shipmentStatuses.test.ts`, `ShipmentStatusTag.tsx`
- Modify: `apps/fulfillment/src/i18n.ts`

**Steps:**
- [x] 2.1 `shipmentStatuses.ts` — pattern `apps/shell/src/features/tech/techHelpers.ts`:
```ts
export const SHIPMENT_STATUSES = ['ORDER_CREATED','ASSIGNING','ASSIGN_FAILED','DRIVER_FOUND','DRIVER_REASSIGNING','ARRIVED','WAITING_CONFIRM','DELIVERING','DELIVERED','COMPLETED','FAILED','CANCELLED','RETURNING','RETURNED','LOST'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number] | (string & {});
export const SHIPMENT_TONE_MAP: Partial<Record<ShipmentStatus, StatusTone>> = { ORDER_CREATED:'info', ASSIGNING:'info', DRIVER_FOUND:'success', DELIVERING:'warning', COMPLETED:'success', FAILED:'error', CANCELLED:'neutral', /* ...đủ 15 */ };
export const isKnownShipmentStatus = (s: string): s is (typeof SHIPMENT_STATUSES)[number] => (SHIPMENT_STATUSES as readonly string[]).includes(s);
export function shipmentStatusLabel(s: string, locale: 'vi'|'en'): string // i18n `fulfillment:shipment.status.<code>`; unknown → return s (code gốc)
```
  Tone colors từ `DESIGN_TOKENS.color.status` (copy pattern `toneColors` techHelpers — KHÔNG hex cứng).
- [x] 2.2 `ShipmentStatusTag.tsx`: `{status: string}` → pill class `sf6-status-tag` + tone class, `data-testid={'shipment-status-' + status}`; unknown → tone info + label = code.
- [x] 2.3 i18n `fulfillment:shipment.status.*` đủ 15 mã vi/en (VD `ORDER_CREATED`: vi "Đã tạo vận đơn" / en "Order created"; `DRIVER_REASSIGNING`: vi "Đang đổi tài xế" / en "Reassigning driver").
- [x] 2.4 Test: known status → label vi/en đúng; unknown status → trả code, tone info; đủ 15 mã có label.
- [x] 2.5 `pnpm --filter fulfillment test && tsc --noEmit` → commit `feat(sf16): master map 15 trạng thái vận đơn + ShipmentStatusTag`.

### Task 3: quotes-display-recalc — bảng quotes 6 xe + recalc

**Files:**
- Modify: `CarrierSection.tsx` (children slot), `CreateBatchingModal.tsx`, `batching-modal.css`, i18n
- Create: (tests mở rộng `CreateBatchingModal.test.tsx`)

**Steps:**
- [x] 3.1 State trong modal (hoặc CarrierSection): `quotes: DeliveryQuoteDto[] | null`, `quotesLoading`, `selectedServiceId: string | null`, `metaMock: boolean`. Chọn nhóm TRUCK → gọi `useGetQuotesMutation` với `{shopCode: rows[0].shopAssignment.shopCode, stopOrders: toStopOrders(rows)}` (debounce 300ms; refetch khi rows distance đổi — kết hợp signal `batch-recalc-distance` đã có). Loading → `TableSkeleton`/Spin.
- [x] 3.2 Render radio list `quote-{serviceId}` (testid mới — được phép): name + vehicleType badge + fee `formatVnd` + `etaMinutes` phút + `[MOCK]` tag khi `metaMock`. Chọn quote → `selectedServiceId`.
- [x] 3.3 Recalc tổng: `totalFee = selectedQuote.fee + Σ selectedAddon.fee` (helper `computeTotalFee(quote, addons: DeliveryAddonDto[])` trong `carrierHelpers.ts` + test) — hiển thị ở sumbar (dòng "Phí vận chuyển") + review section (dòng mới, KHÔNG đụng dòng cũ).
- [x] 3.4 Submit TRUCK (wiring thô, gates chi tiết Task 5): `batch-submit` khi TRUCK → sequence: `POST /fulfillment/batches/create` (hook `useCreateBatchMutation` có sẵn — orderCodes từ rows, shipperId, deliveryTime) → `confirmPlanning` (mỗi row: `{stopOrder, orderCode, vehicleType: selectedQuote.vehicleType, serviceId, addons: []}` — addons nối vào Task 4) → `createBooking` (`{planningId, codAmount, totalBill, stopOrder}` từ create response + confirm response). Kết quả bookings hiển thị review section (driver, licensePlate, carrierBookingId). Lỗi 422 → message qua `error.data.details[].message` + i18n wrapper.
- [x] 3.5 i18n + CSS (`.quote-list`, `.quote-item` — tokens only).
- [x] 3.6 Test: computeTotalFee; modal TRUCK → mock api (msw hoặc mock hook theo pattern test hiện có) → quotes render 6 radio, chọn → tổng cập nhật.
- [x] 3.7 test + tsc → commit `feat(sf16): quotes display + recalc + submit truck sequence`.

### Task 4: addon-selector — ROUTE/LOADING radio, DOCUMENT/ROUND_TRIP checkbox

**Files:**
- Create: `apps/orders/src/batching/AddonSelector.tsx`
- Modify: `CarrierSection.tsx`, `CreateBatchingModal.tsx` (truyền addons vào confirm), i18n, css

**Steps:**
- [x] 4.1 `AddonSelector.tsx`: props `{addons: DeliveryAddonDto[]; value: string[]; onChange: (codes: string[]) => void; disabled?: boolean}`. Nhóm theo `grp`: ROUTE/LOADING → `Radio.Group` (exclusive trong grp); DOCUMENT/ROUND_TRIP → `Checkbox`. Item disabled khi `disabled` (unavailable — tooltip). Testid `addon-{code}`.
- [x] 4.2 Wire vào modal: `selectedAddons: string[]` từ `selectedQuote.addonServices`; **đổi quote → reset `selectedAddons`** (useEffect on selectedServiceId). Confirm payload `addons: selectedAddons`.
- [x] 4.3 Tổng phí đã gồm addon (computeTotalFee Task 3) — verify review/sumbar cập nhật khi tick addon.
- [x] 4.4 i18n: `orders:batching.addon.grp.*` (ROUTE/LOADING/DOCUMENT/ROUND_TRIP labels vi/en).
- [x] 4.5 Test: chọn radio ROUTE thay LOADINGS exclusive; checkbox multi; đổi xe reset selection; total cập nhật.
- [x] 4.6 test + tsc → commit `feat(sf16): addon selector radio/checkbox + reset theo xe`.

### Task 5: fee-limit-gates — disable radio + block submit + message

**Files:**
- Modify: `CarrierSection.tsx`, `CreateBatchingModal.tsx`, `carrierHelpers.ts(+test)`, i18n

**Steps:**
- [ ] 5.1 `carrierHelpers.ts` thêm:
```ts
export const isQuoteBlocked = (q: DeliveryQuoteDto) => q.isExceedFeeLimit;
/** Submit gate — selection chứa quote vượt hạn mức → chặn (BE-authoritative 422 là lớp cuối). */
export const hasBlockedSelection = (q: DeliveryQuoteDto | null) => q != null && q.isExceedFeeLimit;
```
- [ ] 5.2 Quote radio `isExceedFeeLimit` → `disabled` + Tooltip i18n "Vượt hạn mức phí cho shop này" + tag tone error.
- [ ] 5.3 Auto-clear: nếu `selectedServiceId` trỏ quote bị vượt (sau refetch) → clear selection + warning banner i18n (`sf6-note-banner` style).
- [ ] 5.4 Submit block: `hasBlockedSelection` → nút `batch-submit` disabled (TRUCK mode) + message line dưới nút. 422 từ confirm/booking → hiển thị `details[].message` qua `notification.error` + i18n fallback.
- [ ] 5.5 Test: quote vượt → disabled; đang chọn rồi vượt (refetch) → cleared + banner; submit disabled khi blocked.
- [ ] 5.6 test + tsc → commit `feat(sf16): fee-limit gates — disable/blocked-submit/422 message`.

### Task 6: replan-rebook-flows — D2 actions + planning map + modal modes

**Files:**
- Create: `packages/shared/src/storage/planningMap.ts` + `planningMap.test.ts` (P0 plan-critic: KHÔNG cross-app import — shell serve cả 2 remote cùng origin :3000 nên localStorage chung; shared package là đường duy nhất), `apps/fulfillment/src/api/deliveryBatchApi.ts`
- Modify: `apps/fulfillment/src/pages/BatchListPage.tsx` (actions mới — KHÔNG đụng nút Cancel/Complete/Print cũ), `apps/orders/src/batching/CreateBatchingModal.tsx` (behavior mode replan/rebook — Task 1 đã thêm prop), `apps/orders/src/pages/D1Page.tsx` (entry-point đọc URL params), i18n cả 2 app

**Kiến trúc cross-MF (P0 plan-critic):** D2 (fulfillment) KHÔNG import modal của orders trực tiếp — navigate `/hub-store-order/order?nvcMode=replan|rebook&batchCode=<code>` (URLSearchParams, sạch khi rời page); `D1Page` đọc params on mount → set selectedRows + mở `CreateBatchingModal` mode tương ứng. KHÔNG thêm MF remotes/exposes mới (tránh exposed-module-init risk).

**Steps:**
- [ ] 6.1 `packages/shared/src/storage/planningMap.ts`:
```ts
export interface PlanningMapEntry { planningId: string; orderCode: string; stopOrder: number; serviceId: string; vehicleType: string; addons: string[]; }
const key = (b: string) => `nvc.plannings.${b}`;
export const loadPlanningMap = (batchCode: string): PlanningMapEntry[] => { try { return JSON.parse(localStorage.getItem(key(batchCode)) ?? '[]') as PlanningMapEntry[]; } catch { return []; } }
export const savePlanningMap = (batchCode: string, entries: PlanningMapEntry[]) => { localStorage.setItem(key(batchCode), JSON.stringify(entries)); }
```
  Orders side: modal (Task 3 sequence) gọi `savePlanningMap` sau confirm. Test: save/load roundtrip + corrupt JSON → []. Export qua barrel `packages/shared/src/index.ts` (nếu có) theo pattern hiện có.
- [ ] 6.2 `apps/fulfillment/src/api/deliveryBatchApi.ts`: injectEndpoints `cancelDeliveryOrder`, `cancelBatch`, `searchBookingDetail` (GET query planningIds join ','). **KHÔNG đăng ký `confirmPlanning`/`createBooking` ở fulfillment** — rebook đi qua orders modal (navigate), tránh trùng endpoint name trên singleton api (P2 plan-critic).
- [ ] 6.3 D2 actions trong `batch-actions-{code}` Space (thêm item, không đổi item cũ):
  - **"Tạo lại phiếu"** (replan) testid `batch-replan-{code}`: hiện khi `batch.status === BATCH_ENTITY_STATUS.CANCELLED`. Click → `navigate('/hub-store-order/order?nvcMode=replan&batchCode=' + code)`.
  - **"Book lại vận đơn"** (rebook) testid `batch-rebook-{code}`: hiện khi batch ACTIVE + `loadPlanningMap(code)` có entries. Click → `navigate('/hub-store-order/order?nvcMode=rebook&batchCode=' + code)`.
- [ ] 6.4 `D1Page.tsx` entry-point: on mount đọc `nvcMode`/`nvcBatchCode` search params → `replan`: fetch `getBatchOrders(batchCode)` → loại đơn FAILED (exact field từ `OrderExpandContent` hiện có) → selectedRows = orders còn lại → mở modal `mode='replan'` (hết order khả dụng → info EmptyState); `rebook`: fetch `searchBookingDetail(planningIds từ map)` → `planningIdsToRebook` = entries có booking cancelled/booking null mà planning CANCELLED → mở modal `mode='rebook'`. Xóa params sau khi mở (replaceState) để refresh không mở lại.
- [ ] 6.5 Modal behavior `mode='replan'`: title i18n "Tạo lại phiếu giao", submit = create flow (như create). `mode='rebook'`: title "Book lại vận đơn", section 1 rows disabled (không DnD/thêm/bớt), submit **KHÔNG create batch** → chỉ `confirmPlanning` (batchCode hiện có — chỉ planningIdsToRebook) + `createBooking`; planning CONFIRMED/BOOKED khác không đụng (BE idempotent no-op). Review hiển thị kết quả book mới.
- [ ] 6.6 i18n vi/en cả orders (modal modes + D1Page entry) + fulfillment (actions). Test: planningMap roundtrip; BatchListPage — gate hiện/ẩn actions theo status + map (mock localStorage); modal rebook không gọi create; D1Page đọc params mở đúng mode.
- [ ] 6.7 test + tsc (cả 2 app) → commit `feat(sf16): replan/rebook flows — D2 actions + planning map + modal modes`.

### Task 7: cancel-shipment-ui — hủy vận đơn per-đơn/batch + auto-note

**Files:**
- Modify: `BatchListPage.tsx` (expand row + batch actions), i18n

**Steps:**
- [ ] 7.1 Expand row (`order-expand-{code}` — thêm item, không đổi item cũ): nếu planning map có entry cho orderCode → nút "Hủy vận đơn" testid `cancel-delivery-{orderCode}` → modal reason (pattern cancel-batch reason modal hiện có) với **textarea prefill auto-note**: `Hủy vận đơn bởi <username> — <batchCode>/<orderCode>` (editable) → `cancelDeliveryOrder {planningId, reason}` → refetch + `notification.success` + update map không cần (planning CANCELLED vẫn in-map).
- [ ] 7.2 Batch action "Hủy vận đơn (cả phiếu)" testid `cancel-delivery-batch-{code}`: hiện khi batch ACTIVE + map có entries. Confirm reason modal → `cancelBatch {batchCode, reason}` → kết quả `Modal`/`Alert` per-planning (`results[]`: planningId → status CANCELLED/DRAFT) + `cancelledCount`.
- [ ] 7.3 422 (BE-authoritative — VD booking COMPLETED không hủy được) → notification error `details[].message`.
- [ ] 7.4 i18n vi/en. KHÔNG đụng nút Cancel legacy (label phân biệt: "Hủy phiếu" cũ vs "Hủy vận đơn" mới).
- [ ] 7.5 Test: nút hiện theo map; cancel gọi đúng payload; partial results render.
- [ ] 7.6 test + tsc → commit `feat(sf16): hủy vận đơn per-đơn/batch + auto-note + partial results`.

### Task 8: tracking-modal — timeline 2 cột + link + status tags

**Files:**
- Create: `apps/fulfillment/src/delivery/TrackingModal.tsx`
- Modify: `BatchListPage.tsx` (action "Tracking"), i18n, css nếu cần

**Steps:**
- [ ] 8.1 Action "Tracking" testid `batch-track-{code}`: hiện khi map có entries. Click → `TrackingModal` mở: fetch `searchBookingDetail` (planningIds từ map).
- [ ] 8.2 Modal (`width={720}`, `sf6-modal-animation`): header mỗi planning — `ShipmentStatusTag` (booking.status), driver "name - phone" (split ` - ` cuối), `licensePlate`, `carrierBookingId`, bookedAt formatPeriodOfTime; **link `urltracking`**: `('urltracking' in booking) && booking.urltracking` → `<a target="_blank" rel="noreferrer">` (BE chưa có field → tự ẩn — contract-ready). Planning chưa book (booking null) → EmptyState "Chưa book vận đơn".
- [ ] 8.3 **Timeline 2 cột** (antd `Row/Col` 2× `Timeline`): cột "Hệ thống" (source=BE) | cột "Đối tác" (source=PARTNER). Mỗi mốc: `shipmentStatusLabel` + occurredAt (formatPeriodOfTime) + note (nếu có). Testid `tracking-timeline-be` / `tracking-timeline-partner`.
- [ ] 8.4 Per-order entry: expand row action "Tracking" testid `order-track-{orderCode}` mở modal lọc entry đó.
- [ ] 8.5 i18n vi/en.
- [ ] 8.6 Test: render modal từ mock searchBookingDetail (timeline BE/PARTNER tách đúng cột; unknown status → code; booking null → EmptyState).
- [ ] 8.7 test + tsc → commit `feat(sf16): tracking modal timeline 2 cột + urltracking slot`.

### Task 9: e2e-nvc-fe-spec — `e2e/tests/07-nvc-fe.spec.ts`

**Files:**
- Create: `e2e/tests/07-nvc-fe.spec.ts`

**Steps:**
- [ ] 9.0 Pre: `pnpm --filter orders build && pnpm --filter fulfillment build` (MF build bắt import cross-package lỗi mà tsc bỏ sót) — pass mới chạy e2e.
- [ ] 9.1 Spec UI qua browser (storageState coordinator mặc định, baseURL :3000). Dùng đơn seed chưa dùng: chọn 2 đơn shop 30203 còn "Chưa soạn" qua D1 filter (pattern 01-main-flow select rows) — cleanup afterAll cancel batch (pattern 05-nvc-api).
- [ ] 9.2 Flow 1 — tạo phiếu Xe tải: D1 select 2 đơn → `bulk-create-batch` → section 1/2 → `carrier-group-TRUCK` → chờ `quote-1T` visible (6 `quote-*`) → click `quote-1T` → click `addon-DOCUMENT` → tổng phí text đổi → click `quote-8T` expect disabled (fixture: 8T vượt limit 150000 — guard `test.skip` nếu seed đổi) → `batch-submit` → success → đóng modal.
- [ ] 9.3 Flow 2 — D2 vận đơn: navigate `/hub-store-order/batch` → tìm batch mới → thấy driver text trong actions/expand → `batch-track-{code}` → modal: `tracking-timeline-partner` có ≥1 mốc, `shipment-status-DRIVER_FOUND` visible → đóng.
- [ ] 9.4 Flow 3 — hủy + rebook: expand 1 đơn → `cancel-delivery-{orderCode}` → confirm reason → toast → `batch-rebook-{code}` → modal rebook → submit → booking mới (driver mới hiện). (rebook cần planning CANCELLED — cancel per-đơn trước là đúng gate).
- [ ] 9.5 Flow 4 — replan: cancel batch legacy (API `PUT /fulfillment/batches/{code}/cancel` qua request context — pattern 05) → D2 reload → `batch-replan-{code}` → modal prefill không có đơn FAILED (nếu tạo đơn FAILED: dùng API fail 1 đơn trước) → submit → batch mới thấy.
- [ ] 9.6 Chạy: `E2E_REUSE=1` với stack đang chạy (dev loop) rồi full `pnpm e2e` (E2E=1) trước merge. E2E cũ 01-06 phải xanh.
- [ ] 9.7 Commit `test(sf16): e2e UI carrier/tracking/cancel/rebook/replan`.

---

## ACCEPTANCE → Task mapping (Phase 5 checklist)
| ACCEPTANCE | Tasks |
|---|---|
| 1. Quotes 6 xe + addon + tổng cập nhật + gate chặn | 3, 4, 5 |
| 2. Book → D2 thấy vận đơn + tài xế; tracking timeline; hủy → rebook | 6, 7, 8 |
| 3. Replan loại đơn FAILED (interim RG #4) | 6 |
| 4. FPT_DELIVERY disabled "Sắp ra mắt" | 1 |
| 5. E2E cũ + mới xanh | 9 |
| 6. Design system SF-6 + i18n + browser verify | mọi task + Phase 5 |
