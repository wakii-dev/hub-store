/**
 * Contract tests SF-28 transfer (plan T1 Step 7, pattern intake.route.test.ts):
 * 403 non-role, 422 tách nợ (upstream INVALID_ARGUMENT), 409 trùng PENDING
 * (upstream ALREADY_EXISTS), happy envelope + metadata x-user-name, GET codes
 * comma → repeated. Harness thật (mock gRPC + JWT) — audit pool bị stub.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  startHarness,
  signTestToken,
  invalidArgument,
  mockGrpcError,
} from './harness.js';
import type { Harness } from './harness.js';
import { __setAuditPoolForTests } from '../src/lib/audit.js';
import type { CreateTransferTicketRequest, ListTransferTicketsRequest } from '../../../api/proto/gen/ts/hubstore/transfer/v1/transfer';

let h: Harness;

beforeEach(async () => {
  h = await startHarness();
});

afterEach(async () => {
  __setAuditPoolForTests(null);
  delete process.env.FULFILLMENT_DB_HOST;
  await h.closeAll();
});

async function injectCreate(
  code: string,
  body: Record<string, unknown>,
  role = 'Coordinator',
): Promise<{ statusCode: number; body: any }> {
  const token = await signTestToken(role);
  const res = await h.app.inject({
    method: 'POST',
    url: `/fulfillment/${code}/transfer-tickets`,
    payload: body,
    headers: { authorization: `Bearer ${token}` },
  });
  let parsed: any = null;
  try {
    parsed = res.json();
  } catch {
    parsed = null;
  }
  return { statusCode: res.statusCode, body: parsed };
}

describe('SF-28 transfer — POST /fulfillment/:code/transfer-tickets', () => {
  it('WarehouseOps (non-role) → 403 PERMISSION_DENIED, không gọi upstream', async () => {
    let called = false;
    h.transfer.override({
      createTransferTicket: (_c, cb) => {
        called = true;
        cb(null, {});
      },
    });
    const { statusCode, body } = await injectCreate('ORD-3001', { toHub: 'Hub Đà Nẵng' }, 'WarehouseOps');
    expect(statusCode).toBe(403);
    expect(body.code).toBe('PERMISSION_DENIED');
    expect(called).toBe(false);
  });

  it('thiếu toHub → 422 VALIDATION_ERROR (BFF tự validate)', async () => {
    let called = false;
    h.transfer.override({
      createTransferTicket: (_c, cb) => {
        called = true;
        cb(null, {});
      },
    });
    const { statusCode, body } = await injectCreate('ORD-3001', {});
    expect(statusCode).toBe(422);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details[0].field).toBe('toHub');
    expect(called).toBe(false);
  });

  it('đơn tách nợ → upstream INVALID_ARGUMENT → 422 VALIDATION_ERROR', async () => {
    let called = false;
    h.transfer.override({
      createTransferTicket: (_c, cb) => {
        called = true;
        cb(invalidArgument([
          { field: 'orderFulfillCode', message: 'Đơn tách nợ không thể tạo yêu cầu chuyển kho.' },
        ]));
      },
    });
    const { statusCode, body } = await injectCreate('ORD-DEBT-1', { toHub: 'Hub Đà Nẵng' });
    expect(statusCode).toBe(422);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details[0].field).toBe('orderFulfillCode');
    expect(called).toBe(true);
  });

  it('trùng ticket PENDING → upstream ALREADY_EXISTS → 409 CONFLICT', async () => {
    h.transfer.override({
      createTransferTicket: (_c, cb) =>
        cb(mockGrpcError(6, 'Order ORD-3001 already has a PENDING transfer ticket.')),
    });
    const { statusCode, body } = await injectCreate('ORD-3001', { toHub: 'Hub Đà Nẵng' });
    expect(statusCode).toBe(409);
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toContain('PENDING');
  });

  it('happy path — 201 { ticket } envelope + metadata + audit order.transfer_ticket_create', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    // getAuditPool gate theo FULFILLMENT_DB_HOST — set env để pool giả được dùng
    // (pattern audit.route.test.ts).
    process.env.FULFILLMENT_DB_HOST = 'audit-test.invalid';
    __setAuditPoolForTests({
      query: (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return Promise.resolve({ rows: [], rowCount: 0 });
      },
    } as unknown as Pool);

    let captured: CreateTransferTicketRequest | undefined;
    let capturedActor: string | undefined;
    let capturedRole: string | undefined;
    h.transfer.override({
      createTransferTicket: (call, cb) => {
        captured = call.request as CreateTransferTicketRequest;
        capturedActor = call.metadata.get('x-user-name')[0] as string;
        capturedRole = call.metadata.get('x-user-role')[0] as string;
        cb(null, {
          ticket: {
            ticketCode: 'TT-0001',
            orderFulfillCode: 'ORD-3001',
            fromHub: '',
            toHub: 'Hub Đà Nẵng',
            reason: 'Gần kho giao hơn',
            status: 'PENDING',
            createdBy: 'coordinator1',
            createdAt: '2026-09-03T10:00:00+07:00',
            confirmedBy: '',
            confirmedAt: '',
          },
        });
      },
    });
    const { statusCode, body } = await injectCreate('ORD-3001', {
      toHub: 'Hub Đà Nẵng',
      reason: 'Gần kho giao hơn',
    }, 'Coordinator');
    expect(statusCode).toBe(201);
    expect(body.ticket).toEqual({
      ticketCode: 'TT-0001',
      orderFulfillCode: 'ORD-3001',
      fromHub: '',
      toHub: 'Hub Đà Nẵng',
      reason: 'Gần kho giao hơn',
      status: 'PENDING',
      createdBy: 'coordinator1',
      createdAt: '2026-09-03T10:00:00+07:00',
      confirmedBy: '',
      confirmedAt: '',
    });
    expect(captured?.orderFulfillCode).toBe('ORD-3001');
    expect(captured?.toHub).toBe('Hub Đà Nẵng');
    expect(capturedActor).toBe('tester');
    expect(capturedRole).toBe('Coordinator');

    // Audit fire-and-forget — pool stub nhận INSERT activity_log.
    await vi.waitFor(() => {
      expect(queries).toHaveLength(1);
    });
    expect(queries[0].sql).toContain('INSERT INTO activity_log');
    expect(queries[0].params[0]).toBe('tester');
    expect(queries[0].params[1]).toBe('order.transfer_ticket_create');
    expect(queries[0].params[3]).toBe('TT-0001');
  });
});

describe('SF-28 transfer — GET /fulfillment/transfer-tickets', () => {
  it('codes=a,b → repeated order_fulfill_codes downstream + envelope { items }', async () => {
    let captured: ListTransferTicketsRequest | undefined;
    h.transfer.override({
      listTransferTickets: (call, cb) => {
        captured = call.request as ListTransferTicketsRequest;
        cb(null, {
          tickets: [
            {
              ticketCode: 'TT-0001',
              orderFulfillCode: 'ORD-3001',
              fromHub: '',
              toHub: 'Hub Đà Nẵng',
              reason: 'Gần kho giao hơn',
              status: 'PENDING',
              createdBy: 'tester',
              createdAt: '2026-09-03T10:00:00+07:00',
              confirmedBy: '',
              confirmedAt: '',
            },
          ],
        });
      },
    });
    const token = await signTestToken('Manager');
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/transfer-tickets?codes=ORD-3001,ORD-3002&status=PENDING',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(captured?.orderFulfillCodes).toEqual(['ORD-3001', 'ORD-3002']);
    expect(captured?.status).toBe('PENDING');
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].ticketCode).toBe('TT-0001');
  });

  it('thiếu codes → 422 VALIDATION_ERROR', async () => {
    const token = await signTestToken('Manager');
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/transfer-tickets',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().details[0].field).toBe('codes');
  });

  it('WarehouseOps (non-role) → 403', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/fulfillment/transfer-tickets?codes=ORD-3001',
      headers: { authorization: `Bearer ${await signTestToken('WarehouseOps')}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('PERMISSION_DENIED');
  });
});
