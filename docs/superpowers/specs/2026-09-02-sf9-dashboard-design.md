# SF-9 Dashboard thống kê — Design Spec (FI-245, Linear FI-254)

> Status: Approved (autonomous — context pack docs/superpowers/contexts/fi245-sf-9.md + epic spec §3.9 khoá scope; Direction A chốt ở Phase 0 2026-09-02).
> Boundary: KHÔNG realtime (SF-10), KHÔNG date-picker/custom report, KHÔNG batching stats code (batching READ-ONLY — chỉ GỌI RPC sẵn có).

## 1. Problem
Manager không có màn tổng quan — phải vào D1/D2 tự đếm. Cần: đơn/ngày 30 ngày, tỷ lệ hoàn thành/hủy, workload per delivery staff, đơn chờ xử lý — dữ liệu thật từ Postgres fulfillment DB, SQL aggregate (KHÔNG N+1, KHÔNG load rows về BFF đếm).

## 2. Self-answered clarifying questions (codebase facts)
| # | Câu hỏi | Trả lời | Căn cứ |
|---|---------|---------|--------|
| Q1 | orders-per-day nhóm theo cột nào — `orders` không có `created_at`? | `original_time_from` (date, TZ Asia/Ho_Chi_Minh cố định BE+FE) | PostgresOrderRepository.java:94 (seed không có createdAt); original = gốc, không bị SF-28 adjust lệch |
| Q2 | Workload per delivery staff lấy từ đâu — orders không có staff, batches ở DB khác? | Fulfillment RPC trả orders-per-`batch_code` (GROUP BY); BFF merge `batching.FilterBatches` (Batch có `shipper_id`) → group per staff. Batch không shipper → bucket "chưa gán" | batching.proto:57; "BFF owns aggregation" pattern GetOrderDetail; batching READ-ONLY chỉ gọi |
| Q3 | Ai thấy Dashboard? | Nav perm `dashboard.view` CHỈ Manager. Coordinator/WarehouseOps giữ route hiện tại. RPC/API cho mọi role authenticated (pattern hiện tại không có per-route guard) | Context pack: "Manager → Dashboard; Coordinator/WarehouseOps giữ firstPathForRole" |
| Q4 | Chart lib nào? | ZERO deps mới: antd `Statistic`/`Progress` + SVG bar chart hand-built trong shared components | Context pack "ưu tiên ít deps mới"; antd4 4.24.16 MF singleton — thêm chart lib = React compat risk |
| Q5 | E2E "tạo thêm đơn → refetch cập nhật" khi chưa có create-order API? | Insert 1 row vào `orders` qua psql từ e2e test → quay lại Dashboard → bấm refetch → assert +1 | SF-13 mới có create API; pattern seed-db.sh đã dùng psql |
| Q6 | Route path? | `/hub-store-order/dashboard` — nav entry ĐẦU TIÊN trong NAV_ROUTES + perm `dashboard.view` → `firstPathForRole` tự nhiên: Manager→dashboard, Coordinator→/order, WarehouseOps→/batch (không đổi code mapping) | apps/shell/src/nav.ts:15, PERMISSION_MATRIX |

## 3. Architecture

```
Postgres fulfillment DB
   │  4 SQL GROUP BY (JdbcTemplate, fulfillment-service Java)
   ▼
gRPC GetDashboardStats (fulfillment.proto — ADDITIVE)          gRPC FilterBatches (batching, SẴN CÓ)
   │                                                              │
   ▼                                                              ▼
BFF GET /fulfillment/dashboard-stats  ←── merge (batch_code → shipper_id) → workload per staff
   │
   ▼
FE DashboardPage (orders MF expose ./DashboardPage) → shell route /hub-store-order/dashboard
```

## 4. Contracts

### 4.1 gRPC (fulfillment.proto — additive, buf STANDARD lint, envelope per-RPC pair)
```proto
rpc GetDashboardStats(DashboardStatsRequest) returns (DashboardStatsResponse);
message DashboardStatsRequest {}                       // cố định 30 ngày + hôm nay, không param
message DashboardStatsResponse {
  repeated DayCount orders_per_day = 1;                // đủ 30 ô (ngày thiếu = 0), cũ→mới, date "YYYY-MM-DD" (TZ Asia/Ho_Chi_Minh)
  int32 total_today = 2;                               // đơn original_time_from trong hôm nay
  int32 pending_approval = 3;                          // order_status = 0 (Chờ duyệt)
  repeated BatchOrderCount orders_per_batch = 4;       // batch_code → count (GROUP BY, chỉ batch_code != '')
}
message DayCount { string date = 1; int32 count = 2; }
message BatchOrderCount { string batch_code = 1; int32 count = 2; }
```
LƯU Ý domain: order-level `BatchStatus` là trạng thái SOẠN HÀNG (0-3, không phải giao). "Hoàn thành/Hủy" ở đây là trạng thái PHIẾU (`BatchEntityStatus`: 0=Đang soạn/1=Hoàn tất/2=Đã hủy) — data nằm ở batching DB, fulfillment KHÔNG nhóm theo nó. Do đó: completion/cancel + "đang giao" (đơn thuộc phiếu ACTIVE) tính ở BFF từ `FilterBatches` (đã merge); fulfillment RPC chỉ trả aggregate thuần của fulfillment DB (orders_per_day, total_today, pending_approval, orders_per_batch).

