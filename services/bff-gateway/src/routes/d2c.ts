/**
 * SF-18 D2C/Dropship routes (FI-263, spec §3.3):
 *   POST /d2c-orders/filter · PUT /d2c-orders/{orderCode}/note
 *   GET /d2c-orders/export?from=&to=  (BFF-assemble CSV, KHÔNG streaming proto)
 * Role guard per-route: role ∈ D2C_ROLES (WarehouseEmployee/WarehouseOps/Manager)
 * — KHÔNG phụ thuộc KNOWN_ROLES timing (WarehouseEmployee được thêm ở Task 4).
 * Export guard: date-only +07:00, blocked khi (to-from) > 31 ngày hoặc from > to.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  D2cOrder,
  FilterD2cOrdersRequest,
} from '../../../../api/proto/gen/ts/hubstore/fulfillment/v1/fulfillment';
import type { FulfillmentApi } from '../clients/index.js';
import { SERVICE_NAMES } from '../config.js';
import { requireUser } from '../plugins/auth.js';
import { errorEnvelope, paginated } from '../lib/envelope.js';
import { sendGrpcError } from '../lib/grpc-error.js';

/** Roles được phép truy cập D2C — spec §3.3 (Coordinator KHÔNG có). */
export const D2C_ROLES = ['WarehouseEmployee', 'WarehouseOps', 'Manager'] as const;

const EXPORT_RANGE_MESSAGE = 'Khoảng thời gian export tối đa 31 ngày';
const EXPORT_PAGE_SIZE = 500;
const CSV_HEADER =
  'Mã đơn,Mã nội bộ,Mã vận đơn,Hãng vận chuyển,Shop,Người xuất,Thời gian xuất,Thời gian đẩy,' +
  'Người nhận,Điện thoại,Địa chỉ,Loại dịch vụ,Ngành hàng,Loại sản phẩm,Tách nợ,Ghi chú,Trạng thái,Ngày tạo';

/** DTO D2C item — dates ISO string (camelCase §4, không leak shape proto). */
export interface D2cOrderDto {
  orderCode: string;
  orderIdInter: string;
  deliveryId: string;
  carrier: string;
  shop: string;
  exportEmployee: string;
  exportTime?: string;
  pushTime?: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  serviceType: string;
  productCategory: string;
  productType: string;
  isDebtSplitting: boolean;
  note: string;
  status: string;
  createdAt?: string;
  id: number;
}

function mapD2cItem(o: D2cOrder): D2cOrderDto {
  return {
    orderCode: o.orderCode,
    orderIdInter: o.orderIdInter,
    deliveryId: o.deliveryId,
    carrier: o.carrier,
    shop: o.shop,
    exportEmployee: o.exportEmployee,
    exportTime: o.exportTime?.toISOString(),
    pushTime: o.pushTime?.toISOString(),
    receiverName: o.receiverName,
    receiverPhone: o.receiverPhone,
    receiverAddress: o.receiverAddress,
    serviceType: o.serviceType,
    productCategory: o.productCategory,
    productType: o.productType,
    isDebtSplitting: o.isDebtSplitting,
    note: o.note,
    status: o.status,
    createdAt: o.createdAt?.toISOString(),
    id: Number(o.id),
  };
}

/** Role guard per-route — 403 envelope khi role ngoài D2C_ROLES. */
function requireD2cRole(request: FastifyRequest, reply: FastifyReply): boolean {
  const caller = requireUser(request);
  if (!(D2C_ROLES as readonly string[]).includes(caller.role)) {
    void reply.code(403).send(
      errorEnvelope(403, 'Role của bạn không có quyền truy cập D2C.', {
        code: 'PERMISSION_DENIED',
      }),
    );
    return false;
  }
  return true;
}

/** Số ngày giữa 2 ngày date-only (mốc 00:00 +07:00) — guard dùng chung công thức FE. */
export function exportRangeDays(from: string, to: string): number {
  const f = new Date(`${from}T00:00:00+07:00`);
  const t = new Date(`${to}T00:00:00+07:00`);
  return Math.round((t.getTime() - f.getTime()) / 86400000);
}

/** from/to hợp lệ cho export: đủ + YYYY-MM-DD + from ≤ to + ≤ 31 ngày. */
function isValidExportRange(from: string, to: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return false;
  if (from > to) return false;
  return exportRangeDays(from, to) <= 31;
}

