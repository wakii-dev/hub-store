/**
 * SF-10 — route GET /events SSE: guard nhận access_token từ query (CHỈ
 * /events — route khác vẫn bắt buộc Bearer), SSE headers, first-data flow
 * qua bffEvents singleton (fake emit), filter allow-list, cleanup listener.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import { buildApp } from '../src/app.js';
import type { BffConfig } from '../src/config.js';
import {
  registerEventsRoutes,
  SSE_HEARTBEAT_MS,
  SSE_MAX_LIFETIME_MS,
  MAX_SSE_CONNECTIONS_PER_USER,
} from '../src/routes/events.js';
import { bffEvents } from '../src/kafka/events.js';
import { TEST_ISSUER, TEST_AUDIENCE, startTestIdentity, type TestIdentity } from './harness.js';

let kc: Server;
let kcPort: number;
let identity: TestIdentity;

async function startMockKeycloak(): Promise<void> {
  kc = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => kc.listen(0, '127.0.0.1', resolve));
  const address = kc.address();
  if (address === null || typeof address === 'string') throw new Error('kc mock bind failed');
  kcPort = address.port;
}

function buildTestApp(): FastifyInstance {
  const config: BffConfig = {
    port: 0,
    onesignal: { appId: '', restApiKey: '' },
    oidc: {
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
      jwksUrl: identity.jwksUrl,
      adminBaseUrl: `http://127.0.0.1:${kcPort}/realms/hubstore`,
      adminTokenUrl: `http://127.0.0.1:${kcPort}/realms/master/protocol/openid-connect/token`,
      adminUsername: 'admin',
      adminPassword: 'admin-secret',
      kcAdminTokenUrl: `http://127.0.0.1:${kcPort}/realms/hubstore/protocol/openid-connect/token`,
      kcAdminClientId: 'hubstore-admin',
      kcAdminClientSecret: 'test-secret',
    },
    corsOrigins: ['http://localhost:3000'],
    grpc: {
      fulfillment: '127.0.0.1:1',
      batching: '127.0.0.1:1',
      deliverybatch: '127.0.0.1:1',
      print: '127.0.0.1:1',
      intake: '127.0.0.1:1',
      deadlineMs: 2000,
    },
    devResetPassword: false,
    kafka: { enabled: false, bootstrapServers: 'localhost:9092' },
    webhookHmacSecret: '', // SF-26 — test auth/events không chạm webhook
    webhookMapping: '',
  };
  return buildApp(config);
}

let app: FastifyInstance;

/** Capture request/reply của connection /events đang mở — test end stream. */
let captured: { request: FastifyRequest; reply: FastifyReply } | null = null;

beforeAll(async () => {
  await startMockKeycloak();
});

afterAll(async () => {
  await new Promise<void>((res) => kc.close(() => res()));
});

beforeEach(async () => {
  identity = await startTestIdentity();
  app = buildTestApp();
  app.addHook('onRequest', (request, reply, done) => {
    if (request.url === '/events' || request.url.startsWith('/events?')) {
      captured = { request, reply };
    }
    done();
  });
  captured = null;
});

