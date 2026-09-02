# Plan: FI-245 SF-7 — BE foundation: audit log + export CSV + pagination

Date: 2026-09-02 | Linear: FI-252 | Worktree: sf-7-audit-export-pagination
Spec: `docs/superpowers/specs/2026-09-02-fi245-sf7-audit-export-pagination-design.md` (contract — date
UTC pin, Manager-only /audit, buffer-then-send export, fire-and-forget audit, Go List() bất biến)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit trail cho mọi mutation (bảng `activity_log` + ghi tại BFF), GET /audit (Manager), export orders CSV theo filter, pagination SQL cho batches — endpoint cũ KHÔNG vỡ.

**Architecture:** BFF là cổng duy nhất của mutation user-facing → audit ghi tại MỘT chỗ ở BFF (pg trực tiếp DB fulfillment, fail-open fire-and-forget). Schema thuộc fulfillment-service (Flyway V2). Go batches: method SQL pagination MỚI trên PostgresStore, `List()` giữ nguyên. Proto KHÔNG đổi.

**Tech Stack:** Java 17 Spring Boot 3 + Flyway · Go 1.19 + pgx v5 · Fastify + TypeScript + `pg` · vitest · Playwright (chỉ chạy, không sửa)

**Boundary (KHÔNG làm):** UI (SF-11), auth (SF-4), compose (SF-1), proto changes, sửa E2E specs cũ, đổi shape response cũ. Comments tiếng Việt theo convention repo.

---

## 0. Root cause analysis

**Root cause:** Hệ thống reconstruct từ Monolith không có tầng quan sát — mutation chạy trực tiếp repo→DB, actor hardcode `"fulfillment-service"` (`FulfillmentServiceImpl.assignShopHub`), không bảng audit, không export, batches paginate in-memory.
**Current state:** Manager không trả lời được "ai làm gì với đơn này khi nào"; không tải được danh sách ra Excel; batches scale tồi (List toàn bộ rồi slice).
**Expected outcome:** psql thấy audit row đúng actor/action sau mỗi mutate; GET /audit filter actor/date; CSV mở Excel được đúng số dòng theo filter; batches paginate SQL.
**Constraints:** Legacy compat tuyệt đối (E2E cũ xanh KHÔNG sửa — envelope `{items,page,pageSize,total}` bị contract test pin); audit best-effort fail-open (không được làm vỡ mutation).
**Strategy:** Thêm dọc kiến trúc hiện có — schema ở service sở hữu DB, ghi+đọc audit ở BFF (spec slice §2 cho phép, "1 chỗ nhất quán"), pagination Go là method mới giữ sort semantics.

## 1. Problem

Thiếu nền tảng BE cho audit viewer + export UI (SF-11): không có bảng/query audit, không có CSV export, batches pagination in-memory không scale.

## 2. Scope

- **In:** V2 `activity_log` (fulfillment DB); audit write tại BFF mutation routes (orders: assign-shop-hub, note, delivery-time; batches: create, cancel, complete-picking); `GET /fulfillment/audit` (Manager-only, filter actor/action/targetType/targetId/dateFrom/dateTo, pageSize cap 100 default 20); `GET /fulfillment/orders/export.csv` (buffer-then-send, BOM, formula-guard, `attachment; filename="orders-export-<ts>.csv"`, 9 cột pin); Go `Filter` SQL pagination; legacy compat check.
- **Out:** UI, proto, Kafka, auth, outbox/sync guarantee, order-level status mutation route (không tồn tại ở BFF — cancel/complete đi qua batch ops).
- **Success criteria:** 5 dòng ACCEPTANCE context pack (psuil audit row · /audit filter đúng · CSV Excel + đúng số dòng · page/pageSize cũ xanh · go test + mvn test pass).

## 3. Touch map

- Modify: `services/fulfillment-service/src/main/resources/db/migration/` (THÊM V2, KHÔNG sửa V1) · `services/bff-gateway/src/lib/audit.ts` (MỚI) · `src/lib/csv.ts` (MỚI) · `src/routes/fulfillment.ts` (hooks + 2 route mới) · `src/routes/batches.ts` (hooks) · `package.json` (+pg, +@types/pg) · `services/batching-service/internal/store/store.go` (+Filter) · `internal/server/batching_server.go` (FilterBatches dùng SQL)
- Consumers/regression: `bff.contract.test.ts` (pin envelope) · Go `TestList_OrderingCreatedAtThenCode` (pin List) · E2E `04-regression-8b.spec.ts` (pagination UI) · `01-main-flow.spec.ts`
- Shared surfaces: DB fulfillment (bảng mới — additive) · env `FULFILLMENT_DB_*` (đã có, tái dùng) · KHÔNG đổi proto/API cũ