### 4.2 BFF REST
`GET /fulfillment/dashboard-stats` — requireUser → `Promise.all([fulfillment.getDashboardStats(role), batching.filterBatches(pageSize đủ lớn, role)])` → merge workload:
```
workload: [{ staffId, name, orderCount }]  // name từ FilterBatches không có → FE/BE tra? KHÔNG: BFF thêm call fulfillment ListDeliveryStaff (sẵn có) → map staffId→name; staff không có đơn vẫn list với 0
```
Response shape: `{ ordersPerDay: [{date,count}], totalToday, pendingApproval, delivering, completed, cancelled, workload: [{staffId,name,orderCount}] }` — envelope JSON thuần (không paginated — dataset cố định nhỏ).

### 4.3 FE
- `packages/shared`: thêm `dashboard.view` vào PERMISSIONS + PERMISSION_MATRIX (Manager only).
- `packages/api-client`: RTKQ endpoint `getDashboardStats` (slices/fulfillment.ts), refetch sau mutate bằng invalidatesTags chuẩn.
- `apps/orders`: `src/pages/DashboardPage.tsx` — 5 khối: 4 Statistic (Hôm nay, Chờ xử lý, Đang giao, Tỷ lệ hoàn thành/hủy Progress) + SVG bar chart 30 ngày + workload list (Table hoặc List antd). data-testid: `dashboard-root`, `stat-today`, `stat-pending`, `stat-delivering`, `stat-completion-rate`, `chart-orders-per-day`, `bar-YYYY-MM-DD`, `workload-list`, `workload-row-<staffId>`, `dashboard-refetch`.
- `apps/shell`: NAV_ROUTES thêm `{ path: '/hub-store-order/dashboard', perm: 'dashboard.view' }` ĐẦU mảng + NAV_ICONS entry; App.tsx Route + RequirePermission + RemoteBoundary lazy `import("orders/DashboardPage")`.
- i18n: đăng ký resources theo pattern `registerOrdersResources` nếu screen nằm orders remote.

## 5. E2E (e2e/tests/05-dashboard.spec.ts)
- `test.use(storageState: ".auth/manager.json")`.
- Số liệu assert TÍNH TỪ canonical-seed.json constants (27 đơn; order_status 0=5; batch_status 1/2/3=6/3/2; original 2026-09-03=27) — đếm tay được.
- Manager login → landing `/hub-store-order/dashboard`, `dashboard-root` hiện, chart có bars (không màn trắng).
- Coordinator storageState → vẫn landing `/hub-store-order/order` (không đổi), nav không có dashboard.
- "Tạo thêm đơn": psql INSERT 1 đơn original_time_from hôm nay → navigate lại dashboard (hoặc click refetch) → `stat-today` +1, `bar-<hôm nay>` +1.
- Responsive: viewport laptop 1366×768 — chart không tràn (`chart-orders-per-day` visible trong viewport width).

## 6. Tests (BE)
- Unit Java: aggregate SQL vs InMemory — nếu store chưa có method thì test qua PostgresOrderRepositoryIT (skip-when-no-DB) + test shape builder riêng (date-fill 30 ô, TZ).
- BFF vitest: route contract test (mock 2 upstream — merge workload đúng, staff thiếu đơn = 0, name map).
- Chạy: `mvn test`, `pnpm --filter bff-gateway test`, `pnpm --filter e2e e2e`.

## 7. Risks
- TZ: grouping `original_time_from::date AT TIME ZONE 'Asia/Ho_Chi_Minh'` — test IT dùng seed có sẵn; e2e insert đặt giờ 10:00 +07.
- FilterBatches pagination: pageSize phải ≥ tổng batch (dev 7; dùng pageSize 100 — dashboard dataset nhỏ, chấp nhận; ghi comment).
- Manager landing đổi → check auth.setup assert `**/hub-store-order/**` vẫn match ✓; specs cũ role-matrix assert nav-* per role — dashboard nav icon mới có thể xuất hiện assert? Coordinator/WarehouseOps không có perm → không thấy nav ✓. Manager specs: 02-role-matrix manager case có thể assert nav set — phải đọc và update ĐÚNG phạm vi (cho phép thêm nav-dashboard, KHÔNG sửa assertions khác).
