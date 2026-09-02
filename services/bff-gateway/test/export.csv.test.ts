/**
 * SF-7 (FI-252) T4 — GET /fulfillment/orders/export.csv:
 * (a) csvCell pure: formula-guard TRƯỚC quoting (combo), escape `"`, null → '';
 * (b) route: mock gRPC 2 trang (total 600) → 601 dòng (header + 600), headers
 *     đúng (text/csv, attachment, BOM), request mirror querystring filter;
 * (c) lỗi gRPC page 2 → error envelope, KHÔNG phải CSV (buffer-then-send).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import { status } from '@grpc/grpc-js';
import { startHarness, authedInject, mockGrpcError, type Harness } from './harness.js';
import { csvCell, csvRow, EXPORT_COLUMNS } from '../src/lib/csv.js';
import type { FilterOrdersResponse } from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';

describe('csvCell / csvRow / EXPORT_COLUMNS (pure)', () => {
  it('null/undefined → rỗng; plain giữ nguyên', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('')).toBe('');
    expect(csvCell('ORD-123')).toBe('ORD-123');
    expect(csvCell(3)).toBe('3');
  });

  it('formula-guard: = + - @ \t → prefix apostrophe, KHÔNG quote', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+cmd')).toBe("'+cmd");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@risk')).toBe("'@risk");
    expect(csvCell('\tx')).toBe("'\tx");
  });

  it('quote khi chứa , " \\n \\r; escape `"`→`""`', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('cr\rreturn')).toBe('"cr\rreturn"');
  });

  it('combo: formula-guard TRƯỚC quoting (prefix nằm trong quote)', () => {
    // guard chạy trước → "'=a,b"; rồi chứa ',' → bọc quote giữ nguyên prefix.
    expect(csvCell('=a,b')).toBe('"\'=a,b"');
  });

  it('csvRow join + \r\n; EXPORT_COLUMNS 9 cột đúng thứ tự', () => {
    expect(csvRow(['a', 'b,c', null])).toBe('a,"b,c",\r\n');
    expect(EXPORT_COLUMNS).toEqual([
      'fulfillCode',
      'orderCode',
      'batchStatus',
      'shopCode',
      'shopName',
      'shopAddress',
      'deliveryFrom',
      'deliveryTo',
      'note',
    ]);
  });
});

// ── Route tests — mock gRPC upstream thật qua harness ────────────────────────

/** 1 item raw proto đủ field (ts-proto decode shape). */
function mockItem(i: number): Record<string, unknown> {
  return {
    fulfillCode: `FL-${String(i).padStart(4, '0')}`,
    statusCode: 0,
    batchStatus: 0,
    shopAssignment: { shopCode: '30202', shopName: `Kho CN ${i % 3}`, address: `Địa chỉ ${i}, Q1, TP.HCM` },
    originalTime: undefined,
    deliveryTime: { from: '2026-09-03T08:00:00.000Z', to: '2026-09-03T10:00:00.000Z' },
    orderStatus: 0,
    items: [],
    codAmount: 0,
    totalQuantity: 1,
    isDebtSplittingOrder: false,
    customerAddress: '',
    note: i === 1 ? 'Giao giờ hành chính, gọi trước' : undefined,
  };
}

type FilterOrdersHandler = (
  call: ServerUnaryCall<{ page: number; pageSize: number }, FilterOrdersResponse>,
  cb: sendUnaryData<FilterOrdersResponse>,
) => void;

/** 2 trang: total 600 — page 1 = 500 items, page 2 = 100 items. */
function twoPageHandler(): { handler: FilterOrdersHandler; calls: Array<{ page: number; pageSize: number }> } {
  const calls: Array<{ page: number; pageSize: number }> = [];
  return {
    calls,
    handler: (call, cb) => {
      calls.push({ page: call.request.page, pageSize: call.request.pageSize });
      const page = call.request.page;
      if (page === 1) {
        cb(null, { items: Array.from({ length: 500 }, (_, i) => mockItem(i + 1)) as never, total: 600, page: 1, pageSize: 500 });
      } else {
        cb(null, { items: Array.from({ length: 100 }, (_, i) => mockItem(501 + i)) as never, total: 600, page: 2, pageSize: 500 });
      }
    },
  };
}

