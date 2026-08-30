# SF-1 Context Pack — FE Foundation + Spikes (polyglot gRPC + MF)
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 0 — mọi SF khác fork từ output. SAFETY > TỐC ĐỘ: contracts + spike verdicts là sản phẩm chính.

## Spec slice (SF-1 chịu trách nhiệm)
1. **Monorepo scaffold**: pnpm workspaces + turbo; `services/{bff-gateway,fulfillment-service,batching-service,print-service}`, `apps/{shell,orders,fulfillment}`, `packages/{shared,api-client}`, `api/{proto,seed}` (dir placeholders); tsconfig.base; **pin versions mọi root deps**; root `.env` chứa `JWT_DEV_SECRET`; port map dev: bff 8080, shell 3000, orders 3001, fulfillment 3002, gRPC 50051/50052/50053. Turbo CHỈ orchestrate JS/TS — KHÔNG thêm Java/Go/Python vào turbo pipeline.
2. **packages/shared**: types §4 REQUIREMENTS (HubStoreOrderFilterItem, BatchingItem, Product) + enums (BatchStatus 0-3, OrderStatus 0-2, CoordinationStatus 0-2, BatchStatus-phiếu 0 ACTIVE|1 COMPLETED|2 CANCELLED, PrintType union `bill|delivery|handover_receipt|goods_handover|installation_acceptance`) · formatters: VND (VI `15.000.000đ` / EN `15,000,000 ₫`), `formatPeriodOfTime` (`HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY` locale-neutral số) · StatusTag (success/error/warning/info tokens) · theme §7 → AntD 4.24 ConfigProvider preset (primary #EB6E09, radius 2px/8px, Roboto, typo scale) · i18n infra (1 instance, namespaces `shell.*`/`orders.*`/`fulfillment.*` + `common.*`) · FilterBar primitives (TextSearch, MultiSelect, DateRange, DateTimeRange; grid 2×4 + Reset/Search) · `useUrlState` (filter ↔ URL query, serialize array) · `usePermissions` role matrix §2 (Coordinator=`Coordinate_Fulfillment_List|Shop` → D1+D2+Print; WarehouseOps=`WarehouseOps_CN_PickingList_View|Batch_Create|PickingList_Print` → D2+Print; Manager=all).
3. **packages/api-client**: RTK Query singleton + **axiosBaseQuery** (chốt axios) + `setTokenGetter(fn)` registration (shell đăng ký lúc init — KHÔNG truyền token qua React context cross-MF) + tag scheme `Fulfillment`/`Batches`/`MasterData` + **default list-query `refetchOnMount: 'always'`** (cơ chế cross-remote invalidation — mọi remote inherit) + slices skeleton.
4. **SPIKE 1** (`docs/superpowers/spikes/mf-vite-antd4.md`): MF Vite × AntD4 singleton — plugin candidates `@originjs/vite-plugin-federation` vs `@module-federation/vite` (spike quyết); verify dev + `vite build` + publicPath prod + antd KHÔNG duplicate. Fallback gãy: webpack MF (deviation flag).
5. **SPIKE 2** (`docs/superpowers/spikes/react-pdf-remote.md`): react-pdf + pdfjs worker trong remote (worker `?url`, optimizeDeps), render 1 PDF tĩnh.
6. **SPIKE 3** (`docs/superpowers/spikes/dnd-react18.md`): react-sortable-hoc + array-move trên React 18; gãy → dnd-kit (deviation flag, D7).
7. **Federation scaffold THEO SPIKE 1 VERDICT** — **SPIKES CHẠY TRƯỚC scaffold** (thứ tự bắt buộc trong SF):
   - Exposes contract PIN: orders=`orders/D1Page`→`/hub-store-order/order`; fulfillment=`fulfillment/BatchListPage`→`/hub-store-order/batch`, `fulfillment/PrintPage`→`/hub-store-order/batch/print`.
   - Singleton shared: `react, react-dom, antd, @reduxjs/toolkit, react-redux, react-router-dom, i18next, react-i18next` + packages/shared + api-client. RRD singleton → shell owns BrowserRouter.
   - Shell skeleton + 2 remote skeletons đủ remoteEntry load + fallback message khi remote chưa lên.
   - `remotes.config.json` **PRE-SEED cả 2 remote entries dạng skeleton** (SF-7/SF-9 chỉ điền giá trị entry của mình — tránh merge conflict).
8. **fake JWT util dùng chung**: `jose` (Web Crypto async — KHÔNG jwt-simple sync), HS256, `JWT_DEV_SECRET` từ root `.env` (dev-only stub). Payload `{ sub, role }`.
9. Spike verdict format: checklist dev-pass / build-pass / publicPath-prod-pass / singleton-no-duplicate-bundle + plugin/lib chọn + config snippet.

## Touch map (SF-1 sở hữu — SF khác READ-ONLY)
```
package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json, .env (JWT_DEV_SECRET)
packages/shared/**          (SAU SF NÀY FROZEN — trừ api-contracts/ do SF-2 thêm)
packages/api-client/**
apps/shell/**               (CHỈ skeleton — SF-6 sở hữu phần thân)
apps/orders/**              (CHỈ skeleton — SF-7/SF-8 sở hữu phần thân)
apps/fulfillment/**         (CHỈ skeleton — SF-9/SF-10 sở hữu phần thân)
remotes.config.json         (pre-seed skeleton)
docs/superpowers/spikes/{mf-vite-antd4,react-pdf-remote,dnd-react18}.md
```
KHÔNG đụng: `services/**` (SF-2..5), `api/**` (SF-2).

## ACCEPTANCE (user-visible)
- `pnpm install && pnpm build` pass sạch trên monorepo.
- `pnpm dev` root: shell :3000 + 2 remotes (:3001/:3002) lên; shell load 2 remote skeletons vào mount region (placeholder thấy trên browser); remote chưa chạy → fallback message, không trắng trang.
- VI↔EN toggle chạy ở shell; theme FPT orange #EB6E09 hiện.
- 3 spike files tồn tại, mỗi file VERDICT rõ (go/fallback + lý do + config) theo 4-item checklist.
- `pnpm test` smoke xanh (formatters/StatusTag/usePermissions unit tests).

## Boundary (KHÔNG làm)
- KHÔNG screen business logic (SF-6..10); KHÔNG backend/proto/seed thật (SF-2 — chỉ fake JWT util).
- KHÔNG AppLayout hoàn chỉnh/role switcher UI (SF-6 — chỉ skeleton + tokens).
- KHÔNG sửa exposes contract table — đổi tên = toàn DAG gãy → REQUIREMENT-GAP lên epic FI-233.
- KHÔNG tự chọn fallback nếu spike chưa chạy — verdict dựa trên thử thật.
- KHÔNG đụng services/** hoặc api/** (SF-2).
