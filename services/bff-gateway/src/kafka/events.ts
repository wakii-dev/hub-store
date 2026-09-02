import { EventEmitter } from 'node:events';

/**
 * SF-27 — bridge Kafka → nội bộ. SF-10 (SSE) subscribe event 'kafka:event'
 * nhận { topic, envelope }. Giao diện sạch, KHÔNG đụng SSE ở đây.
 */
export const bffEvents = new EventEmitter();

export interface KafkaEventMessage {
  topic: string;
  envelope: unknown;
}
