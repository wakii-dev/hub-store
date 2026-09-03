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
import { registerEventsRoutes, SSE_HEARTBEAT_MS } from '../src/routes/events.js';
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
