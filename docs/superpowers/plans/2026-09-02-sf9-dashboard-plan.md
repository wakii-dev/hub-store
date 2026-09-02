# Plan: SF-9 Dashboard thống kê (FI-245, Linear FI-254)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-09-02 | Linear: FI-254 | Worktree: sf-9-dashboard | Spec: docs/superpowers/specs/2026-09-02-sf9-dashboard-design.md

## 0. Root cause analysis
### Root cause
App là demo vận hành (FI-233) — không hề có màn tổng quan; manager phải tự đếm trên D1/D2. REQUIREMENTS.md dòng 444 cũ loại dashboard khỏi scope — SF-9 bổ sung có chủ đích.
### Current state
3 role login Keycloak, landing theo firstPathForRole (Coordinator/WarehouseOps→order/batch, Manager→order). fulfillment-service (Java) có 12 RPC, không RPC aggregate nào.
### Expected outcome
Login Manager → `/hub-store-order/dashboard`: đơn/ngày 30 ngày (chart), chờ xử lý, đang giao, tỷ lệ hoàn thành/hủy (phiếu), workload shipper — số khớp canonical-seed.json đếm tay được.
### Constraints & hardships
`orders` KHÔNG có `created_at` → nhóm theo `original_time_from`. Trạng thái giao/hoàn tất chỉ tồn tại ở PHIẾU (batching DB) — fulfillment KHÔNG nhóm được → BFF merge. batching READ-ONLY (chỉ gọi RPC sẵn có). antd4 + MF singleton → KHÔNG thêm chart lib.
### High-level strategy
1 RPC aggregate additive (SQL GROUP BY, 4 query gộp hợp lệ — không N+1) + BFF owns aggregation (pattern GetOrderDetail) + FE antd4 thuần (Statistic/Progress + SVG bar hand-built) + perm `dashboard.view` Manager-only đầu NAV_ROUTES (firstPathForRole tự đúng, không sửa mapping code).

## 1. Problem
Manager thiếu tổng quan vận hành ngày — số đơn theo ngày, tỷ lệ hoàn thành/hủy, workload shipper phải đếm tay.

## 2. Scope
- In: GetDashboardStats RPC additive; BFF GET /fulfillment/dashboard-stats; DashboardPage (orders MF); nav/route/perm Manager; e2e 05-dashboard.spec.ts.
- Out: realtime (SF-10), date-picker/custom report, batching code, index/migration mới, antd5/chart lib.
- Success criteria: ACCEPTANCE context pack — (1) Manager login → dashboard số khớp seed; (2) chart render, responsive 1366×768; (3) thêm đơn → refetch thấy tăng.

## 3. Touch map
- Modify: `api/proto/hubstore/fulfillment/v1/fulfillment.proto` (additive); gen 4 ngôn ngữ `api/proto/gen/**`
- Modify: `services/fulfillment-service/` — OrderRepository + PostgresOrderRepository + InMemoryOrderRepository + FulfillmentServiceImpl (+ test)
- Modify: `services/bff-gateway/` — clients/fulfillment.ts facade + routes/fulfillment.ts (+ vitest)
- Modify: `packages/shared/src/hooks/usePermissions.tsx` (PERMISSIONS + MATRIX); `apps/shell/src/nav.ts`, `App.tsx`, `features/layout/AppLayout.tsx` (NAV_ICONS), `i18n.ts`; `apps/orders/vite.config.ts` (expose), `src/pages/DashboardPage.tsx` (mới); `packages/api-client/src/slices/fulfillment.ts`
- New: `e2e/tests/05-dashboard.spec.ts`
- Regression candidates: 02-role-matrix.spec.ts (nav asserts — KHÔNG sửa, chỉ đảm bảo không vỡ), auth.setup landing glob, D1Page store slice.

