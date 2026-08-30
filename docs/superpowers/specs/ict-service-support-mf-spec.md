# Epic Spec v2 — ICT Service Support: microservice + microfrontend (hub-store-order)

> **SUPERSEDES** `ict-service-support-rebuild-spec.md` (v1 — standalone Vite + msw). User pivot ngày 2026-08-31: backend microservice THẬT (full 18 endpoints) + microfrontend THẬT. v1 chỉ còn giá trị ở các decisions được kế thừa tường minh (§5).
> Source of truth nghiệp vụ: `/REQUIREMENTS.md` — acceptance §8b KHÔNG đổi.

## 1. IDEA-BRIEF

- **Task**: Init project greenfield theo kiến trúc microservice + microfrontend: backend NestJS implement đủ 18 API §5 (full handlers, in-memory store) + FE module federation (shell host + 2 remotes) với 5 screens D1/D1b/D1c/D2/D3.
- **Output**: Monorepo pnpm chạy được end-to-end: `pnpm dev` bật api + shell + remotes; luồng §8 chạy thật qua network (không msw).
- **Users**: Coordinator, Warehouse Ops, Manager — FPT internal.
- **Constraints**: Nghiệp vụ + acceptance §8b NGUYÊN VẸN; FE stack giữ React 18 + AntD 4.24 + RTK Query + RRD6 + i18next VI/EN + react-pdf + Vitest; backend TypeScript; desktop 1440px.
- **Success criteria**: Checklist §8b per-screen pass trên app chạy thật + 1-2 luồng E2E §8 cross-remotes pass.
- **Out-of-scope**: §10 REQUIREMENTS trừ 2 dòng bị pivot vô hiệu ("Backend API", mock-only). Vẫn KHÔNG: mobile, nhập tay, OTP, responsive, prod deploy/CI-CD, module khác (AreaStaff/D2C/Delivery Order).

## 2. Kiến trúc (chốt)

```
Monorepo pnpm workspaces + turbo:
services/
  fulfillment-api/    # NestJS 10 + TypeScript — 18 endpoints, in-memory repository
                      # + seed contract, JWT guard stub, CORS. DTO extend/re-export
                      # types từ packages/shared (KHÔNG tự define trùng shape — P0)
apps/
  shell/              # MF HOST: Vite + @module-federation/enhanced (theo spike verdict)
                      # AppLayout (sidebar 48px/header 55px), router, dynamic remote
                      # loading + fallback, OIDC stub + fake JWT + role switcher,
                      # i18next init, AntD ConfigProvider theme tokens §7, api-client init
  orders/             # REMOTE 1: D1 + D1c + D1b (cùng remote — giữ interface pin)
  fulfillment/        # REMOTE 2: D2 + D3
packages/
  shared/             # types §4 + enums + formatters (VND, formatPeriodOfTime D5/D13)
                      # + StatusTag + theme tokens §7 + i18n infra + FilterBar primitives
                      # + useUrlState + usePermissions (role matrix §2)
  api-client/         # RTK Query singleton (baseApi axios-like fetch, Bearer interceptor
                      # đọc token từ shell auth context), tag scheme Fulfillment/Batches/
                      # MasterData, các api slices consume bởi cả 2 remotes
```

**Quyết định lớn — FLAG cho user veto lúc bracket-approval (P0 từ impact analysis):**
- **Direction B: 3 FE apps** (shell + orders + fulfillment), KHÔNG tách D1b thành remote riêng — remote riêng cho 1 modal phá interface pin "D1 selection rows → CreateBatchingModal qua props" và là overhead MF xấu nhất. Tách sau nếu cần = refactor cục bộ.

**Federation contracts (P0):**
- Singleton shared: `react`, `react-dom`, `antd`, `@reduxjs/toolkit`, `react-redux`, `react-router-dom`, `i18next`, `react-i18next`, `packages/shared`, `packages/api-client`. (RRD singleton → shell owns BrowserRouter, `useNavigate` trong remote hoạt động; cross-remote nav = navigate route top-level.)
- **Exposes contract (pin ở SF-1, mọi SF theo):**
  | Remote | Exposed module | Route |
  |--------|---------------|-------|
  | orders | `orders/D1Page` | `/hub-store-order/order` |
  | fulfillment | `fulfillment/BatchListPage` | `/hub-store-order/batch` |
  | fulfillment | `fulfillment/PrintPage` | `/hub-store-order/batch/print` |