afterEach(async () => {
  await app.close();
  await identity.close();
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Chờ connection /events mở xong (guard verify JWKS bất đồng bộ). */
async function waitForCapture(): Promise<{ request: FastifyRequest; reply: FastifyReply }> {
  for (let i = 0; i < 100; i++) {
    if (captured !== null) return captured;
    await sleep(10);
  }
  throw new Error('SSE connection chưa mở sau 1s');
}

function emitKafkaEvent(type: string, payload: unknown, occurredAt = '2026-09-03T00:00:00Z'): void {
  bffEvents.emit('kafka:event', {
    topic: type.startsWith('order.') ? 'order-events' : 'batch-events',
    envelope: { eventId: 'e-1', type, occurredAt, source: 'kafka', payload },
  });
}

describe('GET /events — auth qua query access_token', () => {
  it('401 khi KHÔNG có token (header lẫn query)', async () => {
    const res = await app.inject({ method: 'GET', url: '/events' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });

  it('401 khi token query sai/không verify được', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/events?access_token=not-a-jwt',
    });
    expect(res.statusCode).toBe(401);
  });

  it('route KHÁC không nhận token query — vẫn bắt buộc Bearer (không hồi quy)', async () => {
    const token = await identity.signToken('Manager');
    const res = await app.inject({
      method: 'GET',
      url: `/master-data/regions?access_token=${encodeURIComponent(token)}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('200 + SSE headers khi token query hợp lệ', async () => {
    const token = await identity.signToken('Coordinator');
    const resP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(token)}`,
    });
    const conn = await waitForCapture();
    conn.reply.raw.end();
    const res = await resP;
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-accel-buffering']).toBe('no');
  });
});

describe('GET /events — SSE stream data', () => {
  it('forward event đúng allow-list, filter type lạ, frame đúng shape', async () => {
    const token = await identity.signToken('Manager');
    const resP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(token)}`,
    });
    const conn = await waitForCapture();
    emitKafkaEvent('order.assigned', { orderCode: 'DH-1' });
    emitKafkaEvent('order.unknown', { orderCode: 'DH-2' }); // phải bị filter
    await sleep(20); // nhường event loop ghi raw
    conn.reply.raw.end();
    const res = await resP;
    const body = res.payload;
    expect(body).toContain(
      `data: ${JSON.stringify({
        type: 'order.assigned',
        payload: { orderCode: 'DH-1' },
        ts: '2026-09-03T00:00:00Z',
      })}\n\n`,
    );
    expect(body).not.toContain('order.unknown');
    expect(body).not.toContain('DH-2');
  });

  it('forward stream.degraded (synthetic T2 — cố ý ngoài allow-list)', async () => {
    const token = await identity.signToken('Manager');
    const resP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(token)}`,
    });
    const conn = await waitForCapture();
    emitKafkaEvent('stream.degraded', { reason: 'consumer.disconnect' });
    await sleep(20);
    conn.reply.raw.end();
    const res = await resP;
    expect(res.payload).toContain('stream.degraded');
    expect(res.payload).toContain('consumer.disconnect');
  });

  it('cleanup: sau khi client ngắt, listener bffEvents được gỡ (không leak)', async () => {
    const token = await identity.signToken('Manager');
    const before = bffEvents.listenerCount('kafka:event');
    const resP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(token)}`,
    });
    const conn = await waitForCapture();
    expect(bffEvents.listenerCount('kafka:event')).toBe(before + 1);
    conn.reply.raw.end();
    await resP;
    expect(bffEvents.listenerCount('kafka:event')).toBe(before);
    // Emit sau cleanup không crash + không ghi vào stream đã đóng.
    expect(() => emitKafkaEvent('order.completed', {})).not.toThrow();
  });

  it("cleanup: raw 'error' (socket chết giữa stream) → không unhandled error crash, dọn sạch", async () => {
    const token = await identity.signToken('Manager');
    const before = bffEvents.listenerCount('kafka:event');
    const resP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(token)}`,
    });
    const conn = await waitForCapture();
    // Không có listener 'error' → emit('error') ném (unhandled) và crash
    // process; có handler (review P1) → cleanup chạy, không throw.
    expect(() => conn.reply.raw.emit('error', new Error('socket died'))).not.toThrow();
    expect(bffEvents.listenerCount('kafka:event')).toBe(before);
    // Kafka event emit sau đó cũng an toàn (listener đã gỡ).
    expect(() => emitKafkaEvent('order.completed', {})).not.toThrow();
    // cleanup idempotent — 'error' lặp lại vẫn không ném.
    expect(() => conn.reply.raw.emit('error', new Error('again'))).not.toThrow();
    await resP.catch(() => undefined);
  });
});

