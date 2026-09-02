/**
 * SF-27 (FI-273) event envelope — CANONICAL schema.
 * Copy nhỏ 2 bên phải khớp 100%: fulfillment.events.EventEnvelope (Java),
 * internal/kafka.Envelope (Go). Drift = P1.
 * Topic mapping: order.* → order-events · batch.* → batch-events
 * Message key = orderCode/fulfillCode (order-events) | batchCode (batch-events).
 */
export type EventType =
  | 'order.assigned'
  | 'order.cancelled'
  | 'order.completed'
  | 'order.failed'
  | 'order.redelivered'
  | 'order.created'
  | 'batch.created'
  | 'batch.transitioned';

export type EventSource = 'fulfillment' | 'batching' | 'bff';

export interface EventEnvelope<P = Record<string, unknown>> {
  eventId: string;
  type: EventType;
  occurredAt: string;
  source: EventSource;
  payload: P;
}

export function topicFor(type: EventType): string {
  return type.startsWith('batch.') ? 'batch-events' : 'order-events';
}
