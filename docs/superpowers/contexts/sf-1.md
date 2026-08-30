# SF-1 Context Pack — Foundation + Spikes (microservice + microfrontend)

> Đọc file này THAY VÌ tự tổng hợp. Spec: docs/superpowers/specs/ict-service-support-mf-spec.md (v2 — MF pivot) · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Tier 0 — mọi SF khác fork từ output. SAFETY > TỐC ĐỘ; contracts + spike verdicts là sản phẩm chính.

## Spec slice (SF-1 chịu trách nhiệm)

1. **Monorepo scaffold**: pnpm workspaces + turbo; `services/fulfillment-api`, `apps/{shell,orders,fulfillment}`, `packages/{shared,api-client}`; tsconfig.base; **pin versions mọi root deps** (agents sau không bump); port map dev: api 8080, shell 3000, orders 3001, fulfillment 3002; root script `pnpm dev` (turbo orchestrate).
2. **packages/shared**: types §4 REQUIREMENTS (HubStoreOrderFilterItem, BatchingItem) + enums (BatchStatus 0-3, OrderStatus 0-2, CoordinationStatus, PrintType union bill|delivery|handover_receipt|goods_handover|installation_acceptance) · formatters: VND (VI `15.000.000đ` / EN `15,000,000 ₫`), `formatPeriodOfTime` (`HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY` locale-neutral, D5/D13) · StatusTag (màu tokens: success/error/warning/info) · theme tokens §7 → AntD 4.24 ConfigProvider preset (primary #EB6E09, radius 2px/8px, Roboto, typo scale) · i18n infra (i18next, namespaces convention `shell.*` / `orders.*` / `fulfillment.*` + `common.*`) · FilterBar primitives (TextSearch, MultiSelect, DateRange, DateTimeRange; grid 2×4 + Reset/Search slot) · `useUrlState` (filter ↔ URL query, serialize array) · `usePermissions` role matrix §2 (Coordinator `Coordinate_Fulfillment_List|Shop` → D1+D2+Print; WarehouseOps `WarehouseOps_CN_PickingList_View|Batch_Create|PickingList_Print` → D2+Print; Manager `ServiceOrder_List|Update` → tất cả).
3. **packages/api-client**: RTK Query singleton — baseApi (fetch/axios, Bearer interceptor đọc token từ auth context shell init), **tag scheme `Fulfillment` / `Batches` / `MasterData`**, slices skeleton (fulfillment/batches/print/master-data/order-promising — endpoints rỗng, SF sau điền).
4. **SPIKE 1 — MF Vite × AntD4 singleton** (P0, verdict `docs/superpowers/spikes/mf-vite-antd4.md`): @module-federation/enhanced với Vite — dev + build + publicPath; singleton `react, react-dom, antd, @reduxjs/toolkit, react-redux, react-router-dom, i18next, react-i18next` shared đúng (2 instance AntD = theme gãy); **fallback nếu gãy: webpack MF** — flag deviation tường minh.
5. **SPIKE 2 — react-pdf trong remote** (`docs/superpowers/spikes/react-pdf-remote.md`): pdfjs worker trong Vite remote bundle (`?url`, optimizeDeps), render 1 PDF tĩnh.
6. **SPIKE 3 — DnD × React 18** (`docs/superpowers/spikes/dnd-react18.md`): react-sortable-hoc + array-move (findDOMNode/StrictMode) → gãy thì verdict = dnd-kit (deviation flag, D7).
7. **Federation scaffold theo SPIKE 1 verdict** (KHÔNG chứa business logic):
   - **Exposes contract PIN (bảng này là hợp đồng — SF-3/4/6 phải theo đúng tên):**
     | Remote | Exposed module | Route |
     |--------|---------------|-------|
     | orders | `orders/D1Page` | `/hub-store-order/order` |
     | fulfillment | `fulfillment/BatchListPage` | `/hub-store-order/batch` |
     | fulfillment | `fulfillment/PrintPage` | `/hub-store-order/batch/print` |
   - shell skeleton đủ dynamic-load 2 remotes; remotes skeleton đủ expose remoteEntry; remotes chưa lên → fallback message (không trắng trang).
8. **fake JWT util dùng chung**: HS256 sign/decode, bí mật `JWT_DEV_SECRET` đọc từ root `.env` (MỘT chỗ — FE stub và BE guard cùng đọc; **dev-only, không phải secret thật**). Payload: `{ sub, role }`.

## Touch map (SF-1 sở hữu — SF khác READ-ONLY)

**Staging nội bộ (waves ≤4 — tránh cap-4):** Wave A: monorepo-scaffold → Wave B: shared packages (types → formatters → theme/i18n → filterbar/usepermissions) ∥ 3 spikes → Wave C: api-client + exposes-pin (cần spike 1 verdict) → Wave D: federation scaffold shell + remotes (theo verdict) + fake-jwt-util.

```
package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .env (JWT_DEV_SECRET)
packages/shared/**          (types, enums, formatters, StatusTag, theme, i18n infra, FilterBar, useUrlState, usePermissions)
packages/api-client/**      (baseApi, tag scheme, slices skeleton)
apps/shell/**               (CHỈ skeleton: entry + federation config + placeholder layout — AppLayout thật là SF-3)
apps/orders/** apps/fulfillment/**   (CHỈ skeleton: entry + federation exposes + placeholder page modules đúng tên exposes contract)
docs/superpowers/spikes/{mf-vite-antd4,react-pdf-remote,dnd-react18}.md
```

## ACCEPTANCE (user-visible)

- `pnpm dev` từ root: shell 3000 + 2 remotes (3001/3002) lên; shell load được 2 remote skeletons vào mount region (thấy placeholder từng remote).
- Remote chưa chạy → fallback message, không trắng trang.
- Đổi ngôn ngữ VI↔EN chạy ở shell (i18n infra); theme FPT orange #EB6E09 hiện.
- 3 spike files tồn tại, mỗi file có VERDICT rõ (go / fallback + lý do + config snippet).
- `pnpm test` smoke xanh (shared formatters/StatusTag/usePermissions unit tests).

## Boundary (KHÔNG làm)

- KHÔNG screen business logic nào (D1/D1b/D2/D3 — SF-4/5/6); KHÔNG backend NestJS thật (SF-2, chỉ fake JWT util dùng chung).
- KHÔNG AppLayout hoàn chỉnh/role switcher UI (SF-3 — bạn chỉ để skeleton + tokens).
- KHÔNG sửa exposes contract table — đổi tên = toàn DAG gãy; cần đổi → REQUIREMENT-GAP lên epic.
- KHÔNG tự chọn fallback (webpack MF/dnd-kit) nếu spike chưa chạy — verdict phải dựa trên thử thật.
