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
  DashboardStats,
  TimeRange,
} from '@hub-store/shared';
import type { HubStoreOrderFilterItem as ProtoOrderItem } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import type { FulfillmentApi, BatchingApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { paginated } from '../lib/envelope.js';
import { sendGrpcError, grpcError } from '../lib/grpc-error.js';
import { logActivity, getAuditPool, buildAuditWhere, normalizeAuditPage, type AuditQuery } from '../lib/audit.js';
import { csvRow, EXPORT_COLUMNS } from '../lib/csv.js';
import { emitLocalEvent } from '../lib/realtime-publish.js';
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

/** Querystring GET export — mirror body /filter (giá trị runtime là string). */
interface ExportOrdersQuery {
  fulfillCode?: string;
  /** comma-separated ints — "0,1" */
  batchStatus?: string;
  regionCodes?: string;
  shopCodes?: string;
  orderStatus?: string;
  /** YYYY-MM-DD — wrap full-day UTC */
  createdAt?: string;
}

/** ""/undefined → [] — tránh [''] từ ''.split(','). */
function splitStringList(s?: string): string[] {
  return s ? s.split(',').map((x) => x.trim()).filter((x) => x !== '') : [];
}

function splitIntList(s?: string): number[] {
  return splitStringList(s)
    .map(Number)
    .filter((n) => Number.isInteger(n));
}

/** yyyyMMdd-HHmmss theo UTC (BFF chạy UTC — pattern audit date pin). */
function exportTimestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(
    d.getUTCMinutes(),
  )}${p(d.getUTCSeconds())}`;
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

  // Audit viewer (SF-7) — Manager-only (bracket SF-11). Route order: static
  // beats parametric (find-my-way) nhưng giữ cạnh route static cho dễ đọc —
  // TRƯỚC /fulfillment/:fulfillCode (single-segment conflict — pattern batches criteria).
  app.get<{ Querystring: AuditQuery }>(
    '/fulfillment/audit',
    async (request, reply) => {
      const { role } = requireUser(request);
      if (role !== 'Manager') {
        return sendGrpcError(
          reply,
          grpcError(GrpcStatus.PERMISSION_DENIED, 'Manager only.'),
          SERVICE_NAMES.fulfillment,
        );
      }
      const p = getAuditPool();
      if (!p) {
        return sendGrpcError(
          reply,
          grpcError(GrpcStatus.UNAVAILABLE, 'Audit store unavailable.'),
          SERVICE_NAMES.fulfillment,
        );
      }
      const { whereSql, params } = buildAuditWhere(request.query);
      const { page, pageSize, offset } = normalizeAuditPage(request.query);
      try {
        const { rows } = await p.query(
          `SELECT c.total_all, a.* FROM (SELECT count(*) AS total_all FROM activity_log WHERE ${whereSql}) c
           LEFT JOIN LATERAL (SELECT * FROM activity_log WHERE ${whereSql}
             ORDER BY created_at DESC, id DESC OFFSET $${params.length + 1} LIMIT $${params.length + 2}) a ON TRUE`,
          [...params, offset, pageSize],
        );
        const total = rows.length > 0 ? Number(rows[0].total_all) : 0;
        const items = rows
          .filter((r: Record<string, unknown>) => r.id != null)
          .map((r: Record<string, unknown>) => ({
            id: Number(r.id),
            actor: r.actor,
            action: r.action,
            targetType: r.target_type,
            targetId: r.target_id,
            detail: r.detail ?? null,
            createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          }));
        return await reply.send(paginated(items, total, page, pageSize));
      } catch (err) {
        request.log.error(err);
        return sendGrpcError(
          reply,
          grpcError(GrpcStatus.INTERNAL, 'Audit query failed.'),
          SERVICE_NAMES.fulfillment,
        );
      }
    },
  );

  /**
   * GET /fulfillment/orders/export.csv (SF-7) — mirror body của /filter nhưng
   * qua querystring (GET): lists comma-separated, createdAt = ngày đơn
   * YYYY-MM-DD → wrap full-day UTC như dayToTimeRange batches.ts. Multi-segment
   * không conflict /:fulfillCode nhưng đặt cạnh audit cho gọn.
   * Buffer-then-send: loop FilterOrders pageSize 500 theo total page đầu
   * (TOCTOU best-effort) — lỗi gRPC BẤT KỲ page → sendGrpcError TRƯỚC khi
   * send, không bao giờ trả CSV đứt giữa chừng.
   */
  app.get<{ Querystring: ExportOrdersQuery }>('/fulfillment/orders/export.csv', async (request, reply) => {
    const { role } = requireUser(request);
    const q = request.query;
    const createdTime: TimeRange | undefined = q.createdAt
      ? { from: `${q.createdAt}T00:00:00.000Z`, to: `${q.createdAt}T23:59:59.999Z` }
      : undefined;
    const PAGE_SIZE = 500;
    const collected: ProtoOrderItem[] = [];
    let maxPages = 1; // review T4 P1: freeze theo total PAGE ĐẦU — chống unbounded khi total drift/lừa
    let page = 1;
    try {
      for (;;) {
        const resp = await f.filterOrders(
          {
            fulfillCode: q.fulfillCode ?? '',
            batchStatuses: splitIntList(q.batchStatus),
            regionCodes: splitStringList(q.regionCodes),
            shopCodes: splitStringList(q.shopCodes),
            orderStatuses: splitIntList(q.orderStatus),
            createdTime,
            deliveryTime: undefined,
            originalTime: undefined,
            excludeFulfillCodes: [],
            page,
            pageSize: PAGE_SIZE,
          },
          role,
        );
        if (page === 1) {
          maxPages = Math.max(Math.ceil(Number(resp.total) / PAGE_SIZE), 1);
        }
        const items = resp.items ?? [];
        if (items.length === 0) break;
        collected.push(...items);
        if (page >= maxPages) break;
        page += 1;
      }
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
    // Map từ RAW proto items — KHÔNG mapOrderItem: note trên proto nhưng DTO
    // không map; orderCode là GAP proto (documented ở mappers) → cột xuất rỗng.
    const lines = [
      csvRow([...EXPORT_COLUMNS]),
      ...collected.map((o) =>
        csvRow([
          o.fulfillCode,
          '',
          o.batchStatus,
          o.shopAssignment?.shopCode ?? '',
          o.shopAssignment?.shopName ?? '',
          o.shopAssignment?.address ?? '',
          o.deliveryTime?.from ?? '',
          o.deliveryTime?.to ?? '',
          o.note ?? '',
        ]),
      ),
    ];
    reply.type('text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="orders-export-${exportTimestamp(new Date())}.csv"`);
    return await reply.send('\uFEFF' + lines.join(''));
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

  // Dashboard SF-9 — BFF owns aggregation (pattern GetOrderDetail): stats
  // (fulfillment) + FilterBatches (status/shipper per phiếu — batching
  // READ-ONLY, chỉ GỌI) + ListDeliveryStaff (id→name). pageSize 100: dataset
  // dashboard nhỏ, phiếu > 100 ngoài scope SF-9 (ghi nhận, không paginate-loop).
  app.get('/fulfillment/dashboard-stats', async (request, reply) => {
    const { role } = requireUser(request);
    try {
      const [stats, batches, staff] = await Promise.all([
        f.getDashboardStats({}, role),
        deps.batching.filterBatches(
          { search: '', statuses: [], createdTime: undefined, page: 1, pageSize: 100 },
          role,
        ),
        f.listDeliveryStaff({}, role),
      ]);
      const countByBatch = new Map((stats.ordersPerBatch ?? []).map((b) => [b.batchCode, b.count]));
      let delivering = 0;
      let completed = 0;
      let cancelled = 0;
      const loadByStaff = new Map<string, number>();
      const statusByBatch = new Map((batches.items ?? []).map((b) => [b.batchCode, Number(b.status)]));
      const shipperByBatch = new Map((batches.items ?? []).map((b) => [b.batchCode, b.shipperId]));
      for (const [code, count] of countByBatch) {
        const st = statusByBatch.get(code);
        if (st === 0) delivering += count;
        else if (st === 1) completed += count;
        else if (st === 2) cancelled += count;
        const shipper = shipperByBatch.get(code) ?? '';
        loadByStaff.set(shipper, (loadByStaff.get(shipper) ?? 0) + count);
      }
      const workload = (staff.items ?? []).map((s) => ({
        staffId: s.id,
        name: s.name,
        orderCount: loadByStaff.get(s.id) ?? 0,
      }));
      // Đơn phiếu không khớp shipper trong delivery_staff (shipper lạ/rỗng) — gộp bucket "Chưa gán".
      const knownIds = new Set(workload.map((w) => w.staffId));
      let unassigned = 0;
      for (const [shipper, count] of loadByStaff) if (!knownIds.has(shipper)) unassigned += count;
      const totalBatches = Number(batches.total);
      const decided = completed + cancelled;
      const body: DashboardStats = {
        ordersPerDay: (stats.ordersPerDay ?? []).map((d) => ({ date: d.date, count: d.count })),
        totalToday: stats.totalToday,
        pendingApproval: stats.pendingApproval,
        delivering,
        completed,
        cancelled,
        completionRate: decided > 0 ? Math.round((completed / decided) * 100) : 0,
        cancelRate: decided > 0 ? Math.round((cancelled / decided) * 100) : 0,
        totalBatches,
        workload: [
          ...workload,
          ...(unassigned > 0 ? [{ staffId: '', name: 'Chưa gán', orderCount: unassigned }] : []),
        ],
      };
      return await reply.send(body);
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // Chuyển kho D1c — đúng 1 đơn/lần (§9); server-side validation rule 2 §3.6.
  app.post<{ Params: { code: string }; Body: AssignShopHubRequest }>(
    '/fulfillment/:code/assign-shop-hub',
    async (request, reply) => {
      const { role, sub } = requireUser(request);
      try {
        const resp = await f.assignShopHub(
          { fulfillCode: request.params.code, targetShopCode: request.body.toShopCode },
          role,
        );
        // SF-7 audit — fire-and-forget SAU gRPC thành công, fail-open.
        logActivity({
          actor: sub,
          action: 'order.assign_shop',
          targetType: 'order',
          targetId: request.params.code,
          detail: { toShopCode: request.body.toShopCode },
        });
        // SF-10 — dual-source local emit (KAFKA_ENABLED=false): mirror publish
        // 'order.assigned' phía Java (FulfillmentServiceImpl.assignShopHub).
        emitLocalEvent('order.assigned', {
          fulfillCode: request.params.code,
          targetShop: { code: request.body.toShopCode },
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
      const { role, sub } = requireUser(request);
      try {
        const resp = await f.updateNote(
          { fulfillCode: request.params.code, note: request.body.note },
          role,
        );
        logActivity({
          actor: sub,
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
      const { role, sub } = requireUser(request);
      try {
        const resp = await f.updateDeliveryTime(
          { fulfillCode: request.params.code, deliveryTime: request.body.deliveryTime },
          role,
        );
        logActivity({
          actor: sub,
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
    const { role, sub } = requireUser(request);
    try {
      const resp = await deps.batching.completePicking(
        { batchCode: request.body.batchCode },
        role,
      );
      logActivity({
        actor: sub,
        action: 'batch.complete',
        targetType: 'batch',
        targetId: request.body.batchCode,
      });
      // SF-10 — dual-source local emit: mirror publish 'batch.transitioned'
      // (from/to) phía Go (batching_server.go CompletePicking hook).
      emitLocalEvent('batch.transitioned', {
        batchCode: request.body.batchCode,
        from: 'active',
        to: 'completed',
      });
      return await reply.send(resp.batch ? mapBatch(resp.batch) : null);
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.batching);
    }
  });
}
