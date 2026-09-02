/**
 * REST DTOs — fulfillment endpoints (REQUIREMENTS §5 khối 1 + §3.8 semantics).
 * Shape TÁI SỬ DỤNG types §4 có sẵn của SF-1 (`../types`) — KHÔNG định nghĩa
 * trùng (spec §3.1: DTO KHÔNG tự define shape đã có).
 */
import type { BatchStatus, OrderStatus } from '../enums';
import type { TimeRange, HubStoreOrderFilterItem } from '../types';
import type { Paginated } from './envelopes';

// ---------------------------------------------------------------------------
// POST /fulfillment/filter — D1 list (18 §5 + extension excludeFulfillCodes)
// ---------------------------------------------------------------------------

/** 8 filter fields của D1 (REQUIREMENTS §3 D1) + pagination + excludeFulfillCodes. */
export interface FilterOrdersRequest {
  /** Text search số đơn hàng (fulfillCode). */
  fulfillCode?: string;
  /** Trạng thái soạn hàng — multi-select. */
  batchStatus?: BatchStatus[];
  /** Trạng thái đơn — multi-select. */
  orderStatus?: OrderStatus[];
  /** Kho CN xuất hàng — multi-select shopCode. */
  shopCodes?: string[];
  /** Địa chỉ — multi-select region codes (tỉnh/phường). */
  regionCodes?: string[];
  /** Thời gian dự kiến giao — datetime range. */
  deliveryTime?: TimeRange;
  /** Thời gian tạo đơn — date range. */
  createdAt?: TimeRange;
  /** Thời gian KH mong muốn — datetime range. */
  originalTime?: TimeRange;
  /**
   * Extension (spec §3.1, pin v1): loại trừ các đơn đã được chọn —
   * search "thêm đơn" ở D1b phải ẩn đơn đã nằm trong modal.
   */
  excludeFulfillCodes?: string[];
  page: number;
  pageSize: number;
}

/** D1 list response — pagination envelope chứa đúng row type §4. */
export type FilterOrdersResponse = Paginated<HubStoreOrderFilterItem>;

// ---------------------------------------------------------------------------
// GET /fulfillment/{fulfillCode} — detail D1 (spec §3.8: implement, FE waive
// tường minh — D1 expand dùng items[] từ filter response)
// ---------------------------------------------------------------------------

/** 1 entry trong lịch sử đơn (chuyển kho / mutation order-status). */
export interface OrderHistoryEntry {
  timestamp: string;
  /** Hành động — vd `ASSIGN_SHOP_HUB`, `MUTATE_ORDER_STATUS`. */
  action: string;
  fromShopCode?: string;
  toShopCode?: string;
  actor?: string;
  note?: string;
}

/**
 * OrderDetail — superset của D1 row: thêm `orderCode` (mã RSA), `note`
 * (PUT /{code}/note) và `history[]`. Không lặp lại shape §4 — extend.
 */
export interface OrderDetail extends HubStoreOrderFilterItem {
  /** Mã đơn RSA (BatchingItem.orderCode — referential key với batches seed). */
  orderCode: string;
  /** Ghi chú — mutate qua PUT /fulfillment/{code}/note. */
  note: string;
  history: OrderHistoryEntry[];
}

// ---------------------------------------------------------------------------
// PUT /fulfillment/complete-picking — hoàn tất soạn (D11: batch 1→2 order-level)
// ---------------------------------------------------------------------------

export interface CompletePickingRequest {
  /** Phiếu được hoàn tất — mọi items[].orderCode đổi batchStatus → 2. */
  batchCode: string;
}

// ---------------------------------------------------------------------------
// POST /fulfillment/{code}/assign-shop-hub — chuyển kho (chỉ 1 đơn/lần, §9)
// ---------------------------------------------------------------------------

export interface AssignShopHubRequest {
  /** Kho đích. Server-side reject nếu isDebtSplittingOrder=true hoặc batchStatus≠0 (§3.6 rule 2). */
  toShopCode: string;
}

// ---------------------------------------------------------------------------
// POST /fulfillment/{code}/history — lịch sử chuyển kho
// ---------------------------------------------------------------------------

/**
 * READ SEMANTICS (spec §3.8): tên POST theo production nhưng KHÔNG mutate —
 * trả lịch sử của 1 đơn. SF-3 implement như GET; không ai viết handler mutate.
 */
export type AssignHistoryResponse = OrderHistoryEntry[];

// ---------------------------------------------------------------------------
// PUT /fulfillment/{code}/note — update ghi chú (§3.8: backend đủ 18/18,
// KHÔNG có FE screen — waive có chủ đích)
// ---------------------------------------------------------------------------

export interface UpdateNoteRequest {
  note: string;
}

// ---------------------------------------------------------------------------
// GET /order-promising/time-delivery — gợi ý TG giao (D4: hint cạnh DatePicker D1b)
// ---------------------------------------------------------------------------

/** Query params (nếu có). */
export interface TimeDeliveryRequest {
  shopCode?: string;
}

/** Slot TG giao gợi ý — FE render cạnh DatePicker. */
export interface TimeDeliveryResponse {
  timeSlots: TimeRange[];
}

// ---------------------------------------------------------------------------
// PUT /fulfillment/{code}/delivery-time — update TG dự kiến giao
// ---------------------------------------------------------------------------

/** Server-side reject nếu đơn đã có phiếu (batchStatus≠0, §3.6 rule 3). */
export interface UpdateDeliveryTimeRequest {
  deliveryTime: TimeRange;
}
