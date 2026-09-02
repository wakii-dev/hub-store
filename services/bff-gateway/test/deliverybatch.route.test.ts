/**
 * Contract test SF-15 — /delivery-batch/* routes (spec §3.6): shape từng route,
 * mapping REST↔proto (distance→distanceKm, driver join), planningIds comma
 * parse, meta.mock passthrough, fee-limit FailedPrecondition → 422.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { status } from '@grpc/grpc-js';
import type { ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import { startHarness, signTestToken, mockGrpcError } from './harness.js';
import type { Harness } from './harness.js';

let h: Harness;

/** Bắt request BFF gửi lên mock upstream (assert mapping REST→proto). */
let captured: unknown;
const noteRequest = (v: unknown) => {
  captured = v;
};

type AnyHandler = (call: ServerUnaryCall<any, any>, cb: sendUnaryData<any>) => void;

function captureThenRespond(
  response: Record<string, unknown>,
  onReq: (v: unknown) => void = noteRequest,
): AnyHandler {
  return (call, cb) => {
    onReq(call.request);
    cb(null, response);
  };
}

beforeEach(async () => {
  captured = undefined;
  h = await startHarness();
});

afterEach(async () => {
  await h.closeAll();
});

describe('SF-15 — /delivery-batch/quotes', () => {
  it('shape quotes + addonServices + meta.mock passthrough', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/quotes',
      payload: {
        shopCode: '30201',
        stopOrders: [{ address: 'Số 1 Trịnh Văn Bô', distance: 4.2, codAmount: 1850000, totalBill: 2000000 }],
      },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toEqual({ mock: true });
    expect(body.quotes).toHaveLength(2);
    expect(body.quotes[0]).toMatchObject({
      serviceId: 'SGCN',
      name: 'Xe máy',
      vehicleType: 'SGCN',
      fee: 74600,
      baseFee: 20000,
      etaMinutes: 60,
      isExceedFeeLimit: false,
    });
    expect(body.quotes[0].addonServices[0]).toEqual({
      code: 'LOADING',
      name: 'Bốc xếp',
      grp: 'LOADING',
      fee: 50000,
    });
    expect(body.quotes[1].isExceedFeeLimit).toBe(true);
  });

  it('REST distance → proto distanceKm — assert request upstream nhận', async () => {
    await h.closeAll();
    captured = undefined;
    h = await startHarness({
      deliverybatchHandlers: {
        getQuotes: captureThenRespond({ quotes: [], meta: { mock: true } }),
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/quotes',
      payload: {
        shopCode: '30201',
        stopOrders: [{ address: 'A', distance: 4.2, codAmount: 1850000, totalBill: 2000000 }],
      },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const req = captured as { shopCode: string; stopOrders: Array<{ distanceKm: number; codAmount: number }> };
    expect(req.shopCode).toBe('30201');
    expect(req.stopOrders[0].distanceKm).toBe(4.2);
    expect(req.stopOrders[0].codAmount).toBe(1850000);
  });
});

describe('SF-15 — planning/confirm + booking', () => {
  it('confirm → plannings[] planningId string + status CONFIRMED', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/planning/confirm',
      payload: {
        batchCode: 'BAT-1001',
        plannings: [{ stopOrder: 1, orderCode: 'RSA-700101', vehicleType: 'SGCN', serviceId: 'SGCN', addons: ['LOADING'] }],
      },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toEqual({ mock: true });
    expect(body.plannings[0]).toMatchObject({
      planningId: '101',
      batchCode: 'BAT-1001',
      orderCode: 'RSA-700101',
      status: 'CONFIRMED',
      fee: 74600,
      addons: ['LOADING'],
    });
  });

  it('fee-limit FailedPrecondition → 422 PRECONDITION_FAILED (BE chặn confirm)', async () => {
    await h.closeAll();
    h = await startHarness({
      deliverybatchHandlers: {
        confirmPlanning: (_c, cb) => cb(mockGrpcError(status.FAILED_PRECONDITION, 'fee 250000 exceeds limit 150000')),
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/planning/confirm',
      payload: {
        batchCode: 'BAT-1001',
        plannings: [{ stopOrder: 1, orderCode: 'RSA-700101', vehicleType: '8T', serviceId: '8T', addons: [] }],
      },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.code).toBe('PRECONDITION_FAILED');
    expect(body.message).toContain('limit');
    expect(body.details[0]).toMatchObject({ field: 'request' });
  });

  it('booking → driver join "name - phone" + licensePlate + status', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/booking',
      payload: {
        batchCode: 'BAT-1001',
        shipmentPlannings: [{ planningId: '101', codAmount: 1850000, totalBill: 2000000, stopOrder: 1 }],
      },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toEqual({ mock: true });
    expect(body.bookings[0]).toEqual({
      planningId: '101',
      carrierBookingId: 'MOCK-BK-1',
      driver: 'Nguyễn Văn A - 0901234567',
      licensePlate: '29H-123.45',
      status: 'BOOKED',
    });
  });

  it('book trên planning sai trạng thái (FailedPrecondition) → 422', async () => {
    await h.closeAll();
    h = await startHarness({
      deliverybatchHandlers: {
        createBooking: (_c, cb) => cb(mockGrpcError(status.FAILED_PRECONDITION, 'planning not CONFIRMED')),
      },
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/booking',
      payload: { batchCode: 'BAT-1001', shipmentPlannings: [{ planningId: '101', codAmount: 0, totalBill: 0, stopOrder: 1 }] },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('PRECONDITION_FAILED');
  });
});

describe('SF-15 — cancel-delivery-order + cancel-batch', () => {
  it('cancel-delivery-order → { planningId, status } + meta', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/cancel-delivery-order',
      payload: { planningId: '101', reason: 'khách hủy' },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      planningId: '101',
      status: 'CANCELLED',
      meta: { mock: true },
    });
  });

  it('cancel-batch → results[] + cancelledCount + meta', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/delivery-batch/cancel-batch',
      payload: { batchCode: 'BAT-1001', reason: 'hủy lô' },
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.cancelledCount).toBe(1);
    expect(body.results[0]).toEqual({ planningId: '101', status: 'CANCELLED' });
    expect(body.meta).toEqual({ mock: true });
  });
});

