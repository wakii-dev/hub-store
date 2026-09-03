/**
 * Entry standalone: `pnpm start` / `pnpm dev` trong services/bff-gateway.
 * Listen :8080 (PORT_BFF, root .env). KHÔNG cần service nào khác chạy để boot
 * (gRPC clients lazy-connect) — README có curl /healthz mẫu.
 */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { bffEvents } from './kafka/events.js';
import { startKafkaConsumer } from './kafka/consumer.js';
import { startPushTriggers } from './lib/push-triggers.js';

const config = loadConfig();
const app = buildApp(config);

// SF-27 — Kafka side-channel consumer (KAFKA_ENABLED=true mới chạy; lỗi kafka
// chỉ log, không crash BFF).
let kafkaConsumerStop: (() => Promise<void>) | null = null;
if (config.kafka.enabled) {
  void startKafkaConsumer(config.kafka.bootstrapServers, (m) =>
    bffEvents.emit('kafka:event', m),
  ).then((stop) => {
    kafkaConsumerStop = stop;
  });
}

// SF-23 T5 — push triggers: kafka:event "quan trọng" → notification_log + Web
// Push best-effort (subscribe vô hại khi kafka disabled — không event, không push).
const stopPushTriggers = startPushTriggers(config);

app.listen({ port: config.port, host: '0.0.0.0' }).then(
  (address) => {
    app.log.info(`bff-gateway listening on ${address}`);
  },
  (err) => {
    app.log.error(err);
    process.exit(1);
  },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => kafkaConsumerStop?.())
      .then(() => stopPushTriggers())
      .then(() => process.exit(0));
  });
}
