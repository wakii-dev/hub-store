/**
 * REST DTOs — batching endpoints (REQUIREMENTS §5 khối 2) + master-data
 * extension endpoints (spec §3.1: GET /master-data/delivery-staff,
 * GET /master-data/shops — FLAG scope addition đã duyệt).
 *
 * BatchDto RE-USE `Batch` (types/product.ts — SF-1 P1-1, spec §3.4) — KHÔNG
 * định nghĩa lại. RegionDto/ShopDto/DeliveryStaffDto là shape mới (chưa có
 * trong §4), đặt ở đây vì chỉ xuất hiện qua REST contract.
 */
import type { BatchEntityStatus } from '../enums';
import type { TimeRange, Batch, ShopAssignment } from '../types';
import type { Paginated } from './envelopes';

/** BatchDto — alias của Batch entity (spec §3.4): batchCode, shopCode,
 *  shipperId, deliveryTime{from,to}, status 0 ACTIVE|1 COMPLETED|2 CANCELLED,
 *  items[] BatchingItem, createdAt. */
export type BatchDto = Batch;

// ---------------------------------------------------------------------------
// POST /fulfillment/batches/packing-suggest — gợi ý nhóm đơn theo khoảng cách (D1b)
// ---------------------------------------------------------------------------

export interface PackingSuggestRequest {
  /** Đơn đang có trong modal (cùng kho — rule 1 §3.6). */
  orderCodes: string[];
}

export interface PackingGroup {
  /** Đơn trong 1 nhóm giao cùng — thứ tự = suggested stopOrder. */
  orderCodes: string[];
  /** Tổng km của nhóm. */
  totalDistance: number;
}

export interface PackingSuggestResponse {
  groups: PackingGroup[];
}

// ---------------------------------------------------------------------------
// POST /fulfillment/batches/create — tạo phiếu (D1b "TẠO PHIẾU")
// ---------------------------------------------------------------------------

export interface CreateBatchRequest {
  /** Đơn tạo phiếu — cùng kho, tất cả batchStatus=0 (server validate qua GetOrdersByCodes, §3.6 rule 1). */
  orderCodes: string[];
  shipperId: string;
  deliveryTime: TimeRange;
}

// ---------------------------------------------------------------------------
// POST /fulfillment/batches/filter — D2 list
// ---------------------------------------------------------------------------

export interface FilterBatchesRequest {
  /** Text search theo số phiếu HOẶC số đơn (REQUIREMENTS §3 D2 filter 1). */
  searchText?: string;
  /** Trạng thái phiếu — multi-select (0 ACTIVE | 1 COMPLETED | 2 CANCELLED). */
  status?: BatchEntityStatus[];
  /** Thời gian tạo phiếu — ngày (lọc theo createdAt). */
  createdAt?: string;
  page: number;
  pageSize: number;
}

export type FilterBatchesResponse = Paginated<BatchDto>;

// ---------------------------------------------------------------------------
// PUT /fulfillment/batches/{code}/cancel — hủy phiếu (đơn revert batchStatus=0, §9)
// ---------------------------------------------------------------------------

export interface CancelBatchRequest {
  /** Lý do hủy — từ confirm modal D2. */
  reason: string;
}

// ---------------------------------------------------------------------------
// GET /fulfillment/batches/criteria — cấu hình trạng thái cho phép hủy
// ---------------------------------------------------------------------------

/** criteria trả states cho phép hủy = [ACTIVE] (spec §3.4). */
export interface BatchCriteriaResponse {
  cancellableStatuses: BatchEntityStatus[];
}

// ---------------------------------------------------------------------------
// POST /fulfillment/batches/recalculate-distance — tính lại km (D1b)
// ---------------------------------------------------------------------------

export interface RecalculateDistanceRequest {
  orderCodes: string[];
}

export interface OrderDistance {
  orderCode: string;
  /** Km sau tính lại. */
  distance: number;
}

export interface RecalculateDistanceResponse {
  items: OrderDistance[];
}

// ---------------------------------------------------------------------------
// GET /master-data/regions — danh sách tỉnh/phường (D1 filter địa chỉ)
// ---------------------------------------------------------------------------

/** Hierarchical region (spec D6 / §3.5). */
export interface RegionDto {
  code: string;
  name: string;
  type: 'province' | 'ward';
  /** Bắt buộc khi type='ward' — trỏ code tỉnh cha. */
  parentCode?: string;
}

export interface RegionsResponse {
  items: RegionDto[];
}

// ---------------------------------------------------------------------------
// GET /master-data/delivery-staff — extension (DeliveryStaffSelect D1b)
// ---------------------------------------------------------------------------

export interface DeliveryStaffDto {
  staffId: string;
  name: string;
  /** Staff gắn kho CN — D1b lọc theo kho của đơn. */
  shopCode: string;
  phone?: string;
}

export interface DeliveryStaffResponse {
  items: DeliveryStaffDto[];
}

// ---------------------------------------------------------------------------
// GET /master-data/shops — extension (options filter Kho CN ở D1)
// ---------------------------------------------------------------------------

/** Shape trùng ShopAssignment §4 (shopCode/shopName/address) — re-use, không lặp. */
export type ShopDto = ShopAssignment;

export interface ShopsResponse {
  items: ShopDto[];
}