## 4. Design

- **Audit location:** BFF (direction A — spec §0). Actor = `request.user.sub` (= preferred_username, đã verify `auth.ts:69-74`).
- **Audit writer:** pg Pool lazy (`max:5, connectionTimeoutMillis:3000, statement_timeout:3000`); `logActivity()` INSERT fire-and-forget `.catch(warn)`; gọi SAU gRPC thành công, trước `reply.send`, KHÔNG await. Thiếu env DB → disabled (unit test không DB vẫn xanh).
- **Actions:** `order.assign_shop`, `order.update_note`, `order.update_delivery_time`, `batch.create`, `batch.cancel`, `batch.complete`. detail JSONB = tham số nghiệp vụ chính.
- **GET /fulfillment/audit:** Manager-only (role khác → 403 error envelope); WHERE động ILIKE escape `\ % _` (pattern SF-2 `escapeLike`); date pin: bare `YYYY-MM-DD` = UTC day bounds (`dateFrom >=` 00:00Z inclusive, `dateTo <` ngày kế exclusive), full ISO so trực tiếp; ORDER `created_at DESC, id DESC`; envelope paginated.
- **Export CSV:** GET query params mirror list body (`fulfillCode, batchStatus, regionCodes, shopCodes, orderStatus` — array = comma-separated; `createdAt` YYYY-MM-DD → wrap `T00:00:00.000Z/T23:59:59.999Z` như `dayToTimeRange` batches.ts:32); loop FilterOrders pageSize 500 theo `total` page đầu (TOCTOU best-effort); buffer toàn bộ rồi mới send (lỗi gRPC bất kỳ page → error envelope TRƯỚC headers); UTF-8 BOM `\uFEFF`; cột pin: `fulfillCode, orderCode, batchStatus, shopCode, shopName, shopAddress, deliveryFrom, deliveryTo, note`.
- **Go Filter:** `Filter(ctx, BatchFilter{Search, Statuses, CreatedFrom, CreatedTo, Page, PageSize}) ([]*batchingv1.Batch, int64, error)` — scalar count subquery + LATERAL (deviation có chủ đích vs "COUNT OVER" stale text trong context pack — SF-2 thực tế dùng scalar subquery); WHERE port đúng semantics của `FilterBatches` in-memory hiện tại (đọc batching_server.go:187-239 trước); sort `created_at ASC, batch_code ASC`; OFFSET/LIMIT params cuối; items qua `attachItems`. `List()` KHÔNG đổi.
- **Route order:** `/fulfillment/audit` (GET, single-segment) PHẢI register TRƯỚC `GET /fulfillment/:fulfillCode` (cùng pattern criteria-trước-:code ở batches.ts:110). `/fulfillment/orders/export.csv` multi-segment không conflict nhưng đặt cạnh audit cho gọn.

## 5. Implementation outline

Tasks: T1 V2+audit-lib+env-wiring → T2 audit-hooks → T3 audit-query → T4 export-csv → T6 compat+tests; T5 go-pagination chạy TIER 1 song song T1 (plan-critic: T3+T4 cùng file `fulfillment.ts` → serialize T3→T4; T5 false-dep T2 đã bỏ; T6 chờ T3,T4,T5).
File structure: BFF lib `src/lib/{audit,csv}.ts` + route additions trong `fulfillment.ts`/`batches.ts` (theo convention hiện có — không tạo route file mới); Go method trong `store.go` + test `store_test.go`.
Testing: vitest pure (date/where-builder/CSV escape + route với pg stub); Go testdb (skip-when-no-DB); Java chỉ cần `mvn test` xanh (V2 không đổi logic Java — verify Flyway apply khi chạy stack ở T6/Phase 5).

## 6. Risks & unknowns

- Verify trước code: đọc batching_server.go:187-239 (port đúng filter semantics); đọc mappers/fulfillment.ts (mapOrderItem fields cho CSV cột).
- Giả định chưa verify: harness test buildApp không cần pg (audit lib disabled khi thiếu env) — T1 test ngay.
- Export lớn → memory: chấp nhận (quy mô hiện tại ~trăm đơn; buffer-then-send là trade-off đã duyệt ở spec).

