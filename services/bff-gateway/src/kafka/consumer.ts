import { randomUUID } from 'node:crypto';
import { Kafka, logLevel, type Consumer } from 'kafkajs';
import { type KafkaEventMessage } from './events.js';

const TOPICS = ['order-events', 'batch-events'];

/**
 * SF-27 — parse giá trị message thành envelope (tách khỏi kafkajs để test
 * thuần). Malformed → null (skip, log warn — side-channel không được crash).
 */
export function parseMessage(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    console.warn('[kafka] skip malformed message');
    return null;
  }
}

/**
 * SF-10 — degraded signal: sau khi đã connect+run thành công, consumer lỗi/
 * ngắt giữa chừng (broker chết, crash loop) → bơm ĐÚNG 1 LẦN synthetic event
 * 'stream.degraded' (topic '_system') qua cùng bridge onEvent (server.ts emit
 * 'kafka:event' → SSE forward). FE coi là failure → chuyển polling. Best-effort
 * — không crash BFF. Tách helper export để test không cần broker thật; lần
 * connect ĐẦU thất bại KHÔNG đi qua đây (isConnected còn false — behavior cũ
 * giữ nguyên).
 */
export function attachDegradedHandlers(
  consumer: Pick<Consumer, 'on'>,
  onEvent: (m: KafkaEventMessage) => void,
  isConnected: () => boolean,
): void {
  let degradedSent = false;
  const degrade = (reason: string): void => {
    if (degradedSent || !isConnected()) return;
    degradedSent = true;
    onEvent({
      topic: '_system',
      envelope: {
        eventId: randomUUID(),
        type: 'stream.degraded',
        occurredAt: new Date().toISOString(),
        source: 'bff-local',
        payload: { reason },
      },
    });
  };
  consumer.on('consumer.disconnect', () => degrade('consumer.disconnect'));
  consumer.on('consumer.crash', (event) => {
    const err = (event as { payload?: { error?: Error } }).payload?.error;
    degrade(`consumer.crash: ${err?.message ?? 'unknown'}`);
  });
}

/**
 * SF-27 — consumer group 'bff-realtime'. Mọi lỗi kafka chỉ log — BFF vẫn chạy
 * (side-channel). Connect fail → trả về im (BFF restart để reconnect; kafka
 * thường sống lâu hơn BFF). Trả về stop function (graceful shutdown).
 */
export async function startKafkaConsumer(
  bootstrapServers: string,
  onEvent: (m: KafkaEventMessage) => void,
): Promise<() => Promise<void>> {
  const kafka = new Kafka({
    clientId: 'bff-realtime',
    brokers: bootstrapServers.split(',').map((s) => s.trim()),
    logLevel: logLevel.WARN,
  });
  const consumer = kafka.consumer({ groupId: 'bff-realtime' });
  let connected = false;
  try {
    await consumer.connect();
    for (const topic of TOPICS) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const envelope = parseMessage(message.value?.toString() ?? '');
        if (envelope !== null) onEvent({ topic, envelope });
      },
    });
    connected = true;
    // SF-10 — lỗi/ngắt SAU khi đã chạy → degraded signal cho FE (phía trên).
    attachDegradedHandlers(consumer, onEvent, () => connected);
    console.log(`[kafka] consumer 'bff-realtime' subscribed: ${TOPICS.join(', ')}`);
  } catch (err) {
    console.warn('[kafka] consumer unavailable (side-channel, BFF vẫn chạy):', (err as Error).message);
  }
  return () => consumer.disconnect();
}
