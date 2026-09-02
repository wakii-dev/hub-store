import { Kafka, logLevel } from 'kafkajs';
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
    console.log(`[kafka] consumer 'bff-realtime' subscribed: ${TOPICS.join(', ')}`);
  } catch (err) {
    console.warn('[kafka] consumer unavailable (side-channel, BFF vẫn chạy):', (err as Error).message);
  }
  return () => consumer.disconnect();
}
