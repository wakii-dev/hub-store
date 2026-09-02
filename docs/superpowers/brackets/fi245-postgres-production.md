# Story: FI-245 — Production persistence: PostgreSQL + Docker + real auth

Destination: story/fi245-postgres-production

## SF-1 Postgres infra + seed pipeline
Tier: 0
linear: FI-246
What: compose postgres (2 DB qua initdb, healthcheck, volume) + env wiring cho app services + keycloak block + wait-db.sh dùng chung; seed pipeline script + reset util (deliverable — test standalone/dry-run; CHỈ chạy được sau khi migration của SF-2/SF-3 có — full-chain verify là SF-5); compose cleanup seed remnant (SEED_PATH/CANONICAL_SEED_PATH/depends_on cũ); .env.example
Depends on: —
Tasks: compose-postgres / initdb-2-databases / healthcheck-wiring / app-services-env-wiring / keycloak-service-block / wait-db-script / seed-pipeline-script / reset-db-util / db-seed-compose-wiring (depends_on migrate+seed completed-successfully) / compose-cleanup-seed-remnant / env-example-credentials / compose-config-verify

## SF-2 Orders Java → Postgres
Tier: 1
linear: FI-247
What: PostgresOrderRepository implements OrderRepository (11 method giữ nguyên semantics — filter COUNT(*) OVER() 1 query + LIKE escape, findByCodes CASE-ordering, findByFulfillCode dual ORD/RSA match, mutate transaction, history table), Flyway orders schema V1 + migrate-on-boot, seed-verify-on-boot fail-loud, datasource env + fail-loud impl selection, run.sh wait-db, unit test giữ InMemory + integration test skip-when-no-DB; acceptance standalone: migrate + seed-db.sh → data đúng
Depends on: SF-1
Tasks: flyway-orders-schema / postgres-repo-impl / filter-window-count-escape / findbycodes-ordering / dual-code-match / mutate-transaction / history-table-mapping / distinctshops-sql / seed-verify-boot / flyway-wiring-boot / datasource-config-env / impl-selection-conditional / runsh-wait-db / unit-tests-inmemory / integration-test-db

## SF-3 Batches Go → Postgres
Tier: 1
linear: FI-248
What: BatchStore interface + pgx v5 PostgresStore (Transition CAS SQL, CreateWithNextCode sequence + bootstrap setval max-seed khi trống, List ordering giữ semantics), bỏ LoadSeedFile (data do seed pipeline), golang-migrate batches schema V1, boot không phụ thuộc Java; acceptance standalone: migrate + seed-db.sh → BATCH-0001 thấy
Depends on: SF-1
Tasks: batchstore-interface / golang-migrate-batches-schema / pgx-impl-store / transition-cas-sql / create-next-code-sequence / list-ordering-semantics / remove-loadseedfile / migrate-entrypoint / go-mod-pin / dockerfile-update / unit-tests

## SF-4 OIDC auth thật (Keycloak)
Tier: 1
linear: FI-249
What: Keycloak realm import (roles Coordinator/WarehouseOps/Manager + users mẫu password literal dev-only trong realm JSON — KHÔNG env-substitution), shell login PKCE + silent renew + logout (pin oidc-client-ts), BFF verify JWKS (refresh unknown kid) + map realm_access.roles → x-user-role, loại fake-JWT khỏi runtime path, E2E login helper storageState, forgot-password C1 (custom page + BFF → Keycloak Admin API set password — dev-only, ghi rõ README/comment)
Depends on: SF-1
Tasks: keycloak-realm-import / roles-users-seed / shell-login-pkce / silent-renew-logout / bff-jwks-verify / roles-claim-map / remove-fakejwt-runtime / forgot-password-page / bff-reset-password-admin-api / e2e-login-helper / e2e-specs-pass-auth

