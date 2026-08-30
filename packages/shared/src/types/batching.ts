import type { OrderStatus } from '../enums';
import type { Product } from './product';

/** BatchingItem — 1 row trên D2 (REQUIREMENTS §4, field names GIỮ NGUYÊN). */
export interface BatchingItem {
  /** Mã phiếu soạn */
  batchCode: string;
  /** Thứ tự giao */
  stopOrder: number;
  /** Mã đơn RSA */
  orderCode: string;
  customerAddress: string;
  /** Km */
  distance: number;
  fromDeliveryTime: string;
  toDeliveryTime: string;
  orderStatus: OrderStatus;
  orderType: number;
  items: Product[];
  totalQuantity: number;
  /** VND */
  codAmount: number;
}
