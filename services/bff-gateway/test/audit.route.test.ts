/**
 * SF-7 (FI-252) T3 — GET /fulfillment/audit route:
 * (a) Manager → 200 envelope {items,page,pageSize,total};
 * (b) Coordinator → 403 PERMISSION_DENIED (không chạm pool);
 * (c) thiếu env DB → 503 UPSTREAM_UNAVAILABLE;
 * (d) filter querystring → WHERE actor ILIKE + created_at bounds đúng (UTC pin);
 * (e) pageSize 500 → query LIMIT 100 (cap).
 * Harness thật (mock gRPC + JWT) — pool pg bị stub qua __setAuditPoolForTests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { startHarness, authedInject, type Harness } from './harness.js';
import { __setAuditPoolForTests } from '../src/lib/audit.js';

let h: Harness;
let queryMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  queryMock = vi.fn().mockResolvedValue({
    rows: [
      {
        total_all: 1,
        id: 42,
        actor: 'manager1',
        action: 'order.assign_shop',
        target_type: 'order',
        target_id: 'FL-001',
        detail: { toShopCode: '30202' },
        created_at: new Date('2026-09-02T01:02:03.000Z'),
      },
    ],
  });
  // getAuditPool gate theo FULFILLMENT_DB_HOST — set env để pool giả được dùng.
  process.env.FULFILLMENT_DB_HOST = 'audit-test.invalid';
  __setAuditPoolForTests({ query: queryMock } as unknown as Pool);
});

afterEach(() => {
  __setAuditPoolForTests(null);
  delete process.env.FULFILLMENT_DB_HOST;
});

async function withHarness(run: (h: Harness) => Promise<void>): Promise<void> {
  h = await startHarness();
  try {
    await run(h);
  } finally {
    await h.closeAll();
  }
}

describe('GET /fulfillment/audit', () => {
  it('Manager → 200 envelope {items,page,pageSize,total}, row map camelCase + ISO', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'GET', '/fulfillment/audit');
      expect(res.statusCode).toBe(200);
      expect(Object.keys(res.body as object).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
      const { items, page, pageSize, total } = res.body as Record<string, unknown>;
      expect(total).toBe(1);
      expect(page).toBe(1);
      expect(pageSize).toBe(20);
      expect(items).toEqual([
        {
          id: 42,
          actor: 'manager1',
          action: 'order.assign_shop',
          targetType: 'order',
          targetId: 'FL-001',
          detail: { toShopCode: '30202' },
          createdAt: '2026-09-02T01:02:03.000Z',
        },
      ]);
      // Query: scalar count subquery + LATERAL cùng WHERE, sort + OFFSET/LIMIT param cuối.
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toContain('count(*) AS total_all');
      expect(sql).toContain('LEFT JOIN LATERAL');
      expect(sql).toContain('ORDER BY created_at DESC, id DESC');
      expect(params.slice(-2)).toEqual([0, 20]);
    });
  });

  it('Coordinator → 403 PERMISSION_DENIED, KHÔNG chạm pool', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'GET', '/fulfillment/audit', undefined, 'Coordinator');
      expect(res.statusCode).toBe(403);
      expect((res.body as { code?: string }).code).toBe('PERMISSION_DENIED');
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  it('thiếu FULFILLMENT_DB_HOST → 503 UPSTREAM_UNAVAILABLE', async () => {
    await withHarness(async (h) => {
      __setAuditPoolForTests(null);
      delete process.env.FULFILLMENT_DB_HOST;
      const res = await authedInject(h.app, 'GET', '/fulfillment/audit');
      expect(res.statusCode).toBe(503);
      expect((res.body as { code?: string }).code).toBe('UPSTREAM_UNAVAILABLE');
      expect(queryMock).not.toHaveBeenCalled();
    });
  });

  it('filter actor/dateFrom/dateTo → WHERE ILIKE + created_at bounds (bare date = UTC day)', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(
        h.app,
        'GET',
        '/fulfillment/audit?actor=xyz&dateFrom=2026-09-01&dateTo=2026-09-02',
      );
      expect(res.statusCode).toBe(200);
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toContain("actor ILIKE $1 ESCAPE '\\'");
      expect(sql).toContain('created_at >= $2');
      expect(sql).toContain('created_at < $3');
      expect(params[0]).toBe('%xyz%');
      expect(params[1]).toEqual(new Date('2026-09-01T00:00:00.000Z'));
      // dateTo bare → 00:00Z NGÀY KẾ (exclusive).
      expect(params[2]).toEqual(new Date('2026-09-03T00:00:00.000Z'));
      // WHERE xuất hiện 2 lần (count subquery + LATERAL) — cùng điều kiện.
      expect(sql.match(/created_at >= /g)).toHaveLength(2);
    });
  });

  it('pageSize=500 → query LIMIT 100 (cap), pageSize response 100', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'GET', '/fulfillment/audit?pageSize=500');
      expect(res.statusCode).toBe(200);
      const [sql, params] = queryMock.mock.calls[0];
      expect(params.slice(-2)).toEqual([0, 100]);
      expect(sql).toContain('LIMIT $2');
      expect((res.body as { pageSize?: number }).pageSize).toBe(100);
    });
  });
});
