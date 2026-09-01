/**
 * Wire envelopes — spec §3.1 (REST contract, BFF → FE).
 * SF-2 (FI-235) authored; SF-3..SF-10 consume. FROZEN shapes.
 */

/**
 * Pagination envelope — MỌI list response (spec §3.1).
 * `items` là typed array của page hiện tại; `total` là tổng trước khi phân trang.
 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Chi tiết lỗi per-field — gRPC InvalidArgument details → BFF map 422 (spec §3.1, §3.6). */
export interface ErrorDetail {
  /** Tên field vi phạm (vd: `orderCodes`, `toShopCode`). */
  field: string;
  message: string;
}

/** Error envelope chuẩn (spec §3.1): `{ statusCode, message, code?, details? }`. */
export interface ErrorEnvelope {
  /** HTTP status code do BFF set (vd 422, 503). */
  statusCode: number;
  message: string;
  /**
   * Machine-readable code — vd `UPSTREAM_UNAVAILABLE` (resilience policy:
   * gRPC unavailable/deadline → 503 + code này, spec §3.1).
   */
  code?: string;
  details?: ErrorDetail[];
}
