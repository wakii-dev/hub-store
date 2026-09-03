/**
 * SF-26 webhook route mapping (Task 4) — end-to-end qua harness (mock gRPC
 * intake thật): happy path 200 {fulfillCode, replayed} camelCase; 422 từng
 * nhánh (X-Source, externalId, phone, items); gRPC error passthrough
 * (INVALID_ARGUMENT→422 details, UNAVAILABLE→503).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { startHarness, mockGrpcError, invalidArgument } from './harness.js';
import type { Harness } from './harness.js';

const SECRET = 'test-webhook-secret'; // khớp harness config

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

const VALID_PAYLOAD = {
  externalId: 'SP-9001',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0901234567',
  customerAddress: '123 Lê Lợi, Q1, TP.HCM',
  items: [
    { productCode: 'SKU-1', productName: 'Laptop', quantity: 2 },
    { productCode: 'SKU-2', productName: 'Chuột', quantity: 3 },
  ],
  codAmount: 1500000,
  shopHint: 'SHOPEE-HCM',
};

interface CapturedRequest {
  request: Record<string, unknown>;
  actor: string | undefined;
  role: string | undefined;
}

describe('SF-26 POST /webhooks/orders — mapping + RPC (Task 4)', () => {
  let h: Harness;
  let captured: CapturedRequest;

  beforeAll(async () => {
    h = await startHarness({
      intakeHandlers: {
        createWebhookOrder: (call, cb) => {
          captured = {
            request: call.request as Record<string, unknown>,
            actor: call.metadata.get('x-user-name')[0] as string | undefined,
            role: call.metadata.get('x-user-role')[0] as string | undefined,
          };
          cb(null, { fulfillCode: 'ORD-WH-777', replayed: false });
        },
      },
    });
  });
  afterAll(async () => {
    await h.closeAll();
  });

  function inject(payload: unknown, headers: Record<string, string> = {}) {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: raw,
      headers: {
        'content-type': 'application/json',
        'x-source': 'shopee',
        'x-signature': sign(raw),
        ...headers,
      },
    });
  }

  it('happy path → 200 {fulfillCode, replayed} camelCase; RPC nhận source/externalId/quantity=Σ', async () => {
    const res = await inject(VALID_PAYLOAD);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.fulfillCode).toBe('ORD-WH-777'); // camelCase theo DTO convention
    expect(body.replayed).toBe(false);
    // RPC request đã map đúng
    expect(captured.request.source).toBe('shopee');
    expect(captured.request.externalId).toBe('SP-9001');
    const order = captured.request.order as Record<string, unknown>;
    expect(order.quantity).toBe(5); // Σ items[].quantity — validator SF-13 bắt buộc
    expect(order.codAmount).toBe(1500000);
    // SF-12: webhook machine-call — role 'Manager' + actor 'webhook:<source>'
    // cho audit trail (auth downstream = x-internal-token, KHÔNG JWT).
    expect(captured.role).toBe('Manager');
    expect(captured.actor).toBe('webhook:shopee');
  });

  it('X-Source missing → 422 VALIDATION_ERROR details field X-Source', async () => {
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: raw,
      headers: { 'content-type': 'application/json', 'x-signature': sign(raw) }, // KHÔNG x-source
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([
      { field: 'X-Source', message: expect.stringContaining('bắt buộc') },
    ]);
  });

  it('X-Source blank → 422 (trim rỗng)', async () => {
    const raw = JSON.stringify(VALID_PAYLOAD);
    const res = await h.app.inject({
      method: 'POST',
      url: '/webhooks/orders',
      payload: raw,
      headers: {
        'content-type': 'application/json',
        'x-signature': sign(raw),
        'x-source': '   ',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).details[0].field).toBe('X-Source');
  });

  it('externalId missing → 422 details field externalId', async () => {
    const { externalId: _drop, ...noExt } = VALID_PAYLOAD;
    const res = await inject(noExt);
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([
      { field: 'externalId', message: expect.stringContaining('bắt buộc') },
    ]);
  });

  it('phone sai format → 422 details field customerPhone', async () => {
    const res = await inject({ ...VALID_PAYLOAD, customerPhone: '12345' });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.details.some((d: { field: string }) => d.field === 'customerPhone')).toBe(true);
  });

  it('items rỗng → 422 details field items', async () => {
    const res = await inject({ ...VALID_PAYLOAD, items: [] });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.details.some((d: { field: string }) => d.field === 'items')).toBe(true);
  });

  it('upstream INVALID_ARGUMENT → 422 passthrough qua mapGrpcError (details giữ nguyên)', async () => {
    const hh = await startHarness({
      intakeHandlers: {
        createWebhookOrder: (_c, cb) =>
          cb(invalidArgument([{ field: 'quantity', message: 'lech' }])),
      },
    });
    try {
      const raw = JSON.stringify(VALID_PAYLOAD);
      const res = await hh.app.inject({
        method: 'POST',
        url: '/webhooks/orders',
        payload: raw,
        headers: { 'content-type': 'application/json', 'x-source': 'shopee', 'x-signature': sign(raw) },
      });
      expect(res.statusCode).toBe(422);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual([{ field: 'quantity', message: 'lech' }]);
    } finally {
      await hh.closeAll();
    }
  });

  it('upstream UNAVAILABLE → 503 UPSTREAM_UNAVAILABLE', async () => {
    const hh = await startHarness({
      intakeHandlers: {
        createWebhookOrder: (_c, cb) => cb(mockGrpcError(14, 'connection refused')),
      },
    });
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
      expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(body.message).toContain('intake-service');
    } finally {
      await hh.closeAll();
    }
  });
});
