/**
 * SF-21 (FI-266) — printer management route tests: GET /fulfillment/printers
 * (mọi role), POST/PUT Admin-only (403 role khác), duplicate ALREADY_EXISTS
 * → 409, update not-found NOT_FOUND → 404, identity từ path (body bỏ qua).
 * Harness pattern d2c.route.test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { status } from '@grpc/grpc-js';
import { authedInject, startHarness, type Harness, mockGrpcError } from './harness.js';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

describe('GET /fulfillment/printers', () => {
  it('200 — { items } với DTO đầy đủ (ip/mac/type) cho role thường', async () => {
    const res = await authedInject(h.app, 'GET', '/fulfillment/printers?shopCode=30201', undefined, 'WarehouseOps');
    expect(res.statusCode).toBe(200);
    const body = res.body as { items: Array<Record<string, unknown>> };
    expect(Array.isArray(body.items)).toBe(true);
    const item = body.items[0];
    expect(item.printerId).toBe('PRN-30201-01');
    expect(item.shopCode).toBe('30201');
    expect(item.printerIp).toBe('192.168.30.21');
    expect(item.mac).toBe('AA:BB:CC:30:21:01');
    expect(item.type).toBe('bill');
  });
});

describe('GET /fulfillment/print/printers — đổi nguồn fulfillment (D1), shape { items } pin', () => {
  it('200 — items map từ fulfillment ListPrinters (KHÔNG còn print-service)', async () => {
    let printCalled = false;
    h.print.override({
      listPrinters: (_c, cb) => {
        printCalled = true;
        cb(null, { printers: [] });
      },
    });
    const res = await authedInject(h.app, 'GET', '/fulfillment/print/printers?shopCode=30201');
    expect(res.statusCode).toBe(200);
    expect(printCalled).toBe(false);
    const body = res.body as { items: Array<Record<string, unknown>> };
    expect(body.items[0].printerId).toBe('PRN-30201-01');
  });
});

describe('POST /fulfillment/printers — Admin only', () => {
  it('Admin → 200 + DTO', async () => {
    const res = await authedInject(h.app, 'POST', '/fulfillment/printers', {
      shopCode: '30201',
      printerId: 'PRN-NEW',
      name: 'New',
      type: 'bill',
    }, 'Admin');
    expect(res.statusCode).toBe(200);
    expect((res.body as { printerId: string }).printerId).toBe('PRN-NEW');
  });

  it('Manager → 403 FORBIDDEN', async () => {
    const res = await authedInject(h.app, 'POST', '/fulfillment/printers', {
      shopCode: '30201', printerId: 'PRN-NEW', type: 'bill',
    }, 'Manager');
    expect(res.statusCode).toBe(403);
  });

  it('duplicate upstream ALREADY_EXISTS → 409 CONFLICT', async () => {
    h.fulfillment.override({
      createPrinter: (_c, cb) => cb(mockGrpcError(status.ALREADY_EXISTS, 'dup')),
    });
    const res = await authedInject(h.app, 'POST', '/fulfillment/printers', {
      shopCode: '30201', printerId: 'PRN-30201-01', type: 'bill',
    }, 'Admin');
    expect(res.statusCode).toBe(409);
    expect((res.body as { code: string }).code).toBe('CONFLICT');
  });
});

describe('PUT /fulfillment/printers/:shopCode/:printerId — Admin only, identity từ path', () => {
  it('Admin → 200 + DTO; identity gửi từ path (body printer_identity bị bỏ qua)', async () => {
    let captured: { shopCode?: string; printerId?: string } | null = null;
    h.fulfillment.override({
      updatePrinter: (call, cb) => {
        captured = {
          shopCode: call.request.shopCode,
          printerId: call.request.printerId,
        };
        cb(null, {
          printer: {
            shopCode: call.request.shopCode,
            printerId: call.request.printerId,
            name: 'Renamed',
            type: 'a4',
          },
        });
      },
    });
    const res = await authedInject(h.app, 'PUT', '/fulfillment/printers/30201/PRN-30201-01', {
      shopCode: '99999', // body identity phải bị bỏ qua — path là nguồn sự thật (D9)
      printerId: 'HACK',
      name: 'Renamed',
      type: 'a4',
    }, 'Admin');
    expect(res.statusCode).toBe(200);
    expect(captured!.shopCode).toBe('30201');
    expect(captured!.printerId).toBe('PRN-30201-01');
    expect((res.body as { name: string }).name).toBe('Renamed');
  });

  it('WarehouseOps → 403', async () => {
    const res = await authedInject(h.app, 'PUT', '/fulfillment/printers/30201/PRN-1', {
      name: 'x', type: 'a4',
    }, 'WarehouseOps');
    expect(res.statusCode).toBe(403);
  });

  it('upstream NOT_FOUND → 404', async () => {
    h.fulfillment.override({
      updatePrinter: (_c, cb) => cb(mockGrpcError(status.NOT_FOUND, 'missing')),
    });
    const res = await authedInject(h.app, 'PUT', '/fulfillment/printers/30201/PRN-X', {
      name: 'x', type: 'a4',
    }, 'Admin');
    expect(res.statusCode).toBe(404);
  });
});
