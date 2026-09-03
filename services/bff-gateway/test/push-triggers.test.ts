/**
 * SF-23 T5 — push triggers trên bffEvents bus:
 * (a) emit 'kafka:event' order.assigned → pool giả nhận đúng 1 INSERT với
 *     dedupeKey = eventId ('evt-1') + copy vi đúng;
 * (b) type KHÔNG trong allow-list (order.cancelled) → 0 INSERT;
 * (c) envelope hỏng (null / thiếu type / không phải object) → KHÔNG throw;
 * (d) mock mode (config.onesignal rỗng) → sendOneSignalPush false path,
 *     ZERO fetch (assert global fetch không bị gọi).
 * Harness mirror notifications.test.ts — pool pg stub qua __setNotificationsPoolForTests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { __setNotificationsPoolForTests } from '../src/lib/notifications.js';
import { startPushTriggers } from '../src/lib/push-triggers.js';
import { bffEvents } from '../src/kafka/events.js';
import type { BffConfig } from '../src/config.js';

function makeConfig(onesignal?: { appId: string; restApiKey: string }): BffConfig {
  return { onesignal: onesignal ?? { appId: '', restApiKey: '' } } as BffConfig;
}

describe('startPushTriggers', () => {
  const queryMock = vi.fn();
  const fetchMock = vi.fn();
  let stop: (() => void) | null = null;

  beforeEach(() => {
    queryMock.mockReset().mockResolvedValue({ rows: [] });
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.FULFILLMENT_DB_HOST = 'push-test.invalid';
    __setNotificationsPoolForTests({ query: queryMock } as unknown as Pool);
  });

  afterEach(() => {
    stop?.();
    stop = null;
    __setNotificationsPoolForTests(null);
    delete process.env.FULFILLMENT_DB_HOST;
    vi.unstubAllGlobals();
  });

  const emit = (envelope: unknown) =>
    bffEvents.emit('kafka:event', { topic: 'order-events', envelope });

  it('order.assigned → 1 INSERT, dedupeKey = eventId, copy vi đúng', async () => {
    stop = startPushTriggers(makeConfig());
    emit({ eventId: 'evt-1', type: 'order.assigned', payload: { fulfillCode: 'ORD-1' } });
    await new Promise((r) => setTimeout(r, 0)); // đợi fire-and-forget query
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('INSERT INTO notification_log (type, title, body, payload, dedupe_key)');
    expect(params).toEqual([
      'order.assigned',
      'Đơn mới vào',
      'Đơn ORD-1 đã được phân công.',
      { fulfillCode: 'ORD-1' },
      'evt-1',
    ]);
  });

  it('batch.completed → body dùng batchCode ?? code', async () => {
    stop = startPushTriggers(makeConfig());
    emit({ eventId: 'evt-2', type: 'batch.completed', payload: { batchCode: 'BAT-9' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock.mock.calls[0][1]).toEqual([
      'batch.completed',
      'Phiếu hoàn tất',
      'Phiếu soạn BAT-9 hoàn tất.',
      { batchCode: 'BAT-9' },
      'evt-2',
    ]);
  });

  it('type không trong map (order.cancelled) → 0 INSERT', async () => {
    stop = startPushTriggers(makeConfig());
    emit({ eventId: 'evt-3', type: 'order.cancelled', payload: { fulfillCode: 'ORD-2' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('envelope hỏng (null / thiếu type / thiếu eventId) → KHÔNG throw, không crash', async () => {
    stop = startPushTriggers(makeConfig());
    expect(() => emit(null)).not.toThrow();
    expect(() => emit({ eventId: 'evt-4' })).not.toThrow();
    expect(() => emit('not-an-object')).not.toThrow();
    expect(() => emit({ eventId: 'evt-5', type: 'order.completed' })).not.toThrow(); // payload thiếu → {}
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).toHaveBeenCalledTimes(1); // chỉ evt-5 (order.completed, payload {})
    expect(queryMock.mock.calls[0][1][2]).toBe('Đơn  hoàn tất giao.');
  });

  it('mock mode (appId + key rỗng) → KHÔNG fetch (log-only, false path)', async () => {
    stop = startPushTriggers(makeConfig());
    emit({ eventId: 'evt-6', type: 'order.failed', payload: { fulfillCode: 'ORD-3' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unsubscribe closure → handler gỡ khỏi bus, emit sau stop → 0 INSERT', async () => {
    stop = startPushTriggers(makeConfig());
    stop();
    stop = null;
    emit({ eventId: 'evt-7', type: 'order.assigned', payload: {} });
    await new Promise((r) => setTimeout(r, 0));
    expect(queryMock).not.toHaveBeenCalled();
  });
});
