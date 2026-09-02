import { describe, expect, it } from 'vitest';
import { topicFor, type EventEnvelope } from './envelope';
import fixture from './envelope.fixture.json';

describe('event envelope (SF-27)', () => {
  it('fixture khớp shape EventEnvelope', () => {
    const env = fixture as unknown as EventEnvelope;
    expect(env.eventId).toBeTruthy();
    expect(env.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(['fulfillment', 'batching', 'bff']).toContain(env.source);
    expect(env.payload).toBeTypeOf('object');
  });
  it('topicFor mapping', () => {
    expect(topicFor('order.assigned')).toBe('order-events');
    expect(topicFor('batch.created')).toBe('batch-events');
    expect(topicFor('order.created')).toBe('order-events');
    expect(topicFor('batch.transitioned')).toBe('batch-events');
  });
});
