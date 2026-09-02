# Epic Spec — Production persistence: PostgreSQL + Docker + real auth (tiếp nối FI-233)

> Story này build TRÊN code FI-233 — ĐÃ merge vào main (commit 24fe163, tree == FI-233 verified tree).
> Destination branch của story này fork từ main.

## 1. Goal
hub-store-order (FI-233) đang chạy in-memory demo — mất data khi restart, 1 process, đăng nhập dev-stub 1-click.
Mục tiêu: **user thật sử dụng được** — PostgreSQL persistent, deploy 1 lệnh `docker compose up --build`,
đăng nhập username/password thật (OIDC), toàn bộ API đọc/ghi DB thật.

## 2. Quyết định đã chốt (user — KHÔNG đổi lại trong SF runs)
1. **Migration tooling chuẩn production**: Flyway (Java) + golang-migrate (Go), migration files versioned trong repo.
2. **Auth thật TRONG story này**: OIDC (Keycloak trong compose) thay fake-JWT dev-stub cho đăng nhập; env `VITE_OIDC_*` đã chừa sẵn trong `.env` (commented).
3. **E2E reset**: `E2E=1` → truncate + reseed từ `api/seed/canonical-seed.json` trước mỗi run; dev volume giữ data thật.
4. **Dev flow**: `run.sh` từng service YÊU CẦU Postgres đang chạy (`docker compose up -d postgres` trước); `InMemoryOrderRepository` chỉ còn phục vụ unit test (không phải runtime fallback).
5. **Postgres topology**: 1 instance trong compose, **2 databases riêng** (`fulfillment`, `batching`) — mỗi service owns DB của mình, không cross-schema query.
6. **API contract GIỮ NGUYÊN 100%**: gRPC proto (`api/proto/`) + BFF REST routes + response shape KHÔNG đổi. FE business logic không sửa (trừ login flow SF-4).
7. **Seed**: `api/seed/canonical-seed.json` vẫn là nguồn khởi tạo DUY NHẤT, giữ nguyên nội dung; nạp vào DB theo emptiness-gate (chi tiết §3.1).
8. **UI/UX hiện đại hóa trên antd4** (KHÔNG nâng antd5): theme tokens mới + polish toàn web, design-first (3 hướng HTML → user chọn). KHÔNG đổi testids/cấu trúc DOM mà E2E phụ thuộc; KHÔNG đổi business logic.

## 3. Scope

### 3.1 Postgres infra + schema + seed pipeline (SF-1, Tier 0)
- `docker-compose.yml`: thêm service `postgres` (volume persistent, healthcheck `pg_isready`), `depends_on: condition: service_healthy` cho app services. **2 databases tạo bằng init script** `/docker-entrypoint-initdb.d/` (image chỉ tự tạo 1 DB qua `POSTGRES_DB` — verify trước khi code).
- Schema versioned 2 bộ: Flyway migrations (Java) + golang-migrate (Go). Bảng:
  - `fulfillment` DB: `orders` (mọi field của `SeedModels.OrderSeed` + id thật), `shop_assignment_history`, `regions`, `delivery_staff`.
  - `batching` DB: `batches`, `batch_items`.
- Seed pipeline (CHỦNG QUYỀN cho CẢ 2 DB — thuộc SF-1): 1 script duy nhất nạp `canonical-seed.json` → Postgres (cả DB `fulfillment` lẫn `batching`). Được gọi ở 2 chỗ: (a) script standalone cho dev flow, (b) compose: service `db-seed` 1-shot (profile hoặc depends_on) chạy sau postgres-healthy, trước app services. Idempotent theo **emptiness-gate**: DB rỗng → nạp; DB có data → KHÔNG đụng (không ON CONFLICT-upsert; seed sửa sau này = reset DB thủ công, ghi trong README). KHÔNG wipe user data khi boot; wipe chỉ khi `E2E=1`.
- **Go batches KHÔNG tự seed-on-boot** — SF-3 chỉ migrate schema; data batches do seed pipeline của SF-1 nạp (tránh double-seed race).
- Reset util dùng chung (shell script): `E2E=1` → `TRUNCATE ... RESTART IDENTITY` cả 2 DB + reseed + **setval sequences về max seed** (`BATCH` sequence = max batchCode seed) → state == seed file chính xác.
- Credentials: `.env.example` mới + compose default local-only; DB password KHÔNG hardcode vào code (pattern `${POSTGRES_PASSWORD:?}`).
- Compose thêm service block `keycloak` (realm-import mount sẵn, chi tiết realm do SF-4).
- Healthcheck pattern mới cho compose (postgres `pg_isready` — hiện compose KHÔNG có healthcheck nào).

