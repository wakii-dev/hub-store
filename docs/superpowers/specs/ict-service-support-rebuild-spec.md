# Epic Spec — ICT Service Support: Đơn hàng kho chi nhánh (hub-store-order rebuild)

> **⚠️ SUPERSEDED 2026-08-31** — bởi `ict-service-support-mf-spec.md` (pivot kiến trúc: microservice backend thật + microfrontend). Spec này KHÔNG còn là spec thực thi; chỉ tham khảo decisions D1-D13 được kế thừa (bảng trong spec v2 §4).

> Source of truth: `/REQUIREMENTS.md` (viết lại từ production code ict-service-support-web).
> Spec này bổ sung quyết định kiến trúc + phân rã SF. Acceptance criteria = §8b REQUIREMENTS.md (không đổi).

## 1. IDEA-BRIEF

- **Task**: Rebuild module `hub-store-order` thành standalone web app: D1 danh sách đơn (8 filters, bulk actions) + D1b CreateBatchingModal (DnD sortable, packing suggest, gán shipper) + D1c HubStoreTransferModal + D2 danh sách phiếu soạn (hủy phiếu) + D3 Print Shipment (5 tab PDF).
- **Output**: React 18 + AntD4 + RTK Query + Vite + msw + Vitest. Desktop 1440px fixed.
- **Users**: Coordinator, Warehouse Ops (kho CN), Manager — FPT internal, auth SSO.
- **Constraints**: Cùng production stack (§6 REBUILD table); AntD4 KHÔNG Tailwind; đơn KHÔNG nhập tay; scope chỉ hub-store-order.
- **Success criteria**: Checklist §8b per-screen pass + luồng E2E §8 chạy được trên mock.
- **Out-of-scope**: §10 KHÔNG (mobile, nhập tay, OTP, responsive, backend thật, note UI...).

## 2. Kiến trúc (chốt)

```
React 18 + TypeScript + Vite
AntD 4.24.x + styled-components (theme từ tokens §7)
Redux Toolkit + RTK Query (baseApi axios custom, Bearer token, tag scheme: Fulfillment / Batches / MasterData)
React Router 6: /hub-store-order/order | /hub-store-order/batch | /hub-store-order/batch/print
i18next VI/EN (VI ngôn ngữ gốc)
msw: mocks/db.ts in-memory store SINGLE SOURCE OF TRUTH cho D1/D1b/D2/D3 — mọi handler mutate db.ts
Vitest + React Testing Library (node env + msw)
react-pdf + pdfjs-dist (print), react-sortable-hoc + array-move (DnD — theo spec production)
```

**Mock data consistency contract (P0):**
- `mocks/db.ts` là store duy nhất; seed fixtures: đơn nhiều kho, đơn chia nợ (`isDebtSplittingOrder`), đơn đủ 3 batchStatus + 3 orderStatus, phiếu đủ trạng thái.
- Mutation bắt buộc trong handlers: tạo phiếu → đơn đổi batchStatus=1 (Đang soạn) + sinh batchCode + gán stopOrder; hủy phiếu → đơn revert batchStatus=0 (Chưa soạn); chuyển kho → db đổi shopAssignment + append history record; hoàn tất soạn (`PUT /fulfillment/complete-picking`) → phiếu + đơn đổi batchStatus=2 (Đã soạn).
- `GET /fulfillment/batches/criteria` trả config trạng thái cho phép hủy (chưa hoàn tất).
- **Seed contract (P0 — toàn bộ chốt ở SF-1, SF khác KHÔNG tự thêm vào db.ts):**
  - ≥ 25+ đơn trải nhiều kho / 3 batchStatus / 3 orderStatus / có `isDebtSplittingOrder=true` (đủ cho pagination "Tổng N mã")
  - phiếu soạn đủ trạng thái; delivery staff (cho DeliveryStaffSelect — SF-4); printers theo shopCode (SF-5); regions tỉnh/phường hierarchical (SF-2, shape D6)
  - PDF fixtures 5 loại phiếu: SF-5 tự giữ fixture LOCAL trong `src/pages/print/` (KHÔNG đụng db.ts — touch map)
