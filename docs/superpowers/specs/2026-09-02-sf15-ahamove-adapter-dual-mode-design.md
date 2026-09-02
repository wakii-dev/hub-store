# SF-15 — NVC backend: Ahamove adapter dual-mode (mock mặc định / real khi có key)

Story: FI-245 · Linear: FI-260 · Tier 3 (deps SF-3) · Spec gốc: §3.15
Context pack: `docs/superpowers/contexts/fi245-sf-15.md`
Status: Approved (autonomous — self-review + spec-critic pass)

## 1. Problem

Batching flow hiện có (Go gRPC :50052 + BFF REST proxy) chưa có carrier: quotes
xe tải, booking vận đơn, tracking, hủy. Chưa có credential Ahamove → cần adapter
**dual-mode**: `mock` MẶC ĐỊNH trả response shape Ahamove thực tế; điền
`AHAMOVE_API_KEY` + `AHAMOVE_PARTNER_TOKEN` (+ `AHAMOVE_MODE=real`) = gọi thật,
KHÔNG sửa code. Business data (plannings/bookings/tracking) lưu **Postgres
thật** (DB `batching`, migration V2); chỉ provider state (driver pool) là
in-memory trong adapter. Mock KHÔNG rải fixture ngoài adapter.

## 2. Scope

**In:**
- Adapter `internal/ahamove`: interface `Client` + `mock.go` (default) + `real.go` (Ahamove v3).
- Proto MỚI `api/proto/hubstore/batching/v1/delivery_batch.proto` — service `DeliveryBatchService` (additive, KHÔNG đụng batching.proto FROZEN, KHÔNG regenerate gen cũ).
- Batching DB V2 (`migrations/000002_nvc_*`): `shipment_plannings`, `bookings`, `shipment_tracking_events`, `addon_services` (catalog seed), `fee_limits` (per-shop seed).
- gRPC impl `internal/server/delivery_batch_server.go` + persist qua pgx (pattern PostgresStore SF-3).
- BFF: `src/clients/deliverybatch.ts` (gRPC facade) + `src/routes/deliverybatch.ts` (6 routes `/delivery-batch/*`) + register.
- REST DTO types MỚI trong `packages/shared/src/delivery-batch.ts`.
- `.env.example`: `AHAMOVE_MODE` / `AHAMOVE_API_KEY` / `AHAMOVE_PARTNER_TOKEN` / `AHAMOVE_BASE_URL` / `AHAMOVE_MOCK_FAST` (`.env` là local-only, KHÔNG commit — chỉ example vào git).
- E2E `e2e/tests/05-nvc-api.spec.ts` (mock mode, auth storageState pattern SF-4).
- Unit tests Go (mock adapter + fee-limit rules + timeline) + BFF contract test.

