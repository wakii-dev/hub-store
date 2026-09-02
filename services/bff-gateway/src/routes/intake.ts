/**
 * Intake REST routes (SF-13 — plan T6 + hydration route T8):
 *   GET  /orders/import/template      — Coordinator — CSV template download
 *   POST /orders/import/preview       — Coordinator — parse file + gRPC validate
 *   POST /orders/import/confirm       — Coordinator — tạo đơn hàng loạt
 *   POST /orders                      — Coordinator — tạo đơn tay
 *   POST /orders/:code/fail           — WarehouseOps — mark giao thất bại
 *   POST /orders/:code/redeliver      — WarehouseOps — tạo đơn giao lại
 *   GET  /orders/:code/audit          — mọi role — activity log per order
 *   GET  /orders/by-batch/:batchCode  — mọi role — BFF owns aggregation
 *                                      (batching getBatchDetail → fulfillment
 *                                      getOrdersByCodes — plan T8 moved).
 * Prefix /orders* thống nhất intake surface (plan errata — có lệch /fulfillment/*).
 *
 * Preview row-indexing: dòng parse-fail vẫn giữ vị trí bằng IntakeOrder
 * placeholder rỗng trong request gRPC (1-based indexing plan T5); BFF track
 * index placeholder và DROP resp.errors của các row đó (placeholder sinh ~4
 * validation errors rác/row — không lọc thì preview sai).
 */
import type { FastifyInstance } from 'fastify';
import type { IntakeOrderDto } from '@hub-store/shared';
import type { IntakeApi, FulfillmentApi, BatchingApi } from '../clients/index.js';
import type { RawRow } from '../lib/parseOrdersFile.js';
import { parseOrdersFile, templateCsv } from '../lib/parseOrdersFile.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser, requireRole } from '../plugins/auth.js';
import { sendGrpcError, sendBadRequest, grpcError } from '../lib/grpc-error.js';
import { errorEnvelope } from '../lib/envelope.js';
import { toProtoIntakeOrder, mapImportError, mapAuditEntry } from '../mappers/intake.js';
import { mapOrderItem } from '../mappers/fulfillment.js';

export interface IntakeRouteDeps {
  intake: IntakeApi;
  fulfillment: FulfillmentApi;
  batching: BatchingApi;
}

