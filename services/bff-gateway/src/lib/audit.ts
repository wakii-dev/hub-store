/**
 * Audit trail (SF-7 — FI-252). Ghi + đọc activity_log trên DB fulfillment
 * TRỰC TIẾP từ BFF — 1 chỗ nhất quán cho mọi mutation (spec §2: "qua BFF
 * plugin nếu dễ hơn"). Fail-open: thiếu env DB → disabled; lỗi INSERT →
 * warn, KHÔNG bao giờ fail mutation. Pool timeout ngắn chống exhaustion.
 */
import { Pool } from 'pg';

export interface AuditEntry {
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  detail?: Record<string, unknown>;
}

export interface AuditQuery {
  actor?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export const AUDIT_PAGE_SIZE_CAP = 100;
export const AUDIT_PAGE_SIZE_DEFAULT = 20;

let pool: Pool | null = null;

/** Lazy pool. Trả null khi thiếu env (audit disabled — unit test không DB). */
export function getAuditPool(env: NodeJS.ProcessEnv = process.env): Pool | null {
  const host = env.FULFILLMENT_DB_HOST;
  if (!host) return null;
  if (!pool) {
    pool = new Pool({
      host,
      port: Number(env.FULFILLMENT_DB_PORT ?? 5432),
      database: env.FULFILLMENT_DB_NAME ?? 'fulfillment',
      user: env.FULFILLMENT_DB_USER ?? 'hubstore',
      password: env.FULFILLMENT_DB_PASSWORD ?? '',
      max: 5,
      connectionTimeoutMillis: 3000,
      statement_timeout: 3000,
    });
  }
  return pool;
}

/** Test-only hook (SF-7 T2) — inject pool giả thay vì mock module. */
export function __setAuditPoolForTests(p: Pool | null): void {
  pool = p;
}

/** Fire-and-forget. Gọi SAU khi gRPC mutation thành công — KHÔNG await. */
export function logActivity(entry: AuditEntry, env: NodeJS.ProcessEnv = process.env): void {
  const p = getAuditPool(env);
  if (!p) return;
  void p
    .query(
      'INSERT INTO activity_log (actor, action, target_type, target_id, detail) VALUES ($1,$2,$3,$4,$5)',
      [entry.actor, entry.action, entry.targetType, entry.targetId, entry.detail ?? null],
    )
    .catch((err: Error) => console.warn(`[audit] write failed: ${err.message}`));
}

/** LIKE escape như SF-2 PostgresOrderRepository.escapeLike — wildcard user bị vô hiệu. */
export function escapeLike(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Date pin (spec §2 In-3): bare `YYYY-MM-DD` = UTC day bounds — dateFrom
 * inclusive `>=` 00:00:00Z, dateTo exclusive `<` 00:00:00Z NGÀY KẾ. Full
 * ISO-8601 → so trực tiếp. Múi giờ tham chiếu: UTC (BFF chạy UTC).
 */
export function parseDateBound(input: string, bound: 'from' | 'to'): Date | null {
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (bare) {
    const d = Date.UTC(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
    // JS Date lenient (`2026-13-45` → rollover 2027-02-14) — round-trip check
    // để từ chối month/day ngoài miền (spec: invalid → null).
    if (new Date(d).toISOString().slice(0, 10) !== input) return null;
    return bound === 'from' ? new Date(d) : new Date(d + 24 * 3600 * 1000);
  }
  const t = new Date(input);
  if (Number.isNaN(t.getTime())) return null;
  // Full ISO — round-trip check prefix YYYY-MM-DD (rollover month/day ngoài miền).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (m && new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) {
    return null;
  }
  return t;
}

/** WHERE động + params — pure, vitest trực tiếp. */
export function buildAuditWhere(q: AuditQuery): { whereSql: string; params: unknown[] } {
  const where: string[] = ['TRUE'];
  const params: unknown[] = [];
  if (q.actor) { params.push(`%${escapeLike(q.actor)}%`); where.push(`actor ILIKE $${params.length} ESCAPE '\\'`); }
  if (q.action) { params.push(`%${escapeLike(q.action)}%`); where.push(`action ILIKE $${params.length} ESCAPE '\\'`); }
  if (q.targetType) { params.push(q.targetType); where.push(`target_type = $${params.length}`); }
  if (q.targetId) { params.push(`%${escapeLike(q.targetId)}%`); where.push(`target_id ILIKE $${params.length} ESCAPE '\\'`); }
  if (q.dateFrom) { const d = parseDateBound(q.dateFrom, 'from'); if (d) { params.push(d); where.push(`created_at >= $${params.length}`); } }
  if (q.dateTo) { const d = parseDateBound(q.dateTo, 'to'); if (d) { params.push(d); where.push(`created_at < $${params.length}`); } }
  return { whereSql: where.join(' AND '), params };
}

export function normalizeAuditPage(q: AuditQuery): { page: number; pageSize: number; offset: number } {
  const page = Math.max(q.page ?? 1, 1);
  const pageSize = Math.min(Math.max(q.pageSize ?? AUDIT_PAGE_SIZE_DEFAULT, 1), AUDIT_PAGE_SIZE_CAP);
  return { page, pageSize, offset: (page - 1) * pageSize };
}
