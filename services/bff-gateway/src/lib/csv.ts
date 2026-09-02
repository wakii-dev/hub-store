/**
 * CSV serialize Excel-safe (SF-7 — FI-252, spec §2 In-4). Formula-guard chạy
 * TRƯỚC quoting: cell bắt đầu = + - @ \t được gắn prefix `'` để Excel không
 * thực thi công thức; cell chứa , " \n \r được bọc quote + escape `"`→`""`.
 * Line endings \r\n (chuẩn RFC 4180 — Excel mở đúng).
 */

/** 1 cell — null/undefined → rỗng, guard công thức rồi mới quote. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 1 dòng — join ',' + \r\n. */
export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}

/** 9 cột pin (spec §2 In-4) — thứ tự KHÔNG đổi (contract export UI SF-11). */
export const EXPORT_COLUMNS = [
  'fulfillCode',
  'orderCode',
  'batchStatus',
  'shopCode',
  'shopName',
  'shopAddress',
  'deliveryFrom',
  'deliveryTo',
  'note',
] as const;
