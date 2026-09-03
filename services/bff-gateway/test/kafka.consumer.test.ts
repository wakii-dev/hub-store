/**
 * SF-27 — Kafka consumer bridge tests. parseMessage + bffEvents emit là pure
 * logic (không cần broker thật — E2E 05-kafka.spec.ts mới test với kafka lên).
 */
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachDegradedHandlers, parseMessage } from '../src/kafka/consumer.js';
import { bffEvents, type KafkaEventMessage } from '../src/kafka/events.js';

describe('parseMessage (SF-27)', () => {
  it('parses valid envelope JSON', () => {
    const raw = JSON.stringify({
      eventId: 'u1',
      type: 'order.assigned',
      occurredAt: '2026-09-02T10:00:00Z',
      source: 'fulfillment',
      payload: { fulfillCode: 'ORD-3001' },
    });
    expect(parseMessage(raw)).toMatchObject({ type: 'order.assigned' });
  });

  it('returns null + không throw cho malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseMessage('không-phải-json{{')).toBeNull();
    expect(parseMessage('')).toBeNull();
    warn.mockRestore();
  });
});

describe('bffEvents bridge (SF-27)', () => {
  afterEach(() => {
    bffEvents.removeAllListeners('kafka:event');
  });

  it('emit kafka:event với { topic, envelope }', () => {
    const spy = vi.fn();
    bffEvents.on('kafka:event', spy);
    const msg: KafkaEventMessage = {
      topic: 'order-events',
      envelope: { type: 'order.assigned' },
    };
    bffEvents.emit('kafka:event', msg);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(msg);
  });
});

describe('kafka config flag (SF-27)', () => {
  it("enabled chỉ khi KAFKA_ENABLED='true' đúng chữ (thống nhất Go/Java/e2e); mặc định localhost:9092", async () => {
    const { loadConfig } = await import('../src/config.js');
    const base = { OIDC_ISSUER: 'http://localhost:8081' };
    expect(loadConfig(base).kafka).toEqual({
      enabled: false,
      bootstrapServers: 'localhost:9092',
    });
    expect(loadConfig({ ...base, KAFKA_ENABLED: 'true' }).kafka.enabled).toBe(true);
    expect(loadConfig({ ...base, KAFKA_ENABLED: '1' }).kafka.enabled).toBe(false);
    expect(loadConfig({ ...base, KAFKA_ENABLED: 'false' }).kafka.enabled).toBe(false);
    expect(
      loadConfig({ ...base, KAFKA_ENABLED: 'true', KAFKA_BOOTSTRAP_SERVERS: 'kafka:29092' })
        .kafka.bootstrapServers,
    ).toBe('kafka:29092');
  });
});

describe('degraded signal (SF-10 T2)', () => {
  function fakeConsumer(): EventEmitter {
    return new EventEmitter();
  }

  it('consumer.disconnect sau khi connect → onEvent nhận stream.degraded topic _system (đúng 1 lần)', () => {
    const consumer = fakeConsumer();
    const seen: KafkaEventMessage[] = [];
    attachDegradedHandlers(
      consumer as never,
      (m) => seen.push(m),
      () => true,
    );
    consumer.emit('consumer.disconnect');
    consumer.emit('consumer.disconnect'); // lặp → bỏ qua
    expect(seen).toHaveLength(1);
    expect(seen[0].topic).toBe('_system');
    expect(seen[0].envelope).toMatchObject({
      type: 'stream.degraded',
      source: 'bff-local',
      payload: { reason: 'consumer.disconnect' },
    });
    const envelope = seen[0].envelope as Record<string, unknown>;
    expect(typeof envelope.eventId).toBe('string');
    expect(new Date(envelope.occurredAt as string).getTime()).not.toBeNaN();
  });

  it('consumer.crash → degraded kèm reason từ error payload', () => {
    const consumer = fakeConsumer();
    const seen: KafkaEventMessage[] = [];
    attachDegradedHandlers(
      consumer as never,
      (m) => seen.push(m),
      () => true,
    );
    consumer.emit('consumer.crash', { payload: { error: new Error('broker gone') } });
    expect(seen).toHaveLength(1);
    expect(seen[0].envelope).toMatchObject({
      type: 'stream.degraded',
      payload: { reason: 'consumer.crash: broker gone' },
    });
  });

  it('chưa từng connect thành công (isConnected=false) → KHÔNG emit (behavior connect-fail cũ giữ nguyên)', () => {
    const consumer = fakeConsumer();
    const seen: KafkaEventMessage[] = [];
    attachDegradedHandlers(
      consumer as never,
      (m) => seen.push(m),
      () => false,
    );
    consumer.emit('consumer.disconnect');
    consumer.emit('consumer.crash', { payload: { error: new Error('x') } });
    expect(seen).toHaveLength(0);
  });
});