### 3.2 Java orders → Postgres (SF-2, Tier 1, deps SF-1)
- `PostgresOrderRepository implements OrderRepository` — 11 method giữ đúng semantics in-memory:
  - `filter`: mọi điều kiện thành SQL; **ORDER BY tường minh** khớp in-memory (createdTime, fulfillCode); `FilterResult` invariant (items + total khớp cùng lúc) đạt bằng **1 query duy nhất** — window function `COUNT(*) OVER()` (KHÔNG dùng 2 statement trong transaction READ COMMITTED — vẫn race).
  - `findByCodes`: trả đúng thứ tự codes yêu cầu, bỏ code lạ → SQL CASE-based ORDER BY hoặc post-sort sau query.
  - `getHistory`: entries theo thứ tự timestamp xác định (ORDER BY timestamp, tie-breaker稳定).
  - Region filter: GIỮ heuristic substring (`customerAddress` LIKE %tên region%) — KHÔNG thêm regionCode column (tránh đổi seed/contract).
  - `findByFulfillCode` match CẢ `ORD-*` lẫn `RSA-*` (fix FI-237 giữ nguyên).
  - `mutateBatchStatus` (nhiều codes): 1 transaction; target=0 clear batchCode.
  - `assignShopHub` + history append; `distinctShops` derive từ orders (DISTINCT SQL, sort theo code).
- Flyway migrate-on-boot (Spring Boot boot path); Hikari pool; `application.yml` datasource qua env.
- Boot: seed-verify — nếu DB rỗng → chạy seed pipeline; KHÔNG nạp lại nếu đã có (emptiness-gate, khớp SF-1).
- **Chọn impl**: Spring `@Configuration` + `@ConditionalOnProperty` (vd `fulfillment.store=postgres` default; `inmemory` chỉ dùng trong unit test context). Runtime thiếu datasource config → **fail-loud khi start** (không âm thầm rơi về in-memory).
- `run.sh`: wait-for-db rồi mới start.
- Unit tests GIỮ `InMemoryOrderRepository` (không testcontainers cho unit); thêm integration test chạy khi postgres có sẵn (skip nếu không).
- LIKE escaping: escape `%`/`_` trong region filter (in-memory là substring thuần).

### 3.3 Go batches → Postgres (SF-3, Tier 1, deps SF-1)
- `BatchStore` interface (mới) + `PostgresStore` impl bằng **pgx**:
  - `Transition` CAS → `UPDATE ... WHERE status = $from` (rowsAffected check).
  - `CreateWithNextCode` / `NextBatchCode` → Postgres sequence atomic, khởi tạo từ max seed (`BATCH-%04d` format giữ nguyên; sequence setval = max seed).
  - `List` giữ sort semantics (createdAt → batchCode); `Delete` (compensation) giữ.
  - `batch_items` con bảng; hydration payload shape không đổi.
- **Seed redesign (R2)**: `LoadSeedFile` (boot-time, đọc JSON) BỎ cross-check orderCode — dữ liệu batches do seed pipeline SF-1 nạp sẵn vào DB (§3.1), Go chỉ migrate schema rồi đọc DB. Việc verify orderCode tồn tại chuyển vào **seed pipeline SF-1** (script nạp batches kiểm `orderCode` có trong DB `fulfillment.orders` — FK hoặc query check; item lạ → fail pipeline với message rõ). Go runtime KHÔNG phụ thuộc Java khi boot (chỉ phụ thuộc khi serve request hydration — như hiện tại).
- **Boot semantics khi Java down**: không đổi — Go vẫn lên bình thường, hydration request fail như hiện tại (client deadline).
- golang-migrate trong entrypoint/Dockerfile (wait-for-db → migrate → serve).
- go.mod thêm pgx v5 (+ nguyên tắc pin version).

