/**
 * REST DTOs — /delivery-batch/* endpoints (SF-15, spec §3.6). Contract chung
 * cho SF-16 (FE NVC). Shape khớp app gốc — pragmatic (spec §3.6, không có
 * source gốc local).
 *
 * Mapping với proto DeliveryBatchService (delivery_batch.proto): field names
 * trùng camelCase — BFF map gần như passthrough. Khác biệt có chủ đích:
 *   - StopOrder: REST `distance` (km, app gốc) → proto `distanceKm`.
 *   - Booking: REST `driver` MỘT string "name - phone" (shape §3.6) — proto
 *     tách driver_name/driver_phone; BFF join, KHÔNG mất thông tin.
 *   - PlanningDto bỏ `id` (DB internal — không part của REST contract).
 *
 * Tiền tố `Delivery*` để tránh collision barrel với batching.ts (đã có
 * `CancelBatchRequest` của /fulfillment/batches). Tiền (VND) là number —
 * proto ts-gen dùng number cho int64 (SF-15 gen decision).
 */

/** MetaDto — mọi response /delivery-batch/* kèm: mock=true → mock mode. */
export interface MetaDto {
  mock: boolean;
}

// ---------------------------------------------------------------------------
// POST /delivery-batch/quotes — báo giá theo tải trọng (NVC step 1)
// ---------------------------------------------------------------------------

/** 1 stop giao — `distance` là km (float, app gốc dùng `distance`). */
export interface DeliveryStopOrderDto {
  address: string;
  distance: number;
  codAmount: number;
  totalBill: number;
}

export interface DeliveryQuotesRequest {
  shopCode: string;
  stopOrders: DeliveryStopOrderDto[];
}

/** Dịch vụ gia tăng đi kèm quote (radio/checkbox FE — grp phân nhóm). */
export interface DeliveryAddonDto {
  code: string;
  name: string;
  /** ROUTE / LOADING (radio) / DOCUMENT (checkbox) / ROUND_TRIP. */
  grp: string;
  /** VND */
  fee: number;
}

/** 1 mức tải trọng — fee BE-authoritative; isExceedFeeLimit chặn confirm. */
export interface DeliveryQuoteDto {
  serviceId: string;
  name: string;
  vehicleType: string;
  /** VND — tổng (base + per-km × distance). */
  fee: number;
  /** VND */
  baseFee: number;
  etaMinutes: number;
  /** fee > limit (strict >) — BE chặn confirm/booking khi true. */
  isExceedFeeLimit: boolean;
  addonServices: DeliveryAddonDto[];
}

export interface DeliveryQuotesResponse {
  quotes: DeliveryQuoteDto[];
  meta: MetaDto;
}

// ---------------------------------------------------------------------------
// POST /delivery-batch/planning/confirm — chốt giá + tạo shipment_plannings
// ---------------------------------------------------------------------------

/** 1 planning cần confirm — fee do server persist (spec §3.2). */
export interface DeliveryPlanningInputDto {
  stopOrder: number;
  orderCode: string;
  vehicleType: string;
  serviceId: string;
  addons: string[];
}

export interface DeliveryConfirmPlanningRequest {
  batchCode: string;
  plannings: DeliveryPlanningInputDto[];
}

/** Row shipment_plannings sau confirm — planningId là string decimal DB id. */
export interface DeliveryPlanningDto {
  planningId: string;
  batchCode: string;
  stopOrder: number;
  orderCode: string;
  vehicleType: string;
  serviceId: string;
  addons: string[];
  /** DRAFT / CONFIRMED / BOOKED / CANCELLED. */
  status: string;
  codAmount: number;
  totalBill: number;
  /** VND — fee server-persisted tại thời điểm confirm (spec §3.2). */
  fee: number;
}

export interface DeliveryConfirmPlanningResponse {
  plannings: DeliveryPlanningDto[];
  meta: MetaDto;
}

// ---------------------------------------------------------------------------
// POST /delivery-batch/booking — book carrier (gán tài xế + biển số)
// ---------------------------------------------------------------------------

export interface DeliveryBookingInputDto {
  planningId: string;
  /** VND — money-to-collect (proto cod_amount). */
  codAmount: number;
  /** VND */
  totalBill: number;
  stopOrder: number;
}

export interface DeliveryBookingRequest {
  batchCode: string;
  shipmentPlannings: DeliveryBookingInputDto[];
}

/** `driver` = "name - phone" (join 2 field proto — shape §3.6 app gốc). */
export interface DeliveryBookingDto {
  planningId: string;
  carrierBookingId: string;
  driver: string;
  licensePlate: string;
  status: string;
}

export interface DeliveryBookingResponse {
  bookings: DeliveryBookingDto[];
  meta: MetaDto;
}

// ---------------------------------------------------------------------------
// POST /delivery-batch/cancel-delivery-order — hủy 1 đơn đã book/chốt
// ---------------------------------------------------------------------------

export interface DeliveryCancelOrderRequest {
  planningId: string;
  reason: string;
}

export interface DeliveryCancelOrderResponse {
  planningId: string;
  status: string;
  meta: MetaDto;
}

// ---------------------------------------------------------------------------
// POST /delivery-batch/cancel-batch — hủy theo lô (booking ACTIVE → CANCELLED,
// planning CONFIRMED chưa book → DRAFT)
// ---------------------------------------------------------------------------

export interface DeliveryCancelBatchRequest {
  batchCode: string;
  reason: string;
}

export interface DeliveryCancelBatchResultDto {
  planningId: string;
  status: string;
}

export interface DeliveryCancelBatchResponse {
  results: DeliveryCancelBatchResultDto[];
  cancelledCount: number;
  meta: MetaDto;
}

// ---------------------------------------------------------------------------
// GET /delivery-batch/searchbookingdetail?planningIds=a,b — tracking detail
// ---------------------------------------------------------------------------

export interface DeliveryBookingDetailDto {
  carrierBookingId: string;
  driverName: string;
  driverPhone: string;
  licensePlate: string;
  status: string;
  /** ISO-8601 datetime. */
  bookedAt: string;
  /** ISO-8601 datetime — chỉ set khi CANCELLED. */
  cancelledAt: string;
  cancelReason: string;
}

/** 1 mốc timeline (source: BE | PARTNER). */
export interface DeliveryTrackEventDto {
  status: string;
  source: string;
  /** ISO-8601 datetime. */
  occurredAt: string;
  note: string;
}

/** Planning chưa book → booking=null, timeline=[] (contract SF-16). */
export interface DeliveryBookingEntryDto {
  planningId: string;
  booking: DeliveryBookingDetailDto | null;
  timeline: DeliveryTrackEventDto[];
}

export interface DeliverySearchBookingDetailResponse {
  bookings: DeliveryBookingEntryDto[];
  meta: MetaDto;
}