---

### Task 1: Flyway V2 activity_log + BFF audit lib (pg pool + query builder) + tests

**Files:**
- Create: `services/fulfillment-service/src/main/resources/db/migration/V2__activity_log.sql`
- Create: `services/bff-gateway/src/lib/audit.ts`
- Create: `services/bff-gateway/test/audit.lib.test.ts`
- Modify: `services/bff-gateway/package.json` (+`pg`, +`@types/pg`)

- [ ] **Step 1: Migration V2** (style khớp V1 — timestamptz, comment tiếng Việt)

```sql
-- SF-7 (FI-252): audit trail mọi mutation. Append-only — KHÔNG update/delete.
-- Actor = preferred_username từ JWT (BFF ghi qua lib/audit.ts, fail-open).
CREATE TABLE activity_log (
    id          BIGSERIAL PRIMARY KEY,
    actor       VARCHAR      NOT NULL,
    action      VARCHAR      NOT NULL,
    target_type VARCHAR      NOT NULL,
    target_id   VARCHAR      NOT NULL,
    detail      JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_log_actor_created ON activity_log (actor, created_at DESC);
CREATE INDEX idx_activity_log_action ON activity_log (action);
CREATE INDEX idx_activity_log_target ON activity_log (target_type, target_id);
```

- [ ] **Step 2: `cd services/bff-gateway && npm install pg && npm install -D @types/pg`**
- [ ] **Step 3: `src/lib/audit.ts`** — pool + fire-and-forget write + pure query builder (test được không cần DB):

```typescript
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
    return bound === 'from' ? new Date(d) : new Date(d + 24 * 3600 * 1000);
  }
  const t = new Date(input);
  return Number.isNaN(t.getTime()) ? null : t;
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
```