## SF-5 Convergence — production compose + E2E + deploy docs
Tier: 2
linear: FI-250
What: full compose chain verify (postgres → migrate one-shot → db-seed completed → apps — psql thấy ORD-3001/BATCH-0001 qua compose up); docker compose up --build full stack E2E với DB + auth thật; persistence proof restart; E2E 13/13 với E2E=1; boot-all.sh update; README deploy + backup pg_dump; security re-check. READ-ONLY apps/** (SF-6 sở hữu song song)
Depends on: SF-2, SF-3, SF-4
Tasks: compose-full-chain-verify / compose-full-build / persistence-restart-proof / e2e-13-green / bootall-update / readme-deploy-guide / backup-doc / security-recheck / audit-comment

## SF-6 UI/UX hiện đại hóa toàn web — antd4 refresh
Tier: 2
linear: FI-251
Design: mock-prototype
What: design-first bắt buộc (3 hướng HTML prototype shell+D1 → user chọn gate → hand-off direction); theme LESS tokens mới (palette #EB6E09, radius, shadow, spacing, typography), skeletons/empty-states, micro-interactions, login wrapper polish; phạm vi shell + D1 + D1b + D2 + D3 — 1 design system thống nhất; KHÔNG antd5; KHÔNG đổi testids/DOM mà E2E phụ thuộc; KHÔNG đổi business logic
Depends on: SF-2, SF-3, SF-4
Tasks: design-3-directions-user-gate / theme-tokens-LESS / shell-nav-refresh / login-wrapper / d1-orders-refresh / d1b-batching-modal-refresh / d2-fulfillment-refresh / d3-print-refresh / skeleton-empty-states / visual-verify-3-tiers

## SF-7 BE foundation — audit log + export + pagination
Tier: 2
linear: FI-252
What: bảng activity_log (fulfillment DB — actor/action/target/detail JSONB/timestamp) ghi tại mọi mutation; export CSV endpoint theo filter hiện tại; pagination server-side chuẩn (page/pageSize+total) cho orders + batches — endpoint cũ KHÔNG vỡ (envelope mới thêm)
Depends on: SF-2
Tasks: activity-log-table / audit-write-mutations / audit-query-api / export-csv-endpoint / pagination-orders / pagination-batches / legacy-compat-check / unit-tests

## SF-8 Users management UI
Tier: 2
linear: FI-253
What: màn Users chỉ Manager: list users Keycloak + tạo user + gán role + set password + khóa/mở — BFF endpoints gọi Keycloak Admin API (service-account credential qua env); UI theo sf6-direction nếu đã có, SF-11 hội tụ
Depends on: SF-4
Tasks: bff-kc-admin-client / users-list-api / users-crud-role-api / users-lock-api / fe-users-screen / role-matrix-guard / e2e-users-spec

## SF-9 Dashboard thống kê
Tier: 2
linear: FI-254
What: màn Dashboard — đơn/ngày 30 ngày, tỷ lệ hoàn thành/hủy, workload shipper, đơn chờ xử lý; aggregate API riêng (SQL aggregate, KHÔNG N+1 client); UI theo sf6-direction nếu đã có, SF-11 hội tụ
Depends on: SF-2
Tasks: dashboard-aggregate-api / fe-dashboard-screen / charts-antd / role-based-default-route / e2e-dashboard-spec

## SF-10 Realtime SSE
Tier: 2
linear: FI-255
What: BFF SSE endpoint + event bus (order assign/cancel/complete, batch create/transition → event); FE hook subscribe — D1/D2 cập nhật realtime; reconnect + fallback polling; auth access token trên SSE
Depends on: SF-2, SF-3
Tasks: bff-sse-endpoint / event-bus-mutations / fe-sse-hook / d1-d2-live-update / reconnect-fallback / e2e-sse-spec

## SF-11 FE convergence mới — audit viewer + export UI + mobile
Tier: 3
linear: FI-256
What: audit-log viewer (Manager), export UI theo filter, mobile responsive polish (tablet shipper), toàn bộ screens mới (SF-8/9/13) hội tụ design system SF-6; skeleton/empty-state screens mới; E2E specs mới cho users/dashboard/export/audit — KHÔNG sửa assertions specs cũ
Depends on: SF-6, SF-7, SF-8, SF-9, SF-10, SF-13
Tasks: audit-viewer-screen / export-ui / mobile-responsive / design-harmonize-screens / skeletons-new-screens / e2e-new-features-green

## SF-12 Production hardening
Tier: 6
linear: FI-257
What: M-3 resolved (token passthrough HOẶC mTLS s2s — chọn 1 + rationale); .env ra khỏi git + rotate credentials + compose env-file local; healthcheck endpoints mọi service + logs structured; CI GitHub Actions (lint + unit + E2E E2E=1 + docker build mỗi PR); backup cron pg_dump 2 DB + restore doc
Depends on: SF-5, SF-11, SF-14, SF-16, SF-20, SF-21, SF-22, SF-22, SF-23, SF-24, SF-25, SF-26
Tasks: s2s-token-passthrough-or-mtls / secrets-out-of-git / rotate-credentials / healthchecks-all / structured-logs / ci-pipeline / e2e-in-ci / backup-cron / restore-doc / security-final-audit

## SF-13 Order intake + delivery exceptions
Tier: 2
linear: FI-258
What: import CSV/Excel đơn (template + validate + preview lỗi từng row + confirm insert); tạo đơn thủ công trên D1 (generate fulfillCode dải ORD-*); per-order FAILED + lý do (enum + ghi chú) + flow giao lại (chọn retry/reopen — giữ audit); proto CHỈ additive; UI antd4 sạch — SF-11 harmonize
Depends on: SF-2, SF-3
Tasks: import-template / import-validate-preview / import-insert / manual-create-form / fulfillcode-gen / order-failed-status / exception-reasons / redelivery-flow / e2e-intake-spec / e2e-exception-spec

## SF-14 COD đối soát
Tier: 3
linear: FI-259
What: xác nhận thu COD per-order (số tiền + người thu + thời điểm, mặc định từ batch hoàn tất); màn đối soát theo shop theo kỳ — hoàn tất-COD vs đã-thu vs chênh lệch; export CSV đối soát (pattern SF-7); Flyway V3 settlement trong DB fulfillment
Depends on: SF-7, SF-13
Tasks: cod-confirm-flow / settlement-table / settlement-aggregate-api / fe-settlement-screen / settlement-export / e2e-settlement-spec

## SF-15 NVC backend + mock carrier provider
Tier: 3
linear: FI-260
What: tích hợp API Ahamove THẬT (api.ahamove.com — partner token env AHAMOVE_*, KHÔNG mock/provider giả; E2E NVC skip-if-no-credential); endpoints quotes/planning-confirm/booking/cancel/searchbookingdetail; batching DB V2 (plannings/bookings/statuses/tracking events/addon catalog/fee limits per-SP); fee-limit rules BE-authoritative
Depends on: SF-3
Tasks: ahamove-client-auth / quotes-endpoint / planning-confirm-endpoint / booking-endpoint / cancel-shipment-endpoints / tracking-detail-endpoint / addon-catalog / fee-limits-rules / batching-db-v2 / e2e-nvc-api-skip-if-no-env

## SF-16 NVC FE — carrier section + replan/rebook/tracking
Tier: 4
linear: FI-261
What: D1b carrier section (3 nhóm carrier, quotes + recalculate, addon radio/checkbox, fee-limit gates); D2 replan/rebook (gate trạng thái) + hủy vận đơn per-đơn/batch + note; tracking modal timeline 2 cột + link; master mapping 15 trạng thái vận đơn; theo design system SF-6
Depends on: SF-15, SF-6
Tasks: carrier-section-d1b / quotes-display-recalc / addon-selector / fee-limit-gates / replan-rebook-flows / cancel-shipment-ui / tracking-modal / status-master-map / e2e-nvc-fe-spec

## SF-17 Khu vực hoạt động NV
Tier: 3
linear: FI-262
What: BE Flyway V4 (service_employees + regions/wards + payment account — verify Zalopay thật (env ZALOPAY_*) hoặc nhập tay nếu chưa có credential — KHÔNG giả lập) CRUD + active toggle; FE list + lọc chức danh/NV/vùng + expand wards; define/edit form (vùng multi → chức danh → NV → payment → khu vực tỉnh/phường); Admin viết, role khác xem; design system SF-6
Depends on: SF-2
Tasks: area-staff-schema / area-staff-crud-api / payment-verify-real / fe-area-list / fe-area-form / active-toggle / role-guard / e2e-area-spec

## SF-18 D2C/Dropship module
Tier: 3
linear: FI-263
What: BE d2c_orders schema + filter đa chiều (carrier/shop/NV xuất/ngành hàng/khung giờ đẩy) + ghi chú + export Excel/CSV ≤31 ngày (pattern SF-7); FE list + expand (push/export info, người nhận, tách nợ) + note modal; role WarehouseEmployee; design system SF-6
Depends on: SF-2
Tasks: d2c-schema / d2c-filter-api / d2c-note-api / d2c-export / fe-d2c-list / fe-d2c-expand-note / role-guard / e2e-d2c-spec

## SF-19 Đơn dịch vụ kỹ thuật BE
Tier: 3
linear: FI-264
What: delivery_orders + installation_orders + technicians (Flyway); 10 mã trạng thái giao; assign/re-assign + suggest employee; timelines; service fees (payout/adjust); receiver/sender lat-long
Depends on: SF-2
Tasks: tech-schema / delivery-order-api / installation-order-api / assign-reassign-api / suggest-employee / timelines / service-fees / unit-tests

## SF-20 Đơn dịch vụ kỹ thuật FE
Tier: 4
linear: FI-265
What: 3 tab Giao hàng/Lắp đặt/KTV-CTV; filter lưu URL; assign modal + gợi ý NV; KTV-CTV detail theo ngày; gọi điện tel:; buttons BE-authoritative; design system SF-6
Depends on: SF-19, SF-6
Tasks: fe-3-tabs / filters-url-persist / assign-modal-suggest / ktv-ctv-detail / phone-call / be-buttons-render / e2e-tech-spec

## SF-21 Print expansion + platform polish
Tier: 4
linear: FI-266
What: in 5 loại chứng từ (bill/delivery/handover_receipt/goods_handover/installation_acceptance); printer management (bảng printers + chọn theo shop, bill vs A4); print errors per-đơn; preview; "in tất cả"; hotkeys F4/F6/F8; empty-states dùng chung
Depends on: SF-15, SF-6
Tasks: print-types-5 / printer-management / print-errors / preview-improve / print-all / hotkeys / empty-states-shared / e2e-print-expansion

## SF-22 i18n vi/en toàn app
Tier: 4
linear: FI-267
What: i18n framework nhẹ + namespace theo module; VI đầy đủ (default) + EN toàn screens; switcher trong shell + localStorage persist; chuẩn KHÔNG hardcode string mới cho code về sau
Depends on: SF-6
Tasks: i18n-framework-setup / namespaces-modules / vi-full / en-full / language-switcher / no-hardcode-convention / e2e-i18n

## SF-23 PWA + Push OneSignal + GA
Tier: 4
linear: FI-268
What: PWA manifest + service worker (installable, offline fallback tĩnh); OneSignal THẬT qua env (app ID + REST key do user cấp) — push đơn mới/batch hoàn tất/vận đơn giao, subscribe khi login; GA thật qua env GA_MEASUREMENT_ID — pageview + sự kiện chính, off khi env trống; KHÔNG giả lập response
Depends on: SF-10
Tasks: pwa-manifest-sw / offline-fallback / onesignal-init-real / push-events / subscribe-login / ga-hook / env-wiring / e2e-wiring-skip-if-no-env

## SF-24 Map view
Tier: 5
linear: FI-269
What: Leaflet + OpenStreetMap (không API key): pins đơn lat/long (tech service), route stops theo thứ tự (batch), warehouse marker; mở từ tracking modal + tech screens
Depends on: SF-16, SF-20
Tasks: map-component / batch-route-view / tech-pins-view / integrate-tracking-modal / e2e-map

## SF-25 KTV/CTV mobile web app
Tier: 5
linear: FI-270
What: mobile web installable PWA cho KTV/CTV: my-orders hôm nay, accept/complete/reschedule theo buttons flags, timeline + địa chỉ + deep-link map, gọi KH; auth OIDC cùng realm (thêm role KTV nếu thiếu)
Depends on: SF-20, SF-23
Tasks: mobile-shell-pwa / my-orders-today / accept-complete-reschedule / timeline-address-map / phone-call / ktv-role-realm / e2e-ktv-mobile

## SF-26 Webhook nhận đơn từ sàn
Tier: 4
linear: FI-271
What: POST /webhooks/orders (HMAC header qua env): validate + idempotency dedupe externalId + map vào orders (fulfillCode tự sinh) + audit; retry semantics chuẩn; config mapping qua env
Depends on: SF-13
Tasks: webhook-endpoint / hmac-auth / idempotency-store / order-mapping / retry-semantics / audit-integration / e2e-webhook

