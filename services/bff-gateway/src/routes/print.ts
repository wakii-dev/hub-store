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
import type { PrintersResponse, BatchDto } from '@hub-store/shared';
import type { BatchingApi, FulfillmentApi, PrintApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { sendGrpcError, sendBadRequest, grpcError } from '../lib/grpc-error.js';
import { printTypeToProto } from '../mappers/print.js';
import { mapBatch } from '../mappers/batching.js';

export function registerPrintRoutes(
  app: FastifyInstance,
  deps: { batching: BatchingApi; print: PrintApi; fulfillment: FulfillmentApi },
): void {
  app.get<{ Querystring: { shopCode?: string } }>(
    '/fulfillment/print/printers',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        // SF-21 D1: nguồn = fulfillment-service (DB-backed registry) thay vì
        // print-service. Response shape { items } GIỮ NGUYÊN (api-contracts pin)
        // + additive printerIp/mac/type (T1 DTO).
        const resp = await deps.fulfillment.listPrinters(
          { shopCode: request.query.shopCode ?? '' },
          role,
        );
        const body: PrintersResponse = {
          items: (resp.printers ?? []).map((p) => ({
            printerId: p.printerId,
            name: p.name,
            shopCode: p.shopCode,
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

  app.post<{ Body: { batchCode: string; printType: string; printerId: string } }>(
    '/fulfillment/print',
    async (request, reply) => {
      const { role } = requireUser(request);
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

      try {
        // 1. Hydrate batch từ Go (batching-service) — lỗi ở bước này báo tên
        // batching-service (resilience policy §3.1).
        const detail = await deps.batching.getBatchDetail({ batchCode }, role);
        if (!detail.batch) {
          // Batch không tồn tại = resource missing → 404 NOT_FOUND (nhất quán
          // với GET /fulfillment/batches/:code), KHÔNG phải 422 validation.
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
            role,
          );
          // 3. Stream bytes — KHÔNG wrap JSON envelope (spec §3.7).
          return await reply
            .header('content-type', 'application/pdf')
            .header('content-disposition', `inline; filename="${batchCode}-${printType}.pdf"`)
            .send(Buffer.from(printed.pdfContent));
        } catch (err) {
          return sendGrpcError(reply, err, SERVICE_NAMES.print);
        }
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.batching);
      }
    },
  );
}
