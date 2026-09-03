import { describe, expect, it } from 'vitest';
import { buildAuditQueryParams, type AuditQueryParams } from './audit';

/**
 * SF-11 Task 1 — serializer của listAudit query params (pure, không chạy
 * RTKQ network). BFF AuditQuery (services/bff-gateway/src/lib/audit.ts):
 * param rỗng = absent; date bare YYYY-MM-DD (D6) giữ nguyên — BFF tự wrap
 * UTC day bounds.
 */
describe('buildAuditQueryParams', () => {
  it('rỗng → object trống (không gửi param nào)', () => {
    expect(buildAuditQueryParams({})).toEqual({});
  });

  it('bỏ param string rỗng / chỉ whitespace (BFF: "" ≠ filter)', () => {
    const out = buildAuditQueryParams({
      actor: '',
      action: '   ',
      targetType: undefined,
      dateFrom: undefined,
    });
    expect(out).toEqual({});
  });

  it('giữ string filter + trim whitespace', () => {
    const out = buildAuditQueryParams({ actor: ' manager ', action: 'order.create' });
    expect(out).toEqual({ actor: 'manager', action: 'order.create' });
  });

  it('date bare YYYY-MM-DD giữ nguyên dạng (không convert timezone ở FE)', () => {
    const out = buildAuditQueryParams({ dateFrom: '2026-09-01', dateTo: '2026-09-03' });
    expect(out).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-03' });
  });

  it('page=1 mặc định không gửi; page>1 + pageSize gửi số', () => {
    expect(buildAuditQueryParams({ page: 1 })).toEqual({});
    expect(buildAuditQueryParams({ page: 3, pageSize: 20 })).toEqual({ page: 3, pageSize: 20 });
    expect(buildAuditQueryParams({ page: 0, pageSize: -5 })).toEqual({});
  });

  it('full filter set (shape khớp AuditQuery BFF)', () => {
    const q: AuditQueryParams = {
      actor: 'manager',
      action: 'batch.create',
      targetType: 'batch',
      targetId: 'B26',
      dateFrom: '2026-08-28',
      dateTo: '2026-09-03',
      page: 2,
      pageSize: 20,
    };
    expect(buildAuditQueryParams(q)).toEqual(q);
  });
});
