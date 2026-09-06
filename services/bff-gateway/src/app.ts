/**
 * BFF app factory (Task 5): Fastify + CORS whitelist + JWT guard + error
 * handlers (envelope một chỗ) + 26 REST routes. Factory nhận BffConfig để
 * test inject được (mock upstream addrs, deadline ngắn...).
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import type { FastifyError, FastifyInstance } from 'fastify';
import type { ErrorEnvelope } from '@hub-store/shared';
import type { BffConfig } from './config.js';
import { registerJwtGuard } from './plugins/auth.js';
import { registerApiDocs } from './plugins/api-docs.js';
import { errorEnvelope } from './lib/envelope.js';
import { getAuditPool } from './lib/audit.js';
import {
  createFulfillmentClient,
  createBatchingClient,
  createPrintClient,
  createDeliveryBatchClient,
  createTechClient,
  createIntakeClient,
  createStaffAreaClient,
  createTransferClient,
} from './clients/index.js';
import { registerFulfillmentRoutes } from './routes/fulfillment.js';
import { registerTechRoutes } from './routes/tech.js';
import { registerIntakeRoutes } from './routes/intake.js';
import { registerBatchRoutes } from './routes/batches.js';
import { registerPrintRoutes } from './routes/print.js';
import { registerPrinterRoutes } from './routes/printers.js';
import { registerDeliveryBatchRoutes } from './routes/deliverybatch.js';
import { registerServiceEmployeesRoutes } from './routes/serviceEmployees.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUsersRoutes } from './routes/users.js';
import { KcAdminClient } from './kc-admin.js';
import { registerD2cRoutes } from './routes/d2c.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { registerBatchingPresetRoutes } from './routes/batching-presets.js';
import { registerCodRoutes } from './routes/cod.js';
import { registerEventsRoutes } from './routes/events.js';
import { registerAvatarRoutes } from './routes/avatar.js';
import { registerMetaRoutes } from './routes/meta.js';
import { registerNotificationsRoutes } from './routes/notifications.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

export function buildApp(config: BffConfig): FastifyInstance {
  const app = Fastify({ logger: false });

  // CORS whitelist :3000-3002 (shell + orders + fulfillment remotes).
  void app.register(cors, { origin: config.corsOrigins });

  // multipart cho POST /orders/import/preview (SF-13) — request.file() stream.
  void app.register(multipart);

  // FI-326 SF-1 — Swagger UI /documentation (DEV-ONLY): tự no-op khi
  // BFF_ENABLE_API_DOCS unset (fail-safe prod — không mount, không route).
  void registerApiDocs(app);

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

  // SF-12 — readiness probe (không JWT — plugins/auth public skip-list).
  // Ping DB BFF sở hữu TRỰC TIẾP: fulfillment (pool audit — notifications dùng
  // chung cùng DB). BFF KHÔNG có cred DB batching → không key batching ở đây
  // (batches DB được Go /health :8082 ping riêng — plan step 4.1 choice).
  // Fail-open khi thiếu env DB (host-run/test không cấu hình) — như audit/notifications.
  app.get('/health', async (_request, reply) => {
    const pool = getAuditPool();
    if (!pool) {
      return { status: 'ok', db: { fulfillment: 'disabled' } };
    }
    try {
      await pool.query('SELECT 1');
      return { status: 'ok', db: { fulfillment: 'ok' } };
    } catch {
      void reply.code(503);
      return { status: 'degraded', db: { fulfillment: 'down' } };
    }
  });

  // gRPC clients — insecure nội bộ (spec §2); close dọn sạch khi shutdown.
  // StaffArea (SF-17) sống trong cùng process fulfillment-service → cùng addr.
  const fulfillment = createFulfillmentClient(config.grpc.fulfillment, config.grpc.deadlineMs);
  // TechService (SF-19) sống cùng fulfillment-service — chung addr.
  const tech = createTechClient(config.grpc.fulfillment, config.grpc.deadlineMs);
  const batching = createBatchingClient(config.grpc.batching, config.grpc.deadlineMs);
  const deliveryBatch = createDeliveryBatchClient(config.grpc.deliverybatch, config.grpc.deadlineMs);
  const print = createPrintClient(config.grpc.print, config.grpc.deadlineMs);
  const intake = createIntakeClient(config.grpc.intake, config.grpc.deadlineMs);
  const staffArea = createStaffAreaClient(config.grpc.fulfillment, config.grpc.deadlineMs);
  // TransferService (SF-28) sống cùng fulfillment-service — chung addr.
  const transfer = createTransferClient(config.grpc.fulfillment, config.grpc.deadlineMs);
  app.addHook('onClose', async () => {
    fulfillment.close();
    tech.close();
    batching.close();
    deliveryBatch.close();
    print.close();
    intake.close();
    staffArea.close();
    transfer.close();
  });

  registerFulfillmentRoutes(app, { fulfillment, batching });
  registerTechRoutes(app, { tech });
  // SF-13 intake routes — đăng ký SAU fulfillment (plan T6).
  registerIntakeRoutes(app, { intake, fulfillment, batching });
  registerBatchRoutes(app, batching);
  registerPrintRoutes(app, { batching, print, fulfillment });
  // SF-21 — printer CRUD (Admin) — dùng fulfillment client (DB-backed registry).
  registerPrinterRoutes(app, { fulfillment });
  registerDeliveryBatchRoutes(app, deliveryBatch);
  registerServiceEmployeesRoutes(app, { staffArea });
  // SF-18 — D2C orders (consumer trực tiếp) — dùng fulfillment client.
  registerD2cRoutes(app, { fulfillment });
  // SF-28 — transfer tickets (tạo + lịch sử) — TransferService cùng fulfillment.
  registerTransferRoutes(app, { transfer });
  // SF-28 — criteria presets (static BFF-side, không gọi batching service).
  registerBatchingPresetRoutes(app);
  // SF-14 — COD confirm + settlement đối soát — dùng fulfillment client.
  registerCodRoutes(app, { fulfillment });
  // SF-10 — SSE /events realtime (không cần gRPC client; nguồn là bffEvents).
  // corsOrigins: hijack discard headers của @fastify/cors → route tự tính CORS.
  registerEventsRoutes(app, { corsOrigins: config.corsOrigins });
  // SF-21 — avatar upload/serve (DB fulfillment qua pg Pool, precedent audit).
  registerAvatarRoutes(app);
  // SF-21 — GET /version metadata (public, không JWT — plugins/auth exempt).
  registerMetaRoutes(app);
  // SF-23 — notifications feed cho FE polling (không cần gRPC client; nguồn
  // là notification_log DB trực tiếp — pattern audit pool).
  registerNotificationsRoutes(app);
  // SF-26 — webhook nhận đơn từ sàn (public, auth HMAC trong route; scoped
  // raw-body parser tự encapsulate trong app.register scope con).
  registerWebhookRoutes(app, { intake, config });
  // SF-8 — users management (Manager-only) qua KC Admin REST.
  const kcAdmin = new KcAdminClient(config.oidc);
  registerUsersRoutes(app, { kcAdmin });
  // DEV-ONLY — fail-safe: chỉ mount khi ENABLE_DEV_RESET_PASSWORD=1 tường minh
  // (prod/K8s không set flag → endpoint không tồn tại thay vì dựa vào doc).
  if (config.devResetPassword) {
    registerAuthRoutes(app, { oidc: config.oidc });
  }

  return app;
}
