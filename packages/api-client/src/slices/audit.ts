import { api, createListQuery } from '../api';
import type { PaginationEnvelope } from '../baseQuery';

/**
 * SF-7/SF-11 — Audit viewer slice (FI-256). GET /fulfillment/audit (BFF,
 * Manager-only) → PaginationEnvelope chuẩn. Item `detail` là JSONB mà BFF ĐÃ
 * parse object (hoặc null) — FE KHÔNG double-parse.
 * Date filter gửi bare `YYYY-MM-DD` (D6) — BFF tự wrap UTC day bounds,
 * dateTo exclusive-next-day.
 */
export interface AuditQueryParams {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  /** Bare YYYY-MM-DD (D6) — BFF tự xử lý UTC day bounds. */
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditListItem {
  id: number;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  /** Freeform JSONB — object đã parse từ BFF hoặc null (KHÔNG double-parse). */
  detail: Record<string, unknown> | null;
  /** ISO string từ BFF (`created_at.toISOString()`). */
  createdAt: string;
}

/**
 * Serializer pure — unit-tested: bỏ param rỗng (BFF treats "" như absent),
 * trim whitespace; date giữ nguyên dạng bare YYYY-MM-DD; page/pageSize số.
 */
export function buildAuditQueryParams(q: AuditQueryParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of ['actor', 'action', 'targetType', 'targetId', 'dateFrom', 'dateTo'] as const) {
    const v = q[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  if (q.page && q.page > 1) out.page = q.page;
  if (q.pageSize && q.pageSize > 0) out.pageSize = q.pageSize;
  return out;
}

const enhanced = api.injectEndpoints({
  endpoints: (builder) => ({
    listAudit: builder.query(
      createListQuery<AuditQueryParams, PaginationEnvelope<AuditListItem>>({
        query: (params) => ({
          url: '/fulfillment/audit',
          method: 'GET',
          params: buildAuditQueryParams(params),
        }),
      }),
    ),
  }),
});

export const { useListAuditQuery } = enhanced;
/** Same singleton as `api`, statically typed with this slice's endpoints. */
export const auditApi = enhanced;
