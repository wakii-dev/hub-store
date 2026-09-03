/**
 * Printer management REST routes (SF-21, FI-266 — spec D9):
 *   GET  /fulfillment/printers?shopCode=                  — mọi user đã đăng nhập
 *     (ai có fulfillment.print đọc list để in — spec Permissions).
 *   POST /fulfillment/printers                            — Admin (403 nếu không)
 *   PUT  /fulfillment/printers/:shopCode/:printerId       — Admin
 *
 * Identity (shopCode, printerId) KHÔNG sửa sau tạo — PUT chỉ name/printerIp/
 * mac/type. Duplicate → upstream ALREADY_EXISTS (409); not-found → NOT_FOUND
 * (404) — mapping một chỗ lib/grpc-error.ts. Admin gate server-side
 * requireRole('Admin') — không chỉ ẩn nút FE (spec §4 non-functional).
 */
import type { FastifyInstance } from 'fastify';
import type { FulfillmentApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser, requireRole } from '../plugins/auth.js';
import { sendGrpcError, grpcError } from '../lib/grpc-error.js';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { PrinterDto } from '@hub-store/shared';
import type { Printer as ProtoPrinter } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';

export interface PrinterRouteDeps {
  fulfillment: FulfillmentApi;
}

/** Body shape create/update — identity immutable khi update (path là nguồn sự thật). */
interface PrinterBody {
  shopCode?: string;
  printerId?: string;
  name?: string;
  location?: string;
  printerIp?: string;
  mac?: string;
  type?: string;
}

function mapPrinter(p: ProtoPrinter): PrinterDto {
  return {
    shopCode: p.shopCode,
    printerId: p.printerId,
    name: p.name,
    location: p.location || undefined,
    printerIp: p.printerIp || undefined,
    mac: p.mac || undefined,
    type: (p.type || undefined) as 'bill' | 'a4' | undefined,
  };
}

export function registerPrinterRoutes(app: FastifyInstance, deps: PrinterRouteDeps): void {
  const f = deps.fulfillment;

  // List — filter theo shop (shopCode trống = tất cả — Admin page dùng).
  app.get<{ Querystring: { shopCode?: string } }>(
    '/fulfillment/printers',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const resp = await f.listPrinters(
          { shopCode: request.query.shopCode ?? '' },
          role,
        );
        return await reply.send({ items: (resp.printers ?? []).map(mapPrinter) });
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Create — Admin. Validate type bill|a4 ở BFF (nhanh, 422 trước khi gRPC).
  app.post<{ Body: PrinterBody }>('/fulfillment/printers', async (request, reply) => {
    if (!requireRole(request, reply, 'Admin')) return reply;
    const { role, sub } = requireUser(request);
    const b = request.body;
    try {
      const resp = await f.createPrinter(
        {
          printer: {
            shopCode: b.shopCode ?? '',
            printerId: b.printerId ?? '',
            name: b.name ?? '',
            location: b.location ?? '',
            printerIp: b.printerIp ?? '',
            mac: b.mac ?? '',
            type: b.type ?? '',
          },
        },
        role,
        sub,
      );
      if (!resp.printer) {
        return sendGrpcError(
          reply,
          grpcError(GrpcStatus.INTERNAL, 'Upstream returned no printer.'),
          SERVICE_NAMES.fulfillment,
        );
      }
      return await reply.send(mapPrinter(resp.printer));
    } catch (err) {
      // ALREADY_EXISTS → 409 (lib/grpc-error.ts map một chỗ).
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // Update — Admin, identity từ PATH (bỏ qua body identity — D9 immutable).
  app.put<{ Params: { shopCode: string; printerId: string }; Body: PrinterBody }>(
    '/fulfillment/printers/:shopCode/:printerId',
    async (request, reply) => {
      if (!requireRole(request, reply, 'Admin')) return reply;
      const { role, sub } = requireUser(request);
      const b = request.body;
      try {
        const resp = await f.updatePrinter(
          {
            shopCode: request.params.shopCode,
            printerId: request.params.printerId,
            printer: {
              shopCode: request.params.shopCode,
              printerId: request.params.printerId,
              name: b.name ?? '',
              location: b.location ?? '',
              printerIp: b.printerIp ?? '',
              mac: b.mac ?? '',
              type: b.type ?? '',
            },
          },
          role,
          sub,
        );
        if (!resp.printer) {
          return sendGrpcError(
            reply,
            grpcError(GrpcStatus.NOT_FOUND, 'Printer not found.'),
            SERVICE_NAMES.fulfillment,
          );
        }
        return await reply.send(mapPrinter(resp.printer));
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );
}
