/**
 * SF-21 (FI-266) — print-error record semantics (spec D2) + counts route:
 *   - preview (printerId '')      → KHÔNG validate, KHÔNG record
 *   - in thật + printer lạ        → record (order_code rỗng) + 400
 *   - in thật + batching fail     → record (order_code rỗng) + gRPC error
 *   - in thật + print-service fail→ record PER ĐƠN trong phiếu + error
 *   - record fail-open            → lỗi gốc KHÔNG bị mask
 *   - GET /fulfillment/print-errors/counts?batchCode= → { items }
 * Harness pattern printers.route.test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { status } from '@grpc/grpc-js';
import { authedInject, startHarness, type Harness, mockGrpcError } from './harness.js';

let h: Harness;
const recorded: Array<{ orderCode?: string; batchCode?: string; printType?: string; printerId?: string; errorMessage?: string }> = [];

beforeEach(async () => {
  recorded.length = 0;
  h = await startHarness({
    fulfillmentHandlers: {
      recordPrintError: (call, cb) => {
        recorded.push({ ...call.request.record });
        cb(null, {});
      },
    },
  });
});

afterEach(async () => {
  await h.closeAll();
});

const PRINT_BODY = {
  batchCode: 'BAT-1001',
  printType: 'bill',
  printerId: 'PRN-30201-01', // có trong harness listPrinters default
};

describe('POST /fulfillment/print — record semantics (D2)', () => {
  it('preview (printerId "") → KHÔNG record, PDF vẫn trả', async () => {
    const res = await authedInject(h.app, 'POST', '/fulfillment/print', {
      ...PRINT_BODY,
      printerId: '',
    });
    expect(res.statusCode).toBe(200);
    expect(recorded).toHaveLength(0);
  });

  it('printer lạ → 400 + record 1 dòng (order_code rỗng — batch chưa hydrate)', async () => {
    const res = await authedInject(h.app, 'POST', '/fulfillment/print', {
      ...PRINT_BODY,
      printerId: 'PRN-GHOST',
    });
    expect(res.statusCode).toBe(400);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].orderCode).toBe('');
    expect(recorded[0].printerId).toBe('PRN-GHOST');
    expect(recorded[0].batchCode).toBe('BAT-1001');
    expect(recorded[0].printType).toBe('bill');
  });

  it('batching fail → record (order_code rỗng) + lỗi batching passthrough', async () => {
    h.batching.override({
      getBatchDetail: (_c, cb) => cb(mockGrpcError(status.UNAVAILABLE, 'go down')),
    });
    const res = await authedInject(h.app, 'POST', '/fulfillment/print', PRINT_BODY);
    expect(res.statusCode).toBe(503);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].orderCode).toBe('');
    expect(recorded[0].printerId).toBe('PRN-30201-01');
  });

  it('print-service fail → record PER ĐƠN (fixture batch 1 đơn RSA-700101) + 503', async () => {
    h.print.override({
      print: (_c, cb) => cb(mockGrpcError(status.UNAVAILABLE, 'print-service down')),
    });
    const res = await authedInject(h.app, 'POST', '/fulfillment/print', PRINT_BODY);
    expect(res.statusCode).toBe(503);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].orderCode).toBe('RSA-700101');
    expect(recorded[0].errorMessage).toContain('print-service down');
  });

  it('preview + batching fail → KHÔNG record (preview fail không record — D2)', async () => {
    h.batching.override({
      getBatchDetail: (_c, cb) => cb(mockGrpcError(status.UNAVAILABLE, 'go down')),
    });
    const res = await authedInject(h.app, 'POST', '/fulfillment/print', {
      ...PRINT_BODY,
      printerId: '',
    });
    expect(res.statusCode).toBe(503);
    expect(recorded).toHaveLength(0);
  });

  it('fail-open: record lỗi → KHÔNG mask lỗi gốc (vẫn 503 print-service)', async () => {
    h.fulfillment.override({
      recordPrintError: (_c, cb) => cb(mockGrpcError(status.UNAVAILABLE, 'fulfillment down')),
    });
    h.print.override({
      print: (_c, cb) => cb(mockGrpcError(status.UNAVAILABLE, 'print-service down')),
    });
    const res = await authedInject(h.app, 'POST', '/fulfillment/print', PRINT_BODY);
    // Lỗi gốc (print-service) được trả nguyên — record fail chỉ log.
    expect(res.statusCode).toBe(503);
    expect((res.body as { code?: string }).code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('GET /fulfillment/print-errors/counts?batchCode=', () => {
  it('200 — { items: [{orderCode, count}] } map từ fulfillment counts', async () => {
    h.fulfillment.override({
      getPrintErrorCounts: (_c, cb) =>
        cb(null, {
          counts: [
            { orderCode: 'RSA-700101', count: 3 },
            { orderCode: 'RSA-700102', count: 1 },
          ],
        }),
    });
    const res = await authedInject(
      h.app,
      'GET',
      '/fulfillment/print-errors/counts?batchCode=BAT-1001',
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      items: [
        { orderCode: 'RSA-700101', count: 3 },
        { orderCode: 'RSA-700102', count: 1 },
      ],
    });
  });

  it('upstream fail → gRPC error envelope', async () => {
    h.fulfillment.override({
      getPrintErrorCounts: (_c, cb) => cb(mockGrpcError(status.UNAVAILABLE, 'down')),
    });
    const res = await authedInject(
      h.app,
      'GET',
      '/fulfillment/print-errors/counts?batchCode=BAT-1001',
    );
    expect(res.statusCode).toBe(503);
  });
});
