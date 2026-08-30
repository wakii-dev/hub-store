import type { BatchStatus, OrderStatus } from '../enums';
import type { TimeRange } from './common';
import type { HubStoreOrderProduct } from './product';

/** Kho CN xuất hàng (REQUIREMENTS §4 HubStoreOrderFilterItem.shopAssignment). */
export interface ShopAssignment {
  shopCode: string;
  shopName: string;
  address: string;
}

/** HubStoreOrderFilterItem — 1 row trên D1 (REQUIREMENTS §4, field names GIỮ NGUYÊN). */
export interface HubStoreOrderFilterItem {
  /** Số đơn hàng (ORD-xxxx) */
  fulfillCode: string;
  /** Trạng thái điều phối (code thô — không có enum trong REQUIREMENTS) */
  statusCode: number;
  /** Trạng thái soạn hàng (0-3) */
  batchStatus: BatchStatus;
  /** Mã phiếu soạn (nếu có) */
  batchCode?: string;
  shopAssignment: ShopAssignment;
  /** TG KH mong muốn */
  originalTime: TimeRange;
  /** TG dự kiến giao */
  deliveryTime: TimeRange;
  /** Trạng thái đơn (0-2) */
  orderStatus: OrderStatus;
  items: HubStoreOrderProduct[];
  /** Tiền COD (VND) */
  codAmount: number;
  totalQuantity: number;
  /** Đơn chia nợ — không được chuyển kho (§9) */
  isDebtSplittingOrder: boolean;
  customerAddress: string;
  /** Khoảng cách (km) */
  distance?: number;
}
