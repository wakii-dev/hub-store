/**
 * SF-10 — pure helpers lib/realtime-events.ts: allow-list membership + topic
 * map (order.* → order-events, batch.* → batch-events). Không I/O — test thuần.
 */
import { describe, expect, it } from 'vitest';
import {
  REALTIME_EVENT_TYPES,
  isRealtimeEvent,
  topicForEventType,
} from '../src/lib/realtime-events.js';

describe('REALTIME_EVENT_TYPES allow-list', () => {
  it('đủ 9 type theo contract SF-10', () => {
    expect(REALTIME_EVENT_TYPES).toEqual([
      'order.assigned',
      'order.cancelled',
      'order.completed',
      'order.failed',
      'order.redelivered',
      'batch.created',
      'batch.cancelled',
      'batch.completed',
      'batch.transitioned',
    ]);
  });
});

describe('isRealtimeEvent', () => {
  it.each(REALTIME_EVENT_TYPES)('nhận type hợp lệ %s', (type) => {
    expect(isRealtimeEvent(type)).toBe(true);
  });

  it.each([
    'order.unknown',
    'batch.pending',
    'stream.degraded', // synthetic T2 — KHÔNG nằm allow-list (FE tự xử lý)
    'ORDER.ASSIGNED', // case-sensitive
    '',
    'random.event',
    'order.', // prefix trống không đủ
  ])('từ chối type lạ %j', (type) => {
    expect(isRealtimeEvent(type)).toBe(false);
  });
});

describe('topicForEventType', () => {
  it('order.* → order-events', () => {
    expect(topicForEventType('order.assigned')).toBe('order-events');
    expect(topicForEventType('order.redelivered')).toBe('order-events');
  });

  it('batch.* → batch-events', () => {
    expect(topicForEventType('batch.created')).toBe('batch-events');
    expect(topicForEventType('batch.transitioned')).toBe('batch-events');
  });

  it('type lạ → null', () => {
    expect(topicForEventType('stream.degraded')).toBeNull();
    expect(topicForEventType('')).toBeNull();
  });
});
