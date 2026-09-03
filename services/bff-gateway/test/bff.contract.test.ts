/**
 * Contract test harness (Task 8, spec §3.1 ACCEPTANCE): assert envelope shape,
 * 422 details khi INVALID_ARGUMENT, 503 UPSTREAM_UNAVAILABLE khi upstream
 * down/deadline, 401 JWT, print application/pdf, x-user-role metadata.
 * 1+ test per CLASS hành vi (parametrize theo behavior, không per-endpoint).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { startHarness, signTestToken, invalidArgument, mockGrpcError, generateSecondIdentity, TEST_ISSUER, TEST_AUDIENCE } from './harness.js';
import type { Harness } from './harness.js';
import { staffAreaResponses } from './fixtures.js';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

describe('Task 5 — bootstrap: JWT guard + public /healthz', () => {
  it('GET /healthz public — không cần token', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('401 khi thiếu Authorization header (error envelope)', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/master-data/regions' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.statusCode).toBe(401);
    expect(body.code).toBe('UNAUTHENTICATED');
    expect(typeof body.message).toBe('string');
  });

  it('401 khi token không verify được (alg sai / ký bằng key lạ)', async () => {
    const forged = await new SignJWT({ role: 'Manager' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('attacker')
      .sign(new TextEncoder().encode('wrong-secret'));
    const res = await h.app.inject({
      method: 'GET',
      url: '/master-data/regions',
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });
});

describe('Task 6 — pagination envelope + gRPC status mapping', () => {
  it('list response wrap { items, total, page, pageSize } + DTO field mapping', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/filter',
      payload: { page: 1, pageSize: 20 },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expect(body.total).toBe(27);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    const item = body.items[0];
    // DTO camelCase §4 — KHÔNG leak tên proto (fulfill_code / is_debt...).
    expect(item.fulfillCode).toBe('ORD-3001');
    expect(item.shopAssignment.shopCode).toBe('30201');
    expect(item.codAmount).toBe(1850000);
    expect(item.isDebtSplittingOrder).toBe(false);
    expect(item.batchStatus).toBe(0);
  });

  it('INVALID_ARGUMENT + metadata details → 422 + details[] per-field', async () => {
    h.fulfillment.override({
      listRegions: (_call, cb) =>
        cb(
          invalidArgument([
            { field: 'orderCodes', message: 'đơn không cùng kho' },
            { field: 'toShopCode', message: 'kho đích không tồn tại' },
          ]),
        ),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/master-data/regions',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.statusCode).toBe(422);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([
      { field: 'orderCodes', message: 'đơn không cùng kho' },
      { field: 'toShopCode', message: 'kho đích không tồn tại' },
    ]);
  });

  it('upstream UNAVAILABLE → 503 + code UPSTREAM_UNAVAILABLE + tên service', async () => {
    h.batching.override({
      filterBatches: (_call, cb) =>
        cb(mockGrpcError(14, 'connection refused')) /* 14 = UNAVAILABLE */,
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/batches/filter',
      payload: { page: 1, pageSize: 20 },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.message).toContain('batching-service');
  });

  it('upstream vượt deadline → 503 UPSTREAM_UNAVAILABLE (deadline thật, 300ms)', async () => {
    await h.closeAll();
    h = await startHarness({ deadlineMs: 300 });
    h.batching.override({
      packingSuggest: (_call, cb) => {
        // Ngủ 1500ms > deadline 300ms → client DEADLINE_EXCEEDED.
        const t = setTimeout(() => cb(null, { groups: [] }), 1500);
        void t;
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/batches/packing-suggest',
      payload: { orderCodes: ['ORD-3001'] },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.message).toContain('batching-service');
  });

  it('upstream chết (conn refused thật) → 503 UPSTREAM_UNAVAILABLE', async () => {
    await h.closeAll();
    h = await startHarness({ deadUpstream: 'fulfillment' });
    const res = await h.app.inject({
      method: 'GET',
      url: '/master-data/shops',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.message).toContain('fulfillment-service');
  });

  it('NOT_FOUND upstream → 404 envelope', async () => {
    h.batching.override({
      getBatchDetail: (_call, cb) => cb(mockGrpcError(5, 'Batch BAT-404 not found.')),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/batches/BAT-404',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});

describe('Task 7 — semantics + print PDF bytes', () => {
  it('GET /fulfillment/:fulfillCode — OrderDetail + history aggregation (Promise.all)', async () => {
    // Mock mặc định: GetOrderDetail → fixtureOrder, GetAssignHistory → 1 entry.
    // Aggregation cả 2 call xảy ra (route dùng Promise.all) — assert shape cuối.
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/ORD-3001',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // OrderDetail = HubStoreOrderFilterItem §4 + orderCode + note + history.
    expect(body.fulfillCode).toBe('ORD-3001');
    expect(body.shopAssignment.shopCode).toBe('30201');
    expect(body.codAmount).toBe(1850000);
    // GAP documented (README): proto detail không mang orderCode → "".
    expect(body.orderCode).toBe('');
    expect(body.note).toBe('');
    // history[] aggregate từ GetAssignHistory, mapped qua mapHistoryEntry.
    expect(body.history).toHaveLength(1);
    expect(body.history[0]).toMatchObject({
      timestamp: '2026-08-30T10:00:00+07:00',
      action: 'ASSIGN_SHOP_HUB',
      fromShopCode: '30201',
      toShopCode: '30202',
      actor: 'admin',
    });
  });

  it('GET /fulfillment/:fulfillCode — order không tồn tại → 404 envelope NOT_FOUND', async () => {
    // Detail response rỗng (order absent — proto3 message field unset).
    h.fulfillment.override({
      getOrderDetail: (_call, cb) => cb(null, {}),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/ORD-KHONG-TON-TAI',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toContain('ORD-KHONG-TON-TAI');
  });

  it('POST /fulfillment/:code/history = READ — trả mảng lịch sử, không mutate', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/ORD-3001/history',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      timestamp: '2026-08-30T10:00:00+07:00',
      action: 'ASSIGN_SHOP_HUB',
      fromShopCode: '30201',
      toShopCode: '30202',
      actor: 'admin',
    });
  });

  it('GET /fulfillment/batches/criteria KHÔNG bị route :code nuốt', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/batches/criteria',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ cancellableStatuses: [0] });
  });

  it('POST /fulfillment/print → application/pdf bytes (KHÔNG JSON envelope) + x-user-role metadata', async () => {
    let capturedRole: string | undefined;
    let capturedPrintType: number | undefined;
    h.print.override({
      print: (call, cb) => {
        capturedRole = call.metadata.get('x-user-role')[0] as string;
        capturedPrintType = (call.request as { printType: number }).printType;
        cb(null, { pdfContent: new TextEncoder().encode('%PDF-1.4 test-pdf-bytes') });
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/print',
      payload: { batchCode: 'BAT-1001', printType: 'bill', printerId: 'P-30201-01' },
      headers: { authorization: `Bearer ${await signTestToken('Manager')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    expect(res.rawPayload.toString()).toContain('test-pdf-bytes');
    // spec §3.9: gRPC metadata truyền x-user-role; printType 'bill' → proto 1.
    expect(capturedRole).toBe('Manager');
    expect(capturedPrintType).toBe(1);
  });

  it('POST /fulfillment/print với printType lạ → 422 + details [field printType]', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/print',
      payload: { batchCode: 'BAT-1001', printType: 'printAll', printerId: 'P' },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().details[0].field).toBe('printType');
  });

  it('POST /fulfillment/print với batch không tồn tại → 404 NOT_FOUND (không 422)', async () => {
    // Hydration rỗng — batching GetBatchDetail trả {} (batch absent).
    h.batching.override({
      getBatchDetail: (_call, cb) => cb(null, {}),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/print',
      payload: { batchCode: 'BAT-KHONG-TON-TAI', printType: 'bill', printerId: 'P' },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.statusCode).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toContain('BAT-KHONG-TON-TAI');
  });

  it('malformed JSON body → error envelope (không crash HTML error)', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/fulfillment/filter',
      payload: '{not-json',
      headers: {
        authorization: `Bearer ${await signTestToken()}`,
        'content-type': 'application/json',
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.statusCode).toBe(400);
  });

  it('401 khi token chỉ có role ngoài KNOWN_ROLES (SF-4 realm role map)', async () => {
    const token = await signTestToken('STAFF', 'u1');
    const res = await h.app.inject({
      method: 'GET',
      url: '/master-data/regions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });

  it('WarehouseEmployee (SF-18) nằm trong KNOWN_ROLES → guard cho qua', async () => {
    const token = await signTestToken('WarehouseEmployee', 'warehouse-emp');
    const res = await h.app.inject({
      method: 'GET',
      url: '/master-data/regions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('JWKS refetch khi gặp unknown kid (SF-4): key mới thêm → token verify 200', async () => {
    // Ký bằng keypair-2 CHƯA có trong JWKS → 401 (kid lạ).
    const second = await generateSecondIdentity();
    const token = await new SignJWT({
      realm_access: { roles: ['Coordinator'] },
      preferred_username: 'kid-tester',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-kid-2' })
      .setSubject('kid-tester')
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(second.privateKey);
    const before = await h.app.inject({
      method: 'GET',
      url: '/master-data/regions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(before.statusCode).toBe(401);
    // JWKS thêm key-2 (mô phỏng Keycloak rotate key) → cùng token verify 200.
    h.identity.addKey(second.jwk);
    // cooldown JWKS refetch 100ms (auth.ts) — chờ đủ trước khi retry.
    await new Promise((r) => setTimeout(r, 150));
    const after = await h.app.inject({
      method: 'GET',
      url: '/master-data/regions',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(200);
  });
});

describe('SF-9 — GET /fulfillment/dashboard-stats (BFF owns aggregation)', () => {
  it('merge 3 upstream — delivering/completed/cancelled theo batch status + workload map shipper (staff 0 đơn, bucket Chưa gán)', async () => {
    // BAT-1001 S-01 ACTIVE(0) 2 đơn; BAT-1002 S-02 COMPLETED(1) 1 đơn;
    // BAT-1003 shipper lạ CANCELLED(2) 2 đơn — S-02 có mặt trong staff, 0 đơn.
    h.fulfillment.override({
      getDashboardStats: (_c, cb) =>
        cb(null, {
          ordersPerDay: [{ date: '2026-09-01', count: 3 }],
          totalToday: 4,
          pendingApproval: 5,
          ordersPerBatch: [
            { batchCode: 'BAT-1001', count: 2 },
            { batchCode: 'BAT-1002', count: 1 },
            { batchCode: 'BAT-1003', count: 2 },
          ],
        }),
      listDeliveryStaff: (_c, cb) =>
        cb(null, {
          items: [
            { id: 'S-01', name: 'Nguyễn Ship', shopCode: '30201' },
            { id: 'S-02', name: 'Trần Một', shopCode: '30201' },
            { id: 'S-03', name: 'Trần Zero', shopCode: '30201' },
          ],
        }),
    });
    h.batching.override({
      filterBatches: (_c, cb) =>
        cb(null, {
          items: [
            { batchCode: 'BAT-1001', shipperId: 'S-01', status: 0, items: [], createdAt: '' },
            { batchCode: 'BAT-1002', shipperId: 'S-02', status: 1, items: [], createdAt: '' },
            { batchCode: 'BAT-1003', shipperId: 'S-GHOST', status: 2, items: [], createdAt: '' },
          ],
          total: 3,
          page: 1,
          pageSize: 100,
        }),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/dashboard-stats',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ordersPerDay).toEqual([{ date: '2026-09-01', count: 3 }]);
    expect(body.totalToday).toBe(4);
    expect(body.pendingApproval).toBe(5);
    expect(body.delivering).toBe(2);
    expect(body.completed).toBe(1);
    expect(body.cancelled).toBe(2);
    // rates: decided=3 → round(1/3*100)=33, round(2/3*100)=67.
    expect(body.completionRate).toBe(33);
    expect(body.cancelRate).toBe(67);
    expect(body.totalBatches).toBe(3);
    // workload: staff map theo shipper (đếm mọi phiếu kể cả COMPLETED),
    // staff không có phiếu nào → orderCount 0, shipper lạ → bucket "Chưa gán".
    expect(body.workload).toEqual([
      { staffId: 'S-01', name: 'Nguyễn Ship', orderCount: 2 },
      { staffId: 'S-02', name: 'Trần Một', orderCount: 1 },
      { staffId: 'S-03', name: 'Trần Zero', orderCount: 0 },
      { staffId: '', name: 'Chưa gán', orderCount: 2 },
    ]);
  });

  it('decided=0 → rates 0; mọi đơn vào staff đã biết → KHÔNG bucket Chưa gán', async () => {
    // Fixture mặc định: BAT-1001 (S-01, status 0) 2 đơn — hết staff đã biết.
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/dashboard-stats',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.delivering).toBe(2);
    expect(body.completed).toBe(0);
    expect(body.cancelled).toBe(0);
    expect(body.completionRate).toBe(0);
    expect(body.cancelRate).toBe(0);
    expect(body.totalBatches).toBe(5);
    expect(body.workload).toEqual([{ staffId: 'S-01', name: 'Nguyễn Ship', orderCount: 2 }]);
  });

  it('stats upstream UNAVAILABLE → 503 UPSTREAM_UNAVAILABLE + tên fulfillment-service', async () => {
    h.fulfillment.override({
      getDashboardStats: (_c, cb) => cb(mockGrpcError(14, 'connection refused')),
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/dashboard-stats',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.message).toContain('fulfillment-service');
  });
});

describe('SF-17 Task 7 — Admin role gate trên 4 write routes /service-employees', () => {
  const WRITE_ROUTES = [
    {
      method: 'POST' as const,
      url: '/service-employees',
      payload: {
        employeeCode: 'NV-403',
        fullName: 'Nguyễn Bị Chặn',
        titleCode: 'SHIPPER',
        paymentAccount: '1234567890',
      },
    },
    {
      method: 'PUT' as const,
      url: '/service-employees/NV-001',
      payload: { fullName: 'Sửa', titleCode: 'SHIPPER', paymentAccount: '1234567890' },
    },
    {
      method: 'PUT' as const,
      url: '/service-employees/NV-001/active',
      payload: { active: false },
    },
    {
      method: 'POST' as const,
      url: '/service-employees/payment-account/verify',
      payload: { paymentAccount: '1234567890' },
    },
  ];

  it('Coordinator gọi 4 write routes → 403 error envelope code FORBIDDEN (không chạm gRPC)', async () => {
    for (const route of WRITE_ROUTES) {
      const res = await h.app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
        headers: { authorization: `Bearer ${await signTestToken('Coordinator')}` },
      });
      expect(res.statusCode, route.url).toBe(403);
      const body = res.json();
      expect(body.statusCode).toBe(403);
      expect(body.code).toBe('FORBIDDEN');
      expect(typeof body.message).toBe('string');
    }
  });

  it('Admin pass-through: POST create chạm mock gRPC + metadata x-user-role Admin', async () => {
    let capturedRole: string | undefined;
    let capturedCode: string | undefined;
    h.fulfillment.override({
      createServiceEmployee: (call, cb) => {
        capturedRole = call.metadata.get('x-user-role')[0] as string;
        capturedCode = (call.request as { employee?: { employeeCode?: string } }).employee
          ?.employeeCode;
        cb(null, staffAreaResponses.createServiceEmployee);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-employees',
      payload: {
        employeeCode: 'NV-001',
        fullName: 'Nguyễn Nhân Viên',
        titleCode: 'SHIPPER',
        paymentAccount: '1234567890',
        regionCodes: ['HNI'],
      },
      headers: { authorization: `Bearer ${await signTestToken('Admin', 'admin-tester')}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ employeeCode: 'NV-001', isActive: true });
    expect(capturedRole).toBe('Admin');
    expect(capturedCode).toBe('NV-001');
  });

  it('Admin verify TK 200 + GET list với Coordinator vẫn 200 (read any-authenticated)', async () => {
    const verify = await h.app.inject({
      method: 'POST',
      url: '/service-employees/payment-account/verify',
      payload: { paymentAccount: '1234567890' },
      headers: { authorization: `Bearer ${await signTestToken('Admin')}` },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toEqual({ valid: true, source: 'MOCK', message: '[MOCK] Số TK hợp lệ.' });

    const list = await h.app.inject({
      method: 'GET',
      url: '/service-employees',
      headers: { authorization: `Bearer ${await signTestToken('Coordinator')}` },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(Object.keys(body).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expect(body.items[0]).toMatchObject({ employeeCode: 'NV-001', fullName: 'Nguyễn Nhân Viên' });
  });
});