/** Format timestamp → 'yyyy-MM-dd HH:mm:ss' theo múi giờ VN (CSV + Excel). */
function fmtCsvTime(d: Date | undefined): string {
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * CSV escape: bọc `"..."` khi chứa , " hoặc newline; `"` đôi thành `""`.
 * Chống CSV formula injection (OWASP): giá trị bắt đầu bằng = + - @ \t \r
 * được prefix `'` để Excel/LibreOffice không thực thi formula.
 */
function csvEscape(v: string): string {
  const neutralized = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  if (/[",\n\r]/.test(neutralized)) return `"${neutralized.replace(/"/g, '""')}"`;
  return neutralized;
}

function d2cCsvRow(o: D2cOrder): string {
  const cells = [
    o.orderCode,
    o.orderIdInter,
    o.deliveryId,
    o.carrier,
    o.shop,
    o.exportEmployee,
    fmtCsvTime(o.exportTime),
    fmtCsvTime(o.pushTime),
    o.receiverName,
    o.receiverPhone,
    o.receiverAddress,
    o.serviceType,
    o.productCategory,
    o.productType,
    o.isDebtSplitting ? 'Có' : 'Không',
    o.note,
    o.status,
    fmtCsvTime(o.createdAt),
  ];
  return cells.map(csvEscape).join(',');
}

interface D2cFilterBody {
  search?: string;
  statuses?: string[];
  carriers?: string[];
  shops?: string[];
  exportEmployees?: string[];
  productCategory?: string;
  productType?: string;
  createdFrom?: string;
  createdTo?: string;
  pushFrom?: string;
  pushTo?: string;
  pushSlotFrom?: string;
  pushSlotTo?: string;
  page?: number;
  pageSize?: number;
}

function mapFilterBody(b: D2cFilterBody): FilterD2cOrdersRequest {
  const iso = (v?: string): Date | undefined => (v ? new Date(v) : undefined);
  return {
    search: b.search ?? '',
    statuses: b.statuses ?? [],
    carriers: b.carriers ?? [],
    shops: b.shops ?? [],
    exportEmployees: b.exportEmployees ?? [],
    productCategory: b.productCategory ?? '',
    productType: b.productType ?? '',
    createdFrom: iso(b.createdFrom),
    createdTo: iso(b.createdTo),
    pushFrom: iso(b.pushFrom),
    pushTo: iso(b.pushTo),
    pushSlotFrom: b.pushSlotFrom ?? '',
    pushSlotTo: b.pushSlotTo ?? '',
    page: b.page ?? 1,
    pageSize: b.pageSize ?? 20,
  };
}

export interface D2cRouteDeps {
  fulfillment: FulfillmentApi;
}

export function registerD2cRoutes(app: FastifyInstance, deps: D2cRouteDeps): void {
  const f = deps.fulfillment;

  // D2C list — filter đa chiều + pagination (envelope chuẩn).
  app.post<{ Body: D2cFilterBody }>('/d2c-orders/filter', async (request, reply) => {
    if (!requireD2cRole(request, reply)) return reply;
    try {
      const req = mapFilterBody(request.body ?? {});
      const resp = await f.filterD2cOrders(req, requireUser(request));
      return await reply.send(
        paginated(resp.items.map(mapD2cItem), Number(resp.total), req.page, req.pageSize),
      );
    } catch (err) {
      return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
    }
  });

  // Ghi chú — khóa nghiệp vụ order_code (precedent UpdateNote khóa fulfill_code).
  app.put<{ Params: { orderCode: string }; Body: { note: string } }>(
    '/d2c-orders/:orderCode/note',
    async (request, reply) => {
      const caller = requireUser(request);
      if (!requireD2cRole(request, reply)) return reply;
      const rawNote = (request.body as { note?: string } | undefined)?.note;
      if (typeof rawNote !== 'string' || rawNote.length > 500) {
        void reply
          .code(400)
          .send(errorEnvelope(400, 'Ghi chú bắt buộc là chuỗi ≤ 500 ký tự.', { code: 'BAD_REQUEST' }));
        return reply;
      }
      try {
        const resp = await f.updateD2cOrderNote(request.params.orderCode, rawNote, caller);
        return await reply.send({ item: resp.order ? mapD2cItem(resp.order) : null });
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );

  // Export CSV ≤31 ngày — BFF-assemble (loop FilterD2cOrders pageSize 500),
  // chỉ theo from/to (không mang filter khác — spec §3.3).
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/d2c-orders/export',
    async (request, reply) => {
      if (!requireD2cRole(request, reply)) return reply;
      const from = request.query.from ?? '';
      const to = request.query.to ?? '';
      if (!isValidExportRange(from, to)) {
        void reply.code(400).send(errorEnvelope(400, EXPORT_RANGE_MESSAGE, { code: 'BAD_REQUEST' }));
        return reply;
      }
      try {
        const caller = requireUser(request);
        const items: D2cOrder[] = [];
        let page = 1;
        let total = Number.POSITIVE_INFINITY;
        // from/to = khoảng NGÀY TẠO (created_at) — bounds full-day theo giờ VN.
        const rangeFilter = {
          search: '',
          statuses: [],
          carriers: [],
          shops: [],
          exportEmployees: [],
          productCategory: '',
          productType: '',
          createdFrom: new Date(`${from}T00:00:00+07:00`),
          createdTo: new Date(`${to}T23:59:59+07:00`),
          pushFrom: undefined,
          pushTo: undefined,
          pushSlotFrom: '',
          pushSlotTo: '',
          page,
          pageSize: EXPORT_PAGE_SIZE,
        };
        while (items.length < total) {
          const resp = await f.filterD2cOrders(
            { ...rangeFilter, page },
            caller,
          );
          total = Number(resp.total);
          items.push(...resp.items);
          if (resp.items.length === 0) break; // upstream hết data sớm hơn total — tránh loop vô hạn
          page++;
        }
        // BOM \uFEFF để Excel decode UTF-8 đúng tiếng Việt.
        const csv = `\uFEFF${CSV_HEADER}\n${items.map(d2cCsvRow).join('\n')}`;
        reply.header('content-type', 'text/csv; charset=utf-8');
        reply.header('content-disposition', `attachment; filename="D2C_Order_${from}_${to}.csv"`);
        return await reply.send(Buffer.from(csv, 'utf8'));
      } catch (err) {
        return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
      }
    },
  );
}