## 4. Design
- Approach: Direction A (spec §3-4). Fulfillment RPC = aggregate thuần fulfillment DB: ordersPerDay 30 ô (fill ngày thiếu=0, TZ Asia/Ho_Chi_Minh, theo original_time_from), totalToday, pendingApproval (status_code=0), ordersPerBatch (batch_code≠'' GROUP BY). BFF merge FilterBatches (batch_code→shipper,status) + ListDeliveryStaff (id→name) → workload + đơn thuộc phiếu ACTIVE ("đang giao") + completed/cancelled (phiếu).
- Alternatives dismissed: @ant-design/charts (deps+MF risk); RPC mới bên batching (READ-ONLY); aggregate ở BFF bằng cách load rows (cấm bởi spec).
- Edge cases: ngày không có đơn → ô 0; batch_code rỗng → loại; staff không có đơn → orderCount 0; batch shipper rỗng → bucket "Chưa gán"; today="" → FE hiển thị 0.
- Non-functional: endpoint qua JWT guard toàn cục; TZ cố định +07; chart responsive theo container width (SVG viewBox).

## 5. Implementation outline
Tasks (ordered): T1 gRPC aggregate → T2 BFF endpoint → T3 DashboardPage+charts → T4 role route/nav → T5 E2E. File structure: Java record `DashboardStatsData` trong store package; FE chart component inline trong DashboardPage (1 file, không prematurize); i18n dashboard strings trong namespace orders (screen thuộc orders remote).

## 6. Risks & unknowns
- Codegen toolchain: protoc 29.3 + plugins pin (docs/superpowers/spikes/grpc-codegen-multilang.md §code). Verify `which protoc` trước; thiếu → brew install protobuf + go install plugin pins v1.28.1/v1.2.0, ts_proto qua npx ts-proto, java plugin exe maven central.
- E2E insert order qua psql — lấy connection từ docker compose exec postgres (env POSTGRES_USER trong docker-compose.yml).
- auth.setup landing manager đổi → glob `**/hub-store-order/**` vẫn match (verify khi chạy).

---

### Task 1: dashboard-aggregate-api (proto + Java)

**Files:**
- Modify: `api/proto/hubstore/fulfillment/v1/fulfillment.proto` (thêm block cuối file)
- Regen: `api/proto/gen/{ts,java,go,python}/hubstore/fulfillment/v1/*` (4 ngôn ngữ — spike doc §code)
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/OrderRepository.java`, `PostgresOrderRepository.java`, `InMemoryOrderRepository.java`
- New: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/store/DashboardStatsData.java`
- Modify: `services/fulfillment-service/src/main/java/com/hubstore/fulfillment/service/FulfillmentServiceImpl.java`
- Test: `FilterAndHydrationTest.java` (thêm unit case InMemory) + `PostgresOrderRepositoryIT.java` (parity case)

- [x] **Step 1: Proto additive** — cuối fulfillment.proto thêm:

```proto
// --- Dashboard (SF-9, FI-245) — aggregate thuần fulfillment DB. TZ cố định
// Asia/Ho_Chi_Minh cho date grouping; window 30 ngày cố định, không param.
message DashboardStatsRequest {
}

message DayCount {
  // YYYY-MM-DD (TZ Asia/Ho_Chi_Minh)
  string date = 1;
  int32 count = 2;
}

message BatchOrderCount {
  string batch_code = 1;
  int32 count = 2;
}

message DashboardStatsResponse {
  // Đủ 30 ô cũ→mới (ngày thiếu = 0), nhóm theo original_time_from.
  repeated DayCount orders_per_day = 1;
  // Đơn original_time_from trong hôm nay (TZ Asia/Ho_Chi_Minh).
  int32 total_today = 2;
  // order_status = ORDER_STATUS_PENDING_APPROVAL.
  int32 pending_approval = 3;
  // Đơn ĐÃ vào phiếu: GROUP BY batch_code (batch_code ≠ '').
  repeated BatchOrderCount orders_per_batch = 4;
}
```
Và trong `service FulfillmentService` thêm:
```proto
  // GET /fulfillment/dashboard-stats (SF-9) — aggregate 30 ngày + hôm nay.
  rpc GetDashboardStats(DashboardStatsRequest) returns (DashboardStatsResponse);
```

- [x] **Step 2: Regen 4 ngôn ngữ** — theo docs/superpowers/spikes/grpc-codegen-multilang.md §Regenerate (protoc 29.3; ts_proto plugin binary `protoc-gen-ts_proto`, opt `outputServices=grpc-js,forceLong=number,esModuleInterop=true`; go plugin pins v1.28.1/v1.2.0; java plugin 1.64.0 osx-aarch_64; python grpc_tools 1.83.1). Chỉ regen fulfillment.proto. Verify: `npx tsc --noEmit` trong services/bff-gateway; `mvn -q compile` trong services/fulfillment-service.

