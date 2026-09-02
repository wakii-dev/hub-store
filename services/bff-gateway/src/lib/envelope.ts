/**
 * Envelope helpers (spec §3.1) — shape FROZEN trong @hub-store/shared
 * api-contracts (Paginated, ErrorEnvelope). BFF chỉ sản xuất, không định nghĩa.
 */
import type { ErrorDetail, ErrorEnvelope, Paginated } from '@hub-store/shared';

/** Pagination envelope — MỌI list response đi qua đây. */
export function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize };
}

/** Error envelope chuẩn `{ statusCode, message, code?, details? }`. */
export function errorEnvelope(
  statusCode: number,
  message: string,
  extra?: { code?: string; details?: ErrorDetail[] },
): ErrorEnvelope {
  return { statusCode, message, ...(extra?.code ? { code: extra.code } : {}), ...(extra?.details ? { details: extra.details } : {}) };
}