export function registerIntakeRoutes(app: FastifyInstance, deps: IntakeRouteDeps): void {
  const intake = deps.intake;

  app.get('/orders/import/template', async (request, reply) => {
    if (requireRole(request, reply, 'Coordinator') === null) return reply;
    return reply
      .type('text/csv')
      .header('Content-Disposition', 'attachment; filename="order-import-template.csv"')
      .send(templateCsv());
  });

  app.post('/orders/import/preview', async (request, reply) => {
    if (requireRole(request, reply, 'Coordinator') === null) return reply;
    const user = requireUser(request);
    let file: Awaited<ReturnType<typeof request.file>>;
    try {
      // Non-multipart request → multipart plugin throw 406 — normalize về 422.
      file = await request.file();
    } catch {
      file = undefined;
    }
    if (!file) {
      return reply.code(422).send(
        errorEnvelope(422, 'Thiếu file import (multipart field "file").', {
          code: 'VALIDATION_ERROR',
          details: [{ field: 'file', message: 'File import là bắt buộc.' }],
        }),
      );
    }
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(422).send(
        errorEnvelope(422, 'Không đọc được file import.', {
          code: 'VALIDATION_ERROR',
          details: [{ field: 'file', message: 'File không đọc được.' }],
        }),
      );
    }
    const { rows, errors } = parseOrdersFile(file.filename, buffer);

    // Parse-fail row → placeholder rỗng giữ vị trí 1-based trong request gRPC.
    const placeholderIdx = new Set<number>();
    const orders = rows.map((row: RawRow, i: number) => {
      if (!row.ok) {
        placeholderIdx.add(i);
      }
      return row.ok
        ? toProtoIntakeOrder({
            customerName: row.customerName,
            customerPhone: row.customerPhone,
            customerAddress: row.customerAddress,
            items: row.items,
            quantity: row.quantity,
            codAmount: row.codAmount,
            shopHint: row.shopHint,
          })
        : {
            customerName: '',
            customerPhone: '',
            customerAddress: '',
            items: [],
            quantity: 0,
            codAmount: 0,
            shopHint: '',
          };
    });

    try {
      const resp = await intake.validateImportOrders({ orders }, user.role, user.sub);
      // DROP validation errors của placeholder rows (rác từ row parse-fail).
      const grpcErrors = (resp.errors ?? [])
        .filter((e) => !placeholderIdx.has(e.row - 1))
        .map(mapImportError);
      // Deterministic (code-point order — KHÔNG localeCompare để tránh ICU shift).
      const allErrors = [...errors, ...grpcErrors].sort(
        (a, b) => a.row - b.row || (a.column < b.column ? -1 : a.column > b.column ? 1 : 0),
      );
      const errorRows = new Set(allErrors.map((e) => e.row));
      const valid: IntakeOrderDto[] = rows
        .map((row, i) => ({ row, rowNumber: i + 1 }))
        .filter(({ row, rowNumber }) => row.ok && !errorRows.has(rowNumber))
        .map(({ row }) => ({
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          customerAddress: row.customerAddress,
          items: row.items,
          quantity: row.quantity,
          codAmount: row.codAmount,
          shopHint: row.shopHint,
        }));
      return await reply.send({ valid, errors: allErrors });
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.intake);
    }
  });

  app.post<{ Body: { orders: IntakeOrderDto[] } }>('/orders/import/confirm', async (request, reply) => {
    if (requireRole(request, reply, 'Coordinator') === null) return reply;
    const user = requireUser(request);
    const orders = request.body?.orders;
    if (!Array.isArray(orders) || orders.length === 0) {
      // Thiếu/rỗng orders → 422, không confirm "im lặng" 200 [].
      return sendBadRequest(reply, [
        { field: 'orders', message: 'Danh sách đơn cần xác nhận là bắt buộc và phải khác rỗng.' },
      ]);
    }
    try {
      const resp = await intake.confirmImportOrders(
        { orders: orders.map(toProtoIntakeOrder) },
        user.role,
        user.sub,
      );
      return await reply.send({ fulfillCodes: resp.fulfillCodes ?? [] });
    } catch (err) {
      // INVALID_ARGUMENT (re-validate fail) → sendGrpcError tự map 422.
      return sendGrpcError(reply, err, SERVICE_NAMES.intake);
    }
  });

  app.post<{ Body: IntakeOrderDto }>('/orders', async (request, reply) => {
    if (requireRole(request, reply, 'Coordinator') === null) return reply;
    const user = requireUser(request);
    try {
      const resp = await intake.createManualOrder(
        { order: toProtoIntakeOrder(request.body) },
        user.role,
        user.sub,
      );
      return await reply.code(201).send({ fulfillCode: resp.fulfillCode });
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.intake);
    }
  });

  app.post<{ Params: { code: string }; Body: { reason: number; note?: string } }>(
    '/orders/:code/fail',
    async (request, reply) => {
      if (requireRole(request, reply, 'WarehouseOps') === null) return reply;
      const user = requireUser(request);
      // Validate reason tại BFF — thiếu/không phải int 0-3 → 422 (không để NaN
      // rơi xuống gRPC serializer → 500).
      const reason = Number(request.body?.reason);
      if (!Number.isInteger(reason) || reason < 0 || reason > 3) {
        return sendBadRequest(reply, [
          { field: 'reason', message: 'reason là số nguyên 0-3 (lý do giao thất bại).' },
        ]);
      }
      try {
        await intake.markOrderFailed(
          {
            fulfillCode: request.params.code,
            reason,
            note: request.body.note ?? '',
          },
          user.role,
          user.sub,
        );
        return await reply.code(204).send();
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.intake);
      }
    },
  );

  app.post<{ Params: { code: string } }>('/orders/:code/redeliver', async (request, reply) => {
    if (requireRole(request, reply, 'WarehouseOps') === null) return reply;
    const user = requireUser(request);
    try {
      const resp = await intake.redeliverOrder(
        { fulfillCode: request.params.code },
        user.role,
        user.sub,
      );
      return await reply.code(201).send({ fulfillCode: resp.newFulfillCode });
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.intake);
    }
  });

  app.get<{ Params: { code: string } }>('/orders/:code/audit', async (request, reply) => {
    const user = requireUser(request); // mọi role đã xác thực
    try {
      const resp = await intake.getOrderAudit(
        { fulfillCode: request.params.code },
        user.role,
        user.sub,
      );
      return await reply.send({ items: (resp.entries ?? []).map(mapAuditEntry) });
    } catch (err) {
      // Code lạ → upstream NOT_FOUND → 404 envelope.
      return sendGrpcError(reply, err, SERVICE_NAMES.intake);
    }
  });

  // GET /orders/by-batch/:batchCode — hydration D2 (plan T8, moved): BFF owns
  // aggregation — batching detail → codes → fulfillment getOrdersByCodes.
  app.get<{ Params: { batchCode: string } }>('/orders/by-batch/:batchCode', async (request, reply) => {
    const user = requireUser(request);
    try {
      const detail = await deps.batching.getBatchDetail(
        { batchCode: request.params.batchCode },
        user.role,
      );
      if (!detail.batch) {
        return sendGrpcError(
          reply,
          grpcError(5, `Batch ${request.params.batchCode} not found.`),
          SERVICE_NAMES.batching,
        );
      }
      const codes = (detail.batch.items ?? []).map((i) => i.orderCode);
      const resp = await deps.fulfillment.getOrdersByCodes({ fulfillCodes: codes }, user.role);
      return await reply.send((resp.orders ?? []).map(mapOrderItem));
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.batching);
    }
  });
}