- [x] **Step 3: Java record + repo** — `DashboardStatsData.java`:
```java
public record DashboardStatsData(List<DayCount> ordersPerDay, int totalToday,
        int pendingApproval, List<BatchCount> ordersPerBatch) {
    public record DayCount(String date, int count) {}
    public record BatchCount(String batchCode, int count) {}
}
```
Interface `OrderRepository` thêm: `DashboardStatsData dashboardStats(LocalDate today, ZoneId zone);`
`PostgresOrderRepository` (JdbcTemplate — 4 statement aggregate, KHÔNG N+1):
```java
@Override
public DashboardStatsData dashboardStats(LocalDate today, ZoneId zone) {
    String zoneId = zone.getId();
    LocalDate start = today.minusDays(29);
    Instant from = start.atStartOfDay(zone).toInstant();
    Instant to = today.plusDays(1).atStartOfDay(zone).toInstant();
    Map<String, Integer> byDay = new HashMap<>();
    jdbc.query("""
            SELECT to_char(original_time_from AT TIME ZONE ?, 'YYYY-MM-DD') AS d, COUNT(*) AS c
            FROM orders WHERE original_time_from >= ? AND original_time_from < ?
            GROUP BY 1 ORDER BY 1""",
        rs -> { byDay.put(rs.getString(1), rs.getInt(2)); }, zoneId,
        OffsetDateTime.ofInstant(from, zone), OffsetDateTime.ofInstant(to, zone));
    List<DashboardStatsData.DayCount> days = new ArrayList<>();
    for (LocalDate d = start; !d.isAfter(today); d = d.plusDays(1)) {
        days.add(new DashboardStatsData.DayCount(d.toString(), byDay.getOrDefault(d.toString(), 0)));
    }
    Integer totalToday = jdbc.queryForObject(
        "SELECT COUNT(*) FROM orders WHERE original_time_from >= ? AND original_time_from < ?",
        Integer.class, OffsetDateTime.ofInstant(from, zone), OffsetDateTime.ofInstant(to, zone));
    Integer pending = jdbc.queryForObject(
        "SELECT COUNT(*) FROM orders WHERE status_code = 0", Integer.class);
    List<DashboardStatsData.BatchCount> perBatch = jdbc.query(
        "SELECT batch_code, COUNT(*) AS c FROM orders WHERE batch_code IS NOT NULL AND batch_code <> '' "
            + "GROUP BY batch_code ORDER BY batch_code ASC",
        (rs, n) -> new DashboardStatsData.BatchCount(rs.getString(1), rs.getInt(2)));
    return new DashboardStatsData(days, totalToday, pending, perBatch);
}
```
`InMemoryOrderRepository` cùng semantics: parse `originalTimeFrom` ISO → `atZoneSameInstant(zone)` → group/fill 30 ô; pending = status_code==0; perBatch group theo batchCode non-blank. (Nếu OrderSeed.originalTimeFrom là String — parse `OffsetDateTime.parse`, fallback `Instant.parse`.)

- [x] **Step 4: ServiceImpl** — pattern try/catch như listRegions:
```java
@Override
public void getDashboardStats(DashboardStatsRequest request,
        StreamObserver<DashboardStatsResponse> responseObserver) {
    try {
        ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
        LocalDate today = LocalDate.now(zone);
        DashboardStatsData s = repo.dashboardStats(today, zone);
        DashboardStatsResponse.Builder b = DashboardStatsResponse.newBuilder()
                .setTotalToday(s.totalToday()).setPendingApproval(s.pendingApproval());
        for (DashboardStatsData.DayCount d : s.ordersPerDay()) {
            b.addOrdersPerDay(DayCount.newBuilder().setDate(d.date()).setCount(d.count()));
        }
        for (DashboardStatsData.BatchCount c : s.ordersPerBatch()) {
            b.addOrdersPerBatch(BatchOrderCount.newBuilder().setBatchCode(c.batchCode()).setCount(c.count()));
        }
        responseObserver.onNext(b.build());
        responseObserver.onCompleted();
    } catch (Exception e) {
        responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
    }
}
```
(Khớp đúng catch-pattern hiện có của class — đọc method lân cận trước khi paste.)

