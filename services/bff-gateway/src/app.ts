/**
 * BFF app factory (Task 5): Fastify + CORS whitelist + JWT guard + error
 * handlers (envelope một chỗ) + 20 REST routes. Factory nhận BffConfig để
 * test inject được (mock upstream addrs, deadline ngắn...).
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { FastifyError, FastifyInstance } from 'fastify';
import type { ErrorEnvelope } from '@hub-store/shared';
import type { BffConfig } from './config.js';
import { registerJwtGuard } from './plugins/auth.js';
import { errorEnvelope } from './lib/envelope.js';
import {
  createFulfillmentClient,
  createBatchingClient,
  createPrintClient,
} from './clients/index.js';
import { registerFulfillmentRoutes } from './routes/fulfillment.js';
import { registerBatchRoutes } from './routes/batches.js';
import { registerPrintRoutes } from './routes/print.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerD2cRoutes } from './routes/d2c.js';

export function buildApp(config: BffConfig): FastifyInstance {
  const app = Fastify({ logger: false });

  // CORS whitelist :3000-3002 (shell + orders + fulfillment remotes).
  void app.register(cors, { origin: config.corsOrigins });

  // OIDC guard (SF-4) — mọi route trừ /healthz + /auth/reset-password (public).
  registerJwtGuard(app, { oidc: config.oidc });

  // Error envelope một chỗ cho error KHÔNG do gRPC (JSON parse, handler throw).
  app.setErrorHandler((err: FastifyError, request, reply) => {
    // Route gRPC đã tự map + send trước khi về đây (reply.sent).
    if (reply.sent) return;
    const statusCode = err.statusCode ?? 500;
    const body: ErrorEnvelope = errorEnvelope(
      statusCode,
      statusCode === 400 && /json/i.test(err.message) ? 'Malformed JSON body.' : err.message,
      { code: statusCode < 500 ? 'BAD_REQUEST' : 'INTERNAL' },
    );
    void reply.code(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send(
      errorEnvelope(404, `Route ${request.method} ${request.url} not found.`, {
        code: 'NOT_FOUND',
      }),
    );
  });

  // Public — liveness probe (không JWT).
  app.get('/healthz', async () => ({ status: 'ok' }));

  // gRPC clients — insecure nội bộ (spec §2); close dọn sạch khi shutdown.
  const fulfillment = createFulfillmentClient(config.grpc.fulfillment, config.grpc.deadlineMs);
  const batching = createBatchingClient(config.grpc.batching, config.grpc.deadlineMs);
  const print = createPrintClient(config.grpc.print, config.grpc.deadlineMs);
  app.addHook('onClose', async () => {
    fulfillment.close();
    batching.close();
    print.close();
  });

  registerFulfillmentRoutes(app, { fulfillment, batching });
  registerBatchRoutes(app, batching);
  registerPrintRoutes(app, { batching, print });
  registerD2cRoutes(app, { fulfillment });
  // DEV-ONLY — fail-safe: chỉ mount khi ENABLE_DEV_RESET_PASSWORD=1 tường minh
  // (prod/K8s không set flag → endpoint không tồn tại thay vì dựa vào doc).
  if (config.devResetPassword) {
    registerAuthRoutes(app, { oidc: config.oidc });
  }

  return app;
}
