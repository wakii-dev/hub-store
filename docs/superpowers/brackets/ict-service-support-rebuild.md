# Story: FI-232 — ICT Service Support: Đơn hàng kho chi nhánh (hub-store-order — microservice + microfrontend)

Destination: story/fi232-hub-order-mf

> **PIVOT 2026-08-31** — thực thi theo spec v2: docs/superpowers/specs/ict-service-support-mf-spec.md
> (backend NestJS thật 18+1 endpoints + FE module federation; v1 standalone/msw SUPERSEDED, chỉ còn
> decisions kế thừa §4 v2). Source of truth nghiệp vụ: REQUIREMENTS.md — acceptance §8b KHÔNG đổi.
> ⚠️ FLAG chờ user veto lúc APPROVE: direction B 3 FE apps (§2 v2), endpoint mới
> `GET /master-data/delivery-staff` (scope addition — §3 v2), DnD fallback dnd-kit nếu spike gãy (D7),
> JWT dev-only stub (§3 v2). Design: none mọi SF — rebuild 1:1 từ production spec (layout + tokens
> §3/§7 REQUIREMENTS), không visual direction mở → không designer phase.
> Team Linear: FI. Epic: FI-232 (In Progress). Context packs: docs/superpowers/contexts/sf-1..7.md

## SF-1 Foundation + Spikes
Tier: 0
linear:
Design: none
What: Monorepo pnpm+turbo scaffold, packages/shared (types §4, enums, formatters, StatusTag, theme tokens §7, i18n infra, FilterBar primitives, useUrlState, usePermissions role matrix §2), packages/api-client (singleton, Bearer, tag scheme, slices skeleton), SPIKES: MF Vite×AntD4 singleton / react-pdf trong remote / DnD×React18, federation scaffold theo spike verdict (shell + 2 remote skeletons), fake JWT util FE+BE
Depends on: —
Tasks: monorepo-scaffold / packages-shared-types-enums / shared-formatters-statustag / shared-theme-i18n / shared-filterbar-useurlstate / shared-usepermissions / packages-api-client / spike-mf-vite-antd4 / spike-react-pdf / spike-dnd / federation-scaffold-shell-skeleton / federation-scaffold-remotes-skeleton / exposes-contract-pin / fake-jwt-util

## SF-2 Backend fulfillment-api
Tier: 1
linear:
Design: none
What: NestJS bootstrap + modules (fulfillment/batches/print/master-data/order-promising), in-memory repository + seed contract (§3 v2: ≥25 đơn shop 30201, 4 batchStatus, staff, printers, regions), đủ 17 endpoints §5 (bỏ note — out-of-scope) + 1 bổ sung delivery-staff, PDF generation pdf-lib 5 template, mutation contract, DTOs vào packages/shared (carve-out), JWT guard + CORS port map, Vitest+supertest tests độc lập
Depends on: SF-1
Tasks: nestjs-bootstrap-modules / inmemory-repo-seed / endpoints-fulfillment-group / endpoints-batches-group / endpoints-print-pdf-lib / endpoints-masterdata-orderpromising / mutation-contract / shared-dtos-carveout / jwt-guard-cors / error-shape-validation / mutation-tests-supertest / readme-api-run

## SF-3 Shell app (MF host)
Tier: 1
linear:
Design: none
What: Vite MF host theo spike verdict, AppLayout (sidebar 48px/header 55px tokens §7), router + dynamic remote loading + fallback UI, auth stub (fake JWT + role switcher + OIDC env), api-client init + token inject, i18next init + namespace wiring + VI/EN toggle, AntD ConfigProvider wrap mount region, route gating role matrix §2, 404, smoke test load 2 remote skeletons
Depends on: SF-1
Tasks: mf-host-setup / app-layout-tokens / router-dynamic-remote-fallback / auth-stub-roleswitcher / api-client-init-token / i18next-init-namespace / antd-configprovider-mountregion / route-gating-404 / smoke-test-remotes / i18n-keys-shell

## SF-4 Orders remote — D1 + D1c
Tier: 2
linear:
Design: none
What: Remote scaffold + exposes orders/D1Page + namespace orders.*, RTK Query slices fulfillment API, 8 filters + URL state, bảng 8 cột (fixed-left link copy, StatusTag, shop, batchCode link → /hub-store-order/batch cross-remote), expandable items[], selection + BulkActionBar (cùng-kho logic + hint), pagination "Tổng N mã", edit deliveryTime (rule §9), HubStoreTransferModal (disable isDebtSplittingOrder) + history
Depends on: SF-1, SF-2, SF-3
Tasks: remote-scaffold-exposes / rtkq-slices-fulfillment / filters-urlstate / order-table-8cols / expandable-rows / selection-bulkbar / pagination / edit-deliverytime / transfer-modal-history / cross-remote-batchcode-link / i18n-keys-orders / unit-tests / acceptance-walkthrough

## SF-5 Orders remote — D1b CreateBatchingModal
Tier: 3
linear:
Design: none
What: Modal 1310×918 tạo phiếu soạn — bảng đơn đã chọn (rows qua props — interface pin), DnD sortable stopOrder (spike verdict), packing suggest, recalculate-distance, thêm đơn (search batchStatus=0 cùng kho + excludeFulfillCodes), DeliveryStaffSelect (GET delivery-staff), DatePicker + time-delivery hint, batches/create (reject batchStatus≠0), success flow + same-remote tag invalidation
Depends on: SF-4
Tasks: modal-shell-selected-table / dnd-sortable-stoporder / packing-suggest / recalculate-distance / add-order-search / shipper-select-deliverystaff / delivery-datepicker-hint / create-batch-mutation / success-flow-invalidation / i18n-keys / tests-acceptance

## SF-6 Fulfillment remote — D2 + D3
Tier: 2
linear:
Design: none
What: Remote scaffold + exposes fulfillment/BatchListPage + fulfillment/PrintPage + namespace fulfillment.*, RTK Query slices batches API, D2: 3 filters + URL state, bảng 8 cột (COD VND), expand detail, hủy phiếu (confirm+reason, criteria-gated, revert), Hoàn tất soạn (D11), nút In → ?batchCode=; D3: 5 tabs, react-pdf theo spike (PDF bytes BE), preview + zoom, printers select, POST print + feedback, In tất cả
Depends on: SF-1, SF-2, SF-3
Tasks: remote-scaffold-exposes-fulfillment / rtkq-slices-batches / d2-filters-urlstate / batch-table-8cols / expand-detail / cancel-batch-flow / complete-picking / print-entry-nav / print-route-tabs-5types / reactpdf-preview-zoom / printers-select-print-action / print-all-flow / i18n-keys-fulfillment / unit-tests / acceptance-walkthrough-d2-d3

## SF-7 Convergence + QA
Tier: 4
linear:
Design: none
What: E2E Playwright 1-2 luồng §8 cross-remotes (webServer boot pnpm dev), cross-remote invalidation verify (refetchOnMount), role matrix verify 3 roles §2, i18n completeness audit (checklist Linear), COD/format audit, build all + docker-compose cấu hình mẫu (turbo cache off cho federation build), README full, full §8b regression, final gate + STORY-CLOSE verify
Depends on: SF-5, SF-6
Tasks: playwright-e2e-setup / e2e-flow-order-to-print / cross-remote-invalidation-verify / role-matrix-verify / i18n-audit-checklist / cod-format-audit / build-docker-compose / full-8b-regression / readme-final-gate
