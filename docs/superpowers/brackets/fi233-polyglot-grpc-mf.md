# Story: FI-233 — Init microservice (gRPC polyglot) + microfrontend — hub-store-order

Destination: story/fi233-polyglot-grpc-mf

> Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 — spec-critic + plan-critic PASS sau revise)
> Nghiệp vụ: REQUIREMENTS.md — acceptance §8b KHÔNG đổi
> Design source of truth: production-clone (REQUIREMENTS §3 screens + §7 tokens, AntD4) — không Figma, không cần 3-hướng designer
> Spike-first: KHÔNG SF UI start trước verdict SPIKE 1-3 (SF-1); KHÔNG service start trước SPIKE 4 (SF-2)
> Context packs: docs/superpowers/contexts/sf-<n>.md — SF agent ĐỌC PACK thay tự tổng hợp

## SF-1 FE Foundation + Spikes
Tier: 0
linear:
Design: none
What: monorepo scaffold + packages/shared + api-client + 3 FE spikes + federation skeleton
Depends on: —
Tasks: monorepo-scaffold / shared-types-enums / formatters / status-tag / theme-tokens / i18n-infra / filterbar-primitives / use-url-state / use-permissions / api-client-singleton / spike-1-mf-antd4 / spike-2-react-pdf-remote / spike-3-dnd-react18 / federation-skeleton-remotes-preseed / jwt-util-jose

## SF-2 Proto + BFF Gateway
Tier: 1
linear:
Design: none
What: buf + 3 protos + SPIKE 4 codegen + BFF Fastify 18 REST endpoints + envelopes + contracts + canonical seed
Depends on: SF-1
Tasks: buf-setup / proto-fulfillment / proto-batching / proto-print / spike-4-codegen-multilang / bff-bootstrap / jwt-guard-cors / rest-endpoints-wiring / pagination-error-envelope / resilience-policy / api-contracts-author / canonical-seed-fixture / contract-test-harness / readme-run

## SF-3 fulfillment-service Java
Tier: 2
linear:
Design: none
What: Spring Boot 3 gRPC service — owns orders store + master-data, seed load, validations
Depends on: SF-2
Tasks: spring-grpc-bootstrap / orders-repo-seed / impl-filter-detail / impl-mutate-status / impl-getordersbycodes / impl-assign-history / impl-delivery-time-promising / impl-masterdata / validations-2-3 / junit-tests / readme-run

## SF-4 batching-service Go
Tier: 2
linear:
Design: none
What: Go gRPC service — owns batches store, rule-1 hydration qua Java, batch lifecycle
Depends on: SF-2
Tasks: go-grpc-bootstrap / batches-store-seed / impl-packing-suggest / impl-create-hydration-mutate / impl-filter-detail / impl-cancel-revert / impl-criteria / impl-recalc-complete / validations-1-4 / go-tests / readme-run

## SF-5 print-service Python
Tier: 2
linear:
Design: none
What: grpcio service — printers registry + print jobs + PDF 5 templates (reportlab)
Depends on: SF-2
Tasks: grpcio-bootstrap / printers-registry-seed / impl-list-printers / impl-print-pdf-bytes / pdf-template-bill / pdf-template-delivery / pdf-template-handover-goods / pdf-template-installation / pytest / readme-run

## SF-6 Shell app
Tier: 1
linear:
Design: none
What: MF host — layout, router, dynamic remote loading, auth stub + role switcher, i18n + theme init
Depends on: SF-1
Tasks: mf-host / app-layout / router-dynamic-remotes / auth-stub-role-switcher / set-token-getter / i18next-init-namespaces / antd-theme-wrap / route-gating-roles / notfound / smoke-remotes

## SF-7 Orders remote — D1 + D1c
Tier: 3
linear:
Design: none
What: remote orders — D1 danh sách đơn (8 filters, bulk actions) + HubStoreTransferModal
Depends on: SF-2, SF-3, SF-6
Tasks: remote-scaffold-orders / rtkq-slices / filters-8-urlstate / regions-shops-fetch / table-8-cols / expandable-items / selection-bulk-bar / pagination-total / edit-delivery-time / transfer-modal-history / i18n-keys / unit-tests / acceptance-walkthrough-d1

## SF-8 Orders remote — D1b CreateBatchingModal
Tier: 4
linear:
Design: none
What: modal 1310×918 — DnD sortable, packing suggest, gán shipper, tạo phiếu
Depends on: SF-7, SF-4
Tasks: modal-shell / dnd-sortable-stoporder / packing-suggest-ui / recalc-distance / them-don-search / delivery-staff-select / datepicker-time-hint / create-batch-mutation / error-ux-reject / success-flow / i18n-keys-tests-walkthrough

## SF-9 Fulfillment remote — D2
Tier: 3
linear:
Design: none
What: remote fulfillment scaffold + D2 danh sách phiếu soạn (hủy, hoàn tất, nút In)
Depends on: SF-2, SF-3, SF-4, SF-6
Tasks: remote-scaffold-fulfillment / rtkq-batches-slices / filters-3-urlstate / table-8-cols-cod / expand-detail / cancel-batch-flow / complete-picking / print-nav-button / i18n-keys / unit-tests / acceptance-walkthrough-d2

## SF-10 Fulfillment remote — D3 Print Shipment
Tier: 4
linear:
Design: none
What: PrintPage thêm vào remote fulfillment (scaffold từ SF-9) — 5 tabs PDF preview + in
Depends on: SF-9, SF-2, SF-5, SF-6
Tasks: printpage-expose-route / tabs-5-printtypes / react-pdf-preview-zoom / printers-select / print-post-feedback / print-all-5-calls / i18n-keys / unit-tests-walkthrough-d3

## SF-11 Convergence + QA
Tier: 5
linear:
Design: none
What: backend integration verify + E2E cross-remotes + audit + compose + regression + close
Depends on: SF-8, SF-9, SF-10
Tasks: backend-integration-java-go / e2e-playwright-main-flows / cross-remote-invalidation-verify / role-matrix-verify / i18n-audit-binary / cod-format-audit / degraded-mode-kill-go / build-all-compose / readme-full / regression-8b-walkthrough / final-gate-story-close
