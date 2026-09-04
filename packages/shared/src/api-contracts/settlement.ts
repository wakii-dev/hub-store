/**
 * SF-14 (FI-259) — COD settlement DTOs cho BFF /cod/* REST surface.
 * Dates ISO string (camelCase §4, không leak shape proto);
 * collectedAmount optional presence — absence = PENDING, 0 = thu thật 0 đồng (D3).
 */

/** 1 dòng aggregate đối soát theo shop — mirror proto SettlementShopRow. */
export interface SettlementShopRow {
  shopCode: string;
  shopName: string;
  totalOrders: number;
  totalExpected: number;
  totalCollected: number;
  diffAmount: number;
  pendingCount: number;
  mismatchCount: number;
}

/** Drill-down 1 confirmation trong kỳ — mirror proto CodConfirmation. */
export interface SettlementDetailItem {
  fulfillCode: string;
  batchCode: string;
  shopCode: string;
  shopName: string;
  expectedAmount: number;
  collectedAmount?: number;
  collectedBy: string;
  collectedAt?: string;
  completedAt?: string;
  status: number;
}

/** Query kỳ đối soát — from/to date-only `YYYY-MM-DD` (D9, wrap full-day +07:00). */
export interface SettlementQuery {
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
}

/** Drill-down query — thêm shopCode. */
export interface SettlementDetailQuery {
  shopCode: string;
  from: string;
  to: string;
}

/** POST /cod/confirm body — collectedAmount optional (absence = lấy expected). */
export interface ConfirmCodBody {
  fulfillCode: string;
  collectedAmount?: number;
}

/** POST /cod/confirm-batch body. */
export interface ConfirmBatchCodBody {
  batchCode: string;
}

/** GET /cod/pending response — badge D2 "COD chờ thu (n)". */
export interface CodPendingDto {
  pendingCount: number;
  totalAmount: number;
}

/** Per-code result của POST /cod/confirm. */
export interface ConfirmCodResultDto {
  fulfillCode: string;
  success: boolean;
  message: string;
}
