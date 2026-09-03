# SF-11 FE Convergence — Audit viewer + Export UI + Mobile + Harmonize — Design

Story: FI-245 (epic) / FI-256 (SF-11). Worktree: `sf-11-fe-convergence` (base `story/fi245-postgres-production`).
Spec source: context pack `docs/superpowers/contexts/fi245-sf-11.md` + epic spec §3.11 + SF-6 direction `docs/superpowers/designs/sf6-direction.md`.

Status: Approved (autonomous — epic-level questions đã trả lời hết trong context pack; Phase 0 + REQUIREMENT-GAP đã flag lên FI-245).

## 1. Problem

BE surfaces đã có (SF-7 audit query + export CSV + pagination; SF-8 users; SF-9 dashboard; SF-10 realtime) nhưng FE thiếu: audit viewer chưa tồn tại, chưa đâu có nút Export, screens SF-8/9 build trước direction nên chưa dùng DESIGN_TOKENS, toàn app không có responsive behavior. Đây là công việc FE lắp ráp + hội tụ trên contracts BE ĐÓNG BĂNG (READ-ONLY services/**).

## 2. Scope

### In
1. **Audit viewer** (Manager only): route `/audit` shell-local, filter actor/action/date-range, bảng phân trang server-side, đúng design system SF-6.
2. **Export UI**: nút "Export CSV" trên D1 page-head (cạnh "Làm mới"), tải file theo filter hiện tại; loading + empty handling.
3. **Mobile responsive ~768px**: D1/D1b (orders-mf), D2 (fulfillment-mf), D3 (print-mf), Dashboard, Users; shell nav collapse; bảng → controlled horizontal scroll.
4. **Design harmonize**: UsersPage + DashboardPage reskin theo 100% SF-6 tokens/spacing/components.
5. **Skeletons + empty-states** cho UsersPage, DashboardPage, AuditPage (components có sẵn trong shared).
6. **E2E**: specs MỚI cho audit-viewer + export (users/dashboard/realtime specs đã có từ SF-8/9/10 — chỉ verify xanh); toàn bộ 15 specs hiện hữu stay green KHÔNG sửa.

### Out (boundary)
- KHÔNG đổi business logic / API shape / proto / compose / realm JSON (services/** READ-ONLY).
- KHÔNG native mobile / PWA — chỉ responsive web.
- KHÔNG sửa specs E2E cũ (kể cả `03-audit.spec.ts` — là i18n-audit, không liên quan activity log).
- KHÔNG harmonize screens ngoài SF-8/9 (SF-17/18/20/28 screens ngoài scope slice này).

## 3. Design decisions (self-answered, flagged trên FI-245)

| # | Câu hỏi | Quyết định | Lý do |
|---|---------|-----------|-------|
| D1 | Audit viewer đặt đâu? | Shell-local route `/audit` (mirror `/users`) | Không đổi MF contract (remotes.config/vite exposes); context pack touch map ghi `apps/shell/src` |
| D2 | Gate permission? | Permission MỚI `audit.view` trong `PERMISSIONS` + `PERMISSION_MATRIX`, map Manager only | BFF check `role !== 'Manager'` → 403; reuse `users.manage` (Manager+Admin) sẽ cho Admin thấy nav rồi ăn 403 |
| D3 | Mobile table strategy? | Controlled horizontal scroll (D1 đã có `scroll={{x:1400}}`; thêm tương tự cho D2/D3 nếu thiếu) + wrap filters + stack stat grids; nav collapse bằng CSS `@media` thuần | Desktop 1440×900 phải pixel-identical (specs cũ dùng viewport đó); card-view double-render quá đắt; acceptance chỉ yêu cầu "usable, không vỡ" |
| D4 | Nav collapse pattern? | ≤768px: sidebar rail chuyển thành off-canvas (hidden bằng transform, element VẪN trong DOM), nút hamburger trong header toggle overlay | Frozen testids `app-sidebar`, `nav-*` phải giữ nguyên DOM; CSS-first tránh hydration flash |
| D5 | Export khi filter không hỗ trợ? (deliveryFrom/To, originalFrom/To — export.csv không nhận params này) | Pass chỉ các filter được hỗ trợ; khi filter KHÔNG hỗ trợ đang active → disable nút + tooltip giải thích | Không được tải file "không đúng filter" (vi phạm acceptance); BE READ-ONLY — REQUIREMENT-GAP đã lên FI-245 |
| D6 | Audit timezone? | Hiển thị `createdAt` theo Asia/Ho_Chi_Minh (khớp convention dashboard `05-dashboard.spec.ts`); date filter gửi bare `YYYY-MM-DD` (BFF tự xử lý UTC day bounds, dateTo exclusive-next-day) | Consistent với phần còn lại của app |
| D7 | Audit detail (JSONB freeform)? | Cell hiển thị `action` + `targetType/targetId`; `detail` render vào expandable row (antd Table `expandedRowRender`) pretty-print JSON, handle null | Freeform JSON không biết shape trước — expandable an toàn |
| D8 | Design direction cho audit viewer? | KHÔNG cần 3 hướng user-gate — design system SF-6 che phủ đầy đủ (table card, filter bar, pagination, TableSkeleton, EmptyState đều có pattern trong sf6-direction + code SF-6); audit viewer = composition các component đó | Directive: "NẾU design system SF-6 che phủ hết → implement theo" |
| D9 | Filename/tên spec mới? | `08-audit-viewer.spec.ts` + `08-export.spec.ts` | Prefix `08-` tránh đụng contract thứ tự `01..07`; tránh đụng tên `03-audit.spec.ts` cũ |
| D10 | E2E stack? | Private-port seam v2 (pattern SF-16): shell :4010, remotes :4011/:4012, BFF :4085, Java :50071, Go :50072, Keycloak/Postgres containers riêng `sf-11-*` qua env override | Không tranh port với SF-14/23/28 đang chạy e2e |

## 4. Architecture

### 4.1 Audit viewer
- `apps/shell/src/features/audit/AuditPage.tsx` (NEW) — shell-local page (pattern `features/users/UsersPage.tsx`).
- Route `/audit` trong `apps/shell/src/App.tsx` — guard bằng `usePermissions().has('audit.view')`; redirect về default route nếu không đủ.
- Nav entry: `apps/shell/src/nav.ts` `NAV_ROUTES` — **append CUỐI mảng** (ordering constraint: `firstPathForRole` phụ thuộc thứ tự), icon trong `NAV_ICONS` (`AppLayout.tsx`), i18n keys `nav.audit` + audit page strings trong `apps/shell/src/i18n.ts` (VI + EN — SF-22 no-hardcode convention).
- Permission: `packages/shared/src/hooks/usePermissions.tsx` — thêm `audit.view` vào `PERMISSIONS`; `PERMISSION_MATRIX` chỉ Manager = true.
- Data: NEW slice `packages/api-client/src/slices/audit.ts` — `GET /fulfillment/audit` với params `actor, action, targetType, targetId, dateFrom, dateTo, page, pageSize`; response chuẩn PaginationEnvelope (`items/total/page/pageSize` qua `packages/api-client/src/baseQuery.ts`). Filter state local (không cần URL persist — acceptance không yêu cầu; URL-persist là pattern SF-20, không áp ở đây).
- UI: page-head (title + i18n), filter row (Input actor, Input action, RangePicker date), Table server-paginated (pageSize 20, pager chuẩn antd), columns: thời gian (Asia/Ho_Chi_Minh), actor, action (Tag), target, expandable row = pretty JSON `detail` (null → empty-state text). `TableSkeleton` khi loading, `EmptyState` khi 0 items.

### 4.2 Export UI
- `apps/orders/src/pages/D1Page.tsx` — button "Export CSV" (icon Download) trong page-head cạnh "Làm mới", `type="default"`.
- Helper `fetchOrdersExport(params)` trong `packages/api-client/src/slices/fulfillment.ts` — copy blob pattern `fetchD2cOrdersExport` (`slices/d2c.ts`): axios singleton (Bearer interceptor) → `responseType: 'blob'` → caller tạo object URL + click link. **KHÔNG dùng `<a href>` trực tiếp** (sẽ 401).
- Querystring derive từ `useUrlState` filter state (mapping util trong task, KHÔNG eyeball): hỗ trợ `fulfillCode, batchStatus, regionCodes, shopCodes, orderStatus, createdAt`.
- Loading: button `loading` state trong lúc fetch blob. Empty: nếu CSV chỉ có header row (resp text 1 dòng) → `message.info` "Không có dữ liệu để xuất" thay vì tải file rỗng.
- Filter không hỗ trợ (delivery/original dates) đang active → button disabled + Tooltip (theo D5).

### 4.3 Mobile responsive (~768px breakpoint)
- Tất cả CSS `@media (max-width: 768px)` đặt trong `packages/shared/src/theme/sf6-antd-overrides.css` (+ CSS mới nếu cần class riêng); KHÔNG JS breakpoint cho chrome layout.
- Shell: sidebar rail (64px, `app-sidebar`) → off-canvas translate khi ≤768px; hamburger button trong header (`app-header`) toggle class trên wrapper; drawer overlay đóng khi click nav item / route change. Element luôn trong DOM.
- Header: co padding, user chip rút gọn.
- D1: FilterBar wrap (flex-wrap), stat-strip stack 2 cột, table đã `scroll={{x:1400}}` (giữ); bulk-bar wrap.
- D2 (BatchListPage): thêm `scroll={{x: <tổng cột>}}` + wrap filters; D3 (PrintPage): layout stack; Dashboard: stat cards grid → 1-2 cột, charts stack; Users: table scroll ngang + form modal full-width ≤768px.
- Không đổi testid/DOM structure có sẵn — chỉ style + element mới (hamburger).

### 4.4 Design harmonize (Users + Dashboard)
- Reskin `apps/shell/src/features/users/UsersPage.tsx` + `apps/orders/src/pages/DashboardPage.tsx`: áp `DESIGN_TOKENS` (color/radius/shadow/spacing), card pattern (`radius.card`, `borderLight`), page-head pattern giống D1, status colors semantic từ direction §1.1.
- Không đổi logic, không đổi testid, không đổi API calls.
- Verify bằng browser 3 tầng so với sf6-direction tokens.

### 4.5 Skeletons + empty-states
- UsersPage: `TableSkeleton` initial load, `EmptyState` khi list rỗng (đã có pattern từ SF-6 components — apply).
- DashboardPage: `StatStripSkeleton` + chart skeleton khi aggregate đang load; empty state khi không data.
- AuditPage: như §4.1.

### 4.6 E2E
- NEW `e2e/tests/08-audit-viewer.spec.ts`: Manager login (storageState mint từ Keycloak qua seam v2) → nav tới /audit → thấy bảng + phân trang; lọc theo actor/action → kết quả lọc đúng; non-Manager (Coordinator) → KHÔNG thấy nav entry + vào thẳng URL → bị chặn.
- NEW `e2e/tests/08-export.spec.ts`: Manager → D1 → set 1 filter → click Export → download event, file tồn tại + content có header CSV; empty filter result → không download + info message (hoặc empty CSV tùy hành vi thật — assert theo implement).
- Regression: chạy TOÀN BỘ 15 specs hiện hữu trên seam v2 (hoặc stack tương đương) — all green, `git diff` = 0 trên `e2e/tests/` cũ.
- Data note: audit activity_log có sẵn data từ mutation flows (SF-7 ghi mọi mutation); specs KHÔNG mutate data ngoài việc tạo order/batch qua UI nếu cần (dùng flows specs cũ đã chứng minh).

## 5. Touch map

```
apps/shell/src/features/audit/AuditPage.tsx        NEW
apps/shell/src/App.tsx                             route /audit
apps/shell/src/nav.ts                              NAV_ROUTES append END + icon
apps/shell/src/features/layout/AppLayout.tsx       NAV_ICONS + hamburger mobile
apps/shell/src/i18n.ts                             keys VI/EN
apps/shell/src/features/users/UsersPage.tsx        harmonize + skeleton/empty
packages/shared/src/hooks/usePermissions.tsx       audit.view + matrix
packages/shared/src/theme/sf6-antd-overrides.css   @media 768px + helpers
packages/api-client/src/slices/audit.ts            NEW
packages/api-client/src/slices/fulfillment.ts      fetchOrdersExport
apps/orders/src/pages/D1Page.tsx                   export button + mobile wrap
apps/orders/src/pages/DashboardPage.tsx            harmonize + skeleton/empty + mobile
apps/fulfillment/src/pages/BatchListPage.tsx       scroll + wrap (D2)
apps/print-mf/src/... (PrintPage)                  stack (D3)
e2e/tests/08-audit-viewer.spec.ts                  NEW
e2e/tests/08-export.spec.ts                        NEW
```
READ-ONLY: services/**, compose, realm JSON, e2e/tests/* cũ (kể cả configs nếu không cần).

## 6. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Vỡ specs cũ khi touch chrome/D1 | CSS `@media` only; DOM/testid frozen; desktop 1440×900 untouched; regression suite chạy TRƯỚC merge |
| `firstPathForRole` vỡ khi thêm nav route | Append END của NAV_ROUTES (constraint ghi trong nav.ts) |
| PERMISSION_MATRIX merge conflict | Thay đổi tối thiểu 2 dòng (PERMISSIONS + 1 role row) |
| Export blob pattern lệch Content-Disposition | Đọc chính xác response khi wire (không đoán filename pattern) |
| audit list rỗng trên stack sạch | Spec tạo mutation qua UI flow có sẵn trước khi assert audit entry |
| Port-war với SF-14/23/28 | Containers + ports riêng sf-11-* (seam v2), check trước khi boot |
| Rate limit Linear | Retry READ-BACK sau khi fail, không tạo trùng |

## 7. Acceptance (user-visible — Phase 5 verify từng dòng)

1. Manager thấy màn Audit log đúng design system SF-6, lọc được theo actor/action/date, phân trang hoạt động.
2. Nút Export trên D1 tải đúng file theo filter đang chọn; loading + empty handling hoạt động.
3. Mở app ở ~768px: D1/D2/D3 + dashboard + users dùng được, nav collapse, không vỡ layout.
4. TẤT CẢ screens (cũ + mới) cùng 1 design system SF-6 — Users + Dashboard harmonized 100% tokens — browser 3 tầng verify (DOM → VISUAL → FLOW).
5. Skeletons + empty-states trên Users/Dashboard/Audit.
6. E2E: specs mới (audit, export) xanh + toàn bộ specs cũ xanh KHÔNG sửa.
