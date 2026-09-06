# Story: FI-326 — BFF API docs (OpenAPI/Swagger)

Destination: story/fi326-api-docs-swagger
Spec: docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md
Plan: docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md
Contexts: docs/superpowers/contexts/sf-{1..9}.md (bắt buộc đọc per SF)

## SF-1 Foundation — toolchain, root spec, drift-guard, Swagger UI
Tier: 0
linear: FI-327
Design: none
What: Bật BFF_ENABLE_API_DOCS=1 mở :8080/documentation thấy Swagger UI với tag System (3 pilot public endpoints healthz/health/version) và try-it-out /healthz trả 200 thật; drift-guard vitest chặn thêm/xóa route mà không sửa spec; tắt flag thì UI không tồn tại (fail-safe prod).
Depends on: —
Tasks: compat-verify plugins static-mode (fallback bundle) / root openapi.yaml (info+servers+12 tags bảng pin+3 securitySchemes) + pre-wire root refs tới 8 paths file + tạo 7 stub file (paths:{}) cho tier-1 fill / components envelopes (ErrorEnvelope+Paginated+401/403/404/422/502) / components enums dùng-chung / components parameters dùng-chung / paths system.yaml 3 pilot shapes thật / plugin api-docs flag-gated + wire app.ts / guard skip-list prefix /documentation / drift-guard test (auto-discovery paths/*.yaml per-file, normalize :param→{param}, harness devResetPassword option, flag-off, negative-control fake-route đỏ, helper export cho per-domain test file) / browser verify UI+try-it-out Rule 0 / regression vitest BFF xanh

## SF-2 Orders domain docs
Tier: 1
linear: FI-328
Design: none
What: Swagger UI có tag Orders (13 ops: filter/detail/audit/note/delivery-time/assign/complete-picking/history/export CSV/dashboard-stats/status-stats/time-slots/time-delivery) + tag Master Data (3 ops regions/delivery-staff/shops); schemas khớp response thật; try-it-out POST /fulfillment/filter với dev token trả Paginated đúng shape.
Depends on: SF-1
Tasks: author fulfillment.yaml filter+export-csv / detail OrderDetail / audit Manager-only / 4 mutations 422 shapes / complete-picking / dashboard+status-stats / time-slots+time-delivery / master-data 3 ops / cross-check mappers+api-contracts camelCase / drift-guard scoped 16 / try-it-out smoke filter+regions / UI walkthrough Orders+Master Data Rule 0

## SF-3 Batching docs
Tier: 1
linear: FI-329
Design: none
What: Tag Batches 9 ops đủ schemas — packing-suggest, create, filter, criteria, detail, cancel, recalculate-distance + criteria-presets GET/select; try-it-out /fulfillment/batches/criteria chạy thật.
Depends on: SF-1
Tasks: author batches.yaml packing-suggest+create / filter+criteria / detail+cancel / recalculate-distance / presets 2 ops / cross-check batching DTO+mapper / drift-guard scoped 9 / try-it-out criteria+UI walkthrough

## SF-4 Intake + Webhook docs
Tier: 1
linear: FI-330
Design: none
What: Tag Intake 8 ops (tạo đơn lẻ, import template CSV/preview multipart/confirm bulk, fail/redeliver, audit, by-batch) + tag Webhooks 1 op (POST /webhooks/orders HMAC X-Signature/X-Source) với description external-facing cho integrators và example signature chạy thật với dev server.
Depends on: SF-1
Tasks: author intake.yaml POST /orders / import flow template-csv+preview-multipart+confirm / fail+redeliver / audit+by-batch / webhook HMAC op+integrator docs / cross-check intake DTO+hmac+webhook-mapping / drift-guard scoped 9 / try-it-out template+webhook-curl-verify / UI walkthrough

## SF-5 Field Service docs
Tier: 1
linear: FI-331
Design: none
What: Tag Field Service 13 ops — delivery/service order filters, service-order lifecycle assign/accept/complete/reschedule, technicians suggest, service-employees CRUD+active+payment-account verify; role gates ghi đúng từng endpoint.
Depends on: SF-1
Tasks: author tech.yaml delivery-orders-filter / service-orders-filter / lifecycle 4 mutations / technicians-suggest / service-employees list+detail / create+update+active / payment-account-verify / cross-check tech+staffArea mappers / drift-guard scoped 13 / try-it-out suggest+UI walkthrough

## SF-6 Delivery last-mile + D2C docs
Tier: 1
linear: FI-332
Design: none
What: Tag Delivery 9 ops — quotes/planning-confirm/booking carrier NVC, cancel-delivery-order/cancel-batch, searchbookingdetail, D2C filter/note/export CSV BOM; try-it-out quotes + export CSV chạy thật.
Depends on: SF-1
Tasks: author delivery.yaml quotes+planning+booking / 2 cancels / searchbookingdetail / d2c filter / d2c note+export-csv / cross-check delivery-batch DTO / drift-guard scoped 9 / try-it-out quotes+csv+UI walkthrough

## SF-7 COD Settlement + Print docs
Tier: 1
linear: FI-333
Design: none
What: Tag COD Settlement 6 ops (confirm per-order/batch, pending, settlement, settlement CSV, settlement detail per-shop) + tag Print 6 ops (print PDF binary, printers list, print-errors counts, printers CRUD) — PDF tải về mở được, CSV có BOM đúng.
Depends on: SF-1
Tasks: author cod-print.yaml cod confirm+confirm-batch / pending+settlement / settlement.csv+detail / print-post-pdf+printers-list / print-errors-counts / printers CRUD 3 ops / cross-check settlement+print DTO+mapper / drift-guard scoped 12 / try-it-out cod-pending+printers / PDF binary verify / UI walkthrough

## SF-8 Platform/Admin docs
Tier: 1
linear: FI-334
Design: none
What: Tag Administration 8 ops (users CRUD+set-password/enabled, avatar upload multipart+serve image binary, reset-password x-dev-only) + tag Realtime & Transfers 5 ops (notifications 2 paths alias, SSE /events access_token query, transfer tickets 2 ops); SSE curl thật nhận event-stream.
Depends on: SF-1
Tasks: author platform.yaml users list+create / set-password+enabled+delete / avatar 2 ops / reset-password dev-only / notifications alias 2 paths / events SSE / transfer 2 ops / cross-check staffArea+transfer mappers+realtime-events / drift-guard scoped 13 / try-it-out notifications+users / SSE curl-verify / UI walkthrough

## SF-9 Convergence — verify toàn cục, regression, README, story close
Tier: 2
linear: FI-335
Design: none
What: Trên nhánh đích: Swagger UI walkthrough đủ 84 ops/12 tags, drift-guard full 84/84 xanh, try-it-out ≥1 op mỗi tag, secrets grep 0 hit, pnpm test + e2e toàn xanh không sửa test nào, README có section API docs, PR nhánh đích→main mở sẵn chờ người merge.
Depends on: SF-2, SF-3, SF-4, SF-5, SF-6, SF-7, SF-8
Tasks: bring-up nhánh đích rev-list guards / full drift 84/84 (DRIFT_FULL=1) + spot-audit examples vs contract tests / spec load $ref pass / UI walkthrough 12 tags Rule 0 / try-it-out matrix 12 tags / secrets audit grep binary / regression pnpm test + e2e E2E=1 / README API docs section + conventions / Linear audit comment + gh pr create chờ người merge
