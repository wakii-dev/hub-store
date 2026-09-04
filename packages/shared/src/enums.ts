/**
 * Status enums — convention: `as const` objects + derived union types.
 * NO TypeScript `enum` keyword (incompatible with `isolatedModules`,
 * worse tree-shaking). Keys are stable identifiers; values are the
 * wire codes agreed in REQUIREMENTS §4 / spec §3.4.
 * SF-2 authors api-contracts against these; SF-7..10 consume them.
 */

/** BatchStatus — Trạng thái soạn hàng (order-level, D1 filter + column). */
export const BATCH_STATUS = {
  NOT_PREPARED: 0, // Chưa soạn
  PREPARING: 1, // Đang soạn
  PREPARED: 2, // Đã soạn
  WEIGHT_EXCEEDED: 3, // Lỗi vượt trọng lượng
} as const;
export type BatchStatus = (typeof BATCH_STATUS)[keyof typeof BATCH_STATUS];

/** OrderStatus — Trạng thái đơn. */
export const ORDER_STATUS = {
  PENDING_APPROVAL: 0, // Chờ duyệt
  APPROVED: 1, // Đã duyệt
  REJECTED: 2, // Từ chối duyệt
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** CoordinationStatus — Trạng thái điều phối. */
export const COORDINATION_STATUS = {
  PENDING: 0, // Chờ điều phối
  IN_PROGRESS: 1, // Đang điều phối
  COMPLETED: 2, // Hoàn tất điều phối
} as const;
export type CoordinationStatus =
  (typeof COORDINATION_STATUS)[keyof typeof COORDINATION_STATUS];

/**
 * BatchEntityStatus — Trạng thái PHIẾU soạn hàng (spec §3.4 Batch entity).
 * Distinct from order-level BatchStatus (0-3) above.
 */
export const BATCH_ENTITY_STATUS = {
  ACTIVE: 0, // Đang soạn
  COMPLETED: 1, // Hoàn tất
  CANCELLED: 2, // Đã hủy
} as const;
export type BatchEntityStatus =
  (typeof BATCH_ENTITY_STATUS)[keyof typeof BATCH_ENTITY_STATUS];

/** PrintType — 5 loại phiếu in (D3 tabs, REQUIREMENTS §3 D3). */
export const PRINT_TYPES = [
  'bill',
  'delivery',
  'handover_receipt',
  'goods_handover',
  'installation_acceptance',
] as const;
export type PrintType = (typeof PRINT_TYPES)[number];

/**
 * DeliveryFailReason — lý do giao thất bại (SF-13, spec D1/D7).
 * Wire codes mirror hubstore.intake.v1.DeliveryFailReason (intake.proto).
 * Đơn KHÔNG fail → cột failReason rỗng (không có mã "không fail" trong enum).
 */
export const DELIVERY_FAIL_REASON = {
  KHACH_VANG: 0,
  SAI_DIA_CHI: 1,
  KHACH_TU_CHOI: 2,
  KHAC: 3,
} as const;
export type DeliveryFailReason =
  (typeof DELIVERY_FAIL_REASON)[keyof typeof DELIVERY_FAIL_REASON];

/** Labels VI/EN cho fail reason — export riêng (STATUS_TAG_LABELS thuộc StatusTag scope). */
export const DELIVERY_FAIL_REASON_LABELS: Readonly<
  Record<DeliveryFailReason, { vi: string; en: string }>
> = {
  0: { vi: 'Khách vắng', en: 'Customer absent' },
  1: { vi: 'Sai địa chỉ', en: 'Wrong address' },
  2: { vi: 'Khách từ chối', en: 'Customer refused' },
  3: { vi: 'Khác', en: 'Other' },
};

/**
 * CodCollectionStatus — trạng thái thu COD (SF-14, FI-259).
 * Wire codes mirror hubstore.fulfillment.v1.CodCollectionStatus: 0 = PENDING
 * (chưa thu), 1 = CONFIRMED (đã chốt — collected có thể lệch expected).
 */
export const COD_COLLECTION_STATUS = {
  PENDING: 0,
  CONFIRMED: 1,
} as const;
export type CodCollectionStatus =
  (typeof COD_COLLECTION_STATUS)[keyof typeof COD_COLLECTION_STATUS];
