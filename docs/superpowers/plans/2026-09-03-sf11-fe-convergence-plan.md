# Plan: SF-11 FE convergence — audit viewer + export UI + mobile + harmonize

Date: 2026-09-03 | Linear: FI-256 | Worktree: sf-11-fe-convergence (base story/fi245-postgres-production)
Spec: `docs/superpowers/specs/2026-09-03-sf11-fe-convergence-design.md` (r2, spec-critic PROCEED)

## 0. Root cause analysis

### Root cause
SF-8/9 build trước SF-6 direction chốt → screens mới không dùng DESIGN_TOKENS; SF-7 BE (audit/export/pagination) chưa được FE tiêu thụ; SF-6 refresh scope không gồm responsive.

### Current state
- Audit API `GET /fulfillment/audit` + export `GET /fulfillment/orders/export.csv` sống nhưng KHÔNG UI gọi.
- UsersPage + DashboardPage: 0 occurrences DESIGN_TOKENS (plain antd4).
- 0 `@media` breakpoint trong app chrome; tables D2/D3 không có scroll prop.

### Expected outcome
Manager xem được audit log lọc/phân trang; D1 export theo filter; toàn app usable ~768px; Users/Dashboard harmonized 100% SF-6; specs mới + cũ all green.

### Constraints & hardships
services/** READ-ONLY (bug BE → REQUIREMENT-GAP, không tự sửa) · KHÔNG sửa specs cũ · desktop 1440×900 phải pixel-identical · frozen testids (`app-sidebar`, `nav-*`, `filter-bar`, `remote-mount`…) · port-war với SF-14/23/28 → seam riêng sf-11-*.

### High-level strategy
FE-only assembly theo patterns có sẵn (shell-local page như `/users`, blob download như d2c, CSS `@media` trong sf6-antd-overrides.css). Parallel theo file-boundary; review rolling theo nhóm.

## 1. Problem
Manager/ops thiếu công cụ xem audit + export đơn; tablet (shipper ra kho) không dùng được app; screens SF-8/9 lệch design system. (Chi tiết: spec §1.)

## 2. Scope
- In: audit viewer `/audit` (Manager) · Export CSV D1 · mobile ≤768px (D1/D1b/D2/D3/Dashboard/Users + nav collapse) · harmonize Users+Dashboard · skeletons/empty-states (Users/Dashboard/Audit) · E2E mới `08-audit-viewer` / `08-export` / `08-mobile` + regression 15 specs cũ.
- Out: business logic/API shape/proto/compose/realm (READ-ONLY) · native/PWA · sửa specs cũ · harmonize screens ngoài SF-8/9.
- Success criteria (observable): spec §7 — 6 dòng ACCEPTANCE.

## 3. Touch map
Xem spec §5 — 17 files (2 NEW FE pages/slice, 3 NEW specs, 12 modify). Consumers rủi ro: `nav.ts` NAV_ROUTES (append END — `firstPathForRole`), `PERMISSION_MATRIX` (merge hotspot, thêm tối thiểu), D1 page-head (specs 01/02/03/04 chạm), frozen testids.

## 4. Design
- Approach: Direction A mọi fork (spec D1-D10) — shell-local audit, permission `audit.view` Manager-only, horizontal scroll mobile, off-canvas nav CSS-only, export single-day mapping.
- Alternatives dismissed: exposed MF module từ orders (federation contract phí); reuse `users.manage` (Admin 403); card-view mobile (double-render đắt, rủi ro specs cũ).
- Edge cases: export created-range nhiều ngày → disable+tooltip; header-only CSV → không tải + message.info; export error → thoát loading + message.error (manual verify); audit detail null/object guard; UTC/HCM boundary (E2E wide range).
- Non-functional: a11y (button/tooltip chuẩn antd), i18n VI+EN mọi string mới (SF-22 convention), perf (server-side pagination pageSize 20, không request unbounded).

## 5. Implementation outline

### Tasks (ordered, DAG)
| # | Task | Deps | Files chính |
|---|------|------|-------------|
| 1 | audit-viewer | — | slices/audit.ts NEW, AuditPage.tsx NEW, App.tsx, nav.ts, AppLayout NAV_ICONS, i18n.ts, usePermissions |
| 2 | export-ui | — | slices/fulfillment.ts, D1Page.tsx |
| 3 | mobile-polish | 1 | sf6-antd-overrides.css, AppLayout hamburger, BatchListPage, PrintPage, CreateBatchingModal css, DashboardPage wrap |
| 4 | design-harmonize | — | UsersPage.tsx, DashboardPage.tsx |
| 5 | skeletons-empty | 1,3,4 | UsersPage, DashboardPage, AuditPage |
| 6 | e2e-new-green | 1,2,3,5 | e2e/tests/08-*.spec.ts NEW + runner sf-11 private seam |
| 7 | e2e-regression-15 | 6 | (chạy trên default-port stack + kafka profile, không sửa) |

**E2E stack strategy (plan-critic P0 fix):**
- T6 (specs MỚI): private seam sf-11 (ports 4010/4011/4012/4085/50071/50072, postgres `sf-11-postgres` :55442, keycloak `sf-11-keycloak` :8082, KAFKA_ENABLED=false — specs mới không phụ thuộc Kafka).
- T7 (15 specs CŨ): specs cũ hardcode absolute URLs `:3000/:8080/:8085` (verified: 05-users, 05-area, 06-exception, 07-realtime, 05-kafka) + cần kafka-ui REST — chạy trên **default-port full compose stack** từ worktree này: `docker compose --profile kafka up -d` (postgres, keycloak :8081, kafka :9092, kafka-ui :8085) + boot apps default ports (shell :3000, BFF :8080) + auth.setup globalSetup — đúng path specs cũ được build cho từ SF-5 (E2E=1). KHÔNG sửa specs cũ. Port-guard trước boot: `lsof -nP -iTCP:3000,8080,8081,8085,9092 -sTCP:LISTEN` — nếu có process lạ chiếm → LIỆT KÊ owner + REPORT, không kill mù (đây là ports dùng chung; các SF song song được chỉ thị dùng seam riêng).

### File structure (conventions)
- Shell page: `apps/shell/src/features/audit/AuditPage.tsx` (mirror `features/users/UsersPage.tsx`).
- API slice: `packages/api-client/src/slices/audit.ts` (pattern `slices/d2c.ts` — RTKQ injectEndpoints + plain fetch helper).
- CSS: mọi `@media (max-width: 768px)` vào `packages/shared/src/theme/sf6-antd-overrides.css` + class riêng nếu cần.
- i18n: keys VI + EN trong `apps/shell/src/i18n.ts`; apps/orders dùng pattern i18n riêng nếu có (check `apps/orders/src` — KHÔNG hardcode string mới).
- Tests: unit co-located `*.test.tsx` (pattern `CreateBatchingModal.test.tsx`).

### Testing strategy
- E2E specs MỚI: seam v2 private (runner `run-sf11.sh` adapt từ `/tmp/story/fi233/run-sf16-v2.sh`): postgres container `sf-11-postgres` :55442, keycloak `sf-11-keycloak` :8082 (realm import `docker/keycloak/`), shell :4010, orders :4011, fulfillment :4012, BFF :4085, Java :50071, Go :50072, print shared :50053; mint storageStates manager/coordinator/admin adapt `mint_sf16_v2.py` (BASE :8082, REDIRECT/ORIGIN :4010).
- E2E regression (T7): DEFAULT-port full compose stack + `--profile kafka` — xem Task 7 (KHÔNG chạy trên seam sf-11).

## 6. Risks & unknowns
- Must verify: BFF audit/export routes exact shapes đã verify (spec-critic round 2); remotes.config ports khi boot seam.
- Unverified assumptions: activity_log có data sau seed+mutations (specs tạo mutation qua UI flows nếu rỗng); Content-Disposition filename pattern (đọc khi wire).
- Mitigations: spec §6 table.

---

### Task 1: audit-viewer — slice + permission + page + nav (FI-256)
**Files:** Create `packages/api-client/src/slices/audit.ts`, `apps/shell/src/features/audit/AuditPage.tsx`; Modify `apps/shell/src/App.tsx` (route `/audit` guard `audit.view`), `apps/shell/src/nav.ts` (NAV_ROUTES **append cuối mảng** — constraint `firstPathForRole`, đọc comment trong file), `apps/shell/src/features/layout/AppLayout.tsx` (NAV_ICONS thêm audit icon), `apps/shell/src/i18n.ts` (VI+EN: `nav.audit`, audit page title/filters/columns/empty), `packages/shared/src/hooks/usePermissions.tsx` (PERMISSIONS + `audit.view`; PERMISSION_MATRIX chỉ Manager=true).
- [ ] Step 1: Đọc `features/users/UsersPage.tsx` (page pattern), `slices/d2c.ts` (slice pattern), `routes/fulfillment.ts` BFF (audit query shape: `AuditQuery` actor/action/targetType/targetId/dateFrom/dateTo/page/pageSize; response items `{id, actor, action, targetType, targetId, detail(object|null), createdAt}`).
- [ ] Step 2: Slice `audit.ts` — RTKQ `listAudit` query GET `/fulfillment/audit` params serialize (dateFrom/dateTo bare YYYY-MM-DD); unit test params.
- [ ] Step 3: Permission `audit.view` + matrix Manager-only; unit test has() cho Manager/Coordinator/Admin.
- [ ] Step 4: AuditPage — page-head (title i18n), filter row (Input actor, Input action, RangePicker), Table server-paginated pageSize 20 (showTotal total), columns: createdAt (format Asia/Ho_Chi_Minh `HH:mm DD/MM/YYYY`), actor, action (Tag), target (`targetType/targetId`), `expandedRowRender` pretty JSON detail (guard typeof object, null → text rỗng). TableSkeleton loading, EmptyState 0 items. Table card class theo SF-6 (`sf6-table-card`/pattern D1).
- [ ] Step 5: Route + nav (icon import từ @ant-design/icons sẵn có) + i18n keys.
- [ ] Step 6: `pnpm --filter @hub-store/shell typecheck` + unit tests pass; commit `feat(sf11): audit viewer — slice + permission + page + nav`.
- **Verify:** typecheck xanh; unit xanh; (browser 3-tier do coordinator chạy sau nhóm).

### Task 2: export-ui — helper + D1 button (FI-256)
**Files:** Modify `packages/api-client/src/slices/fulfillment.ts` (thêm `fetchOrdersExport`), `apps/orders/src/pages/D1Page.tsx` (button + derive + states).
- [ ] Step 1: Đọc `routes/fulfillment.ts` BFF export route (querystring: `fulfillCode`, `batchStatus` comma ints, `regionCodes`/`shopCodes` comma strings, `orderStatus` comma ints, `createdAt` single date → full UTC day) + `utils/filters.ts` D1 state shape (`createdFrom/createdTo`, `deliveryFrom/To`, `originalFrom/To`…).
- [ ] Step 2: Helper `fetchOrdersExport(params)` copy blob pattern `fetchD2cOrdersExport` (axios singleton, responseType blob, ErrorEnvelope parse). Unit test: derive function `buildExportParams(filterState)` → chỉ khi `createdFrom === createdTo` mới set `createdAt`; unsupported filters active (`deliveryFrom||deliveryTo||originalFrom||originalTo` truthy, hoặc `createdFrom !== createdTo`) → `{ disabled: true, reason }`.
- [ ] Step 3: D1Page — button "Export CSV" (icon Download, ghost pattern như "Làm mới" trong page-head cạnh nó) → onClick gọi helper với derived params → loading state → blob: check header-only (mọi byte sau newline đầu là whitespace/EOF) → `message.info(i18n 'no data')` không tải; ngược lại objectURL + a.click + revoke. Filename từ Content-Disposition nếu có, fallback `orders-export-<yyyyMMdd-HHmmss>.csv`. Error → thoát loading + `message.error`. Unsupported active → button `disabled` + `Tooltip` (i18n, nêu filter không hỗ trợ). i18n keys VI+EN theo pattern i18n của apps/orders (check file — KHÔNG hardcode).
- [ ] Step 4: Unit tests derive + header-only detect pass; typecheck shell+orders; commit `feat(sf11): export CSV button trên D1 — filter-derive + loading/empty/error`.
- **Verify:** không đổi testid/DOM cũ; button là element mới (an toàn specs cũ).

### Task 3: mobile-polish — ≤768px shell nav + screens (FI-256) [deps: T1]
**Files:** Modify `packages/shared/src/theme/sf6-antd-overrides.css`, `apps/shell/src/features/layout/AppLayout.tsx` (hamburger), `apps/fulfillment/src/pages/BatchListPage.tsx`, `apps/fulfillment/src/pages/PrintPage.tsx`, `apps/orders/src/batching/batching-modal.css` (+ tsx nếu cần), `apps/orders/src/pages/DashboardPage.tsx` (wrap part), `apps/orders/src/pages/D1Page.tsx` (wrap filters nếu chưa).
- [ ] Step 1: AppLayout — thêm hamburger button trong `app-header` (chỉ visible ≤768px qua CSS class), toggle class `sf11-nav-open` trên layout wrapper. Sidebar rail: `@media (max-width: 768px)` → `transform: translateX(-100%)` (element VẪN trong DOM — testid sống); `.sf11-nav-open` → translateX(0) + overlay backdrop. Click nav item/route change → đóng.
- [ ] Step 2: CSS media block: header co (padding 8px), user chip rút gọn; `.sf11-stack` utility (flex-direction column). D1 FilterBar wrap + stat-strip grid 2 cột; bulk-bar wrap. D2 BatchListPage thêm `scroll={{x}}` (tính tổng cột) + filter wrap. PrintPage stack layout. CreateBatchingModal width `min(960px, calc(100vw - 16px))`. Dashboard stat grid 2 cột, charts stack. Users table wrapper overflow-x.
- [ ] Step 3: Desktop regression tự kiểm: KHÔNG có thay đổi render ở >768px (mọi CSS mới nằm trong @media hoặc class toggle chỉ active ≤768px).
- [ ] Step 4: Typecheck shell+orders+fulfillment; unit tests pass; commit `feat(sf11): mobile ≤768px — nav off-canvas + screen stacks + table scroll`.
- **Verify:** frozen testids `app-sidebar`/`nav-*` vẫn trong DOM ở mọi viewport; desktop pixel-identical (browser do coordinator).

### Task 4: design-harmonize — Users + Dashboard 100% SF-6 (FI-256)
**Files:** Modify `apps/shell/src/features/users/UsersPage.tsx`, `apps/orders/src/pages/DashboardPage.tsx`.
- [ ] Step 1: Đọc `docs/superpowers/designs/sf6-direction.md` (tokens §1, components §2) + `design-tokens.ts` + pattern D1 page (page-head/card/table classes).
- [ ] Step 2: UsersPage reskin: page-head pattern (title + actions), card `radius.card`/`borderLight`, status colors semantic (active/locked → success/neutral tags), spacing tokens, buttons ghost/primary theo hệ. KHÔNG đổi logic/API/testid.
- [ ] Step 3: DashboardPage reskin: stat cards pattern (như StatStrip D1 nếu có), chart cards cùng radius/border/shadow, page-head. KHÔNG đổi data-fetch/testid.
- [ ] Step 4: Typecheck shell+orders; unit pass; commit `feat(sf11): harmonize Users + Dashboard theo design system SF-6`.
- **Verify:** 0 hex ngoài tokens (grep hex literals mới — chỉ tokens import).

### Task 5: skeletons-empty — Users/Dashboard/Audit (FI-256) [deps: T1, T4]
**Files:** Modify `apps/shell/src/features/users/UsersPage.tsx`, `apps/orders/src/pages/DashboardPage.tsx`, `apps/shell/src/features/audit/AuditPage.tsx`.
- [ ] Step 1: Áp `TableSkeleton` (initial load) + `EmptyState` (list rỗng) cho UsersPage (components có sẵn `packages/shared/src/components/Skeleton|EmptyState` — đọc props thật).
- [ ] Step 2: DashboardPage — `StatStripSkeleton` khi aggregate loading; empty state khi charts không data (EmptyState hoặc chart empty config — chọn 1, theo pattern D1 dashboard cũ nếu có).
- [ ] Step 3: AuditPage — confirm skeleton/empty đã có từ T1 (chỉ bổ sung nếu thiếu).
- [ ] Step 4: Typecheck + unit pass; commit `feat(sf11): skeletons + empty-states Users/Dashboard/Audit`.
- **Verify:** mỗi màn có đúng 1 skeleton khi loading + 1 empty khi rỗng (browser do coordinator).

### Task 6: e2e-new-green — 3 specs mới + seam sf-11 (FI-256) [deps: T1,T2,T3,T5]
**Files:** Create `e2e/tests/08-audit-viewer.spec.ts`, `e2e/tests/08-export.spec.ts`, `e2e/tests/08-mobile.spec.ts`, `e2e/scripts/run-sf11-stack.sh` (hoặc /tmp — docs trong runner), `e2e/scripts/mint_sf11.py`; Modify `e2e/playwright.sf11.config.ts` NEW (pattern `playwright.nvc-fe.config.ts`).
- [ ] Step 1: Infra — adapt `/tmp/story/fi233/run-sf16-v2.sh` → `run-sf11-stack.sh` (worktree sf-11-fe-convergence): docker run postgres `sf-11-postgres` :55442 (initdb 2 DB từ `services/` init scripts hoặc reuse compose initdb pattern — đọc `docker-compose.yml` postgres service) + migrate Java (Flyway boot) + seed `seed-db.sh`; docker run keycloak `sf-11-keycloak` :8082 (`quay.io/keycloak/keycloak:26.0 start-dev --import-realm`, volume `docker/keycloak/`); BFF env OIDC issuer/JWKS → localhost:8082, DB ports → 55442, KC admin secret từ realm JSON. Adapter mint_sf11.py (adapt mint_sf16_v2.py: BASE localhost:8082, REDIRECT/ORIGIN http://localhost:4010) mint `manager`, `coordinator`, `admin` storageStates → `e2e/.auth/sf11-*.json`.
- [ ] Step 2: `08-audit-viewer.spec.ts` (config: baseURL :4010, storageState manager): login-role Manager → nav `/audit` → bảng render + cột đúng + phân trang hiện; tạo 1 mutation qua UI (tạo order flow ngắn hoặc dùng data seed đã có mutation log) → lọc actor → thấy entry; lọc action; lọc date wide (dateFrom = hôm nay trừ 7 ngày) → kết quả đúng; Coordinator storageState: nav entry `nav-audit` KHÔNG có + goto /audit → bị chặn (redirect); Admin: tương tự bị chặn.
- [ ] Step 3: `08-export.spec.ts`: Manager → D1 → set filter (vd fulfillCode prefix có data) → click Export (testid mới `export-csv-button`) → download event → file tồn tại, content dòng đầu = header CSV; filter không match → KHÔNG download + message.info; set createdFrom≠createdTo → button disabled + tooltip text.
- [ ] Step 4: `08-mobile.spec.ts`: viewport 768×1024 → hamburger click → `app-sidebar` visible + vẫn trong DOM (attached); click nav item → nav đóng; D1 → bảng scroll ngang hoạt động; `document.body` horizontal overflow ≤ 2px (tolerance scrollbar — tránh flaky 1px retry storm).
- [ ] Step 5: Chạy 3 specs trên stack sf-11 → all green; commit `test(sf11): e2e specs audit/export/mobile + private seam sf-11`.
- **Verify:** runner idempotent (chạy lại không port-conflict); specs không phụ thuộc thứ tự.

### Task 7: e2e-regression-15 — specs cũ all green KHÔNG sửa (FI-256) [deps: 6]
**Files:** KHÔNG sửa specs (run-only). Fix code được phép NẾU (và chỉ nếu) triage ra lỗi do code SF-11.
- [ ] Step 1: Port-guard (lưu ý: `boot-all.sh` tự blind-kill listeners trên 50051/50052/50053/8080/3000/3001/3002 — guard thật sự cần cho docker ports): `lsof -nP -iTCP:8081,8085,9092,55432 -sTCP:LISTEN` sạch + xác nhận không sibling e2e đang chạy trên default ports → boot: `LOG_DIR=/tmp/story/fi245/sf11` + `export KAFKA_ENABLED=true` (inline env — KHÔNG sửa `.env` vì file này git-tracked; dotenv không ghi đè process.env nên inline thắng cho BFF host-run; kafka part chỉ cần `docker compose --profile kafka up -d kafka kafka-init kafka-ui` — postgres/keycloak boot-all tự lo) → `E2E=1 bash scripts/boot-all.sh` (reset-db → seed sạch, khớp intent "state cần seed sạch" của config). Không sạch (docker ports) → liệt kê owner, REPORT coordinator, KHÔNG kill.
- [ ] Step 2: Chạy 15 specs cũ: `E2E_REUSE=1 KAFKA_ENABLED=true pnpm exec playwright test` trong e2e/ (E2E_REUSE=1 BẮT BUỘC — webServer reuse=false mặc định sẽ abort "port already used" vì stack đã boot tay; KAFKA_ENABLED=true trên e2e processenv BẮT BUỘC — 05-kafka test.skip nếu thiếu, false-green). Ghi kết quả từng file.
- [ ] Step 3: Triage matrix khi FAIL (KHÔNG sửa spec trong mọi nhánh):
  (i) Port/seam/env mismatch (lỗi connect, absolute URL) → sai stack — fix cách boot, rerun.
  (ii) Data state (seed mutation, audit trống, đơn đếm sai) → re-seed DB (`seed-db.sh` / compose seed) rồi rerun.
  (iii) Code SF-11 vỡ hành vi cũ (testid mất, DOM đổi, API shape đổi do FE) → fix code SF-11, rerun.
  Nếu FAIL không vào 3 nhánh trên → REPORT coordinator kèm trace, không đoán fix.
- [ ] Step 4: `git diff --stat e2e/tests/` files cũ = 0 (chứng minh không sửa specs); commit chỉ nếu có fix code (`fix(sf11): ...`).
- **Verify:** playwright output full pass (hoặc skip có lý do rõ per-spec nếu spec tự gate env — vd 05-nvc-api theo E2E env của nó); specs cũ untouched.

## Testing checklist (Phase 5 inputs)
- Unit/typecheck: shell, orders, fulfillment, api-client, shared — tất cả pass.
- Browser 3-tier (coordinator): audit viewer (Manager flow + deny flow), export (happy/empty/disabled), 768px (nav toggle + D1 scroll), harmonize (Users/Dashboard vs sf6-direction), skeletons/empty.
- E2E: 3 specs mới + 15 cũ.
