/**
 * SF-23 (FI-268) T3 — notification_log lib + GET /notifications (+ /api):
 * (a) logNotification INSERT đúng params + ON CONFLICT (dedupe_key) DO NOTHING
 *     (Kafka redelivery idempotent) + lỗi query KHÔNG throw (fail-open);
 * (b) listNotifications map snake→camel + created_at ISO + total;
 * (c) normalizeNotificationPage — input rác → default (KHÔNG 500), cap 100;
 * (d) route: 401 không JWT; 200 envelope {items,total} có JWT; pool thiếu →
 *     200 {items:[],total:0}; pageSize=500 → LIMIT 100.
 * Harness thật (mock gRPC + JWT) — pool pg stub qua __setNotificationsPoolForTests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  __setNotificationsPoolForTests,
  getNotificationPool,
  listNotifications,
  logNotification,
  normalizeNotificationPage,
} from '../src/lib/notifications.js';
import { startHarness, authedInject, type Harness } from './harness.js';

// --- lib unit ---

describe('logNotification', () => {
  const queryMock = vi.fn();
  beforeEach(() => {
    queryMock.mockReset().mockResolvedValue({ rows: [] });
    process.env.FULFILLMENT_DB_HOST = 'notif-test.invalid';
    __setNotificationsPoolForTests({ query: queryMock } as unknown as Pool);
  });
  afterEach(() => {
    __setNotificationsPoolForTests(null);
    delete process.env.FULFILLMENT_DB_HOST;
  });

  it('INSERT với params đúng (payload null khi bỏ, dedupeKey=null khi bỏ)', () => {
    logNotification({ type: 'order.assigned', title: 'Đơn mới vào', body: 'ORD-1 đã được phân công.' });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO notification_log (type, title, body, payload, dedupe_key)');
    expect(sql).toContain('ON CONFLICT (dedupe_key) DO NOTHING');
    expect(params).toEqual(['order.assigned', 'Đơn mới vào', 'ORD-1 đã được phân công.', null, null]);
  });

  it('payload + dedupeKey truyền đủ (dedupe = eventId envelope)', () => {
    logNotification({
      type: 'batch.completed',
      title: 'Phiếu hoàn tất',
      body: 'BAT-1 hoàn tất.',
      payload: { batchCode: 'BAT-1' },
      dedupeKey: 'evt-42',
    });
    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(['batch.completed', 'Phiếu hoàn tất', 'BAT-1 hoàn tất.', { batchCode: 'BAT-1' }, 'evt-42']);
  });

  it('query reject → KHÔNG throw (fire-and-forget warn)', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    expect(() =>
      logNotification({ type: 't', title: 't', body: 'b', dedupeKey: 'k' }),
    ).not.toThrow();
    // đợi microtask chain của .catch — không unhandled rejection
    await new Promise((r) => setTimeout(r, 0));
  });

  it('thiếu FULFILLMENT_DB_HOST → disabled, KHÔNG chạm pool', () => {
    delete process.env.FULFILLMENT_DB_HOST;
    logNotification({ type: 't', title: 't', body: 'b' });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('listNotifications', () => {
  const queryMock = vi.fn();
  beforeEach(() => {
    queryMock.mockReset();
    process.env.FULFILLMENT_DB_HOST = 'notif-test.invalid';
    __setNotificationsPoolForTests({ query: queryMock } as unknown as Pool);
  });
  afterEach(() => {
    __setNotificationsPoolForTests(null);
    delete process.env.FULFILLMENT_DB_HOST;
  });

  it('map snake→camel + created_at ISO + total, ORDER created_at DESC + LIMIT/OFFSET', async () => {
    queryMock.mockImplementation((sql: string) =>
      sql.startsWith('SELECT COUNT')
        ? Promise.resolve({ rows: [{ c: 7 }] })
        : Promise.resolve({
            rows: [
              {
                id: 9,
                type: 'order.failed',
                title: 'Giao thất bại',
                body: 'ORD-2 giao thất bại — cần xử lý.',
                payload: { fulfillCode: 'ORD-2' },
                created_at: new Date('2026-09-03T01:02:03.000Z'),
              },
            ],
          }),
    );
    const { items, total } = await listNotifications(2, 10);
    expect(total).toBe(7);
    expect(items).toEqual([
      {
        id: 9,
        type: 'order.failed',
        title: 'Giao thất bại',
        body: 'ORD-2 giao thất bại — cần xử lý.',
        payload: { fulfillCode: 'ORD-2' },
        createdAt: '2026-09-03T01:02:03.000Z',
      },
    ]);
    const found = queryMock.mock.calls.find((c) => !(c[0] as string).startsWith('SELECT COUNT'));
    if (!found) throw new Error('no INSERT call recorded');
    const [itemsSql, params] = found;
    expect(itemsSql).toContain('ORDER BY created_at DESC');
    expect(params).toEqual([10, 10]); // pageSize 10, offset (2-1)*10
  });

  it('pool thiếu → {items:[],total:0} (fail-open)', async () => {
    delete process.env.FULFILLMENT_DB_HOST;
    expect(await listNotifications(1, 20)).toEqual({ items: [], total: 0 });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('normalizeNotificationPage', () => {
  it('input rác → default (KHÔNG 500)', () => {
    expect(normalizeNotificationPage({})).toEqual({ page: 1, pageSize: 20, offset: 0 });
    expect(normalizeNotificationPage({ page: 'abc', pageSize: 'xyz' })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
    // repeated key (?page=1&page=2) → array → NaN → default
    expect(normalizeNotificationPage({ page: ['1', '2'], pageSize: ['10', '20'] })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it('cap 100 + floor âm/0 về default', () => {
    expect(normalizeNotificationPage({ pageSize: 500 })).toEqual({ page: 1, pageSize: 100, offset: 0 });
    expect(normalizeNotificationPage({ page: '3', pageSize: '15' })).toEqual({ page: 3, pageSize: 15, offset: 30 });
    expect(normalizeNotificationPage({ page: 0, pageSize: 0 }).page).toBe(1);
  });

  it('page=1e21 (Number.isFinite=true nhưng OFFSET vượt bigint) → clamp 10_000 (security P2-4)', () => {
    expect(normalizeNotificationPage({ page: '1e21' })).toEqual({ page: 10_000, pageSize: 20, offset: 199_980 });
    expect(normalizeNotificationPage({ page: 1e21 }).page).toBe(10_000);
  });
});

describe('getNotificationPool', () => {
  afterEach(() => {
    delete process.env.FULFILLMENT_DB_HOST;
  });
  it('thiếu env → null; có env + inject → trả pool inject', () => {
    expect(getNotificationPool({})).toBeNull();
    process.env.FULFILLMENT_DB_HOST = 'notif-test.invalid';
    const fake = { query: vi.fn() } as unknown as Pool;
    __setNotificationsPoolForTests(fake);
    expect(getNotificationPool()).toBe(fake);
    __setNotificationsPoolForTests(null);
  });
});

// --- route integration (harness thật + fastify.inject) ---

describe('GET /notifications (+ /api/notifications)', () => {
  let h: Harness;
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    queryMock = vi.fn().mockImplementation((sql: string) =>
      sql.startsWith('SELECT COUNT')
        ? Promise.resolve({ rows: [{ c: 1 }] })
        : Promise.resolve({
            rows: [
              {
                id: 42,
                type: 'order.assigned',
                title: 'Đơn mới vào',
                body: 'ORD-3001 đã được phân công.',
                payload: { fulfillCode: 'ORD-3001' },
                created_at: new Date('2026-09-03T01:02:03.000Z'),
              },
            ],
          }),
    );
    process.env.FULFILLMENT_DB_HOST = 'notif-test.invalid';
    __setNotificationsPoolForTests({ query: queryMock } as unknown as Pool);
  });

  afterEach(async () => {
    __setNotificationsPoolForTests(null);
    delete process.env.FULFILLMENT_DB_HOST;
    await h?.closeAll();
  });

  it('không JWT → 401', async () => {
    h = await startHarness();
    const res = await h.app.inject({ method: 'GET', url: '/notifications' });
    expect(res.statusCode).toBe(401);
  });

  it('JWT Manager → 200 envelope {items,total} map camel', async () => {
    h = await startHarness();
    const res = await authedInject(h.app, 'GET', '/notifications');
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual(['items', 'total']);
    const { items, total } = res.body as { items: Array<Record<string, unknown>>; total: number };
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ id: 42, createdAt: '2026-09-03T01:02:03.000Z' });
  });

  it('dev path /api/notifications — cùng handler, JWT-guarded + 200', async () => {
    h = await startHarness();
    const anon = await h.app.inject({ method: 'GET', url: '/api/notifications' });
    expect(anon.statusCode).toBe(401);
    const res = await authedInject(h.app, 'GET', '/api/notifications?page=1&pageSize=20');
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual(['items', 'total']);
  });

  it('pool thiếu (env trống) → 200 {items:[],total:0} fail-open', async () => {
    delete process.env.FULFILLMENT_DB_HOST;
    __setNotificationsPoolForTests(null);
    h = await startHarness();
    const res = await authedInject(h.app, 'GET', '/notifications');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('pageSize=500 → LIMIT 100 (cap)', async () => {
    h = await startHarness();
    const res = await authedInject(h.app, 'GET', '/notifications?pageSize=500');
    expect(res.statusCode).toBe(200);
    const itemsCall = queryMock.mock.calls.find((c) => !(c[0] as string).startsWith('SELECT COUNT'));
    expect(itemsCall?.[1]).toEqual([100, 0]);
  });

  it('page=1e21 → không 500, clamp về page 10_000 (security P2-4)', async () => {
    h = await startHarness();
    const res = await authedInject(h.app, 'GET', '/notifications?page=1e21');
    expect(res.statusCode).toBe(200);
    const itemsCall = queryMock.mock.calls.find((c) => !(c[0] as string).startsWith('SELECT COUNT'));
    expect(itemsCall?.[1]).toEqual([20, 199_980]); // pageSize default 20, offset (10000-1)*20
  });

  it('pool query throw → 503 envelope chuẩn, KHÔNG leak err.message (security P1-1)', async () => {
    queryMock.mockRejectedValue(new Error('FATAL: password authentication failed for user "hubstore"'));
    h = await startHarness();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await authedInject(h.app, 'GET', '/notifications');
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({
        statusCode: 503,
        code: 'NOTIFICATIONS_UNAVAILABLE',
        message: 'Notification feed tạm thời không khả dụng.',
      });
      expect(JSON.stringify(res.body)).not.toContain('password authentication');
      // chi tiết lỗi vẫn log server-side
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).toContain('password authentication');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