### 3.4 Auth thật — OIDC Keycloak (SF-4, Tier 1, deps SF-1)
- Keycloak trong compose (realm import tự động: roles `Coordinator`/`WarehouseOps`/`Manager` + users mẫu mỗi role 1 user — default `coordinator/coordinator123`, `warehouse/warehouse123`, `manager/manager123` (password LITERAL dev-only trong realm JSON, không env-substitution — đổi = Keycloak admin hoặc reset volume)). **Realm re-import**: `--import-realm` skip realm tồn tại → E2E reset util XÓA keycloak volume để import lại sạch; dev volume giữ nguyên.
- Shell login: redirect PKCE qua `VITE_OIDC_AUTHORITY/CLIENT_ID/REDIRECT_URI` (env đã có, uncomment + wire); logout; **silent renew** access token (oidc-client-ts); 401 → redirect login.
- BFF: verify access token qua **JWKS** (không còn HS256 shared secret cho user flow); **JWKS cache refresh khi gặp unknown `kid`** (Keycloak rotate/restart giữa run); map roles claim (`realm_access.roles` — SF-4 làm cả 2 phía, tự nhất quán) → `x-user-role` gửi xuống gRPC services (services KHÔNG đổi — vẫn nhận x-user-role, M-3 ghi note để sau).
- Fake-JWT dev-stub: loại khỏi runtime path; GIỮ code path test-only (unit test mock).
- **Forgot-password C1 (dev-only)**: FE custom page "Forgot password" (user nhập username + password mới trực tiếp, KHÔNG email) → BFF endpoint gọi Keycloak Admin API set password. KHÔNG có bước xác minh danh tính → CHỈ an toàn local-dev — bắt buộc ghi rõ dev-only trong README + code comment; production thật cần OTP email hoặc bật forgot-password Keycloak (để sau).
- E2E login helper: **Playwright global-setup login UI 1 lần → storageState reuse** cho cả 13 specs (không login lại mỗi spec; không ROPC); nếu token hết hạn giữa run → helper re-login. Specs không đổi business assertions.
- Pin versions: Keycloak image, oidc-client-ts, Flyway, golang-migrate, pgx v5.

### 3.5 Convergence — production compose + E2E + deploy docs (SF-5, Tier 2, deps SF-2+SF-3+SF-4)

- `docker compose up --build` từ repo sạch → full stack lên, login thật, full flow D1→D3 chạy được.
- **Persistence proof**: tạo phiếu → `docker compose restart` → phiếu còn, login lại thấy.
- E2E Playwright: 13/13 xanh với `E2E=1` (reset DB) + auth thật.
- `boot-all.sh` update: wait DB + reset khi E2E=1.
- README: deploy guide (compose up, tạo user Keycloak, backup `pg_dump` 1 đoạn).
- Security re-check trên diff tổng (M-2 resolved pattern; H-1 phần lớn giải quyết bởi OIDC — còn lại ghi note).