describe('heartbeat', () => {
  it(`: ping mỗi ${SSE_HEARTBEAT_MS}ms (fake timers, app tối giản)`, async () => {
    vi.useFakeTimers();
    try {
      const minimal = Fastify({ logger: false });
      minimal.addHook('onRequest', (_req, reply, done) => {
        captured = { request: _req, reply };
        done();
      });
      registerEventsRoutes(minimal, { heartbeatMs: SSE_HEARTBEAT_MS });
      const resP = minimal.inject({ method: 'GET', url: '/events' });
      await vi.advanceTimersByTimeAsync(SSE_HEARTBEAT_MS * 2 + 1);
      const conn = await waitForCapture();
      conn.reply.raw.end();
      const res = await resP;
      expect(res.payload).toContain(': ping\n\n');
      await minimal.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('CORS trên hijacked SSE (review e2e Spec A)', () => {
  it('origin trong whitelist → echo origin + allow-credentials + vary', async () => {
    const token = await identity.signToken('Manager');
    const resP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(token)}`,
      headers: { origin: 'http://localhost:3000' },
    });
    const conn = await waitForCapture();
    conn.reply.raw.end();
    const res = await resP;
    expect(res.statusCode).toBe(200);
    // Hijack discard headers của @fastify/cors → route tự ghi raw.
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['vary']).toContain('Origin');
  });

  it('origin NGOÀI whitelist → không echo (không mở CORS tùy tiện)', async () => {
    const token = await identity.signToken('Manager');
    const resP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(token)}`,
      headers: { origin: 'http://evil.example' },
    });
    const conn = await waitForCapture();
    conn.reply.raw.end();
    const res = await resP;
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('per-user connection cap (review P1 audit)', () => {
  /** App tối giản KHÔNG guard — sub rơi về 'anonymous' (fallback) cho test cap. */
  function buildMinimal(): FastifyInstance {
    const minimal = Fastify({ logger: false });
    const conns: FastifyReply[] = [];
    minimal.addHook('onRequest', (_req, reply, done) => {
      conns.push(reply);
      done();
    });
    registerEventsRoutes(minimal);
    // expose để test end từng connection.
    (minimal as unknown as { conns: FastifyReply[] }).conns = conns;
    return minimal;
  }

  it(`${MAX_SSE_CONNECTIONS_PER_USER} connection đầu OK, connection thứ ${
    MAX_SSE_CONNECTIONS_PER_USER + 1
  } → 429; đóng bớt thì mở lại được`, async () => {
    const minimal = buildMinimal();
    try {
      const resPs = Array.from({ length: MAX_SSE_CONNECTIONS_PER_USER }, () =>
        minimal.inject({ method: 'GET', url: '/events' }),
      );
      await sleep(50);
      const conns = (minimal as unknown as { conns: FastifyReply[] }).conns;
      expect(conns.length).toBe(MAX_SSE_CONNECTIONS_PER_USER);

      // Vượt cap → 429 JSON envelope (reject TRƯỚC hijack).
      const rejected = await minimal.inject({ method: 'GET', url: '/events' });
      expect(rejected.statusCode).toBe(429);
      expect(rejected.json().code).toBe('TOO_MANY_CONNECTIONS');

      // Đóng hết → counter giảm o (idempotent cleanup) → mở lại OK.
      for (const reply of conns) reply.raw.end();
      await Promise.all(resPs.map((p) => p.catch(() => undefined)));
      expect(bffEvents.listenerCount('kafka:event')).toBe(0);

      const retry = minimal.inject({ method: 'GET', url: '/events' });
      await sleep(20);
      const retryConns = (minimal as unknown as { conns: FastifyReply[] }).conns;
      retryConns[retryConns.length - 1]!.raw.end();
      const res = await retry;
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream');
    } finally {
      await minimal.close();
    }
  });

  // Guarded app (token thật qua JWKS) — các test trên dùng minimal app KHÔNG
  // guard nên mọi connection rơi vào bucket 'anonymous' (global). Test này chứng
  // minh cap key theo `.sub` từng user: nếu hồi quy key theo `.role` (hoặc bỏ
  // sub) thì u2 sẽ 429 cùng u1 → test fail.
  it('cap là PER-USER: u1 đủ 5 connection → 429, sub u2 KHÁC vẫn 200 (guarded app)', async () => {
    // Hook riêng ghi (sub, reply) từng request /events — hook `captured` trong
    // beforeEach chỉ giữ connection CUỐI, không đủ cho nhiều connection song song.
    const conns: Array<{ sub: string; reply: FastifyReply }> = [];
    app.addHook('onRequest', (request, reply, done) => {
      if (request.url === '/events' || request.url.startsWith('/events?')) {
        conns.push({ sub: request.user?.sub ?? 'anonymous', reply });
      }
      done();
    });
    /** Mỗi connection SSE THẬT = 1 listener bffEvents — đếm thay poll conns. */
    const openListeners = (): number => bffEvents.listenerCount('kafka:event');
    /** Chỉ connection đã hijack thành SSE (request bị 429 cũng lọt qua hook). */
    const isSse = (c: { reply: FastifyReply }): boolean =>
      c.reply.raw.getHeader('content-type') === 'text/event-stream';

    // 5 connection đồng thời của u1 — hết trong cap, đều chấp nhận.
    const u1Tokens = await Promise.all(
      Array.from({ length: MAX_SSE_CONNECTIONS_PER_USER }, () =>
        identity.signToken('Coordinator', 'u1'),
      ),
    );
    const u1ResPs = u1Tokens.map((token) =>
      app.inject({ method: 'GET', url: `/events?access_token=${encodeURIComponent(token)}` }),
    );
    for (let i = 0; i < 100 && openListeners() < MAX_SSE_CONNECTIONS_PER_USER; i++) await sleep(10);
    expect(openListeners()).toBe(MAX_SSE_CONNECTIONS_PER_USER);

    // Connection thứ 6 của CÙNG u1 → 429 TOO_MANY_CONNECTIONS (không tăng count).
    const u1Token6 = await identity.signToken('Coordinator', 'u1');
    const rejected = await app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(u1Token6)}`,
    });
    expect(rejected.statusCode).toBe(429);
    expect(rejected.json().code).toBe('TOO_MANY_CONNECTIONS');
    expect(openListeners()).toBe(MAX_SSE_CONNECTIONS_PER_USER);

    // sub KHÁC (u2) vẫn mở được — cap per-user, không phải global bucket.
    const u2Token = await identity.signToken('Coordinator', 'u2');
    const u2ResP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(u2Token)}`,
    });
    for (let i = 0; i < 100 && openListeners() < MAX_SSE_CONNECTIONS_PER_USER + 1; i++)
      await sleep(10);
    const u2Conn = conns.find((c) => c.sub === 'u2' && isSse(c));
    expect(u2Conn).toBeDefined();
    u2Conn!.reply.raw.end();
    const u2Res = await u2ResP;
    expect(u2Res.statusCode).toBe(200);
    expect(u2Res.headers['content-type']).toBe('text/event-stream');

    // Đóng hết 5 connection u1 → counter giảm về 0 → u1 mở lại được (decrement).
    for (const conn of conns) {
      if (conn.sub === 'u1' && isSse(conn)) conn.reply.raw.end();
    }
    await Promise.all(u1ResPs.map((p) => p.catch(() => undefined)));
    expect(openListeners()).toBe(0);

    const u1RetryToken = await identity.signToken('Coordinator', 'u1');
    const u1RetryResP = app.inject({
      method: 'GET',
      url: `/events?access_token=${encodeURIComponent(u1RetryToken)}`,
    });
    for (let i = 0; i < 100 && openListeners() < 1; i++) await sleep(10);
    const retryConn = conns[conns.length - 1]!;
    expect(retryConn.sub).toBe('u1');
    retryConn.reply.raw.end();
    const retryRes = await u1RetryResP;
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.headers['content-type']).toBe('text/event-stream');
  });
});

describe('max lifetime (review P1 audit)', () => {
  it(`hết ${SSE_MAX_LIFETIME_MS}ms (override) → comment frame cuối + end + cleanup`, async () => {
    vi.useFakeTimers();
    try {
      const minimal = Fastify({ logger: false });
      minimal.addHook('onRequest', (_req, reply, done) => {
        captured = { request: _req, reply };
        done();
      });
      const lifetimeMs = 100;
      registerEventsRoutes(minimal, { maxLifetimeMs: lifetimeMs });
      const before = bffEvents.listenerCount('kafka:event');
      const resP = minimal.inject({ method: 'GET', url: '/events' });
      await vi.advanceTimersByTimeAsync(1); // flush microtask — handler chạy
      expect(bffEvents.listenerCount('kafka:event')).toBe(before + 1);

      await vi.advanceTimersByTimeAsync(lifetimeMs + 1); // lifetime timer fire
      const res = await resP;
      expect(res.payload).toContain(': stream lifetime reached\n\n');
      // Cleanup đầy đủ: listener gỡ + connection counter giảm (không leak).
      expect(bffEvents.listenerCount('kafka:event')).toBe(before);
      await minimal.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
