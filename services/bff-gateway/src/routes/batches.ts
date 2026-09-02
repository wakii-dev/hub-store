/**
 * Batching REST routes (REQUIREMENTS §5 khối 2 — path /fulfillment/batches/*):
 *   POST packing-suggest · POST create · POST filter · GET criteria (TRƯỚC :code)
 *   GET :code · PUT :code/cancel · POST recalculate-distance
 */
import type { FastifyInstance } from 'fastify';
import type {
  PackingSuggestRequest,
  CreateBatchRequest,
  FilterBatchesRequest,
  CancelBatchRequest,
  BatchCriteriaResponse,
  BatchEntityStatus,
  FilterBatchesResponse,
  PackingSuggestResponse,
  RecalculateDistanceResponse,
  BatchDto,
  TimeRange,
} from '@hub-store/shared';
import type { BatchingApi } from '../clients/batching.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { paginated } from '../lib/envelope.js';
import { sendGrpcError } from '../lib/grpc-error.js';
import { logActivity } from '../lib/audit.js';
import { mapBatch, mapPackingGroup, mapOrderDistance } from '../mappers/batching.js';

/**
 * DTO FilterBatchesRequest.createdAt là NGÀY đơn ("2026-09-03") — proto
 * FilterBatchesRequest.created_time là TimeRange. Wrap nguyên ngày thành
 * full-day range [T00:00:00.000Z, T23:59:59.999Z] (SF-2 contract decision).
 */
function dayToTimeRange(day: string): TimeRange {
  return { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` };
}

export function registerBatchRoutes(app: FastifyInstance, batching: BatchingApi): void {
  const svc = SERVICE_NAMES.batching;

  // Gợi ý nhóm đơn theo khoảng cách (D1b). shopCode trống → Go derive từ orders
  // (hydration — spec §3.3).
  app.post<{ Body: PackingSuggestRequest }>(
    '/fulfillment/batches/packing-suggest',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const resp = await batching.packingSuggest(
          { shopCode: '', fulfillCodes: request.body.orderCodes },
          role,
        );
        const body: PackingSuggestResponse = {
          groups: (resp.groups ?? []).map(mapPackingGroup),
        };
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, svc);
      }
    },
  );

  // Tạo phiếu (D1b) — rule 1 §3.6 validate server-side ở Go (GetOrdersByCodes
  // → Java). shopCode trống → Go derive.
  app.post<{ Body: CreateBatchRequest }>('/fulfillment/batches/create', async (request, reply) => {
    const { role, sub } = requireUser(request);
    try {
      const resp = await batching.createBatch(
        {
          shopCode: '',
          shipperId: request.body.shipperId,
          deliveryTime: request.body.deliveryTime,
          fulfillCodes: request.body.orderCodes,
        },
        role,
      );
      // SF-7 audit — fire-and-forget SAU gRPC thành công, fail-open.
      logActivity({
        actor: sub,
        action: 'batch.create',
        targetType: 'batch',
        targetId: resp.batch?.batchCode ?? '',
        detail: { orderCodes: request.body.orderCodes },
      });
      return await reply.send(resp.batch ? mapBatch(resp.batch) : null);
    } catch (err) {
      return sendGrpcError(reply, err, svc);
    }
  });

  // D2 list — pagination envelope.
  app.post<{ Body: FilterBatchesRequest }>(
    '/fulfillment/batches/filter',
    async (request, reply) => {
      const { role } = requireUser(request);
      const b = request.body;
      try {
        const resp = await batching.filterBatches(
          {
            search: b.searchText ?? '',
            statuses: b.status ?? [],
            createdTime: b.createdAt ? dayToTimeRange(b.createdAt) : undefined,
            page: b.page,
            pageSize: b.pageSize,
          },
          role,
        );
        const body: FilterBatchesResponse = paginated(
          (resp.items ?? []).map(mapBatch),
          Number(resp.total),
          resp.page,
          resp.pageSize,
        );
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, svc);
      }
    },
  );

  // Config trạng thái cho phép hủy — ĐẶT TRƯỚC /:code để không bị nuốt.
  app.get('/fulfillment/batches/criteria', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const resp = await batching.getBatchCriteria({}, role);
      const body: BatchCriteriaResponse = {
        cancellableStatuses: (resp.cancellableStatuses ?? []).map(Number) as BatchEntityStatus[],
      };
      return await reply.send(body);
    } catch (err) {
      return sendGrpcError(reply, err, svc);
    }
  });

  // D2 detail / expand.
  app.get<{ Params: { code: string } }>('/fulfillment/batches/:code', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const resp = await batching.getBatchDetail({ batchCode: request.params.code }, role);
      const body: BatchDto | null = resp.batch ? mapBatch(resp.batch) : null;
      return await reply.send(body);
    } catch (err) {
      return sendGrpcError(reply, err, svc);
    }
  });

  // Hủy phiếu — rule 4 §3.6 (chỉ ACTIVE; Go reject + revert đơn về 0 qua Java).
  app.put<{ Params: { code: string }; Body: CancelBatchRequest }>(
    '/fulfillment/batches/:code/cancel',
    async (request, reply) => {
      const { role, sub } = requireUser(request);
      try {
        const resp = await batching.cancelBatch(
          { batchCode: request.params.code, reason: request.body.reason },
          role,
        );
        logActivity({
          actor: sub,
          action: 'batch.cancel',
          targetType: 'batch',
          targetId: request.params.code,
          detail: { reason: request.body.reason },
        });
        return await reply.send(resp.batch ? mapBatch(resp.batch) : null);
      } catch (err) {
        return sendGrpcError(reply, err, svc);
      }
    },
  );

  // Tính lại km (D1b).
  app.post<{ Body: { orderCodes: string[] } }>(
    '/fulfillment/batches/recalculate-distance',
    async (request, reply) => {
      const { role } = requireUser(request);
      try {
        const resp = await batching.recalculateDistance(
          { shopCode: '', fulfillCodes: request.body.orderCodes },
          role,
        );
        const body: RecalculateDistanceResponse = {
          items: (resp.distances ?? []).map(mapOrderDistance),
        };
        return await reply.send(body);
      } catch (err) {
        return sendGrpcError(reply, err, svc);
      }
    },
  );
}
