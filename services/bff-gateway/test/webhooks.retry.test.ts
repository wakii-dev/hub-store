/**
 * SF-26 webhook retry semantics (Task 6) — hợp đồng lỗi END-TO-END từng nhánh
 * (spec §3 + plan Task 6):
 *   200 happy {fulfillCode, replayed} (replay → replayed:true passthrough)
 *   400 malformed JSON — envelope {statusCode,message} KHÔNG phải default Fastify
 *   401 thiếu / sai X-Signature
 *   503 secret env rỗng (fail-closed warn-once)
 *   422 X-Source blank / externalId missing (BFF-side validation)
 *   422 intake INVALID_ARGUMENT — details[] passthrough qua metadata
 *   503 intake UNAVAILABLE (14) / 500 intake INTERNAL (2) qua mapGrpcError
 *   → MỌI error message KHÔNG chứa secret/signature.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { startHarness, mockGrpcError, invalidArgument } from './harness.js';
import type { Harness } from './harness.js';
import { status as GrpcStatus } from '@grpc/grpc-js';

const SECRET = 'test-webhook-secret'; // khớp harness config

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

const VALID_PAYLOAD = {
  externalId: 'SP-RT-1',
  customerName: 'Nguyễn Văn B',
  customerPhone: '0912345678',
  customerAddress: '45 Hai Bà Trưng, Q1, TP.HCM',
  items: [{ productCode: 'SKU-9', productName: 'Bàn phím', quantity: 1 }],
  codAmount: 250000,
};

/** Raw inject thô — sign trên đúng bytes gửi đi (string payload). */
async function rawInject(
  h: Harness,
  raw: string,
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; payload: string }> {
  const res = await h.app.inject({
    method: 'POST',
    url: '/webhooks/orders',
    payload: raw,
    headers: { 'content-type': 'application/json', ...headers },
  });
  return { statusCode: res.statusCode, payload: res.payload };
}

/** Hợp đồng lỗi: message KHÔNG BAO GIỜ chứa secret hoặc signature value. */
function expectNoSecretLeak(payload: string): void {
  expect(payload).not.toContain(SECRET);
  expect(payload).not.toContain(sign(''));
}

describe('SF-26 retry semantics — error contract đầy đủ (Task 6)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await startHarness({
      intakeHandlers: {
        // Happy mặc định; từng test lỗi override qua h.intake.override(...)
        createWebhookOrder: (_c, cb) => cb(null, { fulfillCode: 'ORD-RT-0001', replayed: false }),
      },
    });
  });
  afterAll(async () => {
    await h.closeAll();
  });

  it('200 happy — HMAC ok + validate ok → {fulfillCode, replayed:false} camelCase', async () => {
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ fulfillCode: 'ORD-RT-0001', replayed: false });
    expectNoSecretLeak(res.payload);
  });

  it('200 replay — cùng externalId → intake quyết định replayed:true passthrough', async () => {
    h.intake.override({
      createWebhookOrder: (_c, cb) => cb(null, { fulfillCode: 'ORD-RT-0001', replayed: true }),
    });
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).replayed).toBe(true);
    h.intake.override({
      createWebhookOrder: (_c, cb) => cb(null, { fulfillCode: 'ORD-RT-0001', replayed: false }),
    });
  });

  it('400 malformed JSON — envelope {statusCode,message,...} không phải default Fastify shape', async () => {
    const raw = '{"externalId": "x"'; // JSON cắt cụt
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    // errorEnvelope chuẩn — default Fastify trả { error, message, statusCode: 400 } có field `error`
    expect(body.statusCode).toBe(400);
    expect(body.message).toBe('Malformed JSON body');
    expect(body.error).toBeUndefined();
    expectNoSecretLeak(res.payload);
  });

  it('401 thiếu X-Signature', async () => {
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await rawInject(h, raw, { 'x-source': 'shopee' });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.message).toBe('missing X-Signature');
    expect(body.code).toBe('UNAUTHORIZED');
    expectNoSecretLeak(res.payload);
  });

  it('401 sai signature (đổi 1 ký tự)', async () => {
    const raw = JSON.stringify(VALID_PAYLOAD);
    const sig = sign(raw);
    const tampered = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': tampered });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.payload).message).toBe('invalid signature');
    // KHÔNG leak đúng signature value hợp lệ
    expect(res.payload).not.toContain(sig);
  });

  it('422 X-Source blank (trim rỗng) — details field X-Source', async () => {
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await rawInject(h, raw, { 'x-source': '   ', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([
      { field: 'X-Source', message: expect.stringContaining('bắt buộc') },
    ]);
    expectNoSecretLeak(res.payload);
  });

  it('422 externalId missing — details field externalId', async () => {
    const { externalId: _drop, ...noExt } = VALID_PAYLOAD;
    const raw = JSON.stringify(noExt);
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([
      { field: 'externalId', message: expect.stringContaining('bắt buộc') },
    ]);
    expectNoSecretLeak(res.payload);
  });

  it('422 intake INVALID_ARGUMENT (3) — details[] passthrough qua metadata x-error-details', async () => {
    // Contract SF-2: metadata value = encodeURIComponent(JSON ErrorDetail[])
    h.intake.override({
      createWebhookOrder: (_c, cb) =>
        cb(invalidArgument([{ field: 'quantity', message: 'khớp lệnh ±1' }])),
    });
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([{ field: 'quantity', message: 'khớp lệnh ±1' }]); // tiếng Việt đi nguyên
    expectNoSecretLeak(res.payload);
  });

  it('503 intake UNAVAILABLE (14) — UPSTREAM_UNAVAILABLE + message kèm intake-service', async () => {
    h.intake.override({
      createWebhookOrder: (_c, cb) => cb(mockGrpcError(GrpcStatus.UNAVAILABLE, 'connection refused')),
    });
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.message).toContain('intake-service');
    expectNoSecretLeak(res.payload);
  });

  it('5xx intake INTERNAL (2) → 500 code INTERNAL qua mapGrpcError default', async () => {
    h.intake.override({
      createWebhookOrder: (_c, cb) => cb(mockGrpcError(GrpcStatus.INTERNAL, 'boom upstream')),
    });
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await rawInject(h, raw, { 'x-source': 'shopee', 'x-signature': sign(raw) });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.payload);
    expect(body.statusCode).toBe(500);
    expect(body.code).toBe('INTERNAL');
    expectNoSecretLeak(res.payload);
  });

  it('503 secret env rỗng — fail-closed TRƯỚC khi đọc payload (warn-once)', async () => {
    const hh = await startHarness({ webhookHmacSecret: '' });
    try {
      const raw = JSON.stringify(VALID_PAYLOAD);
      const res = await hh.app.inject({
        method: 'POST',
        url: '/webhooks/orders',
        payload: raw,
        headers: { 'content-type': 'application/json', 'x-source': 'shopee', 'x-signature': sign(raw) },
      });
      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('UNAUTHORIZED');
      // message không bao giờ chứa giá trị secret (rỗng) hay signature
      expect(res.payload).not.toContain(sign(raw));
    } finally {
      await hh.closeAll();
    }
  });
});
