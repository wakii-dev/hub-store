# SF-6 antd4 Refresh (Direction B Modern SaaS Airy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin toàn web (shell + D1 + D1b wizard + D2 + D3) theo direction B Modern SaaS Airy trên antd 4.24 LESS — không đổi DOM/testid/business logic, E2E giữ xanh không sửa.

**Architecture:** Single-source tokens `DESIGN_TOKENS` (packages/shared) → LESS modifyVars build-time + CSS vars + 1 shared overrides stylesheet. Inline-style TSX pattern giữ nguyên (codebase convention). StatStrip + Skeleton + EmptyState là components NET-NEW. Wizard là sectioned single-pane stepper (E2E-safe — xem Deviation D1).

**Tech Stack:** React 18 + antd 4.24 + Vite LESS modifyVars + pnpm workspace (turbo).

**Linear Issue:** FI-251

**Design source of truth:** `docs/superpowers/designs/sf6-direction.md` (§1 tokens, §2 structure, §3 behavior, §5 out-of-scope-dev-quyết) — plan không lặp lại mọi giá trị, executor ĐỌC hand-off trước mỗi task.

## Deviations đã phân giải (executor phải biết)

- **D1 — Wizard stepper NON-BLOCKING:** E2E `01-main-flow.spec.ts` đi xuyên DnD→suggest→shipper→slot→submit trong MỘT phiên modal không step-nav. Nên stepper là header visual 3 node; 3 section xếp dọc trong modal, content KHÔNG BAO GIỜ ẩn; nút "Tiếp tục →" scroll-to-section kế (không gating); footer giữ `batch-submit`. Crossfade 120ms áp cho section-highlight, không phải step-swap.
- **D2 — StatStrip page-scoped:** `FilterOrdersResponse` không có aggregate → counts theo trang hiện tại, sub-label "theo trang hiện tại". REQUIREMENT-GAP đã lên FI-245.
- **D3 — Không nút "Xuất CSV"** trong page-head (SF-7/SF-11 sở hữu). "Làm mới" = client refetch.
- **D4 — Không role-switcher** (đã xóa SF-4, test assert vắng mặt).
- **D5 — hex cứng chỉ trong** `batching-modal.css` + `sf6-antd-overrides.css` (token-derived khi được).

---

### Task 1: Theme foundation — tokens + LESS + overrides CSS + tests

**Files:**
- Modify: `packages/shared/src/theme/design-tokens.ts` (thay toàn bộ giá trị theo hand-off §1, giữ shape + thêm key)
- Modify: `packages/shared/src/theme/shared-theme.ts` (antdLessModifyVars + sharedCssVariables mới)
- Modify: `packages/shared/src/theme/shared-theme.test.ts` (update giá trị assert — CHỦ ĐÍCH)
- Create: `packages/shared/src/theme/sf6-antd-overrides.css`
- Verify: 3 vite configs đã dây `antdLessModifyVars` (không đổi nếu đã đúng)

