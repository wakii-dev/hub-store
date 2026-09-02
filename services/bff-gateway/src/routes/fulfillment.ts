/**
 * Fulfillment REST routes (REQUIREMENTS §5 khối 1 + extensions):
 *   POST /fulfillment/filter · GET /fulfillment/{fulfillCode}
 *   POST /fulfillment/{code}/assign-shop-hub · POST /fulfillment/{code}/history
 *   PUT /fulfillment/{code}/note · PUT /fulfillment/{code}/delivery-time
 *   GET /order-promising/time-delivery · GET /master-data/{regions,delivery-staff,shops}
 * Error mapping một chỗ: sendGrpcError (spec §3.1). Role từ JWT guard.
 */
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { FastifyInstance } from 'fastify';
import type {
  FilterOrdersRequest,
  AssignShopHubRequest,
  UpdateNoteRequest,
  UpdateDeliveryTimeRequest,
  RegionsResponse,
  DeliveryStaffResponse,
  ShopsResponse,
  TimeDeliveryResponse,
  AssignHistoryResponse,
  OrderDetail,
} from '@hub-store/shared';
import type { FulfillmentApi, BatchingApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { paginated } from '../lib/envelope.js';
import { sendGrpcError, grpcError } from '../lib/grpc-error.js';
import { logActivity } from '../lib/audit.js';
import {
  mapOrderItem,
  mapOrderDetail,
  mapHistoryEntry,
  mapRegion,
  mapDeliveryStaff,
  mapShop,
} from '../mappers/fulfillment.js';
import { mapBatch } from '../mappers/batching.js';

export interface RouteDeps {
  fulfillment: FulfillmentApi;
  batching: BatchingApi;
}

export function registerFulfillmentRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const f = deps.fulfillment;

  // D1 list — filter + pagination + excludeFulfillCodes (pin v1).
  app.post<{ Body: FilterOrdersRequest }>('/fulfillment/filter', async (request, reply) => {
    const { role } = requireUser(request);
    const b = request.body;
    try {
      const resp = await f.filterOrders(
        {
          fulfillCode: b.fulfillCode ?? '',
          batchStatuses: b.batchStatus ?? [],
          deliveryTime: b.deliveryTime,
          regionCodes: b.regionCodes ?? [],
          shopCodes: b.shopCodes ?? [],
          orderStatuses: b.orderStatus ?? [],
          createdTime: b.createdAt,
          originalTime: b.originalTime,
          excludeFulfillCodes: b.excludeFulfillCodes ?? [],
          page: b.page,
          pageSize: b.pageSize,
        },
        role,
      );
      return await reply.send(
        paginated(resp.items.map(mapOrderItem), Number(resp.total), resp.page, resp.pageSize),
      );
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // D1 detail — FE waive tường minh (spec §3.8) nhưng implement đầy đủ.
  // Aggregation: detail + history (BFF owns aggregation — spec §3.3).
  app.get<{ Params: { fulfillCode: string } }>(
    '/fulfillment/:fulfillCode',
    async (request, reply) => {
      const { role } = requireUser(request);
      const { fulfillCode } = request.params;
      try {
        const [detail, history] = await Promise.all([
          f.getOrderDetail({ fulfillCode }, role),
          f.getAssignHistory({ fulfillCode }, role),
        ]);
        if (!detail.order) {
          return sendGrpcError(
            reply,
            grpcError(GrpcStatus.NOT_FOUND, `Order ${fulfillCode} not found.`),
            SERVICE_NAMES.fulfillment,
          );
        }
        const body: OrderDetail = mapOrderDetail(
          detail.order,
          (history.entries ?? []).map(mapHistoryEntry),
        );
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Chuyển kho D1c — đúng 1 đơn/lần (§9); server-side validation rule 2 §3.6.
  app.post<{ Params: { code: string }; Body: AssignShopHubRequest }>(
    '/fulfillment/:code/assign-shop-hub',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const resp = await f.assignShopHub(
          { fulfillCode: request.params.code, targetShopCode: request.body.toShopCode },
          role,
        );
        // SF-7 audit — fire-and-forget SAU gRPC thành công, fail-open.
        logActivity({
          actor: request.user.sub,
          action: 'order.assign_shop',
          targetType: 'order',
          targetId: request.params.code,
          detail: { toShopCode: request.body.toShopCode },
        });
        return await reply.send(resp.order ? mapOrderItem(resp.order) : null);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // LỊCH SỬ CHUYỂN KHO — READ SEMANTICS (spec §3.8): tên POST theo production
  // nhưng KHÔNG mutate. BFF chỉ proxy GetAssignHistory.
  app.post<{ Params: { code: string } }>('/fulfillment/:code/history', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const resp = await f.getAssignHistory({ fulfillCode: request.params.code }, role);
      const body: AssignHistoryResponse = (resp.entries ?? []).map(mapHistoryEntry);
      return await reply.send(body);
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // PUT note — backend đủ 18/18, KHÔNG có FE screen (spec §3.8).
  app.put<{ Params: { code: string }; Body: UpdateNoteRequest }>(
    '/fulfillment/:code/note',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const resp = await f.updateNote(
          { fulfillCode: request.params.code, note: request.body.note },
          role,
        );
        logActivity({
          actor: request.user.sub,
          action: 'order.update_note',
          targetType: 'order',
          targetId: request.params.code,
          detail: { noteLength: (request.body.note ?? '').length },
        });
        return await reply.send(resp.order ? mapOrderItem(resp.order) : null);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Edit TG giao — rule 3 §3.6 (chỉ khi batchStatus=0, Java reject).
  app.put<{ Params: { code: string }; Body: UpdateDeliveryTimeRequest }>(
    '/fulfillment/:code/delivery-time',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const resp = await f.updateDeliveryTime(
          { fulfillCode: request.params.code, deliveryTime: request.body.deliveryTime },
          role,
        );
        logActivity({
          actor: request.user.sub,
          action: 'order.update_delivery_time',
          targetType: 'order',
          targetId: request.params.code,
          detail: { from: request.body.deliveryTime?.from, to: request.body.deliveryTime?.to },
        });
        return await reply.send(resp.order ? mapOrderItem(resp.order) : null);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // D4 hint TG giao — trả mảng slot (TimeDeliveryResponse.timeSlots).
  app.get<{ Querystring: { shopCode?: string } }>(
    '/order-promising/time-delivery',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const resp = await f.getTimeDelivery(
          { shopCode: request.query.shopCode ?? '', customerAddress: '' },
          role,
        );
        const body: TimeDeliveryResponse = {
          timeSlots: resp.suggestedTime ? [{ from: resp.suggestedTime.from, to: resp.suggestedTime.to }] : [],
        };
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // GET /master-data/regions — D6 hierarchical (extension endpoints đã duyệt).
  app.get('/master-data/regions', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const resp = await f.listRegions({}, role);
      const body: RegionsResponse = { items: (resp.regions ?? []).map(mapRegion) };
      return await reply.send(body);
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  app.get<{ Querystring: { shopCode?: string } }>(
    '/master-data/delivery-staff',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const shopCode = request.query.shopCode;
        const resp = await f.listDeliveryStaff(
          shopCode ? { shopCode } : {},
          role,
        );
        const body: DeliveryStaffResponse = { items: (resp.items ?? []).map(mapDeliveryStaff) };
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  app.get('/master-data/shops', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const resp = await f.listDistinctShops({}, role);
      const body: ShopsResponse = { items: (resp.items ?? []).map(mapShop) };
      return await reply.send(body);
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // PUT /fulfillment/complete-picking — D11: batch 1→2 order-level. Upstream là
  // batching-service (Go owns batch transitions, spec §3.3) dù path nằm dưới
  // /fulfillment (REQUIREMENTS §5 giữ nguyên path).
  app.put<{ Body: { batchCode: string } }>('/fulfillment/complete-picking', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const resp = await deps.batching.completePicking(
        { batchCode: request.body.batchCode },
        role,
      );
      logActivity({
        actor: request.user.sub,
        action: 'batch.complete',
        targetType: 'batch',
        targetId: request.body.batchCode,
      });
      return await reply.send(resp.batch ? mapBatch(resp.batch) : null);
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.batching);
    }
  });
}