- [x] **Step 5: Tests** — unit: InMemory dashboardStats với orders giả (2 ngày, thiếu ngày giữa → fill 0; pending đúng; perBatch bỏ batchCode rỗng). IT: sau seed canonical — ordersPerDay có ô "2026-09-03"=27, tổng 30 ô, pendingApproval=5, ordersPerBatch tổng = 11 (27 − 16 đơn batch_status=0 chưa vào phiếu), totalToday theo ngày chạy (0 trừ khi insert). Chạy: `mvn test` (unit) + IT theo pattern hiện có (skip-when-no-DB).

- [x] **Step 6: Commit** — `feat(fi245-sf9): GetDashboardStats RPC — SQL aggregate 30 ngày + per-batch (proto additive + Java)`.

### Task 2: BFF GET /fulfillment/dashboard-stats

**Files:**
- Modify: `services/bff-gateway/src/clients/fulfillment.ts` (facade + import types mới)
- Modify: `services/bff-gateway/src/routes/fulfillment.ts` (route mới + response type trong packages/shared nếu có chỗ — thêm type `DashboardStatsResponse` vào `packages/shared/src/api-contracts/fulfillment.ts` + re-export)
- Test: `services/bff-gateway/test/bff.contract.test.ts` (thêm case, pattern harness/fixtures hiện có)

- [ ] **Step 1: Facade** — thêm `getDashboardStats(req: DashboardStatsRequest, role: string): Promise<DashboardStatsResponse>` vào `FulfillmentApi` + wire `callUnary(c.getDashboardStats.bind(c), ...)`.

- [ ] **Step 2: Route** — trong registerFulfillmentRoutes:
```ts
// Dashboard SF-9 — BFF owns aggregation (pattern GetOrderDetail): stats (fulfillment)
// + FilterBatches (status/shipper per phiếu — batching READ-ONLY, chỉ GỌI)
// + ListDeliveryStaff (id→name). pageSize 100: dataset dashboard nhỏ, phiếu > 100
// ngoài scope SF-9 (ghi nhận, không paginate-loop).
app.get('/fulfillment/dashboard-stats', async (request, reply) => {
  const { role } = requireUser(request);
  try {
    const [stats, batches, staff] = await Promise.all([
      f.getDashboardStats({}, role),
      deps.batching.filterBatches({ page: 1, pageSize: 100 }, role),
      f.listDeliveryStaff({}, role),
    ]);
    const countByBatch = new Map((stats.ordersPerBatch ?? []).map((b) => [b.batchCode, b.count]));
    let delivering = 0, completed = 0, cancelled = 0;
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
      staffId: s.id, name: s.name, orderCount: loadByStaff.get(s.id) ?? 0,
    }));
    // Đơn phiếu không khớp shipper trong delivery_staff (shipper lạ/rỗng) — gộp bucket "Chưa gán".
    const knownIds = new Set(workload.map((w) => w.staffId));
    let unassigned = 0;
    for (const [shipper, count] of loadByStaff) if (!knownIds.has(shipper)) unassigned += count;
    const totalBatches = Number(batches.total);
    const decided = completed + cancelled;
    return await reply.send({
      ordersPerDay: (stats.ordersPerDay ?? []).map((d) => ({ date: d.date, count: d.count })),
      totalToday: stats.totalToday,
      pendingApproval: stats.pendingApproval,
      delivering, completed, cancelled,
      completionRate: decided > 0 ? Math.round((completed / decided) * 100) : 0,
      cancelRate: decided > 0 ? Math.round((cancelled / decided) * 100) : 0,
      totalBatches,
      workload: [...workload, ...(unassigned > 0 ? [{ staffId: '', name: 'Chưa gán', orderCount: unassigned }] : [])],
    });
  } catch (err) {
    return sendGrpcError(reply, err, SERVICE_NAMES.fulfillment);
  }
});
```
Type response đặt trong `packages/shared/src/api-contracts/fulfillment.ts`:
```ts
export interface DashboardStats {
  ordersPerDay: { date: string; count: number }[];
  totalToday: number;
  pendingApproval: number;
  delivering: number;
  completed: number;
  cancelled: number;
  completionRate: number;
  cancelRate: number;
  totalBatches: number;
  workload: { staffId: string; name: string; orderCount: number }[];
}
```
LƯU Ý: `delivering`/`completed`/`cancelled` ở đây đếm ĐƠN theo trạng thái PHIẾU (BatchEntityStatus 0/1/2). filterBatches request dùng field `page/pageSize` (camelCase ts-proto) — xem FilterBatchesRequest đã có trong client batching.

