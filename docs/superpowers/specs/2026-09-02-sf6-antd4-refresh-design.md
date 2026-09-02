# SF-6 — UI/UX hiện đại hóa toàn web (antd4 refresh) — Design Spec

- **Story:** FI-245 / Linear: **FI-251**
- **Status:** Approved — direction **B Modern SaaS Airy** user-chọn qua gate 3 hướng (evidence: commit `7769dab`, hand-off `docs/superpowers/designs/sf6-direction.md`, prototype https://share.onorca.dev/a/eEwm_NOk1mAn)
- **Tier:** Full (Phase 0-5)
- **Nguồn thiết kế:** hand-off file là bản thiết kế chính xác — spec này không lặp lại giá trị tokens, chỉ khóa scope + quyết định phân giải.

## 1. Problem

UI hiện tại là antd4 mặc định đơn điệu (radius 2px, palette cũ, typography 16px, inline styles lộn xộn). Cần 1 design system thống nhất "Modern SaaS Airy" xuyên suốt shell + D1 + D1b wizard + D2 + D3, trên antd 4.24 (LESS build-time theming).

## 2. Scope

**In:**
- Tokens: `design-tokens.ts` (giá trị mới §1 hand-off + key mới), `shared-theme.ts` (LESS modifyVars + CSS vars mới)
- Shell: `AppLayout.tsx` reskin (header 60px trắng, rail 64px #101828, nav gradient cam + indicator), `LoginPage.tsx` + `ForgotPasswordPage.tsx` polish
- D1 (`apps/orders/src/pages/D1Page.tsx`): reskin FilterBar/table/bulk-bar/pagination + **StatStrip NET-NEW** (5 stat card trên FilterBar). **Phân giải data (spec-critic P0-1):** `FilterOrdersResponse` chỉ có `items` (trang hiện tại)/`total`/`page`/`pageSize` — KHÔNG có aggregate → stat counts tính **theo trang hiện tại**, sub-label ghi rõ "theo trang hiện tại"; REQUIREMENT-GAP đã comment lên FI-245 đề xuất aggregate API cho SF sau upgrade. Skeleton khi loading
- Page-head: KHÔNG có nút "Xuất CSV" (SF-7 sở hữu export endpoint, SF-11 sở hữu export UI — spec-critic P0-2); giữ nút "Làm mới" = client refetch (queryClient, không API mới)
- D1b (`CreateBatchingModal.tsx` + `batching-modal.css`): stepper 3 step bọc quanh nội dung hiện có, reskin toàn bộ
- D2 (`BatchListPage.tsx`) + D3 (`PrintPage.tsx` — trong apps/fulfillment): **tokens-derived reskin** — LESS tự lan qua modifyVars; bespoke tối thiểu = buttons theo §2.5 + table card pattern §2.2 + EmptyState qua props antd Table (không cấu trúc mới). Acceptance = Rule 0 screenshot thấy cùng ngôn ngữ thiết kế
- `StatusTag` (shared): reskin pill pastel + chấm tròn, GIỮ mapping kind→tone
- Skeleton/empty-state components NET-NEW trong `packages/shared`: D1 dùng đầy đủ; D2/D3 áp qua props `locale.emptyText`/empty của antd Table
- `shared-theme.test.ts`: cập nhật giá trị assert theo tokens mới (chủ đích — contract mới)

**Out:**
- antd5, đổi testid/DOM E2E phụ thuộc, đổi business logic/API/state
- e2e/, services/, api/, docker-compose, scripts/ — READ-ONLY
- Responsive/mobile (SF-11)
- Role-switcher pill (design §2.1 đề cập) — **SKIP**: component đã xóa ở SF-4, `App.test.tsx:116` assert vắng mặt

## 3. Ràng buộc cứng (vi phạm = fail)

1. antd 4.24 + LESS build-time only (`css.preprocessorOptions.less.modifyVars`) — ConfigProvider không `theme`
2. **MỌI testid hiện có giữ nguyên** (danh sách mở — theo hand-off §0): `app-header`, `app-sidebar`, `nav-*`, `lang-toggle`, `logout-button`, `header-user`, `remote-mount`, `filter-bar` + con, `bulk-bar`, `bulk-create-batch`, `bulk-transfer`, `login-*`, `forgot-*`, `fulfill-code-*`, `batch-link-*`, VÀ wizard-internal (DnD list, shipper select, date picker, slot) — khi bọc stepper, testid con giữ nguyên vị trí render. E2E Playwright toàn bộ specs xanh KHÔNG sửa assertion
3. Business logic không đổi: filter flow, URL state, selection semantics, wizard rules (cùng kho + chưa soạn, DnD stopOrder, shipper lọc kho, canSubmit), gRPC shape
4. Tokens dẫn từ `DESIGN_TOKENS` — hex cứng chỉ cho phép trong: (a) `batching-modal.css`, (b) shared stylesheet MỚI `packages/shared/src/theme/sf6-antd-overrides.css` (antd-internal selector overrides: modal animation `.sf6-modal-animation`, focus ring, pager, skeleton shimmer — escape hatch được spec-critic P1-6 yêu cầu; giá trị nên tham chiếu token). `@border-radius-lg: 20px` lan toàn cục là CHỦ ĐÍCH design; radius 12 bespoke viết CSS riêng

## 4. Thiết kế (tóm tắt — chi tiết đầy đủ trong hand-off §1-§4)

- **Tokens:** primary #EB6E09 (+hover #F68A2E, active #D96408, bg #FEF6EE, border #FDEADA, gradient), neutral scale Untitled-UI (#101828…#98A2B3), bg #F7F8FA, status pastel 5 tone (+purple, neutral), radius scale 5→999px (control 8, card 16, modal 20), shadow 6 cấp, spacing base 4, font 14px Roboto, tabular-nums cho cột số
- **Shell:** header 60px trắng shadow.xs (logo gradient + 2 dòng text); rail 64px #101828 (nav 40×40, active gradient + indicator 3×18 ::after right:-12px)
- **D1:** page-head (h1 21/700 + sub từ response.total) → stat-strip (5 card, card đầu accent #C25A06 — thêm token key `statAccent`) → FilterBar ngang (giữ DOM) → table card radius 16 (thead sticky #FBFCFD, row hover, selected #FEF6EE, pagination footer #FCFCFD) → skeleton shimmer + empty-state
- **Wizard:** modal 1240/radius 20/shadow.lg; stepper 3 node (cur gradient / done checkmark / upcoming trắng); body 3 step reskin theo hand-off §2.3 — DnD/select/date giữ nguyên handler
- **Buttons chuẩn:** primary gradient height 38 shadow.primary; ghost border #EAECF0 radius 10; link cam 600
- **Behavior:** transition .15s/.12s/.13s; focus ring `0 0 0 4px rgba(235,110,9,.12)`; modal fade+scale; stepper crossfade 120ms; refetch → mờ 0.6 giữ data cũ (không flash)

## 5. Test strategy

- Unit: cập nhật `shared-theme.test.ts` theo tokens mới; `StatusTag.test.tsx` phải xanh KHÔNG sửa (self-referential); shell `App.test.tsx` phải xanh KHÔNG sửa
- Build: `pnpm build` toàn workspace pass
- Rule 0 browser 3 tầng (bắt buộc, đây là SF UI):
  - **DOM eval đo được** (không phải taste): header 60px, rail 64px, page bg #F7F8FA, `@border-radius-base` → button radius 8px, fontSize body 14px, primary #EB6E09, modal radius 20px
  - **Screenshot** so prototype B (side-by-side, liệt kê gap từng mục)
  - **Flow trọn**: login Keycloak thật → navigate D1 → bulk-select → wizard 3 step tạo phiếu → D2 thấy batch
- E2E Playwright: toàn bộ specs xanh, KHÔNG sửa assertion (số spec không khóa cứng — count hiện tại có thể thay đổi do SF khác)

## 6. Risks

- `@border-radius-lg: 20px` lan sang mọi lg component antd → spot-check dropdown/popover trong browser
- fontSize 16→14 → regression text D2/D3
- Full stack phải sống cho Rule 0 (Postgres + Keycloak + apps + seed data)
- Inline-style lớn (~nhiều file) — mỗi task commit atomic, review rolling theo nhóm
