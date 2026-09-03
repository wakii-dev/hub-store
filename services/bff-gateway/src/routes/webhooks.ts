/**
 * Webhook routes (SF-26 — nhận đơn từ sàn TMĐT):
 *   POST /webhooks/orders — public (auth = HMAC X-Signature, KHÔNG JWT).
 *
 * Raw-body parser BẮT BUỘC bọc trong encapsulated `app.register` scope:
 * addContentTypeParser trên root app sẽ ghi đè JSON parser TOÀN BỘ BFF,
 * vỡ import CSV SF-13 >1MB. Parser scoped này chỉ shadow các route trong
 * scope con — giữ raw bytes cho HMAC đúng bytes.
 *
 * Task 1 skeleton: HMAC verify wired (verifyHmac fail-closed); mapping +
 * RPC CreateWebhookOrder do Task 2/4 wire — hiện trả 503 sau auth.
 */
import type { FastifyInstance } from 'fastify';
import type { IntakeApi } from '../clients/index.js';
import type { BffConfig } from '../config.js';
import { verifyHmac } from '../lib/hmac.js';
import { errorEnvelope } from '../lib/envelope.js';

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
        return reply
          .code(auth.status)
          .send(errorEnvelope(auth.status, auth.message, { code: 'UNAUTHORIZED' }));
      }
      // mapping + RPC — Task 4 wire đầy đủ; skeleton 503.
      return reply.code(503).send(errorEnvelope(503, 'not implemented yet'));
    });
  });
}