- Redux store PER-REMOTE (không share store qua MF); api-client singleton do shell init.
- **Cross-remote invalidation (chốt — thay cơ chế mơ hồ):** list queries dùng `refetchOnMount: 'always'` (mỗi remote mount riêng, mount region swap khi điều hướng) → không cần pub/sub. SF-7 verify: tạo phiếu ở orders → navigate sang fulfillment → D2 hiện phiếu mới.
- i18next: 1 instance init ở shell; namespace per remote (`orders.*`, `fulfillment.*`, `shell.*`).
- AntD ConfigProvider wrap ở shell AppLayout bao vùng mount remote — chỉ hiệu lực khi antd là singleton (đã liệt kê trên).
- Dynamic remote loading + fallback message khi remote chưa lên (không trắng trang).
- Danh sách remotes CHỐT CỨNG: 2 remotes. Thêm remote sau = scope change qua PM.

## 3. Backend contract (chốt)

- NestJS modules: `fulfillment` / `batches` / `print` / `master-data` / `order-promising` — đủ 18 endpoints §5 REQUIREMENTS **+ 1 endpoint bổ sung (FLAG scope addition chờ user veto): `GET /master-data/delivery-staff`** — phục vụ DeliveryStaffSelect ở D1b (trước đây msw seed đọc trực tiếp, giờ cần API). Không có nó = SF-5 blocked.
- **Nguồn PDF (chốt P0):** `POST /fulfillment/print` trả **PDF bytes (application/pdf)** — BE generate từ batch data bằng `pdf-lib` (5 template theo PrintType). FE react-pdf render blob. Do SF-2 (backend) own, SF-6 chỉ consume.
- **Thêm đơn / tạo phiếu rule (P1):** search thêm đơn chỉ trả đơn `batchStatus=0` (Chưa soạn) + cùng kho; `batches/create` REJECT đơn có batchStatus ≠ 0.
- **`POST /fulfillment/{code}/history`**: tên POST theo production nhưng semantics là ĐỌC lịch sử — không mutate. (flag để agent không implement nhầm)
- **Mutation contract** (kế thừa v1, giờ ở in-memory repository): tạo phiếu → đơn batchStatus=1 + sinh batchCode + stopOrder; hủy phiếu → đơn revert batchStatus=0; chuyển kho → đổi shopAssignment + append history; complete-picking → batch+đơn batchStatus=2; criteria gate: chỉ hủy phiếu chưa hoàn tất.
- **Seed contract** (kế thừa v1 nguyên vẹn): ≥25 đơn trải kho (**shop `30201` PHẢI có** — acceptance filter), đủ 4 batchStatus (status 3 "Lỗi vượt trọng lượng" seed đặt tay 1-2 đơn — không sinh tự nhiên) / 3 orderStatus / có `isDebtSplittingOrder`; delivery staff (cho endpoint delivery-staff); printers theo shopCode; regions hierarchical shape D6.
- DTO extend/re-export `packages/shared` types — single source of truth, chống drift (R6). **Carve-out (P0): SF-2 ĐƯỢC PHÉP thêm backend contract DTOs (filter request/response, packing-suggest groups, print payload, criteria...) vào packages/shared; rule FROZEN áp dụng cho SF-4..SF-7 (sau SF-2), không chặn SF-2.**
- Extension `excludeFulfillCodes` trên `POST /fulfillment/filter` (pin v1) nằm trong shared type ngay từ foundation.
- Auth: fake JWT (HS256, bí mật dev `JWT_DEV_SECRET` trong root `.env` — MỘT chỗ FE/BE cùng đọc; **dev-only stub, KHÔNG phải secret thật, không bao giờ dùng prod**) — guard verify signature + decode role claim; mapping role → permission codes là FE-only (`usePermissions` shared). Production: đổi env sang OIDC thật, không đổi code.
- `GET /fulfillment/{fulfillCode}`: **BỎ waiver D12** — giờ có backend thật, implement endpoint (FE có thể chưa dùng — nhưng endpoint đầy đủ theo §5).
- `PUT /fulfillment/{code}/note`: giữ out-of-scope (không có screen spec) — D3 v1 giữ nguyên.
- Port map dev: api 8080, shell 3000, orders 3001, fulfillment 3002. Root script `pnpm dev` (turbo) orchestrate.

## 4. Quyết định kế thừa từ v1 (đúng nguyên vẹn)

