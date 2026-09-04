import { describe, expect, it } from 'vitest';
import {
  buildExportParams,
  filenameFromContentDisposition,
  isCsvHeaderOnly,
  type OrdersExportFilterState,
} from './fulfillment';

/**
 * SF-11 Task 2 — export CSV derive + header-only detect (pure, không network).
 * Wire: services/bff-gateway/src/routes/fulfillment.ts ExportOrdersQuery —
 * comma-lists, createdAt single YYYY-MM-DD (D5).
 */
const encoder = new TextEncoder();

function bytes(s: string): Uint8Array {
  return encoder.encode(s);
}

describe('buildExportParams', () => {
  it('state rỗng → params mọi field undefined, không disabled', () => {
    const out = buildExportParams({});
    expect(out.disabled).toBe(false);
    expect(out.params).toEqual({});
  });

  it('fulfillCode trim + rỗng → omit', () => {
    expect(buildExportParams({ fulfillCode: '  ' }).params.fulfillCode).toBeUndefined();
    expect(buildExportParams({ fulfillCode: ' ORD-1 ' }).params.fulfillCode).toBe('ORD-1');
  });

  it('comma-lists: batchStatus/orderStatus/regionCodes/shopCodes string[] → comma string', () => {
    const out = buildExportParams({
      batchStatus: ['0', '1'],
      orderStatus: ['2'],
      regionCodes: ['HN', 'HCM'],
      shopCodes: ['S001'],
    });
    expect(out.params.batchStatus).toBe('0,1');
    expect(out.params.orderStatus).toBe('2');
    expect(out.params.regionCodes).toBe('HN,HCM');
    expect(out.params.shopCodes).toBe('S001');
  });

  it('list rỗng / chỉ whitespace → omit (tránh gửi "," hoặc "")', () => {
    const out = buildExportParams({ batchStatus: [], shopCodes: [' '], regionCodes: [''] });
    expect(out.params.batchStatus).toBeUndefined();
    expect(out.params.shopCodes).toBeUndefined();
    expect(out.params.regionCodes).toBeUndefined();
  });

  it('createdAt CHỈ khi createdFrom === createdTo (single-day, D5)', () => {
    expect(buildExportParams({ createdFrom: '2026-09-03', createdTo: '2026-09-03' }).params.createdAt).toBe('2026-09-03');
    expect(buildExportParams({ createdFrom: '2026-09-03', createdTo: '2026-09-04' }).params.createdAt).toBeUndefined();
    // một phía set → coi như không set (khớp list: cần cả hai mới active)
    expect(buildExportParams({ createdFrom: '2026-09-03', createdTo: '' }).params.createdAt).toBeUndefined();
  });

  it('delivery/original active → disabled reason unsupportedFields (endpoint không nhận)', () => {
    const cases: OrdersExportFilterState[] = [
      { deliveryFrom: '2026-09-03 08:00' },
      { deliveryTo: '2026-09-03 12:00' },
      { originalFrom: '2026-09-03 08:00' },
      { originalTo: '2026-09-03 12:00' },
    ];
    for (const state of cases) {
      const out = buildExportParams(state);
      expect(out.disabled).toBe(true);
      expect(out.reason).toBe('unsupportedFields');
      expect(out.params).toEqual({});
    }
  });

  it('createdFrom ≠ createdTo (cả hai set) → disabled reason createdRange', () => {
    const out = buildExportParams({ createdFrom: '2026-09-01', createdTo: '2026-09-03' });
    expect(out.disabled).toBe(true);
    expect(out.reason).toBe('createdRange');
  });

  it('unsupported fields ưu tiên hơn createdRange khi cả hai active', () => {
    const out = buildExportParams({
      deliveryFrom: '2026-09-03 08:00',
      createdFrom: '2026-09-01',
      createdTo: '2026-09-03',
    });
    expect(out.reason).toBe('unsupportedFields');
  });

  it('filter hỗ trợ + single-day createdAt vẫn export được (không disabled)', () => {
    const out = buildExportParams({
      fulfillCode: 'ORD-1',
      batchStatus: ['0'],
      regionCodes: ['HN'],
      shopCodes: ['S001'],
      orderStatus: ['1'],
      createdFrom: '2026-09-03',
      createdTo: '2026-09-03',
      deliveryFrom: '',
      originalTo: '',
    });
    expect(out.disabled).toBe(false);
    expect(out.params).toEqual({
      fulfillCode: 'ORD-1',
      batchStatus: '0',
      regionCodes: 'HN',
      shopCodes: 'S001',
      orderStatus: '1',
      createdAt: '2026-09-03',
    });
  });
});

describe('isCsvHeaderOnly', () => {
  it('header + newline + EOF → header-only', () => {
    expect(isCsvHeaderOnly(bytes('col1,col2\n'))).toBe(true);
  });

  it('header không newline nào → cả file một dòng = header → header-only', () => {
    expect(isCsvHeaderOnly(bytes('col1,col2'))).toBe(true);
  });

  it('header + BOM, sau newline chỉ whitespace (LF/CRLF/spaces/tabs) → header-only', () => {
    expect(isCsvHeaderOnly(bytes('\uFEFFcol1,col2\n'))).toBe(true);
    expect(isCsvHeaderOnly(bytes('\uFEFFcol1,col2\r\n\r\n  \t'))).toBe(true);
    expect(isCsvHeaderOnly(bytes('col1,col2\n   \n\t\n'))).toBe(true);
  });

  it('có data row sau newline đầu → KHÔNG header-only', () => {
    expect(isCsvHeaderOnly(bytes('col1,col2\nORD-1,0\n'))).toBe(false);
    expect(isCsvHeaderOnly(bytes('col1,col2\nORD-1'))).toBe(false);
  });

  it('byte-precise: không dùng split("\\n").length — 0x0B/0x0C cũng là whitespace', () => {
    expect(isCsvHeaderOnly(new Uint8Array([0x61, 0x0a, 0x0b, 0x0c]))).toBe(true);
    expect(isCsvHeaderOnly(new Uint8Array([0x61, 0x0a, 0x00]))).toBe(false);
  });
});

describe('filenameFromContentDisposition', () => {
  it('parse filename có ngoặc kép (format BFF)', () => {
    expect(
      filenameFromContentDisposition('attachment; filename="orders-export-20260903-101500.csv"'),
    ).toBe('orders-export-20260903-101500.csv');
  });

  it('parse filename không ngoặc + filename* RFC 5987', () => {
    expect(filenameFromContentDisposition('attachment; filename=orders-export.csv')).toBe(
      'orders-export.csv',
    );
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''te%20st.csv")).toBe(
      'te%20st.csv',
    );
  });

  it('header lạ / rỗng → undefined', () => {
    expect(filenameFromContentDisposition('attachment')).toBeUndefined();
    expect(filenameFromContentDisposition('')).toBeUndefined();
  });
});