- [ ] **Step 1:** Ghi `DESIGN_TOKENS` mới — colors §1.1 (thêm `primaryHover/Active/Bg/Border/primaryGradient/textFaint/dividerSoft/bgSoftWhite/bgHeaderSticky/sidebar/statAccent`; status 5 tone × {text,bg,line} + purple + neutral), `shadow` §1.3 (6 key), `typography` §1.5 (h1 21/700 -0.02em, h2 17, h3 14, body 14, bodySm 13, caption 12.5, overline 11/600), `radius` §1.2 `{sm:5, control:8, md:10, lg:12, xl:14, card:16, pill:999, modal:20}` (xóa `popup`, grep consumer đổi sang `modal`), `layout: {sidebarWidth: 64, headerHeight: 60}`
- [ ] **Step 2:** `antdLessModifyVars` theo block LESS hand-off §1.1/§1.2 + thêm `@table-padding-vertical: 13px`, `@table-padding-horizontal: 14px`, `@font-size-base: 14px`. `sharedCssVariables` thêm `--primary-hover/--primary-active/--primary-bg/--primary-border/--primary-gradient/--text-faint/--bg-soft-white/--bg-header-sticky/--sidebar-bg/--shadow-xs…--shadow-focus/--stat-accent`; `--radius-control: 8px`, `--radius-modal: 20px` (grep `--radius-popup` consumer — nếu còn thì alias = 20px)
- [ ] **Step 3:** Tạo `sf6-antd-overrides.css` (import SAU `antd/dist/antd.less` trong cả 3 `main.tsx`): primary gradient button (`.ant-btn-primary` bg gradient, border none, shadow.primary, hover brightness(1.05), active translateY(1px)); ghost/default button §2.5; focus ring input/select/textarea (border #EB6E09 + `0 0 0 4px rgba(235,110,9,.12)`); button focus outline `2px solid #F68A2E` offset 2; `.sf6-modal-animation .ant-modal-content` open animation (fade + translateY(8px)→0 scale .98→1 150ms ease-out); pager button 30×30 radius 8 current gradient; `.sf6-shimmer` keyframes §2.2
- [ ] **Step 4:** Update `shared-theme.test.ts`: fontSize 14, radius control 8 / modal 20, status hex mới, layout 64/60, typography scale mới, CSS vars mới. Grep toàn repo consumer token cũ (`radius.popup`, `typography.h1`, hardcoded hex cũ trong TSX) — liệt kê cho Task 3-6, KHÔNG sửa ở task này ngoài shared
- [ ] **Step 5:** Run `pnpm --filter @hubstore/shared test` (tên package grep từ package.json) + `pnpm build` — PASS rồi commit:
```bash
git add packages/shared/src/theme/ apps/*/src/main.tsx
git commit -m "feat(fi251): SF-6 theme tokens — direction B Modern SaaS Airy (LESS + CSS vars + overrides)"
```

### Task 2: StatusTag pastel + shared Skeleton/EmptyState

**Files:**
- Modify: `packages/shared/src/components/StatusTag/tokens.ts` (tone bg/line/text pastel từ `DESIGN_TOKENS.color.status`, thêm dot `::before` 5px — có thể qua style Tag children hoặc CSS trong overrides)
- Modify: `packages/shared/src/components/StatusTag/StatusTag.tsx` (pill radius, padding 3px 11px, font 12/500 — KHÔNG đổi props/mapping)
- Create: `packages/shared/src/components/Skeleton/Skeleton.tsx` + `index.ts` (StatStripSkeleton 5 khối radius 12 cao 64 + TableSkeleton 8 hàng shimmer bar — dùng `.sf6-shimmer`)
- Create: `packages/shared/src/components/EmptyState/EmptyState.tsx` + `index.ts` (icon hộp hàng +cam, title 14/600, sub 12.5, optional action ghost button — props: title, sub, action?)
- Test: chạy `StatusTag.test.tsx` KHÔNG SỬA — phải xanh (self-referential)

- [ ] **Step 1:** Đọc StatusTag tokens.ts hiện tại → đổi giá trị tone theo status mới; giữ nguyên tên tone + mapping kind→value
- [ ] **Step 2:** Reskin StatusTag visual (pill + dot) — `StatusTag.test.tsx` assert `toHaveStyle({backgroundColor})` vẫn pass vì derives từ tokens
- [ ] **Step 3:** Skeleton + EmptyState components (inline styles + DESIGN_TOKENS, convention codebase)
- [ ] **Step 4:** Commit:
```bash
git add packages/shared/src/components/
git commit -m "feat(fi251): StatusTag pastel pill + shared Skeleton/EmptyState components"
```

### Task 3: Shell refresh — AppLayout + Login

**Files:**
- Modify: `apps/shell/src/features/layout/AppLayout.tsx` (inline styles — header 60 trắng shadow.xs: logo 34×34 gradient + 2 dòng text; rail 64 #101828 nav 40×40 radius 12 icon 17, active gradient + `::after` indicator — inline style không có pseudo → dùng CSS class trong `sf6-antd-overrides.css` `.sf6-nav-item`/`.sf6-nav-item-active`; user chip avatar 28 gradient + 2 dòng; logout ghost icon). DOM/testid GIỮ NGUYÊN (`app-header`, `app-sidebar`, `nav-*`, `lang-toggle`, `logout-button`, `header-user`, `remote-mount`)
- Modify: `apps/shell/src/features/login/LoginPage.tsx` (§2.4: card trắng radius 20 shadow.lg nền #F7F8FA, logo gradient 40, input radius 10, nút gradient full-width h44, link quên mật khẩu cam 600; testid `login-*` giữ)
- Modify: `apps/shell/src/features/login/ForgotPasswordPage.tsx` (cùng tokens)
- Verify: `apps/shell/src/App.test.tsx` xanh KHÔNG SỬA

- [ ] **Step 1:** AppLayout header + rail theo §2.1 (hero-left/right thứ tự: lang-toggle pill, user chip, logout ghost)
- [ ] **Step 2:** Nav active gradient + indicator: thêm class `sf6-nav-item` + pseudo-element CSS vào `sf6-antd-overrides.css` (token-derived)
- [ ] **Step 3:** Login + Forgot polish §2.4
- [ ] **Step 4:** Run shell unit tests + commit:
```bash
git add apps/shell/src/ packages/shared/src/theme/sf6-antd-overrides.css
git commit -m "feat(fi251): shell refresh — header 60 rail 64 gradient nav + login polish"
```

### Task 4: D1 refresh — StatStrip + page reskin

**Files:**
- Create: `apps/orders/src/pages/StatStrip.tsx` (5 card: Chưa soạn accent cam `#FEF6EE`/border `#FDEADA`/value `statAccent` · Đang soạn · Đã soạn · Lỗi vượt trọng lượng · Tổng COD chờ giao (tabular-nums); props: `items` (trang hiện tại) + `total` + `isLoading`; skeleton 5 card khi loading; sub-label "theo trang hiện tại")
- Modify: `apps/orders/src/pages/D1Page.tsx` (page-head h1 21/700 + sub `total` đơn; nút "Làm mới" ghost = refetch; StatStrip trên FilterBar; table card radius 16 shadow.sm overflow hidden; bulk bar bg `#FEF6EE` border-bottom `#FDEADA` — testid `bulk-bar`/`bulk-create-batch`/`bulk-transfer` giữ; pagination footer `#FCFCFD` padding 14 18; row hover `#FAFBFC` .12s, selected `#FEF6EE`; `onRow` className cho selected + `.code` tabular-nums; empty → EmptyState; refetch (isFetching ≠ isLoading) → wrapper opacity .6 giữ data)
- Modify: `packages/shared/src/components/FilterBar/*` (reskin controls radius 8 border `#D0D5DD` height 36 focus ring — DOM/testid giữ)

- [ ] **Step 1:** StatStrip component (derive counts từ `items` theo status key hiện có của order — đọc type Order/fulfillment proto để map đúng status values)
- [ ] **Step 2:** D1Page page-head + StatStrip mount + table card reskin
- [ ] **Step 3:** FilterBar controls reskin
- [ ] **Step 4:** Skeleton/empty wiring (isLoading → TableSkeleton; empty → EmptyState "Không có đơn hàng nào" + nút "Xóa bộ lọc" gọi clear filter hiện có)
- [ ] **Step 5:** Commit:
```bash
git add apps/orders/src/pages/ packages/shared/src/components/FilterBar/
git commit -m "feat(fi251): D1 refresh — stat-strip + table card + filter reskin"
```

### Task 5: D1b wizard — sectioned stepper (NON-BLOCKING, Deviation D1)

**Files:**
- Modify: `apps/orders/src/batching/CreateBatchingModal.tsx` (stepper header 3 node §2.3: cur gradient shadow.primary / done bg `#FEF6EE` border `#FDEADA` chữ cam ✓ / upcoming trắng border line; 3 section dọc: §1 list+toolbar+group-chips (reskin item row grid `28px 36px 100px 1fr 90px 160px 110px 60px 110px`, stop number 26×26, nhóm gợi ý bg `#FFFAEB` + inset trái `#B54708`) · §2 shipper select h40 radius 10 + slot chips 2 dòng (chọn = gradient) + sumbar 4 ô (Số đơn/Sản phẩm/Quãng đường/Tổng COD — overline key + 16/700 value) · §3 review table `220px 1fr` + note-banner `#FEF6EE`. Footer: hint trái 12.5 + "Tiếp tục →" scroll-to-section + `batch-submit` GIỮ NGUYÊN. Toàn bộ testid/handler/DnD logic KHÔNG ĐỔI — chỉ wrapper + style)
- Modify: `apps/orders/src/batching/batching-modal.css` (modal 1240 radius 20 shadow.lg backdrop rgba(16,24,40,.55) blur 3px; header/body/footer §2.3; giữ class `.create-batching-modal` — E2E locator phụ thuộc)

- [ ] **Step 1:** Đọc kỹ CreateBatchingModal.tsx hiện tại — map control → section, liệt kê testid
- [ ] **Step 2:** Stepper header + section wrapper (state `activeSection` — set on scroll/click, KHÔNG ẩn content)
- [ ] **Step 3:** Reskin từng section + footer
- [ ] **Step 4:** batching-modal.css theo §2.3 (hex cứng cho phép ở file này — token-derived khi được)
- [ ] **Step 5:** Commit:
```bash
git add apps/orders/src/batching/
git commit -m "feat(fi251): D1b wizard — sectioned stepper + reskin (E2E-safe single-pane)"
```

### Task 6: D2/D3 tokens-derived reskin

**Files:**
- Modify: `apps/fulfillment/src/pages/BatchListPage.tsx` (page-head h1 tokens; table card pattern §2.2; EmptyState qua Table empty prop; buttons §2.5 tự động qua overrides)
- Modify: `apps/fulfillment/src/pages/PrintPage.tsx` (page-head tokens + tabs reskin tối thiểu — khung in KHÔNG đụng)

- [ ] **Step 1:** BatchListPage reskin (page-head + card + empty)
- [ ] **Step 2:** PrintPage page-head + tabs
- [ ] **Step 3:** Commit:
```bash
git add apps/fulfillment/src/
git commit -m "feat(fi251): D2/D3 tokens-derived reskin"
```

### Task 7: Verify — build + unit + E2E + Rule 0 browser 3 tầng

**Files:** chỉ sửa nếu verify phát hiện lỗi (fix → re-verify)

- [ ] **Step 1:** `pnpm build` + `pnpm test` toàn workspace — PASS
- [ ] **Step 2:** E2E: `pnpm --filter e2e test` (hoặc command thực tế trong e2e/package.json) — toàn bộ specs xanh KHÔNG sửa assertion
- [ ] **Step 3:** Rule 0 tầng 1 (DOM eval): header 60px, rail 64px, page bg rgb(247,248,250), button radius 8, body font 14, primary #EB6E09
- [ ] **Step 4:** Rule 0 tầng 2 (screenshot): login → D1 → wizard → D2, so prototype B side-by-side, liệt kê gap
- [ ] **Step 5:** Rule 0 tầng 3 (flow): login Keycloak thật → D1 → bulk-select 2+ đơn cùng kho → wizard DnD → suggest → shipper → slot → tạo phiếu → D2 thấy batch → logout
- [ ] **Step 6:** Fix gap (nếu có) → re-chụp → commit fix

## Self-review checklist (đã chạy)

- Spec coverage: tokens T1, StatusTag T2, skeleton/empty T2+T4+T6, shell/login T3, StatStrip T4, wizard T5, D2/D3 T6, verify T7 ✓
- Deviations D1-D5 ghi rõ ✓
- Type consistency: `DESIGN_TOKENS.radius.modal` (xóa `popup`) — T1 Step 4 grep consumer ✓