### 3.6 UI/UX hiện đại hóa toàn web — antd4 refresh (SF-6, Tier 2, deps SF-2+SF-3+SF-4, SONG SONG SF-5)
- **DESIGN-FIRST bắt buộc**: designer agent tạo 3 hướng HTML prototype (shell + D1 sample) → USER CHỌN (gate) → hand-off direction (tokens/structure) → mới code.
- Phạm vi: shell (login, nav, role switcher) + D1 orders + D1b batching modal + D2 fulfillment + D3 print — 1 design system thống nhất.
- Nội dung: theme LESS tokens mới (palette mở rộng từ #EB6E09, radius, shadow/depth, spacing, typography), skeletons/empty-states, micro-interactions, polish màn login wrapper quanh Keycloak.
- Cứng: KHÔNG antd5; KHÔNG đổi testids/DOM mà E2E Playwright phụ thuộc; KHÔNG đổi business logic; KHÔNG đụng e2e/, services/, compose (SF-5 read-only apps/**).

### 3.7 Product completion — BE foundation (SF-7, deps SF-2)
- Bảng `activity_log` (fulfillment DB): actor, action, targetType/targetId, detail JSONB, timestamp — ghi tại mọi mutation endpoint (assign/cancel/complete/batch create/transition).
- Export CSV endpoint: danh sách đơn theo filter hiện tại (cùng tham số /orders filter).
- Chuẩn hóa pagination server-side (page/pageSize + total) cho list orders + batches — giữ response shape hiện tại cho fields, thêm pagination envelope mới (endpoint cũ không vỡ).

### 3.8 Product completion — Users management UI (SF-8, deps SF-4)
- Màn "Users" chỉ Manager thấy: list users (từ Keycloak), tạo user + gán role, set password, khóa/mở — qua BFF endpoints gọi Keycloak Admin API (service-account credential qua env).
- Màn theo design language SF-6 nếu direction đã có; SF-11 hội tụ sau.

### 3.9 Product completion — Dashboard thống kê (SF-9, deps SF-2)
- Màn Dashboard (mặc định sau login cho Manager; Coordinator thấy nếu phù hợp): đơn/ngày (30 ngày), tỷ lệ hoàn thành/hủy, workload shipper, đơn đang chờ xử lý — aggregate API riêng, KHÔNG N+1 loop client-side.

### 3.10 Product completion — Realtime SSE (SF-10, deps SF-2+SF-3)
- BFF SSE endpoint + event bus: mutation order (assign/cancel/complete) và batch (create/transition) đẩy event → FE hook subscribe, D1/D2 refetch hoặc update optimistic.
- Reconnect + fallback polling; auth cùng access token (query param hoặc header).

### 3.11 Product completion — FE convergence mới (SF-11, deps SF-6+SF-7+SF-8+SF-9+SF-10)
- Audit-log viewer (Manager), export UI (nút export theo filter), mobile responsive polish (breakpoints cho tablet shipper), all-in design system SF-6; skeleton/empty-state cho screens mới; E2E specs mới cho features mới (users UI, dashboard, export, audit) — không sửa assertions specs cũ.

### 3.12 Product completion — Production hardening (SF-12, deps SF-5+SF-11 — CUỐI)
- **M-3 resolved**: s2s auth — token passthrough (BFF forward access token, services verify JWKS) HOẶC mTLS nội mạng compose — SF-12 chọn 1, ghi rationale.
- Secrets: `.env` ra khỏi git (gitignore + rotate credentials), compose đọc từ env file local.
- Monitoring: healthcheck endpoints mọi service + uptime checks compose; logs structured.
- CI/CD: GitHub Actions — lint + unit test + E2E (E2E=1) + docker build mỗi PR.
- Backup: cron `pg_dump` cả 2 DB + restore doc.

## 4. ACCEPTANCE (user-visible)
1. `docker compose up --build` trên máy sạch → mở :3000 → đăng nhập username/password thật → D1 lọc đơn → D1b tạo phiếu (DnD + suggest + shipper) → D2 hủy/hoàn tất → D3 in PDF — toàn bộ hoạt động.
2. Tạo 1 phiếu → `docker compose restart` → đăng nhập lại → phiếu VẪN ĐÓ.
3. Mutations qua API reflecting ngay trên DB (`psql` thấy rows).
4. E2E Playwright xanh khi `E2E=1`.
5. `run.sh` từng service chạy được khi postgres đang lên; unit test pass không cần DB.
6. UI nhìn hiện đại, thống nhất 1 design system mới (3-hướng đã user chọn) — verify bằng browser 3 tầng, không phải chỉ "chạy được".
7. Manager tạo/khóa user + gán role ngay trong app (không cần vào Keycloak console).
8. Dashboard hiện số liệu thật (đơn/ngày, tỷ lệ hoàn thành, workload shipper).
9. Mutate đơn/batch ở 1 tab → tab khác cập nhật gần như tức thì (SSE).
10. Export CSV theo filter; mọi mutation có audit log, Manager xem được.
11. CI chạy test + E2E mỗi PR; backup `pg_dump` cron chạy; s2s auth không còn plain x-user-role.

## 5. Boundary (KHÔNG làm)
- KHÔNG TLS/HA; KHÔNG k8s/helm; KHÔNG horizontal scaling. (Backup automation + monitoring giờ IN scope — SF-12.)
- KHÔNG đổi gRPC proto, REST routes, response shape hiện có (SF-7 thêm endpoint/pagination envelope MỚI, không vỡ endpoint cũ; SF-10 thêm SSE endpoint).
- M-3 s2s auth giờ IN scope — SF-12 (token passthrough hoặc mTLS, SF-12 chọn + rationale).
- KHÔNG đổi nội dung `api/seed/canonical-seed.json`.
- KHÔNG xóa `.env` khỏi git trong story này (M-2 full fix để sau) — nhưng DB credentials phải đi pattern env mới không thêm secret mới vào git.

## 6. Risks (từ P0 analyst)
- **R1** E2E clean-seed giả định vỡ → giải bằng `E2E=1` reset (đã chốt, SF-1 build util, SF-5 wire).
- **R2** Go seed cross-check mất gốc → check orderCode chuyển vào seed pipeline SF-1 (query DB fulfillment.orders, không phải gRPC boot-time — xem §3.3).
- **R3** Batch code sequence vs seed max → `setval` từ max seed; E2E chỉ assert pattern `BATCH-\d+` (an toàn).
- **R4** Region filter heuristic → giữ SQL LIKE, không thêm column.
- **R5** Thứ tự response → ORDER BY tường minh từng query, so khớp in-memory semantics.
- **R7** Dual impl test → InMemory chỉ cho unit test; integration test skip-when-no-DB.
- **R-new** Keycloak boot nặng (~30s) → healthcheck + depends_on; E2E wait-for-ready.