| # | Decision | Ghi chú |
|---|----------|---------|
| D2 | COD format VI `15.000.000đ` / EN `15,000,000 ₫` | |
| D4 | `GET /order-promising/time-delivery` → hint TG giao cạnh DatePicker ở D1b | |
| D5+D13 | `formatPeriodOfTime` `HH:mm DD/MM/YYYY – …` locale-neutral số, đổi nhãn | |
| D6 | regions shape `{ code, name, type, parentCode? }` | |
| D7 | Spike DnD: react-sortable-hoc trước, gãy → dnd-kit (flag deviation) | |
| D9 | AntD4 + StrictMode: lỗi → tắt StrictMode + known-limitations | |
| D10 | DnD keyboard a11y: known-limitations | |
| D11 | "Hoàn tất soạn" ở D2, mutation 1→2 | |
| D1 | Auth stub + role switcher + OIDC env vars | Token giờ chảy tới backend guard (§3) |
| BỎ D12 | Waive detail endpoint | Đã implement (§3 trên) |

## 5. SF Split (rubric C1-C5/V1-V3 — Direction B)

**Anti-duplicate:** mọi pattern lặp ≥2 SF dồn SF-1 (T0): StatusTag, formatters, useUrlState, FilterBar primitives, i18n infra, api-client + tag scheme, federation scaffold, spike verdicts. DnD chỉ ở SF-5; PDF chỉ ở SF-6. Tasks "walkthrough + gate" là Zweck từng SF. **packages/shared FROZEN sau SF-2** (SF-2 được thêm backend DTOs — carve-out §3); từ SF-4 trở đi cần thêm gì → request PM (R9). Backend tests độc lập với FE (supertest) — rule v1 "revert test không đụng filter handler" không còn cần vì BE tự verify mutation.

### SF-1 Foundation + Spikes (Tier 0, ~15 tasks)
Monorepo scaffold (pnpm + turbo + tsconfig.base + pin versions) · packages/shared (types §4, enums, formatters, StatusTag, tokens §7 theme, i18n infra + namespaces convention, FilterBar primitives, useUrlState, usePermissions role matrix §2) · packages/api-client (singleton, Bearer interceptor, tag scheme, slices skeleton) · **SPIKE 1: MF Vite × AntD4 singleton — dev + build + publicPath (verdict docs/superpowers/spikes/, fallback webpack MF)** · SPIKE 2: react-pdf trong remote · SPIKE 3: DnD React 18 · federation scaffold theo spike verdict (shell skeleton + 2 remote skeletons chỉ đủ remoteEntry load) · fake JWT util dùng chung FE/backend · KHÔNG chứa screen business logic.

### SF-2 Backend fulfillment-api (Tier 1, dep SF-1, ~14 tasks)
NestJS bootstrap + module structure · in-memory repository + seed contract §3 · group endpoint fulfillment (filter+excludeFulfillCodes, detail, complete-picking, assign-shop-hub, history, delivery-time) · group batches (packing-suggest, create, filter, detail, cancel, criteria, recalculate-distance) · print (printers, print) · master-data (regions + **delivery-staff** — endpoint §3) · order-promising time-delivery · JWT guard + CORS port map · mutation contract tests (Vitest + supertest, verify ĐỘC LẬP với FE) · validation/error shape thống nhất · README run.

### SF-3 Shell app (Tier 1, dep SF-1, ~10 tasks)
Vite MF host theo spike verdict · AppLayout (sidebar 48px, header 55px, tokens §7) · router + dynamic remote loading + fallback UI · auth stub: login giả lập + fake JWT + role switcher (Coordinator/Ops/Manager) + OIDC env config · api-client init + token inject · i18next init + namespace wiring + VI/EN toggle · AntD ConfigProvider wrap mount region · route gating theo role matrix §2 · 404 · smoke test shell load 2 remote skeletons.

### SF-4 Orders remote — D1 + D1c (Tier 2, dep SF-1, SF-2, SF-3, ~14 tasks)
Remote scaffold + exposes + namespace i18n · RTK Query slices consume fulfillment API · 8 filters + URL state · bảng 8 cột (fixed-left link copy, StatusTag, shop name+address, **batchCode link → navigate `/hub-store-order/batch`** — cross-remote nav qua RRD singleton, REQUIREMENTS §3 D1 cột "Link → D2") · expandable items[] · selection + BulkActionBar (enable/disable cùng kho + hint) · pagination "Tổng N mã" · edit deliveryTime (rule §9: chỉ khi chưa có phiếu) · HubStoreTransferModal (disable isDebtSplittingOrder) + hiển thị history · i18n keys orders.* · unit tests (mock api-client) · acceptance §8b D1 walkthrough.