- [ ] **Step 4: test `test/audit.lib.test.ts`** — parseDateBound (bare date UTC bounds from/to; full ISO; invalid → null), buildAuditWhere (mỗi filter, combo, escape `%`), normalizeAuditPage (cap 100, default 20, page<1→1). Vitest thuần, không mock DB.
- [ ] **Step 5: Wire env cho BFF (plan-critic P0#2 — additive compose edit):** `docker-compose.yml` service `bff` CHƯA có `FULFILLMENT_DB_*` (chỉ fulfillment-service có) → thêm block env additive vào bff (KHÔNG đụng phần khác của SF-1):

```yaml
    environment:
      FULFILLMENT_DB_HOST: postgres            # đã có host name — đối chiếu fulfillment-service env
      FULFILLMENT_DB_PORT: 5432
      FULFILLMENT_DB_NAME: fulfillment
      FULFILLMENT_DB_USER: ${POSTGRES_USER}
      FULFILLMENT_DB_PASSWORD: ${POSTGRES_PASSWORD}
```

+ `.env.example` ghi chú BFF audit dùng chung credentials. Ghi chú boundary deviation: additive-only, cần cho ACCEPTANCE #1. `docker compose config` để verify YAML.
- [ ] **Step 6: Validate V2 trên DB thật (fail sớm — P1):** nếu dev Postgres chạy (`docker compose ps postgres`): `docker compose exec -T postgres psql -U $POSTGRES_USER -d fulfillment -c "\d activity_log"` SAU khi boot fulfillment-service 1 lần (Flyway apply on boot), HOẶC apply tay file V2 bằng psql để bắt syntax. Không có DB → ghi rõ deferred sang Phase 5.
- [ ] **Step 7: Run** `cd services/bff-gateway && npx vitest run test/audit.lib.test.ts` → PASS. Chạy thêm `npx vitest run` toàn bộ → cũ vẫn xanh (chưa đụng route).
- [ ] **Step 8: Commit** `feat(fi245-sf7): activity_log Flyway V2 + BFF audit lib (pg pool fail-open + query builder) + bff env wiring`

### Task 2: Audit hooks tại mọi mutation route BFF + test fail-open

**Files:**
- Modify: `services/bff-gateway/src/routes/fulfillment.ts` (assign-shop-hub, note, delivery-time, complete-picking)
- Modify: `services/bff-gateway/src/routes/batches.ts` (create, cancel)
- Create: `services/bff-gateway/test/audit.hooks.test.ts`

- [ ] **Step 1: Pattern chung** — import `logActivity` từ `../lib/audit.js`; sau gRPC thành công, trước `reply.send`:

```typescript
// ví dụ fulfillment.ts assign-shop-hub (port tương tự cho 5 route còn lại):
const resp = await f.assignShopHub({...}, role);
logActivity({
  actor: request.user.sub,
  action: 'order.assign_shop',
  targetType: 'order',
  targetId: request.params.code,
  detail: { toShopCode: request.body.toShopCode },
});
return await reply.send(...);
```

Mapping đầy đủ: `order.assign_shop` (detail `{toShopCode}`) · `order.update_note` (`{noteLength: (note??'').length}`) · `order.update_delivery_time` (`{from, to}` của deliveryTime) · `batch.create` (batches.ts, `{orderCodes: request.body.orderCodes}` — targetId = `resp.batch.batchCode` nếu có, fallback `''`) · `batch.cancel` (`{reason}`) · `batch.complete` (complete-picking ở fulfillment.ts, targetId = batchCode body). Actor: `request.user.sub` (đã verify = preferred_username).
- [ ] **Step 2: test hooks** — dùng pattern harness (`authedInject` + mock gRPC upstream); inject pool giả: export `__setAuditPoolForTests(p)` trong audit.ts (set/unset biến `pool`) hoặc mock `getAuditPool` qua vitest `vi.mock`. Assert: mutation 200 → INSERT call 1 lần với đúng actor/action/targetId; pg throwing → mutation VẪN 200 (fail-open).
- [ ] **Step 3: Run** `npx vitest run` → mới PASS + cũ xanh (routes cũ contract không đổi).
- [ ] **Step 4: Commit** `feat(fi245-sf7): audit hooks tại 6 mutation route BFF (fire-and-forget fail-open)`

### Task 3: GET /fulfillment/audit — Manager-only + filter + pagination

**Files:**
- Modify: `services/bff-gateway/src/routes/fulfillment.ts` (route ĐẶT TRƯỚC `/fulfillment/:fulfillCode` — route order!)
- Create: `services/bff-gateway/test/audit.route.test.ts`

- [ ] **Step 1: Route** (đặt cạnh các route static; Fastify find-my-way ưu tiên static `/fulfillment/audit` over parametric `/:fulfillCode` bất kể thứ tự — giữ mọi route trong 1 file theo convention):

```typescript
// Audit viewer (SF-7) — Manager-only (bracket SF-11). Route order: TRƯỚC
// /fulfillment/:fulfillCode (single-segment conflict — pattern batches criteria).
app.get<{ Querystring: AuditQuery }>(
  '/fulfillment/audit',
  async (request, reply) => {
    const { role } = requireUser(request);
    if (role !== 'Manager') {
      return sendGrpcError(reply, grpcError(GrpcStatus.PERMISSION_DENIED, 'Manager only.'), SERVICE_NAMES.fulfillment);
    }
    const p = getAuditPool();
    if (!p) {
      return sendGrpcError(reply, grpcError(GrpcStatus.UNAVAILABLE, 'Audit store unavailable.'), SERVICE_NAMES.fulfillment);
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
      const items = rows.filter((r) => r.id != null).map((r) => ({
        id: Number(r.id), actor: r.actor, action: r.action,
        targetType: r.target_type, targetId: r.target_id,
        detail: r.detail ?? null, createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));
      return await reply.send(paginated(items, total, page, pageSize));
    } catch (err) {
      request.log.error(err);
      return sendGrpcError(reply, grpcError(GrpcStatus.INTERNAL, 'Audit query failed.'), SERVICE_NAMES.fulfillment);
    }
  },
);
```

- [ ] **Step 2: test route** — harness: Manager token → 200 envelope `{items,page,pageSize,total}`; Coordinator → 403; filter querystring actor/dateFrom/dateTo đẩy đúng vào WHERE (stub pool capture SQL+params); pageSize 500 → query pageSize 100 (cap).
- [ ] **Step 3: Run** `npx vitest run` → PASS + cũ xanh. **Commit** `feat(fi245-sf7): GET /fulfillment/audit — Manager-only, filter actor/action/date (UTC pin), pagination cap 100`

### Task 4: GET /fulfillment/orders/export.csv — buffer-then-send, Excel-safe

**Files:**
- Create: `services/bff-gateway/src/lib/csv.ts`
- Modify: `services/bff-gateway/src/routes/fulfillment.ts` (route mới, đặt cạnh audit)
- Create: `services/bff-gateway/test/export.csv.test.ts`

- [ ] **Step 1: `src/lib/csv.ts`** (pure, test không HTTP):

```typescript
/** CSV cell Excel-safe (spec §2 In-4): formula-guard TRƯỚC quoting. */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',') + '\r\n';
}
export const EXPORT_COLUMNS = [
  'fulfillCode', 'orderCode', 'batchStatus', 'shopCode', 'shopName',
  'shopAddress', 'deliveryFrom', 'deliveryTo', 'note',
] as const;
```

- [ ] **Step 2: Route export** — GET querystring mirror list body: `fulfillCode`, `batchStatus` (comma list → number[]), `regionCodes`, `shopCodes`, `orderStatus` (comma lists), `createdAt` (YYYY-MM-DD → `dayToTimeRange`-style wrap `T00:00:00.000Z`/`T23:59:59.999Z`). requireUser (mọi role — D1 list role-open). Loop `f.filterOrders` page=1.. pageSize=500 theo `total` page đầu (dừng khi items rỗng hoặc đủ total). **Map từ RAW proto items (KHÔNG qua `mapOrderItem`)** — plan-critic P0#1: DTO không có `orderCode` (GAP documented, KHÔNG đổi proto) → cột xuất rỗng; `note` có trên proto (field 15) nhưng mapOrderItem không map; shop fields lồng trong `shopAssignment`. LỖI gRPC bất kỳ page → `sendGrpcError` TRƯỚC khi send (buffer-then-send). Thành công:

```typescript
// raw proto item fields (ts-proto camelCase): fulfillCode, batchStatus,
// shopAssignment{shopCode,shopName,address}, deliveryTime{from,to}, note.
// orderCode: GAP proto — xuất rỗng (pattern GAP đã document ở mappers).
const lines = [csvRow(EXPORT_COLUMNS), ...resp.items.map((o) => csvRow([
  o.fulfillCode, '', o.batchStatus, o.shopAssignment?.shopCode ?? '',
  o.shopAssignment?.shopName ?? '', o.shopAssignment?.address ?? '',
  o.deliveryTime?.from ?? '', o.deliveryTime?.to ?? '', o.note ?? '',
]))];
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // yyyyMMdd-HHmmss không dấu gạch
reply.type('text/csv; charset=utf-8');
reply.header('Content-Disposition', `attachment; filename="orders-export-${ts}.csv"`);
return await reply.send('\uFEFF' + lines.join(''));
```

(đối chiếu field names thật của `mapOrderItem` trong `src/mappers/fulfillment.ts` trước khi port — Step 1 risk list).
- [ ] **Step 3: test** — pure: csvCell formula-guard + quote combo; route: mock gRPC 2 trang (total 600) → 600 data rows + header; mock gRPC lỗi page 2 → error envelope KHÔNG phải CSV; headers đúng content-type/filename/BOM.
- [ ] **Step 4: Run** `npx vitest run` → PASS. **Commit** `feat(fi245-sf7): export orders CSV — buffer-then-send, Excel-safe, filter mirror list`

### Task 5: Go batches — SQL pagination (PostgresStore.Filter + FilterBatches)

**Files:**
- Modify: `services/batching-service/internal/store/store.go` (+BatchFilter, +Filter method; `List()` KHÔNG đổi)
- Modify: `services/batching-service/internal/server/batching_server.go` (FilterBatches gọi store.Filter thay List+slice)
- Modify: `services/batching-service/internal/store/store_test.go` (+tests)

- [ ] **Step 1: Đọc batching_server.go:187-239** — port ĐÚNG semantics filter hiện tại (search khớp gì, statuses, createdTime range, defaultPageSize=10, page<1→1) vào `BatchFilter`. KHÔNG đổi response shape `FilterBatchesResponse{Items,Total,Page,PageSize}`.
- [ ] **Step 2: Store method** — pattern scalar count + LATERAL như Java (params dùng lại 2 lần, OFFSET/LIMIT là 2 param cuối):

```go
// BatchFilter — tham số FilterBatches (SF-7). Zero-value = không filter.
type BatchFilter struct {
	Search       string
	Statuses     []batchingv1.BatchEntityStatus
	CreatedFrom  *time.Time
	CreatedTo    *time.Time
	Page, PageSize int
}

// Filter — pagination SQL giữ sort semantics của List (created_at → batch_code).
// Count = scalar subquery với CÙNG WHERE (pattern SF-2 — scalar subquery,
// không COUNT OVER). Page vượt last page → items rỗng, total vẫn đúng.
func (s *PostgresStore) Filter(ctx context.Context, f BatchFilter) ([]*batchingv1.Batch, int64, error)
```

WHERE build bằng strings.Builder + params slice: search → `batch_code ILIKE '%'||$n||'%'` **OR EXISTS (SELECT 1 FROM batch_items bi WHERE bi.batch_code = batches.batch_code AND bi.order_code ILIKE '%'||$n||'%')** — in-memory `matchesSearch` khớp CẢ order codes của items (batching_server.go:241-249), thiếu EXISTS = âm thầm đổi behavior UI search; statuses → `status = ANY($n)`; created → `created_at >= / < $n` (pgx nhận *time.Time). Page normalize: `<1→1`, `<=0→10` pageSize. Sau query: `attachItems(ctx, out, codes)`.
- [ ] **Step 3: Server** — `FilterBatches` build BatchFilter từ request (TimeRange proto → *time.Time qua parse hiện có), gọi `st.Filter` (guard type-assert chỉ khi PostgresStore; InMemory/fake store khác → giữ fallback List+slice như cũ để tests server cũ không vỡ — hoặc thêm Filter vào fake store, chọn theo đọc code thực tế, ghi rationale vào commit body).
- [ ] **Step 4: Tests (testdb pattern, skip-when-no-DB)** — `TestFilter_PaginationTraversal`: seed >pageSize batches, duyệt page 1..N nhận đủ, không trùng/l thiếu; `TestFilter_OrderingCreatedAtThenCode`: giữ semantics List; `TestFilter_StatusesAndSearch`: combo filter; `TestFilter_TotalBeyondLastPage`: page 99 → items rỗng, total đúng.
- [ ] **Step 5: Run** `go test ./...` (từ services/batching-service, POSTGRES_PASSWORD set nếu DB chạy) → PASS + `TestList_OrderingCreatedAtThenCode` vẫn xanh. **Commit** `feat(fi245-sf7): batches FilterBatches SQL pagination — PostgresStore.Filter giữ sort semantics, List() bất biến`

### Task 6: Pagination-orders verify + legacy-compat sweep + full test run

**Files:**
- Modify: chỉ khi phát hiện gap — orders pagination ĐÃ server-side (scalar count + OFFSET/LIMIT, PostgresOrderRepository) và BFF passthrough `page/pageSize` có sẵn → kỳ vọng KHÔNG đổi code
- Test: toàn bộ suite

- [ ] **Step 1: Verify orders pagination** — đọc lại `PostgresOrderRepository.filter` + `/fulfillment/filter` route: page/pageSize/total đã đủ ACCEPTANCE #4 → ghi kết quả vào commit body (nếu thiếu gì, sửa tối thiểu + tách commit riêng).
- [ ] **Step 2: Full test sweep** — `cd services/bff-gateway && npx vitest run` · `cd services/batching-service && go test ./...` · `cd services/fulfillment-service && mvn -q test` → cả 3 xanh; bff.contract.test.ts envelope keys không đổi.
- [ ] **Step 3: Compat thủ công** — curl `/fulfillment/filter` + `/fulfillment/batches/filter` (nếu stack chạy) so response shape với trước; E2E `04-regression-8b` + `01-main-flow` chạy nếu stack E2E khả dụng (KHÔNG sửa specs).
- [ ] **Step 4: Commit** (nếu có thay đổi) `chore(fi245-sf7): legacy-compat verify — orders pagination sẵn có, envelope cũ nguyên vẹn` · nếu không đổi code: ghi evidence vào Linear comment thay commit.

**ACCEPTANCE mapping (Phase 5 verify từng dòng):**
1. Mutate → psql `SELECT * FROM activity_log` row đúng actor/action — verify khi stack chạy (Phase 5, curl mutation thật qua BFF + psql)
2. GET /audit filter actor/date — T3 test + curl thật Phase 5
3. Export CSV Excel + đúng số dòng — T4 test + curl thật Phase 5
4. page/pageSize + endpoint cũ nguyên — T5 + T6 (E2E cũ xanh)
5. go test + mvn test pass — T6 sweep