- [ ] **Step 3: Vitest contract test** — theo harness hiện có: mock 2 upstream; assert merge đúng (workload map theo shipper, staff 0 đơn, deliverering/completed/cancelled từ batch status, rate tính đúng, error path 502 qua sendGrpcError). Chạy: `pnpm --filter bff-gateway test`.

- [ ] **Step 4: Commit** — `feat(fi245-sf9): BFF GET /fulfillment/dashboard-stats — merge batches/staff → workload + rates`.

### Task 3: fe-dashboard-screen + charts (orders MF)

**Files:**
- Modify: `packages/api-client/src/slices/fulfillment.ts` (endpoint getDashboardStats)
- New: `apps/orders/src/pages/DashboardPage.tsx`
- Modify: `apps/orders/vite.config.ts` exposes `./DashboardPage`
- Modify: `apps/orders/src/i18n.ts` (resources dashboard, namespace orders — theo pattern đăng ký hiện có)

- [x] **Step 1: RTKQ endpoint** — trong slices/fulfillment.ts:
```ts
getDashboardStats: builder.query<DashboardStats, void>({
  query: () => ({ url: '/fulfillment/dashboard-stats', method: 'GET' }),
  providesTags: [{ type: 'Fulfillment' as const, id: 'STATS' }],
}),
export const { useGetDashboardStatsQuery } = enhanced;
```
(refetchOnMountOrArgChange: true toàn cục sẵn — navigate quay lại là refetch; thêm nút refresh gọi `refetch()`.)

- [x] **Step 2: DashboardPage** — tự bọc `<Provider store={createAppStore()}>` như D1Page (đọc head D1Page để copy convention i18n/Provider). Layout: `dashboard-root` → Row/Col antd: 4 Statistic cards (`stat-today`, `stat-pending` (Chờ duyệt), `stat-delivering` (Đang vận chuyển — đơn phiếu ACTIVE), `stat-completion-rate` Progress completionRate + text "Hủy x%") + chart card `chart-orders-per-day` + workload card `workload-list` (List antd, row `workload-row-<staffId>` — staffId rỗng dùng key `unassigned`, testid `workload-row-unassigned`).

SVG bar chart hand-built (KHÔNG lib): nhận `data: {date,count}[]`, render `<svg viewBox="0 0 W H" width="100%">` — W=600,H=180, bar width = W/30−2, height tỉ lệ max(≥1); mỗi bar: `<rect data-testid={`bar-${date}`} x y width height fill="var(--ant-primary-color, #EB6E09)"><title>${date}: ${count}</title></rect>`; trục nhãn: ngày đầu/giữa/cuối + max. Đơn giản, đủ ACCEPTANCE "charts render không màn trắng".

- [x] **Step 3: i18n + expose** — đăng keys vi/en (dashboard.title, dashboard.stat.*...); vite exposes thêm `"./DashboardPage": "./src/pages/DashboardPage.tsx"`.

- [x] **Step 4: Verify build** — `pnpm --filter @hub-store/orders build` (hoặc tsc) + mở dev server kiểm nhanh (Rule 0 full ở bước riêng).

- [x] **Step 5: Commit** — `feat(fi245-sf9): DashboardPage — Statistic/Progress + SVG bar 30 ngày + workload list`.

### Task 4: role-based-default-route (shell + perms)

