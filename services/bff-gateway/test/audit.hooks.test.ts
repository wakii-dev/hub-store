/**
 * SF-7 (FI-252) T2 — audit hooks tại mutation routes:
 * (a) mutation 200 → INSERT 1 lần, đúng actor/action/target_id;
 * (b) pg rejecting → mutation VẪN 200 (fail-open);
 * (c) route read-only → KHÔNG insert.
 * Harness thật (mock gRPC + JWT) — pool pg bị stub qua __setAuditPoolForTests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { startHarness, authedInject, type Harness } from './harness.js';
import { __setAuditPoolForTests } from '../src/lib/audit.js';

const INSERT_SQL =
  'INSERT INTO activity_log (actor, action, target_type, target_id, detail) VALUES ($1,$2,$3,$4,$5)';

let h: Harness;
let queryMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
  // getAuditPool gate theo FULFILLMENT_DB_HOST trước khi nhìn pool — phải set
  // env để pool giả được dùng (unit test không đụng DB thật).
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

describe('audit hooks — mutation routes', () => {
  it('assign-shop-hub 200 → INSERT 1 lần đúng actor/action/target_id/detail', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'POST', '/fulfillment/ORD-3001/assign-shop-hub', {
        toShopCode: '30202',
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toBe(INSERT_SQL);
      // Actor = request.user.sub = preferred_username của token harness ('tester').
      expect(params[0]).toBe('tester');
      expect(params[1]).toBe('order.assign_shop');
      expect(params[2]).toBe('order');
      expect(params[3]).toBe('ORD-3001');
      expect(params[4]).toEqual({ toShopCode: '30202' });
    });
  });

  it('batches/create 200 → INSERT target_id = batchCode upstream trả về', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'POST', '/fulfillment/batches/create', {
        shipperId: 'S-01',
        orderCodes: ['ORD-3001'],
        deliveryTime: { from: '2026-09-03T08:00:00+07:00', to: '2026-09-03T12:00:00+07:00' },
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql, params] = queryMock.mock.calls[0];
      expect(sql).toBe(INSERT_SQL);
      expect(params[0]).toBe('tester');
      expect(params[1]).toBe('batch.create');
      expect(params[3]).toBe('BAT-1001'); // resp.batch.batchCode
      expect(params[4]).toEqual({ orderCodes: ['ORD-3001'] });
    });
  });

  it('batches/:code/cancel 200 → INSERT batch.cancel với detail.reason', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'PUT', '/fulfillment/batches/BAT-1001/cancel', {
        reason: 'Sai khu vực',
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [, params] = queryMock.mock.calls[0];
      expect(params[1]).toBe('batch.cancel');
      expect(params[2]).toBe('batch');
      expect(params[3]).toBe('BAT-1001');
      expect(params[4]).toEqual({ reason: 'Sai khu vực' });
    });
  });

  it('complete-picking 200 → INSERT batch.complete targetId = batchCode body', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'PUT', '/fulfillment/complete-picking', {
        batchCode: 'BAT-1001',
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [, params] = queryMock.mock.calls[0];
      expect(params[1]).toBe('batch.complete');
      expect(params[2]).toBe('batch');
      expect(params[3]).toBe('BAT-1001');
    });
  });

  it('update-note 200 → INSERT order.update_note với detail.noteLength', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'PUT', '/fulfillment/ORD-3001/note', {
        note: 'Giao giờ hành chính',
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1);
      const [, params] = queryMock.mock.calls[0];
      expect(params[1]).toBe('order.update_note');
      expect(params[3]).toBe('ORD-3001');
      expect(params[4]).toEqual({ noteLength: 'Giao giờ hành chính'.length });
    });
  });

  it('pg rejecting → mutation VẪN 200 (fail-open)', async () => {
    await withHarness(async (h) => {
      queryMock.mockRejectedValue(new Error('connection refused'));
      const res = await authedInject(h.app, 'POST', '/fulfillment/ORD-3001/assign-shop-hub', {
        toShopCode: '30202',
      });
      expect(res.statusCode).toBe(200);
      expect(queryMock).toHaveBeenCalledTimes(1); // đã thử ghi — chỉ là lỗi bị nuốt
    });
  });

  it('route read-only (/fulfillment/filter) → KHÔNG insert', async () => {
    await withHarness(async (h) => {
      const res = await authedInject(h.app, 'POST', '/fulfillment/filter', { page: 1, pageSize: 20 });
      expect(res.statusCode).toBe(200);
      expect(queryMock).not.toHaveBeenCalled();
    });
  });
});
