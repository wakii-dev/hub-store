/**
 * SF-10 — dual-source local emit (KAFKA_ENABLED=false): khi Kafka off thì
 * producers Java/Go cũng off → mutation routes gọi emitLocalEvent SAU gRPC
 * success để bơm thẳng envelope vào bffEvents (SSE /events nhận như event
 * kafka). Either/or nên không duplicate.
 *
 * Guard-in-helper (CHỐT 1 chỗ): helper tự đọc loadConfig().kafka.enabled tại
 * mỗi lần gọi — call-site KHÔNG nhận flag (routes không có config trong deps,
 * chữ ký register*Routes không đổi). loadConfig rẻ (env parse) — 1 lần/mutation
 * là nhiễu không đáng kể. 'stream.degraded' (consumer.ts) KHÔNG qua helper này
 * — kafka bật vẫn phải báo degraded cho FE.
 */
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config.js';
import { bffEvents } from '../kafka/events.js';
import { isRealtimeEvent, topicForEventType } from './realtime-events.js';

/** Log-once per type lạ — tránh spam warn mỗi mutation. */
const warnedUnknownTypes = new Set<string>();

export function emitLocalEvent(type: string, payload: unknown): void {
  if (loadConfig().kafka.enabled) return; // Kafka on → producers Java/Go lo publish.
  if (!isRealtimeEvent(type)) {
    if (!warnedUnknownTypes.has(type)) {
      warnedUnknownTypes.add(type);
      console.warn(`[realtime] emitLocalEvent: type '${type}' không trong allow-list — skip`);
    }
    return;
  }
  const topic = topicForEventType(type);
  if (topic === null) return; // không tới đây với type đã qua allow-list — phòng thủ
  bffEvents.emit('kafka:event', {
    topic,
    envelope: {
      eventId: randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      source: 'bff-local',
      payload,
    },
  });
}
