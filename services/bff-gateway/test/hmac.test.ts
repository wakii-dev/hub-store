/**
 * SF-26 Task 2 — HMAC auth (verifyHmac timing-safe + route fail-closed):
 *   Lib-level (verifyHmac trực tiếp): sig đúng/đổi 1 byte/thiếu header/secret
 *   rỗng 503/prefix sha256=/length khác không throw.
 *   Route-level (fastify inject qua harness, secret 'test-webhook-secret'):
 *   cùng các nhánh qua HTTP + secret rỗng → 503 fail-closed + warn log ĐÚNG
 *   MỘT LẦN (flag chống spam — spec §3).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { verifyHmac } from '../src/lib/hmac.js';
import { buildApp } from '../src/app.js';
import type { BffConfig } from '../src/config.js';
import { startHarness } from './harness.js';
import type { Harness } from './harness.js';

const SECRET = 'test-webhook-secret';

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('SF-26 verifyHmac (lib)', () => {
  const body = '{"externalId":"H1"}';

  it('signature đúng → ok', () => {
    const r = verifyHmac(Buffer.from(body), sign(body), SECRET);
    expect(r).toEqual({ ok: true, status: 200, message: 'ok' });
  });

  it('signature sai → 401 invalid signature', () => {
    const good = sign(body);
    const bad = (good[0] === '0' ? '1' : '0') + good.slice(1);
    expect(verifyHmac(Buffer.from(body), bad, SECRET)).toMatchObject({
      ok: false,
      status: 401,
      message: 'invalid signature',
    });
  });

  it('raw body khác 1 byte → 401 (không ok)', () => {
    const other = '{"externalId":"H2"}'; // signer ký body khác
    expect(verifyHmac(Buffer.from(body), sign(other), SECRET).status).toBe(401);
  });

  it('thiếu header (undefined / rỗng) → 401 missing X-Signature', () => {
    expect(verifyHmac(Buffer.from(body), undefined, SECRET)).toMatchObject({
      ok: false,
      status: 401,
      message: 'missing X-Signature',
    });
    expect(verifyHmac(Buffer.from(body), '', SECRET).status).toBe(401);
  });

  it('secret rỗng → 503 fail-closed (webhook auth unavailable)', () => {
    expect(verifyHmac(Buffer.from(body), sign(body), '')).toMatchObject({
      ok: false,
      status: 503,
      message: 'webhook auth unavailable',
    });
  });

  it('header có tiền tố sha256= → chấp nhận (stripped)', () => {
    expect(verifyHmac(Buffer.from(body), `sha256=${sign(body)}`, SECRET).ok).toBe(true);
  });

  it('length khác → KHÔNG throw, 401 (timingSafeEqual an toàn)', () => {
    expect(() => verifyHmac(Buffer.from(body), 'abc', SECRET)).not.toThrow();
    expect(verifyHmac(Buffer.from(body), 'abc', SECRET).status).toBe(401);
    expect(() => verifyHmac(Buffer.from(body), 12345, SECRET)).not.toThrow();
    expect(verifyHmac(Buffer.from(body), 12345, SECRET).status).toBe(401);
  });

  it('message KHÔNG chứa secret', () => {
    for (const r of [
      verifyHmac(Buffer.from(body), undefined, SECRET),
      verifyHmac(Buffer.from(body), 'zzz', SECRET),
      verifyHmac(Buffer.from(body), sign(body), ''),
    ]) {
      expect(r.message).not.toContain(SECRET);
    }
  });
});

describe('SF-26 HMAC route-level (harness, secret đã set)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h.closeAll();
  });

  function injectPost(raw: string, headers: Record<string, string>) {
    return h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: raw,
      headers: { 'content-type': 'application/json', ...headers },
    });
  }

  it('signature đúng → qua auth (503 skeleton mapping — Task 4 wire)', async () => {
    const raw = JSON.stringify({ externalId: 'H10' });
    const res = await injectPost(raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(503); // qua HMAC, chạm skeleton
    expect(JSON.parse(res.payload).message).toBe('not implemented yet');
  });

  it('signature sai → 401; raw khác 1 byte → 401', async () => {
    const raw = JSON.stringify({ externalId: 'H11' });
    const good = sign(raw);
    const res1 = await injectPost(raw, { 'x-signature': good.slice(0, -1) + '0' });
    expect(res1.statusCode).toBe(401);
    // signer ký raw khác đúng 1 byte
    const res2 = await injectPost(raw, { 'x-signature': sign(raw + ' ') });
    expect(res2.statusCode).toBe(401);
  });

  it('thiếu X-Signature → 401; prefix sha256= → qua auth', async () => {
    const raw = JSON.stringify({ externalId: 'H12' });
    const res1 = await injectPost(raw, { 'x-source': 'shopee' });
    expect(res1.statusCode).toBe(401);
    expect(JSON.parse(res1.payload).message).toBe('missing X-Signature');
    const res2 = await injectPost(raw, { 'x-signature': `sha256=${sign(raw)}` });
    expect(res2.statusCode).toBe(503); // qua auth
  });
});

describe('SF-26 route fail-closed (secret rỗng) + warn-once', () => {
  let app: FastifyInstance;

  function emptySecretConfig(): BffConfig {
    return {
      port: 0,
      onesignal: { appId: '', restApiKey: '' },
      oidc: {
        issuer: 'https://keycloak.test/realms/hubstore',
        audience: 'hubstore-api',
        jwksUrl: 'http://127.0.0.1:1/certs', // không fetch — chỉ route webhook được gọi
        adminBaseUrl: 'http://127.0.0.1:1/admin/realms/hubstore',
        adminTokenUrl: 'http://127.0.0.1:1/token',
        adminUsername: 'admin',
        adminPassword: 'admin',
        kcAdminTokenUrl: 'http://127.0.0.1:1/token',
        kcAdminClientId: 'hubstore-admin',
        kcAdminClientSecret: '',
      },
      corsOrigins: ['http://localhost:3000'],
      grpc: {
        fulfillment: '127.0.0.1:1',
        batching: '127.0.0.1:1',
        deliverybatch: '127.0.0.1:1',
        print: '127.0.0.1:1',
        intake: '127.0.0.1:1',
        deadlineMs: 500,
      },
      devResetPassword: false,
      kafka: { enabled: false, bootstrapServers: 'localhost:9092' },
      webhookHmacSecret: '', // fail-closed
      webhookMapping: '',
    };
  }

  beforeAll(() => {
    app = buildApp(emptySecretConfig());
  });
  afterAll(async () => {
    await app.close();
  });

  it('secret rỗng → 503 webhook auth unavailable + warn log ĐÚNG MỘT LẦN', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const raw = JSON.stringify({ externalId: 'H20' });
      const injectPost = () =>
        app.inject({
          method: 'POST',
          url: '/webhooks/orders',
          payload: raw,
          headers: {
            'content-type': 'application/json',
            'x-source': 'shopee',
            'x-signature': sign(raw),
          },
        });
      const res1 = await injectPost();
      expect(res1.statusCode).toBe(503);
      expect(JSON.parse(res1.payload).message).toBe('webhook auth unavailable');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0]?.[0])).not.toContain(SECRET);
      // request thứ 2 — KHÔNG warn thêm (flag chống spam)
      const res2 = await injectPost();
      expect(res2.statusCode).toBe(503);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
