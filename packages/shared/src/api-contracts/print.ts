/**
 * REST DTOs — print endpoints (REQUIREMENTS §5 khối 3, D3 Print Shipment).
 * PrintType re-use enum SF-1 (`PRINT_TYPES`, 5 tab D3).
 */
import type { PrintType } from '../enums';

// ---------------------------------------------------------------------------
// GET /fulfillment/print/printers?shopCode= — danh sách máy in theo kho
// ---------------------------------------------------------------------------

export interface PrintersRequest {
  /** Query param `shopCode` — printers registry seed theo shopCode (gồm 30201). */
  shopCode: string;
}

export interface PrinterDto {
  printerId: string;
  name: string;
  shopCode: string;
  /** Vị trí vật lý (vd "Tầng 2 — khu soạn"). */
  location?: string;
}

export interface PrintersResponse {
  items: PrinterDto[];
}

// ---------------------------------------------------------------------------
// POST /fulfillment/print — in phiếu
// ---------------------------------------------------------------------------

export interface PrintRequest {
  /** Phiếu cần in — BFF hydrate payload từ Go rồi push print-service (spec §3.2/§3.7). */
  batchCode: string;
  /** 1 trong 5 loại phiếu (tab D3); "In tất cả" = FE gọi 5 lần — KHÔNG printAll endpoint (pin §3.7). */
  printType: PrintType;
  printerId: string;
}

/**
 * RESPONSE KHÔNG phải JSON envelope: BFF stream `application/pdf` bytes
 * (spec §3.7) — FE react-pdf render blob. Type này chỉ mô tả meta cho
 * api-client (responseType: 'blob'); không có DTO body.
 */
export interface PrintResponseMeta {
  readonly responseType: 'blob';
  readonly contentType: 'application/pdf';
}