### SF-5 Orders remote — D1b CreateBatchingModal (Tier 3, dep SF-4, ~11 tasks)
Modal 1310×918 + bảng đơn đã chọn (rows qua props từ D1 selection — interface pin) · DnD sortable → stopOrder (spike verdict SF-1) · packing suggest (handler + UI) · recalculate-distance · thêm đơn search cùng kho (filter + excludeFulfillCodes) · DeliveryStaffSelect (seed staff) · DatePicker + time-delivery hint (D4) · batches/create mutation · success flow (đóng + same-remote tag invalidation; cross-remote thấy phiếu nhờ `refetchOnMount: 'always'` §2) · i18n keys · tests + acceptance §8b D1b walkthrough.
- Tier-gate: gate SF-5 test mutation qua API thật (phiếu sinh, đơn đổi status) — KHÔNG test "phiếu hiện ở D2" (cross-SF → SF-7).

### SF-6 Fulfillment remote — D2 + D3 (Tier 2, dep SF-1, SF-2, SF-3, ~15 tasks)
Remote scaffold + exposes + namespace fulfillment · RTK Query slices batches API · D2: 3 filters + URL state, bảng 8 cột (COD VND D2), expand detail, hủy phiếu (confirm + reason, criteria-gated, revert), "Hoàn tất soạn" (D11), nút In → navigate `/hub-store-order/batch/print?batchCode=<code>` (param pin — PrintPage đọc) · D3: route + 5 tabs, react-pdf theo spike (preview + zoom slider — PDF bytes từ BE, §3), printers select (API), POST print + feedback, "In tất cả" · i18n keys fulfillment.* · unit tests · acceptance §8b D2 + D3 walkthrough. **(SF nặng nhất — nếu Phase 3 detail >15 tasks → tách D3 print thành SF riêng, báo PM.)**

### SF-7 Convergence + QA (Tier 4, dep SF-4, SF-5, SF-6, ~10 tasks)
E2E Playwright 1-2 luồng §8 chính cross-remotes (đơn → tạo phiếu ở orders → thấy ở fulfillment → hủy → revert → in → hoàn tất; boot qua Playwright webServer config chạy `pnpm dev` turbo — KHÔNG boot tay 4 process) · cross-remote invalidation verify (theo cơ chế `refetchOnMount: 'always'` §2) · role matrix verify 3 roles §2 · i18n completeness audit (VI/EN, checklist trong Linear comment) · COD/format audit · build all + docker-compose cấu hình mẫu (api + nginx static shell/remotes, publicPath prod theo spike; turbo cache TẮT cho build federation — remoteEntry stale) · README full · full §8b regression walkthrough · final gate + STORY-CLOSE verify.

### DAG
```
SF-1 (T0) ──┬─→ SF-2 (T1) ──┐
            └─→ SF-3 (T1) ──┼─→ SF-4 (T2) ──→ SF-5 (T3) ──┬─→ SF-7 (T4)
                            └─→ SF-6 (T2) ────────────────┘
```
Parallelization: sau SF-1 → SF-2 ∥ SF-3 chạy song song; sau đó SF-4 ∥ SF-6; SF-5 sau SF-4; SF-7 cuối.

## 6. Spike-first rule (P0 — R1/R2/R3)
KHÔNG SF UI nào start trước khi SF-1 có verdict 3 spike trong `docs/superpowers/spikes/`. Spike fail → fallback đã định (webpack MF / dnd-kit) — deviation flag tường minh trong Linear comment + spec note.

## 7. ACCEPTANCE
Nguồn §8b REQUIREMENTS.md, không đổi. Verifier mỗi SF kiểm đúng dòng ACCEPTANCE trong context pack của SF (browser walkthrough Rule 0, 3 tầng nhận thức). SF-7 kiểm full §8b + E2E cross-remote.

## 8. Boundary chung
- KHÔNG responsive mobile; KHÔNG nhập tay; KHÔNG prod deploy/CI-CD (chỉ cấu hình mẫu); KHÔNG module khác; KHÔNG weight check/reporting/dashboard.
- packages/shared read-only sau SF-1. Root deps versions pin — agents không bump.
- Dev không tự mở scope; chi tiết chưa ghi → quyết theo conventions + flag trong notes; REQUIREMENT-GAP comment lên epic nếu chặn.
