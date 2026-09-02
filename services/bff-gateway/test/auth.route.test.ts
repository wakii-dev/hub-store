/**
 * SF-4 — route /auth/reset-password (forgot-password dev-only C1).
 * Mock Keycloak Admin API bằng http server thật: token endpoint (password
 * grant realm master) + users lookup + reset-password PUT — assert flow BFF
 * gọi đúng thứ tự + bảo mật body đúng shape + envelope lỗi đúng.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';
import type { BffConfig } from '../src/config.js';
import { TEST_ISSUER, TEST_AUDIENCE, startTestIdentity, type TestIdentity } from './harness.js';

let kc: Server;
let kcPort: number;
let identity: TestIdentity;

// Captured từ mock KC — assert trong từng test.
let capturedReset: { path: string; body: string; auth: string } | null = null;
let capturedLookupUsername: string | null = null;
let foundUser: { id: string } | null = { id: 'u-123' };

async function startMockKeycloak(): Promise<void> {
  kc = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '';
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const bodyRaw = Buffer.concat(chunks).toString();
      if (url.startsWith('/realms/master/protocol/openid-connect/token')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'kc-admin-token' }));
        return;
      }
      // /reset-password PHẢI check TRƯỚC /users — URL PUT chứa segment users/.
      if (url.includes('/reset-password')) {
        capturedReset = { path: url, body: bodyRaw, auth: req.headers.authorization ?? '' };
        res.writeHead(204);
        res.end();
        return;
      }
      if (url.startsWith('/realms/hubstore/users')) {
        const params = new URL(url, 'http://x').searchParams;
        capturedLookupUsername = params.get('username');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(foundUser ? [foundUser] : []));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((resolve) => kc.listen(0, '127.0.0.1', resolve));
  const address = kc.address();
  if (address === null || typeof address === 'string') throw new Error('kc mock bind failed');
  kcPort = address.port;
}

function buildTestApp(opts: { devResetPassword?: boolean } = {}): ReturnType<typeof buildApp> {
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
    },
    corsOrigins: ['http://localhost:3000'],
    grpc: {
      fulfillment: '127.0.0.1:1',
      batching: '127.0.0.1:1',
      print: '127.0.0.1:1',
      intake: '127.0.0.1:1',
      deadlineMs: 2000,
    },
    devResetPassword: opts.devResetPassword ?? true,
  };
  return buildApp(config);
}

let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  await startMockKeycloak();
});

afterAll(async () => {
  await new Promise<void>((res) => kc.close(() => res()));
});

beforeEach(async () => {
  identity = await startTestIdentity();
  app = buildTestApp();
  capturedReset = null;
  capturedLookupUsername = null;
  foundUser = { id: 'u-123' };
});

afterEach(async () => {
  await app.close();
  await identity.close();
});

describe('POST /auth/reset-password (dev-only forgot-password)', () => {
  it('public — KHÔNG cần Bearer token (guard skip route này)', async () => {
    const res = await app.inject({ method: 'GET', url: '/master-data/regions' });
    expect(res.statusCode).toBe(401); // route thường vẫn bị guard chặn
    const ok = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { username: 'coordinator', newPassword: 'NewPass123' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('400 khi thiếu username / password quá ngắn', async () => {
    const noUser = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { newPassword: 'NewPass123' },
    });
    expect(noUser.statusCode).toBe(400);
    const shortPw = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { username: 'coordinator', newPassword: '123' },
    });
    expect(shortPw.statusCode).toBe(400);
  });

  it('404 khi user không tồn tại trong realm', async () => {
    foundUser = null;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { username: 'ghost-user', newPassword: 'NewPass123' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('200 happy path — lookup đúng username + PUT reset-password với bearer admin token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { username: 'coordinator', newPassword: 'NewPass123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(capturedLookupUsername).toBe('coordinator');
    expect(capturedReset?.auth).toBe('Bearer kc-admin-token');
    expect(JSON.parse(capturedReset?.body ?? '{}')).toEqual({
      type: 'password',
      value: 'NewPass123',
      temporary: false,
    });
  });

  it('FAIL-SAFE: flag ENABLE_DEV_RESET_PASSWORD thiếu → route không tồn tại (404)', async () => {
    const gated = buildTestApp({ devResetPassword: false });
    try {
      const res = await gated.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { username: 'coordinator', newPassword: 'NewPass123' },
      });
      expect(res.statusCode).toBe(404); // không mount — không dựa vào doc/README
    } finally {
      await gated.close();
    }
  });
});
