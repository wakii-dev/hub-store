# Story: FI-232 — ICT Service Support: Đơn hàng kho chi nhánh (hub-store-order rebuild)

Destination: story/fi232-ict-service-support-rebuild

> Spec epic: docs/superpowers/specs/ict-service-support-rebuild-spec.md
> Source of truth: REQUIREMENTS.md — acceptance §8b KHÔNG đổi; boundary §10 KHÔNG đổi.
> Quyết định flag chờ user veto lúc approve: D1-D13 trong spec (ĐỌC TRƯỚC KHI APPROVE) —
> đặc biệt D7 (DnD lib fallback dnd-kit), D11 (complete-picking ở D2), OIDC mock (D1).
> Design: none cho mọi SF — đây là rebuild 1:1 từ production UI; layout + tokens đã spec
> sẵn trong REQUIREMENTS §3/§7, không có visual direction mở → không cần designer phase.
> Team Linear: FI. Epic: FI-232 (In Progress).

## SF-1 Foundation + Shared Primitives
Tier: 0
linear:
Design: none
What: Vite+TS+Vitest scaffold, AntD4 theme tokens §7, router + AppLayout, i18n VI/EN infra, axios baseApi + Bearer + RTK Query tag scheme, msw infra, mocks/db.ts + seed contract (P0), shared types + enums, StatusTag, formatters, useUrlState, FilterBar primitives, auth stub (usePermissions), spikes DnD×React18 + react-pdf×Vite
Depends on: —
Tasks: vite-scaffold / antd-theme-tokens / router-layout-shell / i18n-infra / axios-baseapi-tag-scheme / msw-infra / db-seed-contract / shared-types-enums / status-tag / formatters-vnd-time / useurlstate-hook / filterbar-primitives / auth-stub-permissions / spikes-dnd-pdf

## SF-2 D1 Danh sách đơn + D1c Chuyển kho
Tier: 1
linear:
Design: none
What: D1 order list 8 filters + URL state, bảng 8 cột, expandable, selection + BulkActionBar (cùng-kho logic), pagination, edit deliveryTime (rule §9), HubStoreTransferModal + history, filter handler mở rộng excludeFulfillCodes (SF-4 consume)
Depends on: SF-1
Tasks: filter-handler-plus-exclude / d1-filters-urlstate / order-table-8cols / expandable-rows / selection-bulkbar / pagination / edit-deliverytime / transfer-handlers / transfer-modal / history-view / i18n-keys / unit-tests / acceptance-walkthrough

## SF-3 D2 Danh sách phiếu soạn
Tier: 1
linear:
Design: none
What: D2 batching list 3 filters + URL state, bảng 8 cột (COD VND), expand detail, hủy phiếu (confirm+reason, criteria-gated, mutation revert), nút Hoàn tất soạn (D11), nút In + navigation ?batchCode=, revert-consistency test trên db state
Depends on: SF-1
Tasks: batches-handlers-criteria-completepicking / d2-filters-urlstate / batch-table-8cols / expand-detail / cancel-batch-flow / complete-picking-button / print-entry-nav / revert-consistency-test / i18n-keys / unit-tests / acceptance-walkthrough

## SF-4 D1b CreateBatchingModal
Tier: 2
linear:
Design: none
What: Modal 1310×918 tạo phiếu soạn — bảng đơn đã chọn (props từ D1 selection — interface pinned §2 spec), DnD sortable stopOrder (theo spike SF-1), packing suggest, recalculate-distance, thêm đơn (filter handler + excludeFulfillCodes), DeliveryStaffSelect, DatePicker + time-delivery hint, batches/create mutation, success flow
Depends on: SF-2, SF-3
Tasks: modal-shell-selected-table / dnd-sortable-stoporder / packing-suggest / recalculate-distance / add-order-search / shipper-select / delivery-datepicker / create-batch-handler / success-flow-refresh / i18n-keys / tests-acceptance

## SF-5 D3 Print Shipment
Tier: 2
linear:
Design: none
What: Print route 5 tab (bill/delivery/handover/goods/installation), react-pdf theo spike SF-1 (worker Vite), mock PDF data 5 loại (fixtures local — không đụng db.ts), preview + zoom slider, printers select, POST print + feedback, In tất cả
Depends on: SF-3
Tasks: print-route-tabs / reactpdf-integration / pdf-fixtures-5types / preview-zoom / printers-handler-select / print-action-feedback / print-all-flow / i18n-keys / unit-tests / acceptance-walkthrough

## SF-6 Convergence + QA
Tier: 3
linear:
Design: none
What: usePermissions thật (3 roles §2, route gating), auth flow E2E mock, luồng E2E §8 đầy đủ (đơn→phiếu→hủy→revert→tạo lại→in→hoàn tất soạn), i18n completeness + URL state + COD audit (output: checklist Linear), vite build + Docker/nginx SPA fallback cấu hình mẫu, full §8b regression, README
Depends on: SF-4, SF-5
Tasks: permissions-impl / auth-e2e-mock / e2e-full-flow / i18n-audit-checklist / urlstate-audit / cod-format-audit / build-docker-spa / full-8b-regression / readme-final-gate
