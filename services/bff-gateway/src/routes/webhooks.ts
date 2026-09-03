/**
 * Webhook routes (SF-26 — nhận đơn từ sàn TMĐT):
 *   POST /webhooks/orders — public (auth = HMAC X-Signature, KHÔNG JWT).
 *
 * Raw-body parser BẮT BUỘC bọc trong encapsulated `app.register` scope:
 * addContentTypeParser trên root app sẽ ghi đè JSON parser TOÀN BỘ BFF,
 * vỡ import CSV SF-13 >1MB. Parser scoped này chỉ shadow các route trong
 * scope con — giữ raw bytes cho HMAC đúng bytes.
 *
 * Task 4: mapping + RPC CreateWebhookOrder wired — HMAC (verifyHmac fail-closed)
 * → X-Source check → mapWebhookPayload (lỗi → 422 details[]) → intake RPC
 * (role MANAGER, actor 'webhook:<source>') → 200 { fulfillCode, replayed };
 * lỗi upstream qua mapGrpcError (INVALID_ARGUMENT→422, UNAVAILABLE→503).
 */
import type { FastifyInstance } from 'fastify';
import type { IntakeApi } from '../clients/index.js';
import type { BffConfig } from '../config.js';
import { SERVICE_NAMES } from '../config.js';
import { verifyHmac } from '../lib/hmac.js';
import { errorEnvelope } from '../lib/envelope.js';
import { sendGrpcError } from '../lib/grpc-error.js';
import {
  WebhookMappingValidationError,
  mapWebhookPayload,
  resolveFieldMap,
} from '../lib/webhook-mapping.js';

/**
 * Fail-closed warn-once flag (spec §3): secret rỗng → log warn MỘT LẦN duy
 * nhất mỗi process — tránh spam log mỗi request nhưng ops vẫn thấy cấu hình
 * thiếu. KHÔNG log giá trị secret/signature.
 */
let secretWarned = false;

export function registerWebhookRoutes(
  app: FastifyInstance,
  deps: { intake: IntakeApi; config: BffConfig },
): void {
  app.register(async (scope) => {
    // Raw body cho HMAC đúng bytes — parser NÀY chỉ tồn tại trong scope con,
    // shadow default parser của root app cho đúng route trong scope này.
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer', bodyLimit: 1024 * 1024 },
      (req, body: Buffer, done) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = body; // giữ raw bytes cho HMAC
        // Body rỗng → body undefined (KHÔNG JSON.parse('') → 400): route handler
        // tự fail-closed 401 qua guard rawBody rỗng (HMAC trên rỗng vô nghĩa).
        if (body.length === 0) {
          done(null, undefined);
          return;
        }
        try {
          done(null, JSON.parse(body.toString('utf8')));
        } catch (e) {
          done(e as Error);
        }
      },
    );
    // Parse-error (JSON malformed) → 400 errorEnvelope (không phải default Fastify shape)
    scope.setErrorHandler((err: unknown, request, reply) => {
      const statusCode = (err as { statusCode?: number } | null)?.statusCode;
      if (statusCode === 400 || err instanceof SyntaxError) {
        return reply.code(400).send(errorEnvelope(400, 'Malformed JSON body'));
      }
      throw err; // nhả cho root handler
    });

    scope.post('/webhooks/orders', async (request, reply) => {
      const source = String(request.headers['x-source'] ?? '').trim();
      const secret = deps.config.webhookHmacSecret;
      const raw = (request as unknown as { rawBody?: Buffer }).rawBody as Buffer;
      // Body rỗng/thiếu (Fastify bỏ parser khi content-length 0) → 401, không
      // để HMAC chạy trên rỗng rồi nổ TypeError → 500.
      if (!raw || raw.length === 0) {
        return reply
          .code(401)
          .send(errorEnvelope(401, 'invalid signature', { code: 'UNAUTHORIZED' }));
      }
      const sig = request.headers['x-signature'];
      // HMAC — timing-safe fail-closed; KHÔNG log signature/secret.
      const auth = verifyHmac(raw, sig, secret);
      if (!auth.ok) {
        if (auth.status === 503 && !secretWarned) {
          secretWarned = true;
          console.warn(
            '[sf26] WEBHOOK_HMAC_SECRET rỗng/thiếu — webhook auth unavailable, fail-closed 503.',
          );
        }
        return reply.code(auth.status).send(
          errorEnvelope(auth.status, auth.message, {
            // 401 = chữ ký sai/thiếu; 503 fail-closed = lỗi cấu hình phía mình —
            // dùng code riêng để caller không nhầm là auth reject.
            code: auth.status === 503 ? 'SERVICE_UNAVAILABLE' : 'UNAUTHORIZED',
          }),
        );
      }
      // X-Source bắt buộc (spec §3) — sàn KHÔNG tự đặt tên mình trong payload.
      if (!source) {
        return reply.code(422).send(
          errorEnvelope(422, 'Dữ liệu đơn không hợp lệ', {
            code: 'VALIDATION_ERROR',
            details: [{ field: 'X-Source', message: 'Header X-Source là bắt buộc.' }],
          }),
        );
      }
      // X-Source ASCII-safe — gRPC metadata (webhook:<source> actor header) chỉ
      // chấp nhận byte ASCII; source non-ASCII/space hiện tại nổ 500 ở RPC.
      // Charset chặt cũng ép caller giữ nhất quán casing (lowercase convention).
      if (!/^[A-Za-z0-9._-]+$/.test(source)) {
        return reply.code(422).send(
          errorEnvelope(422, 'Dữ liệu đơn không hợp lệ', {
            code: 'VALIDATION_ERROR',
            details: [
              { field: 'X-Source', message: 'Chỉ cho phép A-Z a-z 0-9 . _ -' },
            ],
          }),
        );
      }
      // Mapping — thu gom MỌI lỗi field vào details[] (không fail-fast).
      try {
        const { externalId, order } = mapWebhookPayload(
          request.body,
          resolveFieldMap(deps.config.webhookMapping),
        );
        const r = await deps.intake.createWebhookOrder(
          { source, externalId, order },
          'MANAGER',
          'webhook:' + source,
        );
        return reply.code(200).send({ fulfillCode: r.fulfillCode, replayed: r.replayed });
      } catch (err) {
        if (err instanceof WebhookMappingValidationError) {
          return reply.code(422).send(
            errorEnvelope(422, 'Dữ liệu đơn không hợp lệ', {
              code: 'VALIDATION_ERROR',
              // ErrorDetail (shared, FROZEN) = {field, message} — plan ghi thêm
              // `row` nhưng contract không có; webhook 1 row nên bỏ row.
              details: err.errors.map((e) => ({ field: e.field, message: e.message })),
            }),
          );
        }
        sendGrpcError(reply, err, SERVICE_NAMES.intake);
        return reply;
      }
    });
  });
}