- **Interface pin D1-selection → D1b modal (P0):** D1 giữ selection là full rows trong RTK state; CreateBatchingModal nhận rows qua props (không re-fetch). "Thêm đơn" reuse `POST /fulfillment/filter` với `shopCode` + `excludeFulfillCodes` — contract mở rộng này của handler filter (SF-2 own, SF-4 consume).

## 3. Quyết định cho các gap chưa spec (FLAG — lớn, user có thể veto khi approve)

| # | Gap | Quyết định |
|---|-----|-----------|
| D1 | OIDC SSO chưa có server | AuthProvider stub + fake JWT + role switcher (dev toolbar chọn Coordinator/Ops/Manager); OIDC config qua env vars (`VITE_OIDC_AUTHORITY`...) — production chỉ đổi env |
| D2 | COD format EN | VI: `15.000.000đ`; EN: `15,000,000 ₫` |
| D3 | `PUT /fulfillment/{code}/note` | Out of scope (không có screen spec §3) |
| D4 | `GET /order-promising/time-delivery` | Dùng trong D1b — gợi ý TG giao cạnh DatePicker |
| D5 | `formatPeriodOfTime` | Hiển thị `HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY` (VI locale) |
| D6 | `GET /master-data/regions` shape | `{ code, name, type: 'province'|'ward', parentCode? }` — filter Địa chỉ chọn tỉnh rồi phường |
| D7 | DnD lib deprecated trên React 18 | Spike ở SF-1: react-sortable-hoc thử trước; nếu gãy → dnd-kit (deviation có chủ đích, MUST flag) |
| D8 | react-pdf × Vite | Spike ở SF-1 (worker `?url`, optimizeDeps) — SF-5 chỉ implement theo verdict |
| D9 | AntD4 + React 18 StrictMode | Nếu warning/lỗi → tắt StrictMode, ghi known-limitations |
| D10 | a11y DnD keyboard | Gap đã biết của lib cũ — ghi known-limitations, không fix |
| D11 | `PUT /fulfillment/complete-picking` | Nút "Hoàn tất soạn" ở D2 (batch-level action, §8 bước 6) — own bởi SF-3; mutation batchStatus 1→2 trong db contract |
| D12 | `GET /fulfillment/{fulfillCode}` detail D1 | Waive tường minh — UI dùng `items[]` từ filter response, không gọi detail riêng |
| D13 | `formatPeriodOfTime` EN | Giữ format số `HH:mm DD/MM/YYYY – ...` (locale-neutral), chỉ đổi nhãn |

## 4. SF Split (rubric C1-C5/V1-V3 — không duplicate pattern)

**Shared-work nguyên tắc:** mọi pattern lặp ≥2 SF đã dồn SF-1 (tier 0): StatusTag, VND/datetime formatters, useUrlState hook, FilterBar primitives, msw infra + db contract, tag scheme RTK Query, i18n infra. Tasks "walkthrough + gate" là Zweck của từng SF (không tính duplicate).

