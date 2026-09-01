/**
 * Entry standalone: `pnpm start` / `pnpm dev` trong services/bff-gateway.
 * Listen :8080 (PORT_BFF, root .env). KHÔNG cần service nào khác chạy để boot
 * (gRPC clients lazy-connect) — README có curl /healthz mẫu.
 */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp(config);

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
    void app.close().then(() => process.exit(0));
  });
}
