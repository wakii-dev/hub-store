/**
 * SF-10 — GET /events SSE (Server-Sent Events). EventSource (FE) không set
 * được Authorization header → auth qua query `access_token` (guard auth.ts
 * chỉ mở nhánh này cho url /events). Stream: bypass serialization (reply.hijack
 * + raw write), filter qua allow-list isRealtimeEvent, heartbeat 15s, cleanup
 * listener + interval khi client ngắt kết nối hoặc raw stream lỗi (không leak,
 * không unhandled 'error' crash process).
 *
 * Nguồn event: `bffEvents.on('kafka:event')` — singleton import trực tiếp từ
 * kafka/events.js (wiring emit nằm ở server.ts, không phải app.ts — nên inject
 * test bơm thẳng vào singleton).
 */
import type { FastifyInstance } from 'fastify';
import { bffEvents, type KafkaEventMessage } from '../kafka/events.js';
import { isRealtimeEvent } from '../lib/realtime-events.js';

/** Heartbeat giữ connection sống qua proxy idle-timeout. */
export const SSE_HEARTBEAT_MS = 15_000;

interface RealtimeEnvelope {
  eventId?: unknown;
  type?: unknown;
  occurredAt?: unknown;
  source?: unknown;
  payload?: unknown;
}

export function registerEventsRoutes(
  app: FastifyInstance,
  opts: { heartbeatMs?: number } = {},
): void {
  const heartbeatMs = opts.heartbeatMs ?? SSE_HEARTBEAT_MS;

  app.get('/events', async (request, reply) => {
    // Bypass Fastify serialization/error handler — stream raw tới client.
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
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

    // Client ngắt (tab close, EventSource reconnect) → dọn sạch, không leak.
    const cleanup = (): void => {
      clearInterval(heartbeat);
      bffEvents.off('kafka:event', onKafkaEvent);
    };
    request.raw.on('close', cleanup);
    raw.on('close', cleanup);
    // Socket chết giữa stream (trước khi 'close' kịp chạy): write() vào
    // destroyed stream sẽ emit 'error' — không có listener → unhandled
    // 'error' crash process. cleanup idempotent nên gọi lại vẫn an toàn.
    raw.on('error', cleanup);
  });
}
