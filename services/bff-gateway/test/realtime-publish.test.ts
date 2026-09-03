/**
 * SF-10 T2 — emitLocalEvent (dual-source local emit khi KAFKA_ENABLED=false):
 * envelope shape + topic mapping (order.* vs batch.*), no-op khi kafka bật,
 * no-op cho type lạ, và 1 route test assert emit fire SAU success.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bffEvents, type KafkaEventMessage } from '../src/kafka/events.js';
import { emitLocalEvent } from '../src/lib/realtime-publish.js';
import { authedInject, startHarness, type Harness } from './harness.js';

describe('emitLocalEvent — helper thuần (SF-10)', () => {
  const spy = vi.fn<(m: KafkaEventMessage) => void>();

  beforeEach(() => {
    spy.mockClear();
    bffEvents.on('kafka:event', spy);
  });

  afterEach(() => {
    bffEvents.removeAllListeners('kafka:event');
    vi.unstubAllEnvs();
  });

  it('envelope shape đúng contract + topic order-events cho order.*', () => {
    vi.stubEnv('KAFKA_ENABLED', '');
    emitLocalEvent('order.assigned', { fulfillCode: 'DH-1' });
    expect(spy).toHaveBeenCalledOnce();
    const msg = spy.mock.calls[0][0] as KafkaEventMessage;
    expect(msg.topic).toBe('order-events');
    const envelope = msg.envelope as Record<string, unknown>;
    expect(envelope.type).toBe('order.assigned');
    expect(envelope.source).toBe('bff-local');
    expect(typeof envelope.eventId).toBe('string');
    expect(new Date(envelope.occurredAt as string).getTime()).not.toBeNaN();
    expect(envelope.payload).toEqual({ fulfillCode: 'DH-1' });
  });

  it('topic mapping: batch.* → batch-events (2 event batch khác nhau)', () => {
    vi.stubEnv('KAFKA_ENABLED', '');
    emitLocalEvent('batch.created', { batchCode: 'B-1', itemCount: 2 });
    emitLocalEvent('batch.transitioned', { batchCode: 'B-1', from: 'active', to: 'cancelled' });
    expect(spy).toHaveBeenCalledTimes(2);
    expect((spy.mock.calls[0][0] as KafkaEventMessage).topic).toBe('batch-events');
    expect((spy.mock.calls[1][0] as KafkaEventMessage).topic).toBe('batch-events');
  });

  it('no-op khi KAFKA_ENABLED=true (kafka side-channel lo publish)', () => {
    vi.stubEnv('KAFKA_ENABLED', 'true');
    emitLocalEvent('order.assigned', { fulfillCode: 'DH-1' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('no-op + warn-once cho type không trong allow-list', () => {
    vi.stubEnv('KAFKA_ENABLED', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    emitLocalEvent('order.unknown', { x: 1 });
    emitLocalEvent('order.unknown', { x: 2 });
    expect(spy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1); // log once per type
    warn.mockRestore();
  });
});

describe('route emit sau success (SF-10) — assign-shop-hub', () => {
  let harness: Harness;

  afterEach(async () => {
    await harness?.closeAll();
  });

  it('POST /fulfillment/:code/assign-shop-hub 200 → bffEvents nhận order.assigned (source bff-local)', async () => {
    harness = await startHarness(); // config.kafka.enabled=false trong test harness
    const seen: KafkaEventMessage[] = [];
    const listener = (m: KafkaEventMessage): void => {
      seen.push(m);
    };
    bffEvents.on('kafka:event', listener);
    const res = await authedInject(
      harness.app,
      'POST',
      '/fulfillment/ORD-3001/assign-shop-hub',
      { toShopCode: 'SG01' },
    );
    bffEvents.off('kafka:event', listener);
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].topic).toBe('order-events');
    expect(seen[0].envelope).toMatchObject({
      type: 'order.assigned',
      source: 'bff-local',
      payload: { fulfillCode: 'ORD-3001' },
    });
  });
});