**Files:**
- Modify: `packages/shared/src/hooks/usePermissions.tsx` — PERMISSIONS thêm `'dashboard.view'`; MATRIX: Manager có thêm 'dashboard.view' (Coordinator/WarehouseOps KHÔNG). Comment mapping: dashboard.view → Dashboard (/hub-store-order/dashboard).
- Modify: `apps/shell/src/nav.ts` — NAV_ROUTES entry ĐẦU mảng: `{ path: '/hub-store-order/dashboard', labelKey: 'nav.dashboard', permission: 'dashboard.view' }` → firstPathForRole(Manager) tự = dashboard; Coordinator vẫn order (không có perm); WarehouseOps vẫn batch.
- Modify: `apps/shell/src/features/layout/AppLayout.tsx` — NAV_ICONS thêm `'/hub-store-order/dashboard': <DashboardOutlined />` (import từ @ant-design/icons).
- Modify: `apps/shell/src/i18n.ts` — vi `"nav.dashboard": "Tổng quan"`, en `"nav.dashboard": "Dashboard"` (cả 2 khối ngôn ngữ).
- Modify: `apps/shell/src/App.tsx` — lazy `const DashboardPage = lazy(() => import("orders/DashboardPage"));` + Route `/hub-store-order/dashboard` RequirePermission `dashboard.view` + RemoteBoundary (đặt TRƯỚC route order).

- [x] **Step 1: Áp diffs trên** (đọc từng file trước khi sửa).
- [ ] **Step 2: Verify** — shell tsc build pass; chạy e2e existing 02-role-matrix (KHÔNG sửa spec) — Coordinator/WarehouseOps asserts vẫn xanh vì perm mới chỉ Manager.
- [ ] **Step 3: Commit** — `feat(fi245-sf9): Manager default route /dashboard — perm dashboard.view + nav entry`.

### Task 5: e2e-dashboard-spec

**Files:**
- New: `e2e/tests/05-dashboard.spec.ts`

- [ ] **Step 1: Spec** — pattern theo 02-role-matrix (test.use storageState). Parse seed để tính expected (đếm tay bằng code):
```ts
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const seed = JSON.parse(readFileSync(new URL("../../api/seed/canonical-seed.json", import.meta.url), "utf8"));
const orders: Array<Record<string, unknown>> = seed.orders ?? seed;
const pendingApproval = orders.filter((o) => Number(o.order_status ?? o.orderStatus) === 0).length;
const perDay = new Map<string, number>();
for (const o of orders) {
  const raw = String(o.original_time_from ?? o.originalTimeFrom ?? "");
  const date = raw.slice(0, 10);
  perDay.set(date, (perDay.get(date) ?? 0) + 1);
}
```
(Kiểm tra structure seed thật khi viết — field snake_case hay camelCase; đọc file canonical-seed.json đầu tiên.)

Test cases:
1. Manager: goto `/hub-store-order/dashboard` → `dashboard-root` visible, `chart-orders-per-day` visible với ≥1 bar (`bar-2026-09-03`), `stat-pending` text chứa expected pendingApproval từ seed, `workload-list` visible.
2. Manager landing sau login thật (realLogin như 02-role-matrix) → URL `/hub-store-order/dashboard`.
3. Coordinator storageState: nav KHÔNG có `nav-dashboard`; goto /hub-store-order/dashboard → `forbidden` visible.
4. "Tạo thêm đơn → refetch cập nhật": trước insert đo `stat-today` (0); execSync psql INSERT 1 đơn (original_time_from hôm nay 10:00 +07, fulfill_code `ORD-E2E-DASH`, status_code 1, batch_code NULL — copy cột bắt buộc từ seed row); click nút refresh (`dashboard-refetch`) → `stat-today` = 1 và `bar-<today>` height > 0; dọn: DELETE WHERE fulfill_code='ORD-E2E-DASH' (afterEach/finally — DB dùng chung, KHÔNG reset-db).
5. Responsive 1366×768 (mặc định Playwright viewport) — `chart-orders-per-day` bounding box width ≤ viewport width, visible.

psql qua: `execSync("docker compose exec -T postgres psql -U <POSTGRES_USER> -d fulfillment -c \\"...\"", { cwd: path.join(__dirname, "../..") })` — đọc docker-compose.yml lấy user/credential pattern.

- [ ] **Step 2: Chạy** — stack sống (scripts/boot-all.sh hoặc compose): `pnpm --filter @hub-store/e2e exec playwright test tests/05-dashboard.spec.ts`; sau đó full suite E2E=1 để đảm bảo không vỡ spec cũ.
- [ ] **Step 3: Commit** — `test(fi245-sf9): E2E dashboard — seed-derived asserts + refetch after insert + role guard`.
