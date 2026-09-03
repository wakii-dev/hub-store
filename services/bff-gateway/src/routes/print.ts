/**
 * Print REST routes (REQUIREMENTS §5 khối 3, D3):
 *   GET /fulfillment/print/printers?shopCode=  → JSON envelope { items }
 *   POST /fulfillment/print                    → application/pdf BYTES (KHÔNG
 *     JSON envelope — spec §3.7 + api-contracts print.ts PrintResponseMeta).
 *
 * Print flow (spec §3.7): BFF hydrate batch từ Go (GetBatchDetail) → serialize
 * canonical JSON → push FAT PAYLOAD sang print-service → stream PDF về FE.
 */
import type { FastifyInstance } from 'fastify';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { PrintersResponse, BatchDto, PrintErrorCountsResponse } from '@hub-store/shared';
import type { BatchingApi, FulfillmentApi, PrintApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { sendGrpcError, sendBadRequest, grpcError } from '../lib/grpc-error.js';
import { errorEnvelope } from '../lib/envelope.js';
import { printTypeToProto } from '../mappers/print.js';
import { mapBatch } from '../mappers/batching.js';

export function registerPrintRoutes(
  app: FastifyInstance,
  deps: { batching: BatchingApi; print: PrintApi; fulfillment: FulfillmentApi },
): void {
  app.get<{ Querystring: { shopCode?: string } }>(
    '/fulfillment/print/printers',
    async (request, reply) => {
      const caller = requireUser(request);
      try {
        // SF-21 D1: nguồn = fulfillment-service (DB-backed registry) thay vì
        // print-service. Response shape { items } GIỮ NGUYÊN (api-contracts pin)
        // + additive printerIp/mac/type (T1 DTO).
        const resp = await deps.fulfillment.listPrinters(
          { shopCode: request.query.shopCode ?? '' },
          caller,
        );
        const body: PrintersResponse = {
          items: (resp.printers ?? []).map((p) => ({
            printerId: p.printerId,
            name: p.name,
            shopCode: p.shopCode,
            // Review-nhóm-2 P1 — location qua lại cho label PrintPage
            // ("HP LaserJet M404 — Khu soạn A", spec D9).
            location: p.location || undefined,
            printerIp: p.printerIp || undefined,
            mac: p.mac || undefined,
            type: (p.type || undefined) as 'bill' | 'a4' | undefined,
          })),
        };
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // SF-21 (spec D2) — GET /fulfillment/print-errors/counts?batchCode= —
  // badge + sort D3: số lỗi in per đơn theo phiếu (V9 qua fulfillment-service).
  app.get<{ Querystring: { batchCode?: string } }>(
    '/fulfillment/print-errors/counts',
    async (request, reply) => {
      const caller = requireUser(request);
      try {
        const resp = await deps.fulfillment.getPrintErrorCounts(
          { batchCode: request.query.batchCode ?? '' },
          caller,
        );
        const body: PrintErrorCountsResponse = {
          items: (resp.counts ?? []).map((c) => ({
            orderCode: c.orderCode,
            count: Number(c.count),
          })),
        };
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  app.post<{ Body: { batchCode: string; printType: string; printerId: string } }>(
    '/fulfillment/print',
    async (request, reply) => {
      const caller = requireUser(request);
      const { batchCode, printType, printerId } = request.body;

      // BFF-side reject printType không nằm trong 5 loại (proto UNSPECIFIED pin).
      const protoType = printTypeToProto(printType);
      if (protoType === undefined) {
        return sendBadRequest(reply, [
          {
            field: 'printType',
            message: `printType must be one of: bill, delivery, handover_receipt, goods_handover, installation_acceptance (got "${printType}").`,
          },
        ]);
      }

      // SF-21 (spec D2) — record 1 lỗi print-thật vào fulfillment-service.
      // FAIL-OPEN: lỗi ghi nhận chỉ log — KHÔNG BAO GIỜ mask lỗi gốc.
      const recordError = async (
        orderCode: string,
        reason: string,
      ): Promise<void> => {
        try {
          await deps.fulfillment.recordPrintError(
            {
              record: {
                orderCode,
                batchCode,
                printType,
                printerId,
                errorMessage: reason,
              },
            },
            caller,
          );
        } catch (err) {
          request.log.error(
            { err },
            'print-errors: record failed (fail-open — original error response preserved)',
          );
        }
      };

      // SF-21 D2 — PREVIEW (printerId ''): pass-through nguyên trạng —
      // KHÔNG validate printer, KHÔNG record (hành vi cũ giữ nguyên).
      if (printerId !== '') {
        // In THẬT: validate printerId trước khi proxy (D1) — list một lần
        // (shopCode trống = tất cả; membership theo printerId là đủ ở BFF).
        try {
          const printers = await deps.fulfillment.listPrinters({ shopCode: '' }, caller);
          const known = (printers.printers ?? []).some((p) => p.printerId === printerId);
          if (!known) {
            // Đơn chưa hydrate ở bước này → record với order_code rỗng
            // (batch_code only — spec D2). 400 Bad Request (D2: invalid
            // printerId → 400 + record — KHÔNG 422 validation như printType).
            await recordError('', `Unknown printer "${printerId}".`);
            return await reply.code(400).send(
              errorEnvelope(400, `printerId "${printerId}" does not exist.`, {
                code: 'BAD_REQUEST',
                details: [
                  {
                    field: 'printerId',
                    message: `printerId "${printerId}" does not exist.`,
                  },
                ],
              }),
            );
          }
        } catch (err) {
          // Lỗi khi ĐỌC printers — không phải lỗi in; trả upstream error như cũ.
          return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
        }
      }

      try {
        // 1. Hydrate batch từ Go (batching-service) — lỗi ở bước này báo tên
        // batching-service (resilience policy §3.1).
        const detail = await deps.batching.getBatchDetail({ batchCode }, caller);
        if (!detail.batch) {
          // Batch không tồn tại = resource missing → 404 NOT_FOUND (nhất quán
          // với GET /fulfillment/batches/:code), KHÔNG phải 422 validation.
          if (printerId !== '') {
            await recordError('', `Batch ${batchCode} not found.`);
          }
          return sendGrpcError(
            reply,
            grpcError(GrpcStatus.NOT_FOUND, `Batch ${batchCode} not found.`),
            SERVICE_NAMES.batching,
          );
        }
        const batch: BatchDto = mapBatch(detail.batch);
        try {
          // 2. Push fat payload (canonical JSON) sang print-service → PDF bytes.
          const printed = await deps.print.print(
            {
              batchPayload: new TextEncoder().encode(JSON.stringify(batch)),
              printType: protoType,
              printerId,
            },
            caller,
          );
          // 3. Stream bytes — KHÔNG wrap JSON envelope (spec §3.7).
          return await reply
            .header('content-type', 'application/pdf')
            .header('content-disposition', `inline; filename="${batchCode}-${printType}.pdf"`)
            .send(Buffer.from(printed.pdfContent));
        } catch (err) {
          // SF-21 D2 — print-service fail trên lệnh IN THẬT: record 1 dòng
          // per đơn trong phiếu (đơn đã biết sau hydrate).
          if (printerId !== '') {
            const reason = err instanceof Error ? err.message : String(err);
            for (const item of batch.items) {
              await recordError(item.orderCode, reason.slice(0, 500));
            }
          }
          return sendGrpcError(reply, err, SERVICE_NAMES.print);
        }
      } catch (err) {
        // SF-21 D2 — batching hydration fail trên lệnh IN THẬT: đơn chưa
        // biết → record với order_code rỗng (batch_code only).
        if (printerId !== '') {
          const reason = err instanceof Error ? err.message : String(err);
          await recordError('', reason.slice(0, 500));
        }
        return sendGrpcError(reply, err, SERVICE_NAMES.batching);
      }
    },
  );
}
