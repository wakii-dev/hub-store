/**
 * SF-26 webhook mapping unit tests (plan Task 4 Step 1) — pure mapper:
 * default mapping mọi field; quantity = Σ items[].quantity; externalId missing;
 * items rỗng/không phải mảng; codAmount string-số coerce; WEBHOOK_MAPPING flat
 * rename override; JSON invalid → warn-once + default (không crash boot).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FIELD_MAP,
  WebhookMappingValidationError,
  mapWebhookPayload,
  resolveFieldMap,
} from '../lib/webhook-mapping.js';

const VALID_PAYLOAD = {
  externalId: 'SP-123',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  customerAddress: '123 Lê Lợi, Q1, TP.HCM',
  items: [
    { productCode: 'SKU-1', productName: 'Laptop', quantity: 2 },
    { productCode: 'SKU-2', productName: 'Chuột', quantity: 3 },
  ],
  codAmount: 1500000,
  shopHint: 'SHOPEE-HCM',
};

describe('mapWebhookPayload — default mapping', () => {
  it('default mapping đúng mọi field + quantity = Σ items[].quantity', () => {
    const { externalId, order } = mapWebhookPayload(VALID_PAYLOAD);
    expect(externalId).toBe('SP-123');
    expect(order.customerName).toBe('Nguyễn Văn A');
    expect(order.customerPhone).toBe('0901234567');
    expect(order.customerAddress).toBe('123 Lê Lợi, Q1, TP.HCM');
    expect(order.items).toEqual(VALID_PAYLOAD.items);
    expect(order.quantity).toBe(5); // 2 + 3
    expect(order.codAmount).toBe(1500000);
    expect(order.shopHint).toBe('SHOPEE-HCM');
  });

  it('trả về object MỚI — không mutate payload gốc', () => {
    const payload = structuredClone(VALID_PAYLOAD);
    const { order } = mapWebhookPayload(payload);
    order.customerName = 'CHANGED';
    expect(payload.customerName).toBe('Nguyễn Văn A');
  });

  it('externalId missing → lỗi message rõ (422)', () => {
    const { externalId: _drop, ...noExt } = VALID_PAYLOAD;
    try {
      mapWebhookPayload(noExt);
      expect.fail('phải throw');
    } catch (e) {
      expect(e).toBeInstanceOf(WebhookMappingValidationError);
      const errs = (e as WebhookMappingValidationError).errors;
      expect(errs).toContainEqual(
        expect.objectContaining({ field: 'externalId', message: expect.stringContaining('bắt buộc') }),
      );
    }
  });

  it('thu gom NHIỀU lỗi cùng lúc (không fail-fast)', () => {
    try {
      mapWebhookPayload({ customerPhone: '123' });
      expect.fail('phải throw');
    } catch (e) {
      const errs = (e as WebhookMappingValidationError).errors;
      const fields = errs.map((x) => x.field);
      expect(fields).toContain('externalId');
      expect(fields).toContain('customerName');
      expect(fields).toContain('customerPhone');
      expect(fields).toContain('customerAddress');
      expect(fields).toContain('items');
    }
  });

  it('items rỗng / không phải mảng → lỗi items', () => {
    for (const bad of [[], 'x', { a: 1 }, null, undefined]) {
      try {
        mapWebhookPayload({ ...VALID_PAYLOAD, items: bad });
        expect.fail(`phải throw với items=${JSON.stringify(bad)}`);
      } catch (e) {
        const errs = (e as WebhookMappingValidationError).errors;
        expect(errs.some((x) => x.field === 'items')).toBe(true);
      }
    }
  });

  it('item quantity < 1 / không nguyên → lỗi per-item', () => {
    try {
      mapWebhookPayload({
        ...VALID_PAYLOAD,
        items: [{ productCode: 'S1', productName: 'P', quantity: 0 }],
      });
      expect.fail('phải throw');
    } catch (e) {
      const errs = (e as WebhookMappingValidationError).errors;
      expect(errs.some((x) => x.field === 'items[0].quantity')).toBe(true);
    }
  });

  it('codAmount string số → number coerce', () => {
    const { order } = mapWebhookPayload({ ...VALID_PAYLOAD, codAmount: '250000' });
    expect(order.codAmount).toBe(250000);
  });

  it('codAmount không phải số → lỗi; thiếu → 0', () => {
    try {
      mapWebhookPayload({ ...VALID_PAYLOAD, codAmount: 'abc' });
      expect.fail('phải throw');
    } catch (e) {
      expect((e as WebhookMappingValidationError).errors.some((x) => x.field === 'codAmount')).toBe(true);
    }
    expect(mapWebhookPayload({ ...VALID_PAYLOAD, codAmount: undefined }).order.codAmount).toBe(0);
  });

  it('SĐT sai format (không khớp ^(+84|0)\\d{9}$) → lỗi customerPhone', () => {
    for (const bad of ['123456', '09012345678', '1098765432', '+841234']) {
      try {
        mapWebhookPayload({ ...VALID_PAYLOAD, customerPhone: bad });
        expect.fail(`phải throw với phone=${bad}`);
      } catch (e) {
        expect((e as WebhookMappingValidationError).errors.some((x) => x.field === 'customerPhone')).toBe(true);
      }
    }
    // +84 hợp lệ
    expect(mapWebhookPayload({ ...VALID_PAYLOAD, customerPhone: '+84901234567' }).order.customerPhone).toBe(
      '+84901234567',
    );
  });

  it('payload không phải object → lỗi payload', () => {
    for (const bad of [null, 'str', 42, []]) {
      expect(() => mapWebhookPayload(bad)).toThrow(WebhookMappingValidationError);
    }
  });

  it('shopHint optional — thiếu → rỗng', () => {
    const p = { ...VALID_PAYLOAD };
    delete (p as Record<string, unknown>).shopHint;
    expect(mapWebhookPayload(p).order.shopHint).toBe('');
  });
});

describe('WEBHOOK_MAPPING override — flat rename', () => {
  it('override rename đúng: {"externalId":"orderNumber"} đọc từ payload field orderNumber', () => {
    const payload = { orderNumber: 'SH-9', ...VALID_PAYLOAD, externalId: undefined };
    const { externalId, order } = mapWebhookPayload(payload, {
      ...DEFAULT_FIELD_MAP,
      externalId: 'orderNumber',
    });
    expect(externalId).toBe('SH-9');
    expect(order.quantity).toBe(5);
  });

  it('override sai — canonical field không có trong payload → lỗi externalId', () => {
    try {
      mapWebhookPayload(VALID_PAYLOAD, { ...DEFAULT_FIELD_MAP, externalId: 'notThere' });
      expect.fail('phải throw');
    } catch (e) {
      expect((e as WebhookMappingValidationError).errors.some((x) => x.field === 'externalId')).toBe(true);
    }
  });
});

describe('resolveFieldMap — config parse', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('rỗng/undefined → default map', () => {
    expect(resolveFieldMap('')).toEqual(DEFAULT_FIELD_MAP);
    expect(resolveFieldMap(undefined)).toEqual(DEFAULT_FIELD_MAP);
  });

  it('JSON hợp lệ flat map → override', () => {
    expect(resolveFieldMap('{"externalId":"orderNumber"}')).toEqual({
      ...DEFAULT_FIELD_MAP,
      externalId: 'orderNumber',
    });
  });

  it('JSON invalid → warn-once + default (KHÔNG crash)', () => {
    expect(resolveFieldMap('{not-json')).toEqual(DEFAULT_FIELD_MAP);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('WEBHOOK_MAPPING');
    // lần 2 vẫn không warn thêm (warn-once mỗi process)
    expect(resolveFieldMap('[[[')).toEqual(DEFAULT_FIELD_MAP);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('JSON đúng cú pháp nhưng không phải flat string map → default (warn-once đã bắn ở test trước)', () => {
    // mappingWarned là flag module-level — test '{not-json' ở trên đã bắn warn,
    // nên đây KHÔNG còn warn nào nữa (đúng semantics warn-once mỗi process).
    expect(resolveFieldMap('{"externalId":123}')).toEqual(DEFAULT_FIELD_MAP);
    expect(warnSpy).toHaveBeenCalledTimes(0);
  });
});