### SF-1 Foundation (Tier 0, ~14 tasks)
Vite+TS+Vitest scaffold · AntD4 theme tokens §7 · Router + AppLayout (sidebar 48px, header 55px) · i18n infra VI/EN · axios baseApi + Bearer + RTK Query store + tag scheme · msw infra · **mocks/db.ts + seed fixtures + mutation contract** · shared types (§4 + enums) · StatusTag · formatters (VND, formatPeriodOfTime) · useUrlState hook · FilterBar primitives · auth stub (AuthProvider + usePermissions + role codes) · **spikes: DnD×React18 + react-pdf×Vite → docs/superpowers/spikes/**
- Spike DnD + react-pdf ở đây để khử P0 risk trước mọi SF UI.

### SF-2 D1 Danh sách đơn + D1c Chuyển kho (Tier 1, dep SF-1, ~13 tasks)
8 filters + URL state · handler POST /fulfillment/filter · bảng 8 cột (fixed-left, link copy, StatusTag, shop name+address) · expandable items[] · selection + BulkActionBar (enable/disable cùng kho + hint) · pagination "Tổng N mã" · edit deliveryTime (rule §9: chỉ khi chưa có phiếu) · handlers assign-shop-hub + history · HubStoreTransferModal (disable isDebtSplittingOrder) · hiển thị history · i18n keys · unit tests · acceptance §8b D1 walkthrough

### SF-3 D2 Danh sách phiếu soạn (Tier 1, dep SF-1, ~11 tasks)
Handlers batches filter/detail/criteria + complete-picking · 3 filters + URL state · bảng 8 cột (COD VND) · expand detail · hủy phiếu (confirm + reason, criteria-gated, mutation revert) · nút "Hoàn tất soạn" (D11) · nút In + navigation sang print (route `?batchCode=` — SF-5 consume) · test revert consistency (assert db state + batches API của SF-3, KHÔNG đụng filter handler của SF-2 — cross-screen để SF-6) · i18n keys · unit tests · acceptance §8b D2 walkthrough

### SF-4 D1b CreateBatchingModal (Tier 2, dep SF-2+SF-3, ~11 tasks)
Modal 1310×918 + bảng đơn đã chọn (rows qua props từ D1 selection — interface pinned §2) · DnD sortable → stopOrder (theo spike verdict SF-1) · packing suggest (handler + UI) · recalculate-distance · thêm đơn search cùng kho (reuse filter handler + excludeFulfillCodes) · DeliveryStaffSelect (mock staff từ seed SF-1) · DatePicker + time-delivery hint · handler batches/create (mutation) · success flow (đóng, refresh) · i18n keys · tests + acceptance §8b D1b walkthrough
- **Tier-gate**: gate SF-4 test mutation qua handler (phiếu sinh, đơn đổi status) — KHÔNG test "phiếu hiện ở D2" (cross-SF → SF-6).

### SF-5 D3 Print Shipment (Tier 2, dep SF-1+SF-3, ~10 tasks)
Print route + 5 tabs · react-pdf theo spike · mock PDF data 5 loại phiếu · preview + zoom slider · printers handler + select · POST print + feedback · "In tất cả" · i18n keys · tests · acceptance §8b D3 walkthrough

### SF-6 Convergence + QA (Tier 3, dep SF-1..5, ~9 tasks)
usePermissions thật (3 roles §2, route gating) · auth flow E2E mock · **luồng E2E §8 đầy đủ: đơn → tạo phiếu → D2 → hủy → revert → tạo lại → in → hoàn tất soạn (§8 bước 6)** · i18n completeness audit (output: checklist pass/fail trong Linear comment) · URL state cross-screen (output: checklist) · COD/format audit VI-EN · vite build pass + Docker/nginx SPA fallback **cấu hình mẫu** (không phải deliverable deploy — §10) · full §8b regression · README + final gate

### DAG
```
SF-1 (T0) ──┬─→ SF-2 (T1) ──┬─→ SF-4 (T2) ──┬─→ SF-6 (T3, deps SF-4+SF-5)
            └─→ SF-3 (T1) ──┴─→ SF-5 (T2) ──┘
```

## 5. ACCEPTANCE (user-visible — từng SF chi tiết trong context packs)

Nguồn: §8b REQUIREMENTS.md. Verifier Phase 5 của mỗi SF kiểm **đúng các dòng ACCEPTANCE trong context pack của SF đó**, bằng browser walkthrough (Rule 0, 3 tầng nhận thức), không chỉ process-pass.

## 6. Boundary chung

- KHÔNG responsive mobile; KHÔNG nhập đơn tay; KHÔNG backend thật; KHÔNG module khác (AreaStaff, D2C, Delivery Order); KHÔNG weight check, reporting, dashboard.
- Dev không tự mở scope; chi tiết chưa ghi → quyết định theo conventions + flag trong notes/REQUIREMENT-GAP nếu chặn.
