/**
 * Contract tests SF-13 intake (plan T6): template CSV, preview parse+validate
 * (placeholder row-indexing), confirm 422, manual order, fail/redeliver role
 * gate, audit envelope, by-batch aggregation (hydration T8). Harness pattern
 * bff.contract.test.ts — mock gRPC upstream per test qua override().
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  startHarness,
  signTestToken,
  invalidArgument,
  mockGrpcError,
} from './harness.js';
import type { Harness } from './harness.js';
import { TEMPLATE_HEADERS, templateCsv, parseOrdersFile } from '../src/lib/parseOrdersFile.js';
import type { ValidateImportOrdersRequest } from '../../../api/proto/gen/ts/hubstore/intake/v1/intake';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

const CSV_TEMPLATE =
  'customerName,customerPhone,customerAddress,items,quantity,codAmount,shopHint';

function multipartFile(
  filename: string,
  content: string | Buffer,
  boundary = 'testboundary',
): Buffer {
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: text/csv\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return Buffer.concat([
    Buffer.from(head),
    Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
    Buffer.from(tail),
  ]);
}

async function injectPreview(
  filename: string,
  content: string | Buffer,
  role = 'Coordinator',
): Promise<{ statusCode: number; body: any }> {
  const token = await signTestToken(role);
  const res = await h.app.inject({
    method: 'POST',
    url: '/orders/import/preview',
    payload: multipartFile(filename, content),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'multipart/form-data; boundary=testboundary',
    },
  });
  let body: any = null;
  try {
    body = res.json();
  } catch {
    body = null;
  }
  return { statusCode: res.statusCode, body };
}

describe('SF-13 intake — GET /orders/import/template', () => {
  it('Coordinator — text/csv attachment, header đúng thứ tự template', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/import/template',
      headers: { authorization: `Bearer ${await signTestToken('Coordinator')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('order-import-template.csv');
    expect(res.payload).toBe(templateCsv());
    const headerLine = res.payload.split('\r\n')[0].split(',');
    expect(headerLine).toEqual([...TEMPLATE_HEADERS]);
  });

  it('Manager (sai role) → 403 envelope PERMISSION_DENIED', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/import/template',
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PERMISSION_DENIED');
  });
});

describe('SF-13 intake — POST /orders/import/preview (row-indexing placeholder)', () => {
  it('lỗi validation từ gRPC map đúng {row, column, message}; valid loại row lỗi', async () => {
    const csv = [
      CSV_TEMPLATE,
      'Nguyễn A,0912345678,Hà Nội,SKU1:Sản A:2,2,100000,',
      'Trần B,0987654321,Hải Phòng,SKU2:Sản B:1,1,200000,30201',
    ].join('\r\n');
    h.intake.override({
      validateImportOrders: (_c, cb) =>
        cb(null, {
          errors: [{ row: 1, column: 'customerPhone', message: 'Số điện thoại không hợp lệ.' }],
        }),
    });
    const { statusCode, body } = await injectPreview('orders.csv', csv);
    expect(statusCode).toBe(200);
    expect(body.errors).toEqual([
      { row: 1, column: 'customerPhone', message: 'Số điện thoại không hợp lệ.' },
    ]);
    expect(body.valid).toHaveLength(1);
    expect(body.valid[0]).toMatchObject({
      customerName: 'Trần B',
      quantity: 1,
      codAmount: 200000,
      shopHint: '30201',
    });
  });

  it('mixed parse + validation: row parse-fail giữ vị trí, errors rác của placeholder bị DROP', async () => {
    // row1 ok (lỗi phone từ gRPC), row2 items sai format (parse-fail),
    // row3 ok. Placeholder row2 sinh 4 lỗi rác → phải bị lọc.
    const csv = [
      CSV_TEMPLATE,
      'Nguyễn A,0912345678,Hà Nội,SKU1:Sản A:2,2,100000,',
      'Trần B,0987654321,Hải Phòng,không-có-dấu-hai-chấm,1,200000,',
      'Lê C,0900111222,Đà Nẵng,SKU3:Sản C:1;SKU4:Sản D:2,3,300000,30202',
    ].join('\r\n');
    let captured: ValidateImportOrdersRequest | undefined;
    h.intake.override({
      validateImportOrders: (call, cb) => {
        captured = call.request as ValidateImportOrdersRequest;
        cb(null, {
          errors: [
            { row: 1, column: 'customerPhone', message: 'Số điện thoại không hợp lệ.' },
            // ~4 lỗi rác mà placeholder rỗng row2 sẽ sinh — BFF phải DROP.
            { row: 2, column: 'customerName', message: 'Tên khách không được trống.' },
            { row: 2, column: 'customerPhone', message: 'Số điện thoại không hợp lệ.' },
            { row: 2, column: 'items', message: 'Đơn phải có ít nhất 1 sản phẩm.' },
            { row: 2, column: 'quantity', message: 'Số lượng lệch tổng items.' },
          ],
        });
      },
    });
    const { statusCode, body } = await injectPreview('orders.csv', csv);
    expect(statusCode).toBe(200);
    // Placeholder rỗng vẫn được gửi để GIỮ vị trí 1-based (3 orders).
    expect(captured?.orders).toHaveLength(3);
    expect(captured?.orders[1]).toEqual({
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      items: [],
      quantity: 0,
      codAmount: 0,
      shopHint: '',
    });
    // Chỉ còn 2 lỗi thật: row1 (validation) + row2 (parse items).
    expect(body.errors).toEqual([
      { row: 1, column: 'customerPhone', message: 'Số điện thoại không hợp lệ.' },
      { row: 2, column: 'items', message: 'Sản phẩm không hợp lệ (định dạng SKU:Tên:Số lượng;...).' },
    ]);
    // Chỉ row3 valid.
    expect(body.valid).toHaveLength(1);
    expect(body.valid[0].customerName).toBe('Lê C');
    expect(body.valid[0].items).toEqual([
      { productCode: 'SKU3', productName: 'Sản C', quantity: 1 },
      { productCode: 'SKU4', productName: 'Sản D', quantity: 2 },
    ]);
  });

  it('header cột lạ → lỗi {row:0, column:<tên lạ>} "Cột không hợp lệ"', async () => {
    const csv = 'customerName,customerPhone,cotLa\r\nA,0912,x\r\n';
    const { statusCode, body } = await injectPreview('orders.csv', csv);
    expect(statusCode).toBe(200);
    expect(body.errors).toEqual([
      { row: 0, column: 'codAmount', message: 'Cột không hợp lệ' },
      { row: 0, column: 'cotLa', message: 'Cột không hợp lệ' },
      { row: 0, column: 'customerAddress', message: 'Cột không hợp lệ' },
      { row: 0, column: 'items', message: 'Cột không hợp lệ' },
      { row: 0, column: 'quantity', message: 'Cột không hợp lệ' },
      { row: 0, column: 'shopHint', message: 'Cột không hợp lệ' },
    ]);
    expect(body.valid).toEqual([]);
  });

  it('file .xlsx parse được (sheet đầu, header:1)', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      [...TEMPLATE_HEADERS],
      ['Phạm D', '0911222333', 'Cần Thơ', 'SKU9:Sản X:1', 1, 50000, ''],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const { statusCode, body } = await injectPreview('orders.xlsx', buf);
    expect(statusCode).toBe(200);
    expect(body.errors).toEqual([]);
    expect(body.valid).toHaveLength(1);
    expect(body.valid[0]).toMatchObject({
      customerName: 'Phạm D',
      customerPhone: '0911222333',
      codAmount: 50000,
    });
  });

  it('thiếu file (không multipart) → 422 VALIDATION_ERROR field file', async () => {
    const token = await signTestToken('Coordinator');
    const res = await h.app.inject({
      method: 'POST',
      url: '/orders/import/preview',
      payload: {},
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().details[0].field).toBe('file');
  });
});

describe('SF-13 intake — POST /orders/import/confirm', () => {
  it('200 — trả { fulfillCodes } theo thứ tự upstream', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/orders/import/confirm',
      payload: { orders: [{ customerName: 'A', customerPhone: '0912', customerAddress: 'HN', items: [{ productCode: 'S1', productName: 'P', quantity: 1 }], quantity: 1, codAmount: 1000, shopHint: '' }] },
      headers: { authorization: `Bearer ${await signTestToken('Coordinator')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ fulfillCodes: ['ORD-4001', 'ORD-4002'] });
  });

  it('service INVALID_ARGUMENT (re-validate fail) → 422 VALIDATION_ERROR', async () => {
    h.intake.override({
      confirmImportOrders: (_c, cb) =>
        cb(invalidArgument([{ field: 'orders', message: 'Import có 1 dòng lỗi' }])),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/orders/import/confirm',
      payload: { orders: [] },
      headers: { authorization: `Bearer ${await signTestToken('Coordinator')}` },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details[0].field).toBe('orders');
  });
});

describe('SF-13 intake — POST /orders (tạo đơn tay)', () => {
  it('Coordinator — 201 { fulfillCode } + metadata x-user-name truyền downstream', async () => {
    let capturedActor: string | undefined;
    let capturedRole: string | undefined;
    h.intake.override({
      createManualOrder: (call, cb) => {
        capturedActor = call.metadata.get('x-user-name')[0] as string;
        capturedRole = call.metadata.get('x-user-role')[0] as string;
        cb(null, { fulfillCode: 'ORD-4100' });
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        customerName: 'Nguyễn A',
        customerPhone: '0912345678',
        customerAddress: 'Hà Nội',
        items: [{ productCode: 'S1', productName: 'P', quantity: 2 }],
        quantity: 2,
        codAmount: 100000,
        shopHint: '30201',
      },
      headers: { authorization: `Bearer ${await signTestToken('Coordinator', 'coordinator1')}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ fulfillCode: 'ORD-4100' });
    expect(capturedActor).toBe('coordinator1');
    expect(capturedRole).toBe('Coordinator');
  });
});

describe('SF-13 intake — fail / redeliver (WarehouseOps only)', () => {
  it('fail sai role (Manager) → 403 PERMISSION_DENIED, không gọi upstream', async () => {
    let called = false;
    h.intake.override({
      markOrderFailed: (_c, cb) => {
        called = true;
        cb(null, {});
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/orders/ORD-3001/fail',
      payload: { reason: 0, note: 'khách vắng' },
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PERMISSION_DENIED');
    expect(called).toBe(false);
  });

  it('fail WarehouseOps — 204 rỗng + reason/note truyền đúng', async () => {
    let captured: { code: string; reason: number; note: string } | undefined;
    h.intake.override({
      markOrderFailed: (call, cb) => {
        const req = call.request as { fulfillCode: string; reason: number; note: string };
        captured = { code: req.fulfillCode, reason: req.reason, note: req.note };
        cb(null, {});
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/orders/ORD-3001/fail',
      payload: { reason: 2, note: 'khách từ chối nhận' },
      headers: { authorization: `Bearer ${await signTestToken('WarehouseOps')}` },
    });
    expect(res.statusCode).toBe(204);
    expect(res.payload).toBe('');
    expect(captured).toEqual({ code: 'ORD-3001', reason: 2, note: 'khách từ chối nhận' });
  });

  it('redeliver WarehouseOps — 201 { fulfillCode = newFulfillCode }', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/orders/ORD-3001/redeliver',
      payload: {},
      headers: { authorization: `Bearer ${await signTestToken('WarehouseOps')}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ fulfillCode: 'ORD-9001' });
  });
});

describe('SF-13 intake — GET /orders/:code/audit', () => {
  it('envelope { items } — detail JSONB parse về object', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/ORD-4001/audit',
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual({
      actor: 'coordinator1',
      action: 'order.imported',
      target: 'ORD-4001',
      detail: { importedAt: '2026-09-02T10:00:00+07:00' },
      createdAt: '2026-09-02T10:00:00+07:00',
    });
  });

  it('detail JSON parse fail → detail null (không crash)', async () => {
    h.intake.override({
      getOrderAudit: (_c, cb) =>
        cb(null, {
          entries: [
            {
              actor: 'a',
              action: 'order.failed',
              target: 'ORD-4001',
              detailJson: 'không-phải-json',
              createdAt: '2026-09-02T11:00:00+07:00',
            },
          ],
        }),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/ORD-4001/audit',
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].detail).toBeNull();
  });

  it('code lạ → upstream NOT_FOUND → 404 envelope', async () => {
    h.intake.override({
      getOrderAudit: (_c, cb) => cb(mockGrpcError(5, 'Order ORD-KHONG-TON-TAI not found.')),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/ORD-KHONG-TON-TAI/audit',
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});

describe('SF-13 intake — GET /orders/by-batch/:batchCode (hydration T8)', () => {
  it('BFF owns aggregation: batching detail → getOrdersByCodes → HubStoreOrderFilterItem[]', async () => {
    // Mock mặc định: getBatchDetail → fixtureBatch (orderCode RSA-700101),
    // getOrdersByCodes → [fixtureOrder]. Assert shape cuối (mapOrderItem).
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/by-batch/BAT-1001',
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].fulfillCode).toBe('ORD-3001');
    expect(body[0].shopAssignment.shopCode).toBe('30201');
    expect(body[0].codAmount).toBe(1850000);
  });

  it('codes từ batch items truyền ĐÚNG vào getOrdersByCodes', async () => {
    let capturedCodes: string[] | undefined;
    h.fulfillment.override({
      getOrdersByCodes: (call, cb) => {
        capturedCodes = [...((call.request as { fulfillCodes: string[] }).fulfillCodes)];
        cb(null, { orders: [] });
      },
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/by-batch/BAT-1001',
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(capturedCodes).toEqual(['RSA-700101']);
  });

  it('batch không tồn tại → 404 envelope', async () => {
    h.batching.override({
      getBatchDetail: (_c, cb) => cb(null, {}),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/orders/by-batch/BAT-404',
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
    expect(res.json().message).toContain('BAT-404');
  });
});

describe('SF-13 — parseOrdersFile (unit, không harness)', () => {
  it('templateCsv đúng shape', () => {
    expect(templateCsv()).toBe(CSV_TEMPLATE + '\r\n');
  });

  it('csv quoted field: dấu phẩy trong quotes + "" escape', () => {
    const csv = [
      CSV_TEMPLATE,
      '"Nguyễn, A",0912,"Số 1, Đường 2","SKU1:Sản:1",1,1000,',
    ].join('\r\n');
    const { rows, errors } = parseOrdersFile('f.csv', Buffer.from(csv, 'utf8'));
    expect(errors).toEqual([]);
    expect(rows[0].customerName).toBe('Nguyễn, A');
    expect(rows[0].customerAddress).toBe('Số 1, Đường 2');
    expect(rows[0].ok).toBe(true);
  });

  it('số cột dòng lệch → lỗi row đó + placeholder giữ vị trí', () => {
    const csv = [CSV_TEMPLATE, 'A,0912,HN,SKU1:P:1,1,1000,', 'B,0913'].join('\r\n');
    const { rows, errors } = parseOrdersFile('f.csv', Buffer.from(csv, 'utf8'));
    expect(errors).toEqual([{ row: 2, column: 'customerName', message: 'Số cột không khớp template.' }]);
    expect(rows).toHaveLength(2);
    expect(rows[1].ok).toBe(false);
  });
});
