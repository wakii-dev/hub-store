/**
 * SF-14 (FI-259) — COD route tests: role-array guards (403 sai role từng
 * endpoint — confirm 4-role, settlement 2-role), happy path envelope, kỳ
 * from/to wrap full-day +07:00 (from inclusive, to EXCLUSIVE — D9), 400 thiếu
 * tham số, actor x-user-name truyền downstream cho audit collected_by.
 * Harness pattern d2c.route.test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authedInject, signTestToken, startHarness, type Harness } from './harness.js';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

describe('POST /cod/confirm — guard + per-order confirm', () => {
  it('WarehouseEmployee → 403 PERMISSION_DENIED (ngoài COD_CONFIRM_ROLES)', async () => {
    const res = await authedInject(h.app, 'POST', '/cod/confirm', { fulfillCode: 'ORD-1' }, 'WarehouseEmployee');
    expect(res.statusCode).toBe(403);
    expect((res.body as { code: string }).code).toBe('PERMISSION_DENIED');
  });

  it('Manager + collectedAmount → 200 { results } + actor x-user-name downstream', async () => {
    let captured: { actor?: string; role?: string; body?: { items: Array<{ fulfillCode: string; collectedAmount?: number }> } } | null = null;
    h.fulfillment.override({
      confirmCod: (call, cb) => {
        captured = {
          actor: call.metadata.get('x-user-name')[0] as string,
          role: call.metadata.get('x-user-role')[0] as string,
          body: call.request as { items: Array<{ fulfillCode: string; collectedAmount?: number }> },
        };
        cb(null, { results: [{ fulfillCode: 'ORD-1', success: true, message: 'collected=150000.' }] });
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/cod/confirm',
      payload: { fulfillCode: 'ORD-1', collectedAmount: 150000 },
      headers: { authorization: `Bearer ${await signTestToken('Manager', 'manager1')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      results: [{ fulfillCode: 'ORD-1', success: true, message: 'collected=150000.' }],
    });
    expect(captured!.actor).toBe('manager1');
    expect(captured!.role).toBe('Manager');
    expect(captured!.body!.items[0]).toEqual({ fulfillCode: 'ORD-1', collectedAmount: 150000 });
  });

  it('Coordinator — role confirm hợp lệ (màn ops D2) → pass guard tới upstream', async () => {
    const res = await authedInject(h.app, 'POST', '/cod/confirm', { fulfillCode: 'ORD-1' }, 'Coordinator');
    expect(res.statusCode).toBe(200);
  });

  it('collectedAmount = 0 → presence giữ nguyên (thu thật 0 đồng — D3)', async () => {
    let capturedAmount: number | undefined;
    h.fulfillment.override({
      confirmCod: (call, cb) => {
        capturedAmount = (call.request as { items: Array<{ collectedAmount?: number }> }).items[0].collectedAmount;
        cb(null, { results: [{ fulfillCode: 'ORD-1', success: true, message: 'collected=0.' }] });
      },
    });
    const res = await authedInject(h.app, 'POST', '/cod/confirm', { fulfillCode: 'ORD-1', collectedAmount: 0 });
    expect(res.statusCode).toBe(200);
    expect(capturedAmount).toBe(0);
  });

  it('absence collectedAmount → field undefined (upstream lấy expected — D3)', async () => {
    let capturedAmount: number | undefined = 1;
    h.fulfillment.override({
      confirmCod: (call, cb) => {
        capturedAmount = (call.request as { items: Array<{ collectedAmount?: number }> }).items[0].collectedAmount;
        cb(null, { results: [] });
      },
    });
    const res = await authedInject(h.app, 'POST', '/cod/confirm', { fulfillCode: 'ORD-1' });
    expect(res.statusCode).toBe(200);
    expect(capturedAmount).toBeUndefined();
  });

  it('thiếu fulfillCode → 400; collectedAmount âm/thập phân → 400', async () => {
    const missing = await authedInject(h.app, 'POST', '/cod/confirm', {});
    expect(missing.statusCode).toBe(400);
    const negative = await authedInject(h.app, 'POST', '/cod/confirm', { fulfillCode: 'O', collectedAmount: -1 });
    expect(negative.statusCode).toBe(400);
    const fractional = await authedInject(h.app, 'POST', '/cod/confirm', { fulfillCode: 'O', collectedAmount: 1.5 });
    expect(fractional.statusCode).toBe(400);
  });
});

describe('POST /cod/confirm-batch — guard + bulk confirm', () => {
  it('WarehouseEmployee → 403', async () => {
    const res = await authedInject(h.app, 'POST', '/cod/confirm-batch', { batchCode: 'B1' }, 'WarehouseEmployee');
    expect(res.statusCode).toBe(403);
  });

  it('WarehouseOps → 200 { confirmedCount, totalAmount } + actor downstream', async () => {
    let capturedActor: string | undefined;
    let capturedBatch: string | undefined;
    h.fulfillment.override({
      confirmBatchCod: (call, cb) => {
        capturedActor = call.metadata.get('x-user-name')[0] as string;
        capturedBatch = (call.request as { batchCode: string }).batchCode;
        cb(null, { confirmedCount: 3, totalAmount: 420000 });
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/cod/confirm-batch',
      payload: { batchCode: 'B-COD-1' },
      headers: { authorization: `Bearer ${await signTestToken('WarehouseOps', 'ops1')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ confirmedCount: 3, totalAmount: 420000 });
    expect(capturedBatch).toBe('B-COD-1');
    expect(capturedActor).toBe('ops1');
  });

  it('thiếu batchCode → 400', async () => {
    const res = await authedInject(h.app, 'POST', '/cod/confirm-batch', {});
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /cod/pending — guard + badge D2', () => {
  it('WarehouseEmployee → 403', async () => {
    const res = await authedInject(h.app, 'GET', '/cod/pending?batchCode=B1', undefined, 'WarehouseEmployee');
    expect(res.statusCode).toBe(403);
  });

  it('Manager → 200 { pendingCount, totalAmount }', async () => {
    h.fulfillment.override({
      getCodPending: (_call, cb) => cb(null, { pendingCount: 2, totalAmount: 240000 }),
    });
    const res = await authedInject(h.app, 'GET', '/cod/pending?batchCode=B-COD-1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ pendingCount: 2, totalAmount: 240000 });
  });

  it('thiếu batchCode → 400', async () => {
    const res = await authedInject(h.app, 'GET', '/cod/pending');
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /cod/settlement — guard Manager/Admin + kỳ D9', () => {
  it('Coordinator → 403 (chỉ Manager/Admin — D6)', async () => {
    const res = await authedInject(h.app, 'GET', '/cod/settlement?from=2026-08-01&to=2026-08-31', undefined, 'Coordinator');
    expect(res.statusCode).toBe(403);
  });

  it('WarehouseEmployee → 403', async () => {
    const res = await authedInject(h.app, 'GET', '/cod/settlement?from=2026-08-01&to=2026-08-31', undefined, 'WarehouseEmployee');
    expect(res.statusCode).toBe(403);
  });

  it('thiếu from/to → 400; sai format → 400; from > to → 400', async () => {
    const missing = await authedInject(h.app, 'GET', '/cod/settlement');
    expect(missing.statusCode).toBe(400);
    const missingTo = await authedInject(h.app, 'GET', '/cod/settlement?from=2026-08-01');
    expect(missingTo.statusCode).toBe(400);
    const badFormat = await authedInject(h.app, 'GET', '/cod/settlement?from=01-08-2026&to=2026-08-31');
    expect(badFormat.statusCode).toBe(400);
    const reversed = await authedInject(h.app, 'GET', '/cod/settlement?from=2026-08-31&to=2026-08-01');
    expect(reversed.statusCode).toBe(400);
  });

  it('Manager → 200 envelope paginated + kỳ wrap [from 00:00+07, to EXCL ngày+1 00:00+07]', async () => {
    let captured: { from?: Date; to?: Date } | null = null;
    h.fulfillment.override({
      getSettlement: (call, cb) => {
        captured = { from: call.request.periodFrom, to: call.request.periodTo };
        cb(null, {
          rows: [
            { shopCode: 'S1', shopName: 'Shop 1', totalOrders: 3, totalExpected: 300000, totalCollected: 150000, diffAmount: 150000, pendingCount: 1, mismatchCount: 1 },
            { shopCode: 'S2', shopName: 'Shop 2', totalOrders: 1, totalExpected: 90000, totalCollected: 90000, diffAmount: 0, pendingCount: 0, mismatchCount: 0 },
            { shopCode: 'S3', shopName: 'Shop 3', totalOrders: 2, totalExpected: 100000, totalCollected: 0, diffAmount: 100000, pendingCount: 2, mismatchCount: 0 },
          ],
        });
      },
    });
    const res = await authedInject(h.app, 'GET', '/cod/settlement?from=2026-08-01&to=2026-08-31');
    expect(res.statusCode).toBe(200);
    const body = res.body as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(Object.keys(body).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expect(body.total).toBe(3);
    expect(body.items).toHaveLength(3);
    expect((body.items[0] as { shopCode: string }).shopCode).toBe('S1');
    // to EXCLUSIVE = 2026-09-01T00:00+07 = 2026-08-31T17:00Z.
    expect(captured!.from).toEqual(new Date('2026-08-01T00:00:00+07:00'));
    expect(captured!.to).toEqual(new Date('2026-09-01T00:00:00+07:00'));
  });

  it('phân trang BFF-side — page=2&pageSize=2 → slice đúng', async () => {
    h.fulfillment.override({
      getSettlement: (_call, cb) => cb(null, {
        rows: [
          { shopCode: 'S1', shopName: '1', totalOrders: 1, totalExpected: 1, totalCollected: 1, diffAmount: 0, pendingCount: 0, mismatchCount: 0 },
          { shopCode: 'S2', shopName: '2', totalOrders: 1, totalExpected: 1, totalCollected: 1, diffAmount: 0, pendingCount: 0, mismatchCount: 0 },
          { shopCode: 'S3', shopName: '3', totalOrders: 1, totalExpected: 1, totalCollected: 1, diffAmount: 0, pendingCount: 0, mismatchCount: 0 },
        ],
      }),
    });
    const res = await authedInject(h.app, 'GET', '/cod/settlement?from=2026-08-01&to=2026-08-31&page=2&pageSize=2');
    expect(res.statusCode).toBe(200);
    const body = res.body as { items: Array<{ shopCode: string }>; total: number; page: number; pageSize: number };
    expect(body.items.map((i) => i.shopCode)).toEqual(['S3']);
    expect(body.total).toBe(3);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(2);
  });
});

describe('GET /cod/settlement/detail — guard + drill-down', () => {
  it('Coordinator → 403 (settlement guard)', async () => {
    const res = await authedInject(h.app, 'GET', '/cod/settlement/detail?shopCode=S1&from=2026-08-01&to=2026-08-31', undefined, 'Coordinator');
    expect(res.statusCode).toBe(403);
  });

  it('thiếu shopCode → 400; thiếu from/to → 400', async () => {
    const noShop = await authedInject(h.app, 'GET', '/cod/settlement/detail?from=2026-08-01&to=2026-08-31');
    expect(noShop.statusCode).toBe(400);
    const noPeriod = await authedInject(h.app, 'GET', '/cod/settlement/detail?shopCode=S1');
    expect(noPeriod.statusCode).toBe(400);
  });

  it('Manager → 200 envelope; collectedAmount absence → PENDING (không set field)', async () => {
    h.fulfillment.override({
      getSettlementDetail: (_call, cb) => cb(null, {
        confirmations: [
          {
            fulfillCode: 'ORD-1', batchCode: 'B1', shopCode: 'S1', shopName: 'Shop 1',
            expectedAmount: 150000, collectedAmount: 100000, collectedBy: 'ops1',
            collectedAt: new Date('2026-08-02T03:00:00Z'), completedAt: new Date('2026-08-01T10:00:00Z'),
            status: 1,
          },
          {
            fulfillCode: 'ORD-2', batchCode: 'B1', shopCode: 'S1', shopName: 'Shop 1',
            expectedAmount: 90000, collectedBy: '', completedAt: new Date('2026-08-01T11:00:00Z'),
            status: 0,
          },
        ],
      }),
    });
    const res = await authedInject(h.app, 'GET', '/cod/settlement/detail?shopCode=S1&from=2026-08-01&to=2026-08-31');
    expect(res.statusCode).toBe(200);
    const body = res.body as { items: Array<Record<string, unknown>>; total: number };
    expect(body.total).toBe(2);
    expect(body.items[0]).toEqual({
      fulfillCode: 'ORD-1', batchCode: 'B1', shopCode: 'S1', shopName: 'Shop 1',
      expectedAmount: 150000, collectedAmount: 100000, collectedBy: 'ops1',
      collectedAt: '2026-08-02T03:00:00.000Z', completedAt: '2026-08-01T10:00:00.000Z',
      status: 1,
    });
    expect(body.items[1].collectedAmount).toBeUndefined(); // PENDING — optional presence D3
    expect(body.items[1].collectedAt).toBeUndefined();
    expect(body.items[1].status).toBe(0);
  });
});

describe('Guard thống nhất — token sai role từng endpoint (ma trận D6)', () => {
  it('confirm paths: 4 role được phép, WarehouseEmployee chặn', async () => {
    for (const role of ['Coordinator', 'WarehouseOps', 'Manager', 'Admin'] as const) {
      const token = await signTestToken(role);
      const res = await h.app.inject({
        method: 'GET',
        url: '/cod/pending?batchCode=B1',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode, role).toBe(200);
    }
    const denied = await authedInject(h.app, 'GET', '/cod/pending?batchCode=B1', undefined, 'WarehouseEmployee');
    expect(denied.statusCode).toBe(403);
  });

  it('settlement paths: chỉ Manager + Admin được phép', async () => {
    for (const role of ['Manager', 'Admin'] as const) {
      const token = await signTestToken(role);
      const res = await h.app.inject({
        method: 'GET',
        url: '/cod/settlement?from=2026-08-01&to=2026-08-31',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode, role).toBe(200);
    }
    for (const role of ['Coordinator', 'WarehouseOps', 'WarehouseEmployee'] as const) {
      const res = await authedInject(h.app, 'GET', '/cod/settlement?from=2026-08-01&to=2026-08-31', undefined, role);
      expect(res.statusCode, role).toBe(403);
    }
  });
});
