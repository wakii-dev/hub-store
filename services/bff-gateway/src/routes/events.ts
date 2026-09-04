/**
 * SF-10 — GET /events SSE (Server-Sent Events). EventSource (FE) không set
 * được Authorization header → auth qua query `access_token` (guard auth.ts
 * chỉ mở nhánh này cho url /events). Stream: bypass serialization (reply.hijack
 * + raw write), filter qua allow-list isRealtimeEvent, heartbeat 15s, cleanup
 * listener + interval khi client ngắt kết nối hoặc raw stream lỗi (không leak,
 * không unhandled 'error' crash process).
 *
 * CORS (review e2e): reply.hijack() + raw.writeHead() DISCARD headers mà
 * @fastify/cors đã set trên reply → browser origin :3000 block stream (curl/
 * unit không thấy). Fix: tính tay CORS headers cho route này — echo origin
 * CHỈ khi nằm trong whitelist (semantic khớp @fastify/cors origin: string[]),
 * kèm allow-credentials + vary (preflight N/A — GET EventSource, không preflight).
 *
 * Nguồn event: `bffEvents.on('kafka:event')` — singleton import trực tiếp từ
 * kafka/events.js (wiring emit nằm ở server.ts, không phải app.ts — nên inject
 * test bơm thẳng vào singleton).
 */
import type { FastifyInstance } from 'fastify';
import { bffEvents, type KafkaEventMessage } from '../kafka/events.js';
import { isRealtimeEvent } from '../lib/realtime-events.js';
import { errorEnvelope } from '../lib/envelope.js';

/** Heartbeat giữ connection sống qua proxy idle-timeout. */
export const SSE_HEARTBEAT_MS = 15_000;

/**
 * Max lifetime mỗi SSE connection (review P1 security audit) — hết hạn BFF
 * chủ động đóng (comment frame cuối + end) → FE EventSource tự reconnect với
 * token mới, tránh connection + JWT sống vô hạn.
 */
export const SSE_MAX_LIFETIME_MS = 30 * 60_000; // 30 phút

/** Cap connection /events đồng thời theo user (review P1 security audit). */
export const MAX_SSE_CONNECTIONS_PER_USER = 5;

// Mỗi SSE connection = 1 listener trên bffEvents; default max 10 → nhiều user
// cùng lúc nổ MaxListenersExceededWarning. Ceiling 100 khớp scale dev (5/user).
bffEvents.setMaxListeners(100);

/** Per-user connection count — module-level, sống qua các lần register. */
const sseConnections = new Map<string, number>();

interface RealtimeEnvelope {
  eventId?: unknown;
  type?: unknown;
  occurredAt?: unknown;
  source?: unknown;
  payload?: unknown;
}

export function registerEventsRoutes(
  app: FastifyInstance,
  opts: { heartbeatMs?: number; maxLifetimeMs?: number; corsOrigins?: string[] } = {},
): void {
  const heartbeatMs = opts.heartbeatMs ?? SSE_HEARTBEAT_MS;
  const maxLifetimeMs = opts.maxLifetimeMs ?? SSE_MAX_LIFETIME_MS;
  const corsOrigins = opts.corsOrigins;

  app.get('/events', async (request, reply) => {
    const sub = request.user?.sub ?? 'anonymous';

    // Cap connection/user — reject TRƯỚC hijack (hijack bypass error handler
    // + serialization nên JSON envelope phải gửi ở đây).
    const open = sseConnections.get(sub) ?? 0;
    if (open >= MAX_SSE_CONNECTIONS_PER_USER) {
      void reply
        .code(429)
        .send(
          errorEnvelope(429, 'Too many concurrent /events connections.', {
            code: 'TOO_MANY_CONNECTIONS',
          }),
        );
      return;
    }
    sseConnections.set(sub, open + 1);
    let released = false;
    const releaseConnection = (): void => {
      if (released) return;
      released = true;
      sseConnections.set(sub, Math.max(0, (sseConnections.get(sub) ?? 1) - 1));
    };

    // CORS cho hijacked stream — xem comment module header. Không whitelist
    // cấu hình hoặc origin không allow-list → KHÔNG echo (khớp @fastify/cors).
    const origin = request.headers.origin;
    const corsHeaders: Record<string, string> = {};
    if (corsOrigins && origin && corsOrigins.includes(origin)) {
      corsHeaders['access-control-allow-origin'] = origin;
      corsHeaders['access-control-allow-credentials'] = 'true';
      corsHeaders['vary'] = 'Origin';
    }

    // Bypass Fastify serialization/error handler — stream raw tới client.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      ...corsHeaders,
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const onKafkaEvent = (msg: KafkaEventMessage): void => {
      const envelope = msg.envelope as RealtimeEnvelope | null;
      const type = typeof envelope?.type === 'string' ? envelope.type : undefined;
      // filter allow-list + 'stream.degraded' (synthetic T2 — cố ý ngoài
      // allow-list, FE xử lý riêng để chuyển polling).
      if (!type || (!isRealtimeEvent(type) && type !== 'stream.degraded')) return;
      const frame = {
        type,
        payload: envelope?.payload ?? null,
        ts: typeof envelope?.occurredAt === 'string' ? envelope.occurredAt : '',
      };
      raw.write(`data: ${JSON.stringify(frame)}\n\n`);
    };

    bffEvents.on('kafka:event', onKafkaEvent);
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), heartbeatMs);

    // Max lifetime (P1 audit) — comment frame cuối rồi đóng; FE tự reconnect
    // với token mới. Cleanup chạy ngay (raw 'close' sẽ no-op nhờ idempotent).
    const lifetime = setTimeout(() => {
      raw.write(': stream lifetime reached\n\n');
      raw.end();
      cleanup();
    }, maxLifetimeMs);

    // Client ngắt (tab close, EventSource reconnect) → dọn sạch, không leak.
    const cleanup = (): void => {
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      bffEvents.off('kafka:event', onKafkaEvent);
      releaseConnection();
    };
    request.raw.on('close', cleanup);
    raw.on('close', cleanup);
    // Socket chết giữa stream (trước khi 'close' kịp chạy): write() vào
    // destroyed stream sẽ emit 'error' — không có listener → unhandled
    // 'error' crash process. cleanup idempotent nên gọi lại vẫn an toàn.
    raw.on('error', cleanup);
  });
}
