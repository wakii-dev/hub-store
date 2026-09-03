/**
 * SF-26 webhook payload mapping (FI-27) — pure function payload → IntakeOrder
 * shape cho CreateWebhookOrderRequest (plan Task 4; spec §3 BFF).
 *
 * - Default field map: tên field payload = tên canonical (khớp template SF-13).
 * - Override flat rename 1 mức qua env WEBHOOK_MAPPING (JSON `{canonical: payloadField}`).
 *   JSON invalid → warn MỘT LẦN + dùng default (KHÔNG crash boot).
 * - quantity TỰ TÍNH = Σ items[].quantity (validator SF-13 bắt buộc khớp —
 *   IntakeValidator.java: tổng quantity ≠ Σ items → INVALID_ARGUMENT).
 * - Lỗi thu gom TẤT CẢ field (không fail-fast) → 422 details[] per-field.
 */
import type { IntakeOrder } from '../../../../api/proto/gen/ts/hubstore/intake/v1/intake';
import type { Product } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';

/** canonical field → tên field trong payload (flat rename 1 mức). */
export interface WebhookMappingConfig {
  [canonical: string]: string;
}

export const DEFAULT_FIELD_MAP: WebhookMappingConfig = {
  externalId: 'externalId',
  customerName: 'customerName',
  customerPhone: 'customerPhone',
  customerAddress: 'customerAddress',
  items: 'items',
  codAmount: 'codAmount',
  shopHint: 'shopHint',
};

/** 1 lỗi mapping per-field — BFF bọc thành ErrorDetail {row:1, field, message}. */
export interface WebhookMappingError {
  field: string;
  message: string;
}

/** Aggregate error — route đọc `.errors` để dựng details[]. */
export class WebhookMappingValidationError extends Error {
  errors: WebhookMappingError[];
  constructor(errors: WebhookMappingError[]) {
    super(`Webhook payload validation failed: ${errors.length} error(s).`);
    this.name = 'WebhookMappingValidationError';
    this.errors = errors;
  }
}

export interface MappedOrder {
  externalId: string;
  order: IntakeOrder;
}

/** SĐT VN — khớp CHÍNH XÁC regex IntakeValidator.java: ^(\+84|0)\d{9}$ */
const PHONE_RE = /^(\+84|0)\d{9}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function pushErr(errors: WebhookMappingError[], field: string, message: string): void {
  errors.push({ field, message });
}

/** Coerce codAmount: number OK; string số → number; khác → lỗi (trả 0). */
function coerceCodAmount(raw: unknown, errors: WebhookMappingError[]): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw.trim()))) {
    return Number(raw.trim());
  }
  pushErr(errors, 'codAmount', 'codAmount phải là số (chuỗi số cũng được chấp nhận).');
  return 0;
}

function mapItems(
  raw: unknown,
  errors: WebhookMappingError[],
): Product[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    pushErr(errors, 'items', 'items phải là mảng không rỗng [{productCode, productName, quantity}].');
    return [];
  }
  const items: Product[] = [];
  raw.forEach((it, i) => {
    if (!isRecord(it)) {
      pushErr(errors, `items[${i}]`, 'Item phải là object {productCode, productName, quantity}.');
      return;
    }
    const productCode = str(it.productCode);
    const productName = str(it.productName);
    const quantity = it.quantity;
    if (!productCode) pushErr(errors, `items[${i}].productCode`, 'productCode là bắt buộc.');
    if (!productName) pushErr(errors, `items[${i}].productName`, 'productName là bắt buộc.');
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      pushErr(errors, `items[${i}].quantity`, 'quantity phải là số nguyên >= 1.');
    }
    // Field thiếu vẫn push item để Σ quantity có thể tính — upstream validator
    // sẽ chặn lại nếu thiếu (defense-in-depth, KHÔNG dùng cho 200-skip).
    if (productCode && productName && typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1) {
      items.push({ productCode, productName, quantity });
    }
  });
  return items;
}

/**
 * Pure mapper — KHÔNG throw cho lỗi field (thu gom vào WebhookMappingValidationError),
 * chỉ throw TypeError-esque qua validation error cho payload không phải object.
 */
export function mapWebhookPayload(
  payload: unknown,
  fieldMap: WebhookMappingConfig = DEFAULT_FIELD_MAP,
): MappedOrder {
  const errors: WebhookMappingError[] = [];
  if (!isRecord(payload)) {
    throw new WebhookMappingValidationError([
      { field: 'payload', message: 'Payload phải là JSON object.' },
    ]);
  }
  const pick = (canonical: string): unknown => payload[fieldMap[canonical] ?? canonical];

  const externalId = str(pick('externalId'));
  if (!externalId) {
    pushErr(errors, 'externalId', 'externalId (mã đơn phía sàn) là bắt buộc — dùng làm dedupe key.');
  }
  const customerName = str(pick('customerName'));
  if (!customerName) pushErr(errors, 'customerName', 'customerName là bắt buộc.');
  const customerPhone = str(pick('customerPhone'));
  if (!PHONE_RE.test(customerPhone)) {
    pushErr(errors, 'customerPhone', 'customerPhone phải là SĐT VN hợp lệ (0XXXXXXXXX hoặc +84XXXXXXXXX).');
  }
  const customerAddress = str(pick('customerAddress'));
  if (!customerAddress) pushErr(errors, 'customerAddress', 'customerAddress là bắt buộc.');
  const items = mapItems(pick('items'), errors);
  const codAmount = coerceCodAmount(pick('codAmount'), errors);
  const shopHint = str(pick('shopHint'));

  if (errors.length > 0) throw new WebhookMappingValidationError(errors);
  return {
    externalId,
    order: {
      customerName,
      customerPhone,
      customerAddress,
      items,
      // BẮT BUỘC = Σ items[].quantity — validator SF-13 từ chối nếu lệch.
      quantity: items.reduce((sum, it) => sum + it.quantity, 0),
      codAmount,
      shopHint,
    },
  };
}

let mappingWarned = false;

/**
 * Parse WEBHOOK_MAPPING env (raw string từ config — config.ts giữ nguyên string).
 * JSON invalid / không phải object → warn MỘT LẦN mỗi process + default map
 * (spec: config-time warn, KHÔNG crash boot).
 */
export function resolveFieldMap(raw: string | undefined): WebhookMappingConfig {
  if (!raw || raw.trim() === '') return DEFAULT_FIELD_MAP;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && Object.values(parsed).every((v) => typeof v === 'string')) {
      // Partial override — chỉ rename các key được nêu, còn lại dùng default.
      return { ...DEFAULT_FIELD_MAP, ...(parsed as WebhookMappingConfig) };
    }
    throw new Error('not a flat string map');
  } catch {
    if (!mappingWarned) {
      mappingWarned = true;
      console.warn(
        '[sf26] WEBHOOK_MAPPING không phải JSON object flat {canonical: payloadField} — dùng default mapping.',
      );
    }
    return DEFAULT_FIELD_MAP;
  }
}
