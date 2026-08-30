import type { BatchEntityStatus } from '../enums';
import type { BatchingItem } from './batching';
import type { TimeRange } from './common';

/**
 * Product — dòng sản phẩm trong items[].
 * NOTE (ambiguity flagged): REQUIREMENTS §4 không định nghĩa field-level
 * shape cho Product/HubStoreOrderProduct — chỉ đặt tên type. Shape tối thiểu
 * dưới đây theo bảng D1 expand (items[] sản phẩm) + D2 (SL sản phẩm).
 * SF-2 (api-contract author) là nơi chốt shape cuối; nếu SF-2 thêm field,
 * mở rộng interface này — KHÔNG đổi tên field.
 */
export interface Product {
  productCode: string;
  productName: string;
  quantity: number;
}

/**
 * HubStoreOrderProduct — sản phẩm trong HubStoreOrderFilterItem.items[].
 * Alias của Product (REQUIREMENTS dùng 2 tên cho cùng khái niệm:
 * `items: HubStoreOrderProduct[]` ở D1 row, `items: Product[]` ở BatchingItem).
 */
export type HubStoreOrderProduct = Product;

/**
 * Batch — phiếu soạn hàng (spec §3.4, P1-1). Backend persistence shape;
 * BatchingItem là row hiển thị trên D2.
 */
export interface Batch {
  batchCode: string;
  shopCode: string;
  shipperId: string;
  deliveryTime: TimeRange;
  status: BatchEntityStatus;
  items: BatchingItem[];
  createdAt: string;
}
