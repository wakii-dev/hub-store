/**
 * SF-7 (FI-252) T1 — unit test lib/audit.ts (pure, không DB):
 * parseDateBound UTC pin, buildAuditWhere filters, normalizeAuditPage.
 */
import { describe, expect, it } from 'vitest';
import {
  buildAuditWhere,
  normalizeAuditPage,
  parseDateBound,
  escapeLike,
  AUDIT_PAGE_SIZE_CAP,
  AUDIT_PAGE_SIZE_DEFAULT,
  getAuditPool,
  __setAuditPoolForTests,
  type AuditQuery,
} from '../src/lib/audit.js';

describe('parseDateBound', () => {
  it('bare YYYY-MM-DD bound=from → 00:00:00.000Z UTC (inclusive)', () => {
    expect(parseDateBound('2026-09-02', 'from')).toEqual(new Date('2026-09-02T00:00:00.000Z'));
  });

  it('bare YYYY-MM-DD bound=to → 00:00:00.000Z NGÀY KẾ (exclusive)', () => {
    expect(parseDateBound('2026-09-02', 'to')).toEqual(new Date('2026-09-03T00:00:00.000Z'));
  });

  it('bare date dùng UTC, KHÔNG lệ timezone local', () => {
    const d = parseDateBound('2026-01-01', 'from') as Date;
    expect(d.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('full ISO → so trực tiếp', () => {
    expect(parseDateBound('2026-09-02T10:30:00.000Z', 'from')).toEqual(new Date('2026-09-02T10:30:00.000Z'));
  });

  it('full ISO không mili-giây + offset múi giờ → so trực tiếp', () => {
    expect(parseDateBound('2026-09-02T10:30:00Z', 'to')).toEqual(new Date('2026-09-02T10:30:00.000Z'));
  });

  it('format non-ISO ("2026/09/02") → null (không slip qua local time)', () => {
    expect(parseDateBound('2026/09/02', 'from')).toBeNull();
    expect(parseDateBound('Sep 2 2026', 'from')).toBeNull();
    expect(parseDateBound('09/02/2026', 'to')).toBeNull();
  });

  it('invalid → null', () => {
    expect(parseDateBound('not-a-date', 'from')).toBeNull();
    expect(parseDateBound('2026-13-45', 'from')).toBeNull();
    expect(parseDateBound('', 'to')).toBeNull();
  });
});

describe('escapeLike', () => {
  it('escape \\ % _', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});

describe('buildAuditWhere', () => {
  it('không filter → TRUE, params rỗng', () => {
    expect(buildAuditWhere({})).toEqual({ whereSql: 'TRUE', params: [] });
  });

  it('actor → ILIKE wrap %, param $1', () => {
    const { whereSql, params } = buildAuditWhere({ actor: 'manager1' });
    expect(whereSql).toBe("TRUE AND actor ILIKE $1 ESCAPE '\\'");
    expect(params).toEqual(['%manager1%']);
  });

  it('action → ILIKE', () => {
    const { whereSql, params } = buildAuditWhere({ action: 'batch.create' });
    expect(whereSql).toContain('action ILIKE $1');
    expect(params).toEqual(['%batch.create%']);
  });

  it('targetType → = exact (không ILIKE)', () => {
    const { whereSql, params } = buildAuditWhere({ targetType: 'order' });
    expect(whereSql).toBe('TRUE AND target_type = $1');
    expect(params).toEqual(['order']);
  });

  it('targetId → ILIKE', () => {
    const { whereSql, params } = buildAuditWhere({ targetId: 'FL-001' });
    expect(whereSql).toContain('target_id ILIKE $1');
    expect(params).toEqual(['%FL-001%']);
  });

  it('dateFrom bare → created_at >= 00:00Z', () => {
    const { whereSql, params } = buildAuditWhere({ dateFrom: '2026-09-01' });
    expect(whereSql).toContain('created_at >= $1');
    expect(params).toEqual([new Date('2026-09-01T00:00:00.000Z')]);
  });

  it('dateTo bare → created_at < ngày kế 00:00Z', () => {
    const { whereSql, params } = buildAuditWhere({ dateTo: '2026-09-01' });
    expect(whereSql).toContain('created_at < $1');
    expect(params).toEqual([new Date('2026-09-02T00:00:00.000Z')]);
  });

  it('date invalid → bỏ qua filter (không crash)', () => {
    expect(buildAuditWhere({ dateFrom: 'garbage' }).params).toEqual([]);
  });

  it('combo: tham số đánh số tuần tự đúng thứ tự', () => {
    const q: AuditQuery = {
      actor: 'mn', action: 'batch.cancel', targetType: 'batch',
      targetId: 'B-01', dateFrom: '2026-09-01', dateTo: '2026-09-02',
    };
    const { whereSql, params } = buildAuditWhere(q);
    expect(whereSql).toBe(
      "TRUE AND actor ILIKE $1 ESCAPE '\\' AND action ILIKE $2 ESCAPE '\\' AND target_type = $3 "
        + "AND target_id ILIKE $4 ESCAPE '\\' AND created_at >= $5 AND created_at < $6",
    );
    expect(params).toEqual([
      '%mn%', '%batch.cancel%', 'batch', '%B-01%',
      new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-03T00:00:00.000Z'),
    ]);
  });

  it('wildcard user % bị escape — ILIKE khớp literal, không phải wildcard', () => {
    const { params } = buildAuditWhere({ actor: 'a%b' });
    expect(params).toEqual(['%a\\%b%']);
  });
});

describe('normalizeAuditPage', () => {
  it('default: page 1, pageSize 20', () => {
    expect(normalizeAuditPage({})).toEqual({ page: 1, pageSize: AUDIT_PAGE_SIZE_DEFAULT, offset: 0 });
  });

  it('cap pageSize 100', () => {
    expect(normalizeAuditPage({ pageSize: 500 }).pageSize).toBe(AUDIT_PAGE_SIZE_CAP);
  });

  it('page < 1 → 1; pageSize < 1 → 1', () => {
    expect(normalizeAuditPage({ page: 0, pageSize: 0 })).toEqual({ page: 1, pageSize: 1, offset: 0 });
    expect(normalizeAuditPage({ page: -5 }).page).toBe(1);
  });

  it('offset = (page-1)*pageSize', () => {
    expect(normalizeAuditPage({ page: 3, pageSize: 50 })).toEqual({ page: 3, pageSize: 50, offset: 100 });
  });
});

describe('getAuditPool fail-open', () => {
  it('thiếu FULFILLMENT_DB_HOST → null (disabled)', () => {
    expect(getAuditPool({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('__setAuditPoolForTests(null) reset an toàn', () => {
    __setAuditPoolForTests(null);
    expect(getAuditPool({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
