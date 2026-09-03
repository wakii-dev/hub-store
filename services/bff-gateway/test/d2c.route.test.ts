/**
 * SF-18 (FI-263) — D2C route tests: filter envelope, export guard 31 ngày
 * (biên 40/32/31), CSV BOM + Content-Disposition, note order_code pass-through,
 * role guard Coordinator → 403 cả 3 endpoint. Harness pattern bff.contract.test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authedInject, startHarness, type Harness } from './harness.js';
import { fixtureD2cOrder } from './fixtures.js';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

describe('POST /d2c-orders/filter', () => {
  it('200 — envelope paginated { items, total, page, pageSize } + DTO camelCase', async () => {
    const res = await authedInject(h.app, 'POST', '/d2c-orders/filter', { page: 1, pageSize: 20 });
    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expect(body.total).toBe(12);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    const item = (body.items as Array<Record<string, unknown>>)[0];
    expect(item.orderCode).toBe('D2C-1001');
    expect(item.carrier).toBe('GHN');
    expect(item.isDebtSplitting).toBe(false);
    // ts-proto Date → ISO string (14:45+07 = 07:45Z).
    expect(item.pushTime).toBe('2026-08-15T07:45:00.000Z');
  });
});

describe('GET /d2c-orders/export — guard 31 ngày (date-only +07)', () => {
  it('40 ngày → 400 + message đúng', async () => {
    const res = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-07-01&to=2026-08-10');
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toBe(
      'Khoảng thời gian export tối đa 31 ngày',
    );
  });

  it('32 ngày (biên chặn) → 400', async () => {
    const res = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-07-01&to=2026-08-02');
    expect(res.statusCode).toBe(400);
  });

  it('from > to → 400; thiếu from/to → 400', async () => {
    const reversed = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-08-02&to=2026-08-01');
    expect(reversed.statusCode).toBe(400);
    const missing = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-07-01');
    expect(missing.statusCode).toBe(400);
  });

  it('31 ngày (from=01 → 01-tháng-kế) → 200 + BOM + Content-Disposition filename', async () => {
    const res = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-07-01&to=2026-08-01');
    expect(res.statusCode).toBe(200);
    // BOM \uFEFF (EF BB BF) đầu payload.
    expect(res.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const text = res.rawPayload.toString('utf8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text.split('\n')[0]).toContain('Mã đơn');
    expect(text).toContain('D2C-1001');
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="D2C_Order_2026-07-01_2026-08-01.csv"',
    );
  });

  it('assemble loop — upstream trả 2 trang (2 + 1 items) → CSV đủ 3 data rows', async () => {
    let calls = 0;
    h.fulfillment.override({
      filterD2COrders: (call, cb) => {
        calls++;
        const page = call.request.page;
        cb(null, {
          items:
            page === 1
              ? [
                  { ...fixtureD2cOrder, id: 1 },
                  { ...fixtureD2cOrder, orderCode: 'D2C-1002', id: 2 },
                ]
              : [{ ...fixtureD2cOrder, orderCode: 'D2C-1003', id: 3 }],
          total: 3,
        });
      },
    });
    const res = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-07-01&to=2026-08-01');
    expect(res.statusCode).toBe(200);
    expect(calls).toBe(2);
    const dataRows = res.rawPayload.toString('utf8').split('\n').length - 1; // trừ header
    expect(dataRows).toBe(3);
  });

  it('export truyền from/to vào upstream như khoảng ngày tạo (bounds full-day +07)', async () => {
    let captured: { createdFrom?: Date; createdTo?: Date } | null = null;
    h.fulfillment.override({
      filterD2COrders: (call, cb) => {
        captured = { createdFrom: call.request.createdFrom, createdTo: call.request.createdTo };
        cb(null, { items: [{ ...fixtureD2cOrder, id: 1 }], total: 1 });
      },
    });
    const res = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-07-01&to=2026-07-07');
    expect(res.statusCode).toBe(200);
    expect(captured!.createdFrom).toEqual(new Date('2026-07-01T00:00:00+07:00'));
    expect(captured!.createdTo).toEqual(new Date('2026-07-07T23:59:59+07:00'));
  });

  it('csvEscape neutralize formula injection — giá trị bắt đầu bằng = + - @ được prefix apostrophe', async () => {
    h.fulfillment.override({
      filterD2COrders: (_call, cb) => {
        cb(null, {
          items: [
            { ...fixtureD2cOrder, id: 1, note: '=HYPERLINK("http://evil","x")' },
            { ...fixtureD2cOrder, orderCode: '-CMD', id: 2 },
            { ...fixtureD2cOrder, orderCode: '@x', id: 3 },
            { ...fixtureD2cOrder, orderCode: '+1', id: 4 },
          ],
          total: 4,
        });
      },
    });
    const res = await authedInject(h.app, 'GET', '/d2c-orders/export?from=2026-07-01&to=2026-07-07');
    const text = res.rawPayload.toString('utf8');
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain("'-CMD");
    expect(text).toContain("'@x");
    expect(text).toContain("'+1");
    expect(text).not.toContain('=HYPERLINK("http://evil"');
  });
});

describe('PUT /d2c-orders/:orderCode/note', () => {
  it('200 — gọi upstream với đúng order_code + note + actor_role, trả { item }', async () => {
    let captured: Record<string, unknown> | null = null;
    h.fulfillment.override({
      updateD2COrderNote: (call, cb) => {
        captured = { ...call.request };
        cb(null, { order: { ...fixtureD2cOrder, note: 'Ghi chú mới' } });
      },
    });
    const res = await authedInject(h.app, 'PUT', '/d2c-orders/D2C-1001/note', { note: 'Ghi chú mới' });
    expect(res.statusCode).toBe(200);
    expect(captured).toMatchObject({ orderCode: 'D2C-1001', note: 'Ghi chú mới', actorRole: 'Manager' });
    expect((res.body as { item: { note: string } }).item.note).toBe('Ghi chú mới');
  });

  it('body thiếu / note quá dài → 400 envelope (không 500)', async () => {
    h.fulfillment.override({
      updateD2COrderNote: (_call, cb) => cb(null, { order: { ...fixtureD2cOrder } }),
    });
    const noBody = await authedInject(h.app, 'PUT', '/d2c-orders/D2C-1001/note');
    expect(noBody.statusCode).toBe(400);
    const emptyNote = await authedInject(h.app, 'PUT', '/d2c-orders/D2C-1001/note', {});
    expect(emptyNote.statusCode).toBe(400);
    const tooLong = await authedInject(h.app, 'PUT', '/d2c-orders/D2C-1001/note', {
      note: 'x'.repeat(501),
    });
    expect(tooLong.statusCode).toBe(400);
    expect((tooLong.body as { message: string }).message).toContain('500');
    // 500 ký tự đúng biên → qua guard, gọi upstream.
    const atLimit = await authedInject(h.app, 'PUT', '/d2c-orders/D2C-1001/note', {
      note: 'x'.repeat(500),
    });
    expect(atLimit.statusCode).toBe(200);
  });
});

describe('Role guard — Coordinator → 403 cả 3 endpoint D2C', () => {
  it('filter / note / export đều 403 PERMISSION_DENIED', async () => {
    const filter = await authedInject(h.app, 'POST', '/d2c-orders/filter', {}, 'Coordinator');
    expect(filter.statusCode).toBe(403);
    expect((filter.body as { code: string }).code).toBe('PERMISSION_DENIED');

    const note = await authedInject(
      h.app,
      'PUT',
      '/d2c-orders/D2C-1001/note',
      { note: 'x' },
      'Coordinator',
    );
    expect(note.statusCode).toBe(403);

    const exportRes = await authedInject(
      h.app,
      'GET',
      '/d2c-orders/export?from=2026-07-01&to=2026-08-01',
      undefined,
      'Coordinator',
    );
    expect(exportRes.statusCode).toBe(403);
  });
});
