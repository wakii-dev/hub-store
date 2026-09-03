/**
 * SF-26 webhook skeleton (Task 1) — auth-skip exact-path + scoped raw-body
 * parser + HMAC fail-closed:
 *   - POST /webhooks/orders KHÔNG JWT → KHÔNG bị 401-JWT (guard skip);
 *     auth chuyển sang HMAC (verifyHmac) → thiếu/sai signature 401.
 *   - POST /webhooks/other (cùng prefix) VẪN bị 401-JWT — guard KHÔNG skip
 *     prefix /webhooks.
 *   - Signature đúng qua raw bytes → qua HMAC → skeleton 503 (mapping Task 4).
 *   - JSON malformed → 400 errorEnvelope (scoped setErrorHandler).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { startHarness } from './harness.js';
import type { Harness } from './harness.js';

const SECRET = 'test-webhook-secret'; // khớp harness config

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

describe('SF-26 webhook skeleton — auth skip + scoped parser', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h.closeAll();
  });

  it('POST /webhooks/orders không JWT → KHÔNG 401-JWT; thiếu X-Signature → 401 HMAC', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: { externalId: 'X1' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    // HMAC message — KHÔNG phải message JWT guard 'Missing Authorization'
    expect(body.message).toBe('missing X-Signature');
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('POST /webhooks/other không JWT → VẪN 401-JWT (guard chỉ skip exact-path)', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/other',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.message).toBe('Missing Authorization: Bearer <token> header.');
  });

  it('Signature đúng trên raw bytes → qua HMAC → skeleton 503', async () => {
    const raw = JSON.stringify({ externalId: 'X2', customerName: 'A' });
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: raw, // string → bytes đúng như đã sign
      headers: { 'content-type': 'application/json', 'x-source': 'shopee', 'x-signature': sign(raw) },
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).message).toBe('not implemented yet');
  });

  it('Sai signature (đổi 1 ký tự) → 401 invalid signature', async () => {
    const raw = JSON.stringify({ externalId: 'X3' });
    const sig = sign(raw);
    const tampered = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: raw,
      headers: { 'content-type': 'application/json', 'x-signature': tampered },
    });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.payload).message).toBe('invalid signature');
  });

  it('JSON malformed + signature đúng → 400 errorEnvelope (scoped parser)', async () => {
    const raw = '{"externalId":';
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: raw,
      headers: { 'content-type': 'application/json', 'x-signature': sign(raw) },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Malformed JSON body');
  });
});
