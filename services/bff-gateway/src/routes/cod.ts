/**
 * SF-14 COD routes (FI-259, spec §5): confirm thu per-order + bulk theo phiếu,
 * badge pending (D2), đối soát theo shop theo kỳ (Manager) + drill-down.
 * Guard role-array server-side (D6 — reuse requireRole variadic plugins/auth):
 *   confirm paths = Coordinator/WarehouseOps/Manager/Admin;
 *   settlement paths = Manager/Admin.
 * Kỳ from/to date-only `YYYY-MM-DD` wrap full-day +07:00 (D9) — from inclusive
 * 00:00, to EXCLUSIVE (ngày+1 00:00) — convention riêng của SF-14 (khác d2c
 * inclusive 23:59:59) để kỳ [from, to) khớp aggregate SQL bên Java.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { SettlementDetailItem, SettlementShopRow } from '@hub-store/shared';
import type { ConfirmCodResult } from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import type { FulfillmentApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireRole, requireUser } from '../plugins/auth.js';
import { errorEnvelope, paginated } from '../lib/envelope.js';
import { sendGrpcError } from '../lib/grpc-error.js';

/** Roles được confirm thu COD — D2 là màn ops (D6). */
export const COD_CONFIRM_ROLES = ['Coordinator', 'WarehouseOps', 'Manager', 'Admin'] as const;
/** Roles được xem đối soát + drill-down — màn Settlement Manager (D6). */
export const COD_SETTLEMENT_ROLES = ['Manager', 'Admin'] as const;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/** Date-only `YYYY-MM-DD` → Instant mốc 00:00 +07:00. */
function startOfDayVn(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

/** Formatter date-only ở Asia/Ho_Chi_Minh (en-CA → `YYYY-MM-DD`). */
const VN_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Validate lịch thật: parse rồi format lại ở +07 phải khớp chuỗi gốc — chặn
 * roll-over tàng hình (2026-02-31 → 2026-03-03) và ngày không tồn tại
 * (2026-13-01, 2026-00-10 → Invalid Date).
 */
function isCalendarDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00+07:00`);
  return !Number.isNaN(d.getTime()) && VN_DATE.format(d) === date;
}

/**
 * from/to hợp lệ: đủ + đúng format + tồn tại trong lịch + from ≤ to. Trả
 * bounds [fromIncl, toExcl) (D9) hoặc null khi sai — route map thành 400.
 */
function parsePeriod(
  from: string,
  to: string,
): { from: Date; to: Date } | null {
  if (!isCalendarDate(from) || !isCalendarDate(to)) return null;
  if (from > to) return null;
  // to exclusive = ngày kế 00:00 +07:00 (+07 không DST — cộng 1 ngày an toàn).
  const toExcl = new Date(startOfDayVn(to).getTime() + 86400000);
  return { from: startOfDayVn(from), to: toExcl };
}

function badPeriod(reply: FastifyReply): FastifyReply {
  void reply
    .code(400)
    .send(
      errorEnvelope(
        400,
        'Kỳ đối soát yêu cầu from/to là ngày hợp lệ dạng YYYY-MM-DD và from ≤ to.',
        { code: 'BAD_REQUEST' },
      ),
    );
  return reply;
}

/** DTO row aggregate — int64 Number hóa, camelCase §4. */
function mapSettlementRow(r: SettlementShopRow): SettlementShopRow {
  return {
    shopCode: r.shopCode,
    shopName: r.shopName,
    totalOrders: Number(r.totalOrders),
    totalExpected: Number(r.totalExpected),
    totalCollected: Number(r.totalCollected),
    diffAmount: Number(r.diffAmount),
    pendingCount: Number(r.pendingCount),
    mismatchCount: Number(r.mismatchCount),
  };
}

/** DTO confirmation drill-down — dates ISO string, collectedAmount optional. */
function mapDetailItem(c: {
  fulfillCode: string;
  batchCode: string;
  shopCode: string;
  shopName: string;
  expectedAmount: number | string;
  collectedAmount?: number | string;
  collectedBy: string;
  collectedAt?: Date;
  completedAt?: Date;
  status: number;
}): SettlementDetailItem {
  return {
    fulfillCode: c.fulfillCode,
    batchCode: c.batchCode,
    shopCode: c.shopCode,
    shopName: c.shopName,
    expectedAmount: Number(c.expectedAmount),
    ...(c.collectedAmount !== undefined && c.collectedAmount !== null
      ? { collectedAmount: Number(c.collectedAmount) }
      : {}),
    collectedBy: c.collectedBy,
    collectedAt: c.collectedAt?.toISOString(),
    completedAt: c.completedAt?.toISOString(),
    status: Number(c.status),
  };
}

/** Per-code result passthrough (success/message giữ nguyên — hiện toast FE). */
function mapConfirmResult(r: ConfirmCodResult): ConfirmCodResult {
  return { fulfillCode: r.fulfillCode, success: r.success, message: r.message };
}

export interface CodRouteDeps {
  fulfillment: FulfillmentApi;
}

export function registerCodRoutes(app: FastifyInstance, deps: CodRouteDeps): void {
  const f = deps.fulfillment;

  // POST /cod/confirm — per-order, collectedAmount optional (absence = expected;
  // 0 = thu thật 0 đồng — D3). Actor = preferred_username → x-user-name audit.
  app.post<{ Body: { fulfillCode?: string; collectedAmount?: number } }>(
    '/cod/confirm',
    async (request, reply) => {
      const user = requireRole(request, reply, ...COD_CONFIRM_ROLES);
      if (user === null) return reply;
      const role = user.role;
      const sub = user.sub;
      const body = request.body ?? {};
      if (typeof body.fulfillCode !== 'string' || body.fulfillCode.length === 0) {
        void reply
          .code(400)
          .send(errorEnvelope(400, 'fulfillCode bắt buộc.', { code: 'BAD_REQUEST' }));
        return reply;
      }
      if (
        body.collectedAmount !== undefined &&
        (typeof body.collectedAmount !== 'number' ||
          !Number.isInteger(body.collectedAmount) ||
          body.collectedAmount < 0)
      ) {
        void reply.code(400).send(
          errorEnvelope(400, 'collectedAmount phải là số nguyên ≥ 0 (bỏ trống = lấy expected).', {
            code: 'BAD_REQUEST',
          }),
        );
        return reply;
      }
      try {
        const resp = await f.confirmCod(
          {
            items: [
              {
                fulfillCode: body.fulfillCode,
                ...(body.collectedAmount !== undefined
                  ? { collectedAmount: body.collectedAmount }
                  : {}),
              },
            ],
          },
          role,
          sub,
        );
        return await reply.send({ results: resp.results.map(mapConfirmResult) });
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // POST /cod/confirm-batch — bulk confirm mọi PENDING của phiếu (collected=expected).
  app.post<{ Body: { batchCode?: string } }>('/cod/confirm-batch', async (request, reply) => {
    const user = requireRole(request, reply, ...COD_CONFIRM_ROLES);
    if (user === null) return reply;
    const role = user.role;
    const sub = user.sub;
    const batchCode = (request.body as { batchCode?: string } | undefined)?.batchCode;
    if (typeof batchCode !== 'string' || batchCode.length === 0) {
      void reply
        .code(400)
        .send(errorEnvelope(400, 'batchCode bắt buộc.', { code: 'BAD_REQUEST' }));
      return reply;
    }
    try {
      const resp = await f.confirmBatchCod({ batchCode }, role, sub);
      return await reply.send({
        confirmedCount: Number(resp.confirmedCount),
        totalAmount: Number(resp.totalAmount),
      });
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // GET /cod/pending?batchCode= — badge D2 "COD chờ thu (n)".
  app.get<{ Querystring: { batchCode?: string } }>('/cod/pending', async (request, reply) => {
    const user = requireRole(request, reply, ...COD_CONFIRM_ROLES);
    if (user === null) return reply;
    const batchCode = request.query.batchCode ?? '';
    if (batchCode.length === 0) {
      void reply
        .code(400)
        .send(errorEnvelope(400, 'batchCode bắt buộc.', { code: 'BAD_REQUEST' }));
      return reply;
    }
    try {
      const resp = await f.getCodPending({ batchCode }, user.role);
      return await reply.send({
        pendingCount: Number(resp.pendingCount),
        totalAmount: Number(resp.totalAmount),
      });
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // GET /cod/settlement?from=&to=&page=&pageSize= — aggregate theo shop (Manager).
  app.get<{ Querystring: { from?: string; to?: string; page?: string; pageSize?: string } }>(
    '/cod/settlement',
    async (request, reply) => {
      const user = requireRole(request, reply, ...COD_SETTLEMENT_ROLES);
      if (user === null) return reply;
      const from = request.query.from ?? '';
      const to = request.query.to ?? '';
      const period = parsePeriod(from, to);
      if (!period) return badPeriod(reply);
      try {
        const resp = await f.getSettlement(
          { periodFrom: period.from, periodTo: period.to },
          user.role,
        );
        // Upstream không phân trang — BFF slice trên rows (total = số shop).
        const page = Math.max(Number(request.query.page) || DEFAULT_PAGE, 1);
        const pageSize = Math.max(Number(request.query.pageSize) || DEFAULT_PAGE_SIZE, 1);
        const rows = resp.rows.map(mapSettlementRow);
        const start = (page - 1) * pageSize;
        return await reply.send(
          paginated(rows.slice(start, start + pageSize), rows.length, page, pageSize),
        );
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // GET /cod/settlement/detail?shopCode=&from=&to= — drill-down confirmations.
  app.get<{ Querystring: { shopCode?: string; from?: string; to?: string; page?: string; pageSize?: string } }>(
    '/cod/settlement/detail',
    async (request, reply) => {
      const user = requireRole(request, reply, ...COD_SETTLEMENT_ROLES);
      if (user === null) return reply;
      const shopCode = request.query.shopCode ?? '';
      const from = request.query.from ?? '';
      const to = request.query.to ?? '';
      if (shopCode.length === 0) {
        void reply
          .code(400)
          .send(errorEnvelope(400, 'shopCode bắt buộc.', { code: 'BAD_REQUEST' }));
        return reply;
      }
      const period = parsePeriod(from, to);
      if (!period) return badPeriod(reply);
      try {
        const resp = await f.getSettlementDetail(
          { shopCode, periodFrom: period.from, periodTo: period.to },
          user.role,
        );
        const page = Math.max(Number(request.query.page) || DEFAULT_PAGE, 1);
        const pageSize = Math.max(Number(request.query.pageSize) || DEFAULT_PAGE_SIZE, 1);
        const items = resp.confirmations.map(mapDetailItem);
        const start = (page - 1) * pageSize;
        return await reply.send(
          paginated(items.slice(start, start + pageSize), items.length, page, pageSize),
        );
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );
}
