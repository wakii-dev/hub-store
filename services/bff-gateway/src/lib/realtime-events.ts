/**
 * SF-10 — allow-list event type realtime cho SSE /events (T1) + local emit
 * (T2 dùng chung). Envelope shape {eventId,type,occurredAt,source,payload} là
 * contract SF-27 — READ-ONLY, chỉ lọc theo `type`.
 */

/** Sự kiện FE quan tâm (invalidate list) — mọi type khác bị SSE filter bỏ qua. */
export const REALTIME_EVENT_TYPES = [
  'order.assigned',
  'order.cancelled',
  'order.completed',
  'order.failed',
  'order.redelivered',
  'batch.created',
  'batch.cancelled',
  'batch.completed',
  'batch.transitioned',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

/** Thuần — dùng ở SSE filter lẫn call-site emit (T2). */
export function isRealtimeEvent(type: string): boolean {
  return (REALTIME_EVENT_TYPES as readonly string[]).includes(type);
}

/** Topic Kafka tương ứng prefix event type — order.* / batch.* (SF-27 contract). */
export function topicForEventType(type: string): 'order-events' | 'batch-events' | null {
  if (type.startsWith('order.')) return 'order-events';
  if (type.startsWith('batch.')) return 'batch-events';
  return null;
}
