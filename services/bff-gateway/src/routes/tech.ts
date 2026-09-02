/**
 * TechService REST routes (SF-19, plan Task 7 Step 3):
 *   POST /delivery-orders/filter        → FilterDeliveryOrders
 *   POST /service-orders/filter         → FilterInstallationOrders
 *   POST /service-orders/:code/assign   → AssignTechnician
 *   GET  /technicians/suggest?regionCode → SuggestTechnicians
 * Error mapping một chỗ: sendGrpcError (FAILED_PRECONDITION → 409 CONFLICT).
 * Role từ JWT guard. Validation blank params BFF-side → 422 sendBadRequest.
 */
import type { FastifyInstance } from 'fastify';
import type { TechApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { paginated } from '../lib/envelope.js';
import { sendGrpcError, sendBadRequest } from '../lib/grpc-error.js';
import {
  mapDeliveryOrder,
  mapInstallationOrder,
  mapSuggestedTechnician,
  statusStringsToProto,
} from '../mappers/tech.js';

interface DeliveryFilterBody {
  statuses?: string[];
  driverName?: string;
  categoryL1?: string[];
  categoryL2?: string[];
  regionCode?: string;
  province?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

interface InstallationFilterBody extends Omit<DeliveryFilterBody, 'driverName'> {
  technicianCode?: string;
}

export interface TechRouteDeps {
  tech: TechApi;
}

export function registerTechRoutes(app: FastifyInstance, deps: TechRouteDeps): void {
  const t = deps.tech;

  // Đơn giao kỹ thuật — filter + pagination. Cả from+to absent → today
  // default áp upstream-side (spec §4).
  app.post<{ Body?: DeliveryFilterBody }>('/delivery-orders/filter', async (request, reply) => {
    const { role } = requireUser(request);
    const b = request.body ?? {};
    try {
      const resp = await t.filterDeliveryOrders(
        {
          statuses: statusStringsToProto(b.statuses),
          driverName: b.driverName ?? '',
          categoryL1: b.categoryL1 ?? [],
          categoryL2: b.categoryL2 ?? [],
          regionCode: b.regionCode ?? '',
          province: b.province ?? '',
          dateFrom: b.dateFrom ?? '',
          dateTo: b.dateTo ?? '',
          page: b.page ?? 0,
          pageSize: b.pageSize ?? 0,
        },
        role,
      );
      return await reply.send(
        paginated(resp.items.map(mapDeliveryOrder), Number(resp.total), resp.page, resp.pageSize),
      );
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // Đơn lắp đặt — filter + pagination (KHÔNG today default — spec §4).
  app.post<{ Body?: InstallationFilterBody }>('/service-orders/filter', async (request, reply) => {
    const { role } = requireUser(request);
    const b = request.body ?? {};
    try {
      const resp = await t.filterInstallationOrders(
        {
          statuses: statusStringsToProto(b.statuses),
          technicianCode: b.technicianCode ?? '',
          categoryL1: b.categoryL1 ?? [],
          categoryL2: b.categoryL2 ?? [],
          regionCode: b.regionCode ?? '',
          province: b.province ?? '',
          dateFrom: b.dateFrom ?? '',
          dateTo: b.dateTo ?? '',
          page: b.page ?? 0,
          pageSize: b.pageSize ?? 0,
        },
        role,
      );
      return await reply.send(
        paginated(
          resp.items.map(mapInstallationOrder),
          Number(resp.total),
          resp.page,
          resp.pageSize,
        ),
      );
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // Assign/re-assign KTV — server ENFORCE precondition (sai trạng thái →
  // FAILED_PRECONDITION → 409 CONFLICT). technicianCode blank → 422 BFF-side.
  app.post<{ Params: { code: string }; Body?: { technicianCode?: string } }>(
    '/service-orders/:code/assign',
    async (request, reply) => {
      const { role } = requireUser(request);
      const technicianCode = request.body?.technicianCode ?? '';
      if (!technicianCode.trim()) {
        return sendBadRequest(reply, [
          { field: 'technicianCode', message: 'technicianCode is required.' },
        ]);
      }
      try {
        const resp = await t.assignTechnician(
          { serviceOrderCode: request.params.code, technicianCode },
          role,
        );
        return await reply.send({ order: resp.order ? mapInstallationOrder(resp.order) : null });
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Suggest KTV theo vùng + workload asc — regionCode bắt buộc (422 nếu thiếu).
  app.get<{ Querystring: { regionCode?: string } }>(
    '/technicians/suggest',
    async (request, reply) => {
      const { role } = requireUser(request);
      const regionCode = request.query.regionCode ?? '';
      if (!regionCode.trim()) {
        return sendBadRequest(reply, [
          { field: 'regionCode', message: 'regionCode is required.' },
        ]);
      }
      try {
        const resp = await t.suggestTechnicians({ regionCode }, role);
        return await reply.send({ items: (resp.items ?? []).map(mapSuggestedTechnician) });
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );
}