describe('SF-15 — searchbookingdetail (GET, comma parse)', () => {
  it('planningIds=a,b comma-split + booking null khi chưa book + timeline mapping', async () => {
    await h.closeAll();
    h = await startHarness({
      deliverybatchHandlers: {
        searchBookingDetail: captureThenRespond(
          {
            bookings: [
              {
                planningId: '101',
                booking: {
                  carrierBookingId: 'MOCK-BK-1',
                  driverName: 'Nguyễn Văn A',
                  driverPhone: '0901234567',
                  licensePlate: '29H-123.45',
                  status: 'BOOKED',
                  bookedAt: '2026-09-01T10:00:00Z',
                  cancelledAt: '',
                  cancelReason: '',
                },
                timeline: [
                  { status: 'BOOKED', source: 'BE', occurredAt: '2026-09-01T10:00:00Z', note: '' },
                ],
              },
              { planningId: '102', booking: undefined, timeline: [] },
            ],
            meta: { mock: true },
          },
        ),
      },
    });
    const res = await h.app.inject({
      method: 'GET',
      url: '/delivery-batch/searchbookingdetail?planningIds=101, 102',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    // comma-split + trim khoảng trắng.
    expect(captured).toEqual({ planningIds: ['101', '102'] });
    const body = res.json();
    expect(body.meta).toEqual({ mock: true });
    expect(body.bookings[0].booking).toMatchObject({ carrierBookingId: 'MOCK-BK-1', status: 'BOOKED' });
    expect(body.bookings[0].timeline[0]).toEqual({
      status: 'BOOKED',
      source: 'BE',
      occurredAt: '2026-09-01T10:00:00Z',
      note: '',
    });
    // planning chưa book → booking=null, timeline=[] (contract SF-16).
    expect(body.bookings[1]).toEqual({ planningId: '102', booking: null, timeline: [] });
  });

  it('query thiếu planningIds → gọi upstream với mảng rỗng (không crash)', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/delivery-batch/searchbookingdetail',
      headers: { authorization: `Bearer ${await signTestToken()}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().bookings).toHaveLength(2);
  });
});
