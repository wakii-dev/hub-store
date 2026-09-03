/**
 * SF-19 TechService contract tests (plan Task 7 Step 5): 401 guard, filter
 * envelopes + buttons camelCase, timeline parse, assign gRPC args + status
 * mapping (FAILED_PRECONDITION → 409 CONFLICT, INVALID_ARGUMENT → 422,
 * NOT_FOUND → 404), suggest, upstream chết → 503.
 * 1+ test per CLASS hành vi (pattern bff.contract.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { status as GrpcStatus } from '@grpc/grpc-js';
import { startHarness, signTestToken, invalidArgument, mockGrpcError } from './harness.js';
import type { Harness } from './harness.js';
import { fixtureTechInstallationOrder, techResponses } from './fixtures.js';
import { DeliveryStatus } from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';
import type {
  FilterDeliveryOrdersRequest,
  FilterInstallationOrdersRequest,
  AssignTechnicianRequest,
  AcceptOrderRequest,
  CompleteOrderRequest,
  RescheduleOrderRequest,
  SuggestTechniciansRequest,
} from '../../../api/proto/gen/ts/hubstore/fulfillment/v1/tech_service';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

const auth = async () => ({ authorization: `Bearer ${await signTestToken()}` });

describe('SF-19 — auth guard', () => {
  it('401 khi thiếu token (POST /delivery-orders/filter)', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/delivery-orders/filter', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHENTICATED');
  });
});

describe('SF-19 — POST /delivery-orders/filter', () => {
  it('200 paginated envelope + buttons camelCase + status string', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-orders/filter',
      payload: {},
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    expect(body.total).toBe(10);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
    const item = body.items[0];
    expect(item.code).toBe('TD-0001');
    expect(item.status).toBe('SHIPPING');
    // Buttons BE-authoritative — camelCase, không leak snake_case proto.
    expect(item.buttons).toEqual({
      allowCancel: true,
      allowAssign: false,
      allowReassign: false,
      allowAccept: false,
      allowReschedule: false,
      allowComplete: false,
    });
    expect(item.receiver.name).toBe('Nguyễn Văn A');
    // coordination JSONB passthrough → parsed object.
    expect(item.coordination).toEqual({ note: 'Gọi trước khi giao' });
  });

  it('mock nhận đúng gRPC args (statuses string→enum, driverName, phân trang)', async () => {
    let captured: FilterDeliveryOrdersRequest | undefined;
    h.tech.override({
      filterDeliveryOrders: (call, cb) => {
        captured = call.request as FilterDeliveryOrdersRequest;
        cb(null, techResponses.filterDeliveryOrders);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-orders/filter',
      payload: { statuses: ['SHIPPING', 'NEW'], driverName: 'Trần', page: 2, pageSize: 5 },
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(captured?.statuses).toEqual([
      DeliveryStatus.DELIVERY_STATUS_SHIPPING,
      DeliveryStatus.DELIVERY_STATUS_NEW,
    ]);
    expect(captured?.driverName).toBe('Trần');
    expect(captured?.page).toBe(2);
    expect(captured?.pageSize).toBe(5);
  });
});

describe('SF-19 — POST /service-orders/filter', () => {
  it('200 + timeline parse JSON thành array', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/filter',
      payload: {},
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(8);
    const item = body.items[0];
    expect(item.serviceOrderCode).toBe('SO-0001');
    expect(Array.isArray(item.timeline)).toBe(true);
    expect(item.timeline).toHaveLength(2);
    // Spec §3.2: timeline = [{at, status, note, actor}].
    expect(item.timeline[0]).toMatchObject({
      at: '2026-09-01T10:00:00+07:00',
      status: 'NEW',
      note: 'Tạo đơn lắp đặt SO-0001',
      actor: 'system',
    });
  });

  it('timeline JSON lỗi → fallback raw string (không crash)', async () => {
    h.tech.override({
      filterInstallationOrders: (call, cb) =>
        cb(null, {
          ...techResponses.filterInstallationOrders,
          items: [{ ...fixtureTechInstallationOrder, timelineJson: '{không-phải-json' }],
        }),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/filter',
      payload: {},
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].timeline).toBe('{không-phải-json');
  });

  it('mock nhận đúng gRPC args (technicianCode filter)', async () => {
    let captured: FilterInstallationOrdersRequest | undefined;
    h.tech.override({
      filterInstallationOrders: (call, cb) => {
        captured = call.request as FilterInstallationOrdersRequest;
        cb(null, techResponses.filterInstallationOrders);
      },
    });
    await h.app.inject({
      method: 'POST',
      url: '/service-orders/filter',
      payload: { technicianCode: 'KTV-001', statuses: ['CONFIRMED'] },
      headers: await auth(),
    });
    expect(captured?.technicianCode).toBe('KTV-001');
    expect(captured?.statuses).toEqual([DeliveryStatus.DELIVERY_STATUS_CONFIRMED]);
  });

  // SF-25: allowComplete passthrough — PROCESSING order → flag true nguyên vẹn
  // qua mapper (T2-review P1: đường true phải được exercise, không chỉ false).
  it('SF-25 — allowComplete=true passthrough cho PROCESSING order', async () => {
    h.tech.override({
      filterInstallationOrders: (call, cb) =>
        cb(null, {
          ...techResponses.filterInstallationOrders,
          items: [
            {
              ...fixtureTechInstallationOrder,
              status: DeliveryStatus.DELIVERY_STATUS_PROCESSING,
              buttons: {
                allowCancel: true,
                allowAssign: false,
                allowReassign: true,
                allowAccept: false,
                allowReschedule: true,
                allowComplete: true,
              },
            },
          ],
        }),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/filter',
      payload: {},
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].buttons).toEqual({
      allowCancel: true,
      allowAssign: false,
      allowReassign: true,
      allowAccept: false,
      allowReschedule: true,
      allowComplete: true,
    });
  });
});

describe('SF-19 — POST /service-orders/:code/assign', () => {
  it('200 happy path — { order } + gRPC args đúng', async () => {
    let captured: AssignTechnicianRequest | undefined;
    h.tech.override({
      assignTechnician: (call, cb) => {
        captured = call.request as AssignTechnicianRequest;
        cb(null, techResponses.assignTechnician);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0001/assign',
      payload: { technicianCode: 'KTV-001' },
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.order.serviceOrderCode).toBe('SO-0001');
    expect(body.order.technicianCode).toBe('KTV-001');
    expect(body.order.buttons.allowReassign).toBe(true);
    expect(captured).toEqual({ serviceOrderCode: 'SO-0001', technicianCode: 'KTV-001' });
  });

  it('technicianCode blank → 422 BFF-side (không gọi upstream)', async () => {
    let called = false;
    h.tech.override({
      assignTechnician: (_call, cb) => {
        called = true;
        cb(null, techResponses.assignTechnician);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0001/assign',
      payload: { technicianCode: '  ' },
      headers: await auth(),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('VALIDATION_ERROR');
    expect(res.json().details).toEqual([
      { field: 'technicianCode', message: 'technicianCode is required.' },
    ]);
    expect(called).toBe(false);
  });

  it('FAILED_PRECONDITION (trạng thái sai) → 409 CONFLICT', async () => {
    h.tech.override({
      assignTechnician: (_call, cb) =>
        cb(mockGrpcError(GrpcStatus.FAILED_PRECONDITION, 'Order SO-0009 is DELIVERED.')),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0009/assign',
      payload: { technicianCode: 'KTV-001' },
      headers: await auth(),
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.statusCode).toBe(409);
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toContain('DELIVERED');
  });

  it('INVALID_ARGUMENT + metadata details → 422 + details[] per-field', async () => {
    h.tech.override({
      assignTechnician: (_call, cb) =>
        cb(
          invalidArgument([
            { field: 'technicianCode', message: 'KTV không tồn tại' },
          ]),
        ),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0001/assign',
      payload: { technicianCode: 'KTV-999' },
      headers: await auth(),
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual([{ field: 'technicianCode', message: 'KTV không tồn tại' }]);
  });

  it('NOT_FOUND (SO lạ) → 404', async () => {
    h.tech.override({
      assignTechnician: (_call, cb) =>
        cb(mockGrpcError(GrpcStatus.NOT_FOUND, 'Service order SO-404 not found.')),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-404/assign',
      payload: { technicianCode: 'KTV-001' },
      headers: await auth(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });
});

describe('SF-19 — GET /technicians/suggest', () => {
  it('200 items + activeCount mapping', async () => {
    let captured: SuggestTechniciansRequest | undefined;
    h.tech.override({
      suggestTechnicians: (call, cb) => {
        captured = call.request as SuggestTechniciansRequest;
        cb(null, techResponses.suggestTechnicians);
      },
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/technicians/suggest?regionCode=R1',
      headers: await auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([
      { code: 'KTV-001', name: 'Lê Kỹ Thuật', type: 'KTV', activeCount: 1 },
      { code: 'KTV-002', name: 'Phạm Lắp Đặt', type: 'KTV', activeCount: 3 },
    ]);
    expect(captured?.regionCode).toBe('R1');
  });

  it('regionCode blank → 422 BFF-side', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/technicians/suggest',
      headers: await auth(),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});

describe('SF-25 — accept/complete/reschedule + read-side override', () => {
  const techAuth = async (role = 'InsideTechnician', sub = 'KTV-001') => ({
    authorization: `Bearer ${await signTestToken(role, sub)}`,
  });

  it('accept 200 — { order } + gRPC args đúng (role InsideTechnician)', async () => {
    let captured: AcceptOrderRequest | undefined;
    h.tech.override({
      acceptOrder: (call, cb) => {
        captured = call.request as AcceptOrderRequest;
        cb(null, techResponses.acceptOrder);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0006/accept',
      payload: { technicianCode: 'KTV-001' },
      headers: await techAuth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().order.serviceOrderCode).toBe('SO-0001'); // fixture order
    expect(captured).toEqual({ serviceOrderCode: 'SO-0006', technicianCode: 'KTV-001' });
  });

  it('accept role không phải KTV/CTV → 403 (không gọi upstream)', async () => {
    let called = false;
    h.tech.override({
      acceptOrder: (_call, cb) => {
        called = true;
        cb(null, techResponses.acceptOrder);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0006/accept',
      payload: { technicianCode: 'KTV-001' },
      headers: await techAuth('Manager'),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PERMISSION_DENIED');
    expect(called).toBe(false);
  });

  it('accept — technicianCode ÉP từ token sub (body bị ignore — security P0-1)', async () => {
    let captured: AcceptOrderRequest | undefined;
    h.tech.override({
      acceptOrder: (call, cb) => {
        captured = call.request as AcceptOrderRequest;
        cb(null, techResponses.acceptOrder);
      },
    });
    // KTV-001 cố mutate đơn của CTV-001 qua body → BFF ép về token sub.
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0007/accept',
      payload: { technicianCode: 'CTV-001' },
      headers: await techAuth('InsideTechnician', 'KTV-001'),
    });
    expect(res.statusCode).toBe(200);
    expect(captured).toEqual({ serviceOrderCode: 'SO-0007', technicianCode: 'KTV-001' });
  });

  it('complete 200 + FAILED_PRECONDITION → 409 CONFLICT', async () => {
    let captured: CompleteOrderRequest | undefined;
    h.tech.override({
      completeOrder: (call, cb) => {
        captured = call.request as CompleteOrderRequest;
        cb(null, techResponses.completeOrder);
      },
    });
    const ok = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0004/complete',
      payload: { technicianCode: 'KTV-001' },
      headers: await techAuth('OutsideTechnician', 'CTV-001'),
    });
    expect(ok.statusCode).toBe(200);
    // Security P0-1: technicianCode ÉP = token sub 'CTV-001' (body 'KTV-001' bị ignore).
    expect(captured).toEqual({ serviceOrderCode: 'SO-0004', technicianCode: 'CTV-001' });

    h.tech.override({
      completeOrder: (_call, cb) =>
        cb(mockGrpcError(GrpcStatus.FAILED_PRECONDITION, 'Order SO-0004 is CONFIRMED.')),
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0004/complete',
      payload: { technicianCode: 'KTV-001' },
      headers: await techAuth(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('CONFLICT');
  });

  it('reschedule 200 — gRPC args đủ (newExpectedTime + note)', async () => {
    let captured: RescheduleOrderRequest | undefined;
    h.tech.override({
      rescheduleOrder: (call, cb) => {
        captured = call.request as RescheduleOrderRequest;
        cb(null, techResponses.rescheduleOrder);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0004/reschedule',
      payload: {
        technicianCode: 'KTV-001',
        expectedTime: '2026-09-04T09:00:00+07:00',
        note: 'Khách xin dời',
      },
      headers: await techAuth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().order.status).toBe('CONFIRMED'); // fixture status → string
    expect(captured).toEqual({
      serviceOrderCode: 'SO-0004',
      newExpectedTime: '2026-09-04T09:00:00+07:00',
      note: 'Khách xin dời',
      technicianCode: 'KTV-001',
    });
  });

  it('reschedule thiếu expectedTime → 422; SO lạ → 404', async () => {
    const missing = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0004/reschedule',
      payload: { technicianCode: 'KTV-001' },
      headers: await techAuth(),
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().details).toEqual([
      { field: 'expectedTime', message: 'expectedTime is required.' },
    ]);

    h.tech.override({
      rescheduleOrder: (_call, cb) =>
        cb(mockGrpcError(GrpcStatus.NOT_FOUND, 'Order SO-404 not found.')),
    });
    const notFound = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-404/reschedule',
      payload: {
        technicianCode: 'KTV-001',
        expectedTime: '2026-09-04T09:00:00+07:00',
      },
      headers: await techAuth(),
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json().code).toBe('NOT_FOUND');
  });

  it('read-side override: InsideTechnician filter → technicianCode ép từ token sub', async () => {
    let captured: FilterInstallationOrdersRequest | undefined;
    h.tech.override({
      filterInstallationOrders: (call, cb) => {
        captured = call.request as FilterInstallationOrdersRequest;
        cb(null, techResponses.filterInstallationOrders);
      },
    });
    await h.app.inject({
      method: 'POST',
      url: '/service-orders/filter',
      payload: { technicianCode: 'KTV-999' },
      headers: await techAuth('InsideTechnician', 'KTV-001'),
    });
    expect(captured?.technicianCode).toBe('KTV-001');
    // Role khác (Manager desktop) — giữ body nguyên.
    await h.app.inject({
      method: 'POST',
      url: '/service-orders/filter',
      payload: { technicianCode: 'KTV-002' },
      headers: await techAuth('Manager'),
    });
    expect(captured?.technicianCode).toBe('KTV-002');
  });

  // Security-audit P1-2: delivery filter — KTV/CTV → driverName ép = token name
  // claim (fail-closed 403 khi thiếu); role khác giữ body.
  it('read-side override: technician delivery filter → driverName ép từ token name', async () => {
    let captured: FilterDeliveryOrdersRequest | undefined;
    h.tech.override({
      filterDeliveryOrders: (call, cb) => {
        captured = call.request as FilterDeliveryOrdersRequest;
        cb(null, techResponses.filterDeliveryOrders);
      },
    });
    const techAuthNamed = async (role = 'InsideTechnician', sub = 'KTV-001') => ({
      authorization: `Bearer ${await signTestToken(role, sub, 'Nguyễn Văn An')}`,
    });
    await h.app.inject({
      method: 'POST',
      url: '/delivery-orders/filter',
      payload: { driverName: 'Ai đó khác' },
      headers: await techAuthNamed(),
    });
    expect(captured?.driverName).toBe('Nguyễn Văn An');

    // Fail-closed: token technician thiếu name → 403 (không filter-all).
    h.tech.override({
      filterDeliveryOrders: (call, cb) => {
        captured = call.request as FilterDeliveryOrdersRequest;
        cb(null, techResponses.filterDeliveryOrders);
      },
    });
    const noName = await h.app.inject({
      method: 'POST',
      url: '/delivery-orders/filter',
      payload: { driverName: 'Ai đó khác' },
      headers: await techAuth(),
    });
    expect(noName.statusCode).toBe(403);
    expect(noName.json().code).toBe('PERMISSION_DENIED');
  });

  // Security-audit P1-3: assign — KTV/CTV không được reassign (staff-only).
  it('assign role KTV/CTV → 403 (không gọi upstream)', async () => {
    let called = false;
    h.tech.override({
      assignTechnician: (_call, cb) => {
        called = true;
        cb(null, techResponses.assignTechnician);
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/service-orders/SO-0001/assign',
      payload: { technicianCode: 'KTV-002' },
      headers: await techAuth(),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PERMISSION_DENIED');
    expect(called).toBe(false);
  });
});

describe('SF-19 — resilience', () => {
  it('upstream chết (conn refused) → 503 UPSTREAM_UNAVAILABLE + tên service', async () => {
    await h.closeAll();
    h = await startHarness({ deadUpstream: 'fulfillment' }); // tech chung addr fulfillment
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-orders/filter',
      payload: {},
      headers: await auth(),
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(body.message).toContain('fulfillment-service');
  });
});
