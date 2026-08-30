# SF-1 Plan — FE Foundation + Spikes (FI-234)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3, §SF-1) · Context pack: docs/superpowers/contexts/sf-1.md · Epic: FI-233
> Worktree: sf-1-fe-foundation-spikes (fork/merge qua story/fi233-polyglot-grpc-mf — KHÔNG đụng main)
> Thứ tự bắt buộc: SPIKES chạy TRƯỚC federation scaffold (verdict 1-3 gate skeleton). Monorepo scaffold độc lập spike → chạy song song.
> Spike sandbox: /tmp/sf1-spikes/ (không commit — chỉ verdict docs vào repo).

## Meta (không checkbox)
- Roll­ing review: code-reviewer ĐỘC LẬP trên diff theo nhóm (spikes / packages / federation) trước merge.
- Verifier kiểm TỪNG dòng ACCEPTANCE context pack + browser verify 3 tầng (DOM → visual #EB6E09/Roboto/sidebar 48px/header 55px → flow boot+navigate).
- Merge: no-ff vào story/fi233-polyglot-grpc-mf (update-ref FULL refname + ancestor-guard), audit comment merge-hash lên FI-234.
- Linear FI-234 → Done CHỈ SAU story-verify sạch.

## Tasks

- [ ] Task 1 — SPIKE 1: MF Vite × AntD4 singleton. Sandbox /tmp/sf1-spikes/spike1. Candidates: @originjs/vite-plugin-federation 1.4.1 vs @module-federation/vite 1.21.1. Verify: dev server + `vite build` + publicPath prod + antd KHÔNG duplicate bundle (host singleton, remote consume). AntD 4.24.16 + React 18. Verdict → docs/superpowers/spikes/mf-vite-antd4.md (checklist dev-pass/build-pass/publicPath-prod-pass/singleton-no-duplicate + plugin chọn + config snippet). Fallback: webpack MF (deviation flag).
- [ ] Task 2 — SPIKE 2: react-pdf + pdfjs worker trong remote. Sandbox /tmp/sf1-spikes/spike2. Worker `?url` import + optimizeDeps; render 1 PDF tĩnh trong Vite remote context. Verdict → docs/superpowers/spikes/react-pdf-remote.md.
- [ ] Task 3 — SPIKE 3: react-sortable-hoc + array-move trên React 18. Sandbox /tmp/sf1-spikes/spike3. Sort list drag-drop, lifecycle không crash. Gãy → dnd-kit (deviation flag, D7). Verdict → docs/superpowers/spikes/dnd-react18.md.
- [ ] Task 4 — SPIKE 4: gRPC codegen multi-language protoc/buf. Sandbox /tmp/sf1-spikes/spike4. Minimal proto → codegen java+go+python+ts compile pass. buf qua `npx @bufbuild/buf` (chưa cài global). Toolchain thực tế ghi verdict: java 21, go 1.19 (<1.21 spec — flag), python 3.14, protoc 29.3. Verdict → docs/superpowers/spikes/grpc-codegen-multilang.md — SF-2 consume.
- [ ] Task 5 — Monorepo scaffold: pnpm workspaces + turbo; dirs services/{bff-gateway,fulfillment-service,batching-service,print-service}, apps/{shell,orders,fulfillment}, packages/{shared,api-client}, api/{proto,seed} placeholders; tsconfig.base.json; root .env JWT_DEV_SECRET; pin versions mọi root deps; port map bff 8080 / shell 3000 / orders 3001 / fulfillment 3002 / gRPC 50051-50053. Turbo CHỈ JS/TS.
- [ ] Task 6 — packages/shared core: types §4 (HubStoreOrderFilterItem, BatchingItem, Product) + enums (BatchStatus 0-3, OrderStatus 0-2, CoordinationStatus 0-2, phiếu 0 ACTIVE|1 COMPLETED|2 CANCELLED, PrintType union bill|delivery|handover_receipt|goods_handover|installation_acceptance) · formatters VND (VI `15.000.000đ` / EN `15,000,000 ₫`) + formatPeriodOfTime (`HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY` locale-neutral) · StatusTag (success/error/warning/info tokens) · theme §7 → AntD 4.24 ConfigProvider preset (primary #EB6E09, radius 2px/8px, Roboto, typo scale). Unit tests formatters/StatusTag.
- [ ] Task 7 — packages/shared infra: i18n (1 instance, namespaces shell.*/orders.*/fulfillment.* + common.*) · FilterBar primitives (TextSearch, MultiSelect, DateRange, DateTimeRange; grid 2×4 + Reset/Search) · useUrlState (filter ↔ URL query, serialize array) · usePermissions role matrix §2 (Coordinator → D1+D2+Print; WarehouseOps → D2+Print; Manager=all). Unit tests usePermissions/useUrlState.
- [ ] Task 8 — packages/api-client: RTK Query singleton + axiosBaseQuery (axios) + setTokenGetter(fn) + tag scheme Fulfillment/Batches/MasterData + default list-query refetchOnMount:'always' + slices skeleton.
- [ ] Task 9 — fake JWT util: `jose` HS256, JWT_DEV_SECRET từ root .env, payload {sub, role}, dev-only. Đặt packages/shared.
- [ ] Task 10 — Federation skeleton THEO SPIKE 1 VERDICT (GATE: verdicts 1-3 tồn tại + go): shell host + orders + fulfillment remotes; exposes PIN orders=`orders/D1Page`→/hub-store-order/order, fulfillment=`fulfillment/BatchListPage`→/hub-store-order/batch, `fulfillment/PrintPage`→/hub-store-order/batch/print; singletons react/react-dom/antd/@reduxjs/toolkit/react-redux/react-router-dom/i18next/react-i18next + packages/shared + api-client; RRD singleton shell owns BrowserRouter; remotes.config.json PRE-SEED 2 entries skeleton; fallback message remote chưa lên; VI↔EN toggle + theme #EB6E09 ở shell.
- [ ] Task 11 — Build + test sạch: `pnpm install && pnpm build` pass; `pnpm test` smoke xanh (formatters/StatusTag/usePermissions).
- [ ] Task 12 — Verify + review + merge: browser 3 tầng; verifier từng dòng ACCEPTANCE; code-reviewer APPROVED; merge no-ff vào story branch; audit comment FI-234.