async function withHarness(
  fulfillmentHandlers: Record<string, unknown>,
  run: (h: Harness) => Promise<void>,
): Promise<void> {
  const h = await startHarness({ fulfillmentHandlers: fulfillmentHandlers as never });
  try {
    await run(h);
  } finally {
    await h.closeAll();
  }
}

describe('GET /fulfillment/orders/export.csv', () => {
  beforeEach(() => {
    // Audit pool không liên quan — đảm bảo env test không rò rỉ.
    delete process.env.FULFILLMENT_DB_HOST;
  });
  afterEach(() => {
    delete process.env.FULFILLMENT_DB_HOST;
  });

  it('total 600 → loop 2 trang pageSize 500, 601 dòng, headers + BOM đúng', async () => {
    const two = twoPageHandler();
    await withHarness({ filterOrders: two.handler }, async (h) => {
      const res = await authedInject(h.app, 'GET', '/fulfillment/orders/export.csv', undefined, 'Coordinator');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(String(res.headers['content-disposition'])).toMatch(/^attachment; filename="orders-export-\d{8}-\d{6}\.csv"$/);
      const body = res.rawPayload.toString('utf8');
      expect(body.charCodeAt(0)).toBe(0xfeff); // UTF-8 BOM
      const rows = body.slice(1).split('\r\n');
      expect(rows[0]).toBe([...EXPORT_COLUMNS].join(','));
      expect(rows.length).toBe(602); // header + 600 data + '' cuối
      expect(rows[1].startsWith('FL-0001,')).toBe(true);
      // orderCode = GAP proto → cột 2 rỗng (dòng FL-0002 có note chứa ',' → quote).
      expect(rows[2]).toBe('FL-0002,,0,30202,Kho CN 2,"Địa chỉ 2, Q1, TP.HCM",2026-09-03T08:00:00.000Z,2026-09-03T10:00:00.000Z,');
      expect(rows[600].startsWith('FL-0600,')).toBe(true);
      // Loop: 2 request, page 1 rồi 2, pageSize 500 — filter mirror querystring.
      expect(two.calls).toEqual([
        { page: 1, pageSize: 500 },
        { page: 2, pageSize: 500 },
      ]);
    });
  });

  it('querystring filter → FilterOrdersRequest đúng kiểu (ints, lists, ngày UTC)', async () => {
    let captured: Record<string, unknown> | null = null;
    const handler: FilterOrdersHandler = (call, cb) => {
      captured = call.request as unknown as Record<string, unknown>;
      cb(null, { items: [mockItem(1)] as never, total: 1, page: 1, pageSize: 500 });
    };
    await withHarness({ filterOrders: handler }, async (h) => {
      const url =
        '/fulfillment/orders/export.csv?fulfillCode=ORD&batchStatus=0,1&regionCodes=R1,R2&shopCodes=&orderStatus=1&createdAt=2026-09-02';
      const res = await authedInject(h.app, 'GET', url, undefined, 'Manager');
      expect(res.statusCode).toBe(200);
      expect(captured).toMatchObject({
        fulfillCode: 'ORD',
        batchStatuses: [0, 1],
        regionCodes: ['R1', 'R2'],
        shopCodes: [],
        orderStatuses: [1],
        createdTime: { from: '2026-09-02T00:00:00.000Z', to: '2026-09-02T23:59:59.999Z' },
        page: 1,
        pageSize: 500,
      });
    });
  });

  it('lỗi gRPC page 2 → error envelope (buffer-then-send, không CSV đứt)', async () => {
    const handler: FilterOrdersHandler = (call, cb) => {
      if (call.request.page === 1) {
        cb(null, { items: Array.from({ length: 500 }, (_, i) => mockItem(i + 1)) as never, total: 600, page: 1, pageSize: 500 });
      } else {
        cb(mockGrpcError(status.UNAVAILABLE, 'upstream down'));
      }
    };
    await withHarness({ filterOrders: handler }, async (h) => {
      const res = await authedInject(h.app, 'GET', '/fulfillment/orders/export.csv', undefined, 'Coordinator');
      expect(res.statusCode).toBe(503);
      expect(res.headers['content-type']).not.toContain('text/csv');
      expect((res.body as { code?: string }).code).toBe('UPSTREAM_UNAVAILABLE');
    });
  });
});
