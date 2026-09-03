/**
 * Notification log (SF-23 — FI-268). Ghi + đọc notification_log trên DB
 * fulfillment TRỰC TIẾP từ BFF — mirror audit.ts (SF-7) về shape: pool riêng
 * instance (không share pool audit nhưng cùng FULFILLMENT_DB_* env pattern),
 * fail-open (thiếu env DB → disabled; lỗi INSERT → warn, KHÔNG bao giờ fail
 * caller). dedupe_key unique = eventId envelope → Kafka redelivery idempotent.
 */
import { Pool } from 'pg';

export interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationLogInput {
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
}

export const NOTIFICATIONS_PAGE_SIZE_CAP = 100;
export const NOTIFICATIONS_PAGE_SIZE_DEFAULT = 20;

let pool: Pool | null = null;

/** Lazy pool. Trả null khi thiếu env (notifications disabled — unit test không DB). */
export function getNotificationPool(env: NodeJS.ProcessEnv = process.env): Pool | null {
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

/** Test-only hook (SF-23 T3) — inject pool giả thay vì mock module. */
export function __setNotificationsPoolForTests(p: Pool | null): void {
  pool = p;
}

/** Fire-and-forget, idempotent theo dedupe_key (Kafka redelivery → DO NOTHING). */
export function logNotification(
  n: NotificationLogInput,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const p = getNotificationPool(env);
  if (!p) return;
  void p
    .query(
      'INSERT INTO notification_log (type, title, body, payload, dedupe_key) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (dedupe_key) DO NOTHING',
      [n.type, n.title, n.body, n.payload ?? null, n.dedupeKey ?? null],
    )
    .catch((err: Error) => console.warn(`[notifications] write failed: ${err.message}`));
}

/**
 * Normalize page/pageSize (pattern normalizeAuditPage SF-7 T3 P1): querystring
 * runtime là string/array (?page=a&page=b) — Number.isFinite guard, input rác
 * về default thay vì 500; cap 100 chống dump toàn bảng.
 */
export function normalizeNotificationPage(input: {
  page?: unknown;
  pageSize?: unknown;
}): { page: number; pageSize: number; offset: number } {
  const pageRaw = Number(input.page ?? 1);
  const page = Math.max(Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1, 1);
  const sizeRaw = Number(input.pageSize ?? NOTIFICATIONS_PAGE_SIZE_DEFAULT);
  const size = Number.isFinite(sizeRaw)
    ? Math.max(Math.floor(sizeRaw), 1)
    : NOTIFICATIONS_PAGE_SIZE_DEFAULT;
  const pageSize = Math.min(size, NOTIFICATIONS_PAGE_SIZE_CAP);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** snake_case row → camel DTO; created_at Date → ISO string (pattern audit). */
function mapNotificationRow(r: Record<string, unknown>): NotificationRow {
  return {
    id: r.id as number,
    type: r.type as string,
    title: r.title as string,
    body: r.body as string,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : (r.created_at as string),
  };
}

/** Đọc feed cho GET route — pool thiếu → {items:[],total:0} (fail-open). */
export async function listNotifications(
  page: number,
  pageSize: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ items: NotificationRow[]; total: number }> {
  const p = getNotificationPool(env);
  if (!p) return { items: [], total: 0 };
  const offset = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    p.query(
      'SELECT id, type, title, body, payload, created_at FROM notification_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [pageSize, offset],
    ),
    p.query('SELECT COUNT(*)::int AS c FROM notification_log'),
  ]);
  return {
    items: (items.rows as Array<Record<string, unknown>>).map(mapNotificationRow),
    total: total.rows[0].c as number,
  };
}