**Out (boundary):**
- KHÔNG FE (SF-16). KHÔNG fulfillment DB / apps/** / compose / realm / seed.
- KHÔNG đổi batching flow cũ (8 RPC, batches/batch_items V1 tables, routes cũ).
- KHÔNG Kafka (SF-27 side-channel, không vào path này).
- KHÔNG admin API quản lý fee_limits (data qua migration seed / DB).

## 3. Kiến trúc & data flow

```
FE (SF-16) → BFF REST /delivery-batch/* (requireUser, role metadata)
           → gRPC DeliveryBatchService (:50052)
           → server impl: validate + fee-limit (Postgres) + persist plannings/bookings
           → ahamove.Client (mock | real)  ← chỉ adapter đụng provider
```

- **Mode selection** (boot, `cmd/server/main.go`): `AHAMOVE_MODE=real` + đủ 2 key → real; ngược lại mock (mặc định). Log mode lúc boot; mọi response mock có `meta.mock=true` + log `[MOCK]`.

### 3.1 Adapter interface (Go)

```go
type Quote struct { ServiceID, Name string; VehicleType string; BaseFee, FeePerKm int64; EtaMinutes int32 }
type QuoteRequest struct { ShopCode string; DistanceKm float64; CodAmount, TotalBill int64 }
type BookingRequest struct { ShopCode string; Items []BookingItem } // stopOrder, address, distance, cod
type Booking struct { CarrierBookingID string; DriverName, DriverPhone, LicensePlate string; Status string }
type Client interface {
    Quotes(ctx, QuoteRequest) ([]Quote, error)
    Book(ctx, BookingRequest) ([]Booking, error)      // 1 booking/planning
    Cancel(ctx, carrierBookingID, reason string) error
    Detail(ctx, carrierBookingID string, bookedAt time.Time, cancelled bool) (status string, events []TrackEvent, err error)
}
```

- **mock.go**: 6 tải trọng (SGCN xe máy / 500KG / 1T / 2T / 3.5T / 8T) — fee = baseFee + feePerKm×distance (bảng giá deterministic, distance đơn vị **km float**); Book gán driver giả từ pool tuần hoàn (`Nguyễn Văn A`…, biển số `51A-123.45`…, `MOCK-` bookingID); Detail **stateless** — tính timeline từ `bookedAt`: `ORDER_CREATED` (t0) → `DRIVER_FOUND` (+1m) → `DELIVERING` (+5m) → `COMPLETED` (+30m); nhánh **FAILED**: nếu stop address chứa `FAILED` (substring — **contract có chủ đích** cho e2e/SF-16) → `COMPLETED` bị thay bằng `FAILED` (+35m, note lý do). Cancel → CANCELLED. Milestones qua env `AHAMOVE_MOCK_FAST=1` → giây thay phút (+2s/+5s/+10s/+12s) — test/E2E seam, document.
- **Đơn vị distance**: km (float64) toàn bộ DTO + DB.
- **real.go**: Ahamove v3 public API (`POST /v3/order/estimate`, `POST /v3/order`, `DELETE /v3/order/{id}`, `GET /v3/order/{id}`) — headers `API_KEY` + `PARTNER_TOKEN`, path/shape theo docs public; comment ghi rõ assumption chưa verify được thiếu credential. Base URL qua `AHAMOVE_BASE_URL` (default `https://api.ahamove.com`) — override cho integration test.

### 3.2 Fee-limit rules — BE-authoritative

- `fee_limits(shop_code PK, limit_amount, updated_at)`. Row thiếu → không giới hạn.
  (Shop codes tham chiếu seed fulfillment — dependency dev-env, READ-ONLY.)
- **Nguồn phí (server-side truth)**: `ConfirmPlanning` server gọi `adapter.Quotes`
  cho từng stop (distance hydrate từ `batch_items.distance` — V1 truth), chọn
  quote khớp `serviceId` → **persist `fee` vào `shipment_plannings`**. FE không
  được tin; fee trên request chỉ là display hint. Real mode: confirm tốn N
  estimate calls (latency/rate-limit là chấp nhận được ở quy mô batch dev) và
  fee **đóng băng tại thời điểm confirm** (drift so fee chốt của Ahamove sau đó
  là chấp nhận — document ở real.go).
- Enforce: `Quotes` response `isExceedFeeLimit = fee > limit` (full fee, **deviation
  có chủ đích** so epic "baseFee > limit" — vẫn an toàn vì block phía dưới chốt;
  boundary: strict `>`, đúng limit = OK). `ConfirmPlanning` block nếu planning fee
  > limit; `Booking` re-check persisted fee > limit → reject `FailedPrecondition`
  (BFF → HTTP 422). **BE chốt chặn**, không tin FE.
- Migration seed limit mẫu cho shops seed (SH-001…) để e2e test chặn.

### 3.3 Addon catalog (migration seed, bảng `addon_services`)

Nhóm `ROUTE` + `LOADING` (radio — chọn 1 trong nhóm), `DOCUMENT` (checkbox, fee 0), `ROUND_TRIP`; mỗi addon khai `vehicle_types` JSONB để filter theo xe. `Quotes` response trả catalog phù hợp vehicle.

### 3.4 DB V2 — bảng mới (golang-migrate 000002, additive)

| Bảng | Cột chính |
|---|---|
| `shipment_plannings` | id, batch_code, stop_order, order_code, vehicle_type, carrier_service_id, addon_services jsonb, status (DRAFT/CONFIRMED/BOOKED/CANCELLED), cod_amount, total_bill, **fee** (server-persisted — xem §3.2), timestamps |
| `bookings` | id, planning_id FK (**index, KHÔNG unique** — rebook = row mới, "current booking" = row mới nhất chưa CANCELLED), batch_code, carrier_booking_id, driver_name/phone, license_plate, status (sync status timeline mới nhất), booked_at, cancelled_at, cancel_reason, mock bool |
| `shipment_tracking_events` | id, booking_id FK, status, source (BE/PARTNER), occurred_at, note |
| `addon_services` | id, code unique, name, grp, fee, vehicle_types jsonb, sort |
| `fee_limits` | shop_code PK, limit_amount, updated_at |

Timeline advance: `SearchBookingDetail` gọi `adapter.Detail` → status mới hơn DB
→ INSERT tracking_events (idempotent theo status+booking) → update
`bookings.status` = status mới nhất → trả full timeline của current booking.
Restart an toàn (booked_at persist). **Guard**: booking DB status = CANCELLED →
KHÔNG insert event từ adapter (mock Detail nhận `cancelled` — chỉ trả
CANCELLED). ConfirmPlanning trên planning CONFIRMED/BOOKED → idempotent
no-op (trả trạng thái hiện có); trên DRAFT/**CANCELLED** → confirm lại (rebook
path); Book trên planning không ở CONFIRMED → `FailedPrecondition`. "Current
booking" = bookings row mới nhất chưa CANCELLED (order by **id DESC** — batch
book nhiều row trong 1 tx nên id là tie-break deterministic). `serviceId`
không có trong adapter quotes lúc Confirm → `InvalidArgument`.

### 3.5 Proto — `DeliveryBatchService` (file mới)

RPCs: `GetQuotes`, `ConfirmPlanning`, `CreateBooking`, `CancelDeliveryOrder`, `CancelDeliveryBatch`, `SearchBookingDetail`, `ListAddonServices`. Field names trùng REST DTO (camelCase) để BFF map gần như passthrough.

### 3.6 BFF routes (shape khớp app gốc — pragmatic, spec slice)

| Route | Body/Query → Response |
|---|---|
| `POST /delivery-batch/quotes` | `{shopCode, stopOrders:[{address,distance,codAmount,totalBill}]}` → `{quotes:[{serviceId,name,vehicleType,fee,baseFee,etaMinutes,isExceedFeeLimit,addonServices:[{code,name,grp,fee}]}] , meta:{mock}}` |
| `POST /delivery-batch/planning/confirm` | `{batchCode, plannings:[{stopOrder,orderCode,vehicleType,serviceId,addons[]}]}` → `{plannings:[...] status=CONFIRMED}` |
| `POST /delivery-batch/booking` | `{batchCode, shipmentPlannings:[{planningId, COD, totalBill, stopOrder}]}` → `{bookings:[{planningId,carrierBookingId,driver,licensePlate,status}]}` |
| `POST /delivery-batch/cancel-delivery-order` | `{planningId, reason}` → current booking CANCELLED + planning → CANCELLED (planning chưa book → cũng CANCELLED; đã CANCELLED → no-op). **Book-lại = 2 bước: ConfirmPlanning (CANCELLED → CONFIRMED, fee re-persist) rồi Booking — KHÔNG book trực tiếp trên planning CANCELLED** (`FailedPrecondition`). Timeline cũ giữ nguyên DB, response chỉ trả current booking |
| `POST /delivery-batch/cancel-batch` | `{batchCode, reason}` → cancel mọi booking ACTIVE (= status chưa CANCELLED/COMPLETED/FAILED) trong batch + planning CONFIRMED (chưa book) → DRAFT. Response: `{results:[{planningId,status}], cancelledCount}` |
| `GET /delivery-batch/searchbookingdetail?planningIds=a,b` | → `{bookings:[{planningId, booking|null, timeline:[{status,source,occurredAt,note}]}]}` — planning chưa book → entry với `booking=null`, `timeline=[]` (contract SF-16) |

Response mọi endpoint kèm `meta:{mock:boolean}` — `true` mock mode, `false` real (contract SF-16).

## 4. Testing

- **Go unit** (`internal/ahamove/*_test.go`): mock quotes 6 xe phí tăng theo distance; timeline trạng thái theo mốc thời gian (inject clock); FAILED branch; driver pool. `internal/server/delivery_batch_server_test.go`: fee-limit chặn confirm/booking; persist + searchbookingdetail idempotent (per-package test DB pattern SF-3 — testdb).
- **BFF contract test**: 6 routes shape + envelope + 422 fee-limit.
- **E2E** (`e2e/tests/05-nvc-api.spec.ts`, mock mặc định): quotes ≥6 xe phí khác nhau; confirm; booking gán tài xế + biển số; tracking timeline tiến (2 mốc thời gian — **precondition**: `AHAMOVE_MOCK_FAST=1`
trong root `.env` local; spec assert/notify nếu thiếu); hủy per-đơn + book lại
(rebook = confirm rồi book) OK; vượt fee limit → BE chặn (422). Auth storageState SF-4.

## 5. Risks

- Proto regen toolchain: gen CHỈ file mới (`protoc-gen-go` có sẵn; `protoc-gen-go-grpc@v1.3.0` go-install; ts-proto 2.7.7 pin). Gen cũ KHÔNG đụng.
- Ahamove real chưa verify được (thiếu cred) — cô lập `real.go`, documented assumptions.
- "Shape khớp app gốc": source gốc không có local — contract pragmatic ở §3.6 là nguồn chung cho SF-16; nếu app gốc lộ sai khác, chỉ cần adjust mapper BFF.
- Port xung đột cross-worktree khi verify — dùng port map riêng worktree này.
