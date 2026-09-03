/**
 * Transfer REST routes (SF-28 — plan T1, spec §3 Q6-Q7):
 *   POST /fulfillment/:code/transfer-tickets  — Coordinator/Manager/Admin — tạo
 *       ticket chuyển kho; tách nợ → upstream INVALID_ARGUMENT → 422; trùng
 *       PENDING → upstream ALREADY_EXISTS → 409. Audit order.transfer_ticket_create.
 *   GET  /fulfillment/transfer-tickets?codes=a,b[&status=PENDING] — cùng role —
 *       lịch sử ticket theo mã đơn (comma → repeated; read — không audit);
 *       caps review P2: codes ≤ 100 + status whitelist (lệch → 422), upstream
 *       LIMIT 500.
 * Prefix /fulfillment khớp surface fulfillment (TransferService sống cùng process).
 */
import type { FastifyInstance } from 'fastify';
import type { TransferApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireRole, requireUser } from '../plugins/auth.js';
import { sendBadRequest, sendGrpcError, grpcError } from '../lib/grpc-error.js';
import { logActivity } from '../lib/audit.js';
import { mapTransferTicket } from '../mappers/transfer.js';

export interface TransferRouteDeps {
  transfer: TransferApi;
}

/** Review P2: cap số codes + whitelist status — lệch → 422 lộ lỗi sớm cho FE. */
const MAX_CODES = 100;
const ALLOWED_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

export function registerTransferRoutes(app: FastifyInstance, deps: TransferRouteDeps): void {
  const transfer = deps.transfer;

  app.post<{
    Params: { code: string };
    Body: { toHub?: string; reason?: string; fromHub?: string };
  }>('/fulfillment/:code/transfer-tickets', async (request, reply) => {
    if (requireRole(request, reply, 'Coordinator', 'Manager', 'Admin') === null) return reply;
    const user = requireUser(request);
    const toHub = typeof request.body?.toHub === 'string' ? request.body.toHub.trim() : '';
    if (!toHub) {
      return sendBadRequest(reply, [
        { field: 'toHub', message: 'Kho đích (toHub) là bắt buộc.' },
      ]);
    }
    try {
      const resp = await transfer.createTransferTicket(
        {
          orderFulfillCode: request.params.code,
          fromHub: request.body.fromHub ?? '',
          toHub,
          reason: request.body.reason ?? '',
        },
        user,
        user.sub,
      );
      // ts-proto field optional — response thiếu ticket = upstream bug → 500.
      const ticket = resp.ticket;
      if (!ticket) {
        return sendGrpcError(
          reply,
          grpcError(13, 'Upstream trả response thiếu ticket.'),
          SERVICE_NAMES.fulfillment,
        );
      }
      // Fire-and-forget audit (SF-7) — KHÔNG fail mutation khi DB thiếu.
      logActivity({
        actor: user.sub,
        action: 'order.transfer_ticket_create',
        targetType: 'transfer_ticket',
        targetId: ticket.ticketCode,
        detail: {
          orderFulfillCode: request.params.code,
          toHub,
          reason: request.body.reason ?? '',
        },
      });
      return await reply.code(201).send({ ticket: mapTransferTicket(ticket) });
    } catch (err) {
      // INVALID_ARGUMENT (tách nợ) → 422; ALREADY_EXISTS (trùng PENDING) → 409.
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  app.get<{ Querystring: { codes?: string | string[]; status?: string | string[] } }>(
    '/fulfillment/transfer-tickets',
    async (request, reply) => {
      if (requireRole(request, reply, 'Coordinator', 'Manager', 'Admin') === null) return reply;
      const user = requireUser(request);
      // ?codes=a,b (hoặc repeated ?codes=a&codes=b) → repeated string gRPC.
      const raw = request.query.codes;
      const codes = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (codes.length === 0) {
        return sendBadRequest(reply, [
          { field: 'codes', message: 'Ít nhất 1 mã đơn (codes) là bắt buộc.' },
        ]);
      }
      if (codes.length > MAX_CODES) {
        return sendBadRequest(reply, [
          { field: 'codes', message: `Tối đa ${MAX_CODES} mã đơn mỗi lần truy vấn.` },
        ]);
      }
      const statusRaw = request.query.status;
      const status = Array.isArray(statusRaw) ? statusRaw[0] : statusRaw;
      if (status != null && status !== '' && !ALLOWED_STATUSES.includes(status)) {
        return sendBadRequest(reply, [
          { field: 'status', message: 'Trạng thái không hợp lệ (PENDING/APPROVED/REJECTED).' },
        ]);
      }
      try {
        const resp = await transfer.listTransferTickets(
          { orderFulfillCodes: codes, status: status ?? '' },
          user,
          user.sub,
        );
        return await reply.send({ items: (resp.tickets ?? []).map(mapTransferTicket) });
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );
}
