# Story: FI-280 — Test toàn bộ website hub-store + fix bug

Destination: story/qa-hub-store-regression

Epic spec: /tmp/qa-story/epic-spec-draft.md (rubric P0–P3, coverage map 25 specs, file-ownership, wave schedule)

## SF-1 Baseline + Rubric (Tier 0)
Tier: 0
linear:
What: Boot-verify full stack main @ d107f2f 7/7 ports; chạy 25 e2e specs baseline đỏ/xanh; rubric + coverage map vào docs; fix bug infra/seed/boot/fixture trong baseline, route bug app sang SF domain; probe /tmp toolchains
Depends on: —
Tasks: boot-verify / e2e-baseline-run / rubric-doc / fix-infra-reds / route-app-bugs / toolchain-probe

## SF-2 Auth + Role Matrix sweep (Tier 1)
Tier: 1
linear:
What: Login 5 roles (Coordinator/WarehouseOps/Manager/Admin/WarehouseEmployee) + permission matrix ẩn-hiện đúng + logout/session-handling; DUY NHẤT được sửa shared permission files (usePermissions.tsx, nav config); nhận bug [PERM] từ SF khác
Depends on: SF-1
Tasks: login-5-roles / permission-matrix-walk / session-handling / fix-found-bugs / receive-perm-bugs / regression-spec-10xx / verify-no-regression (02-role-matrix)

## SF-3 Orders CRUD + D2C + Intake sweep (Tier 1)
Tier: 1
linear:
What: CRUD order + search/filter/pagination + validate form + i18n vi/en; intake flow; D2C consumer flow; order ops — walkthrough specs 01-main-flow, 04-regression-8b, 05-intake, 05-d2c, 07-order-ops
Depends on: SF-1
Tasks: crud-walk / intake-walk / d2c-walk / order-ops-walk / validation-i18n-walk / fix-found-bugs / regression-spec-11xx / verify-no-regression

## SF-4 Fulfillment lifecycle + Ops sweep (Tier 1)
Tier: 1
linear:
What: Lifecycle prep→assign→driver→deliver đúng trạng thái qua UI; audit trail các mutation qua UI; area-staff, settlement COD, tech-service, exception, cancel/edge cases — walkthrough specs 03-audit, 08-audit-viewer, 05-area, 05-settlement, 05-tech-service, 06-exception
Depends on: SF-1
Tasks: lifecycle-walk / audit-trail-check / area-walk / settlement-walk / tech-service-walk / exception-walk / edge-cases / fix-found-bugs / regression-spec-12xx / verify-no-regression

## SF-5 Batching/D1 + Realtime sweep (Tier 1)
Tier: 1
linear:
What: Tạo batch, DnD grouping, D1 realtime qua Kafka side-channel, map tracking; Kafka canary trước khi fix (Kafka chết ≠ bug app) — walkthrough specs 05-kafka, 07-realtime, 08-map
Depends on: SF-1
Tasks: batching-walk / d1-realtime-check / map-walk / kafka-canary / fix-found-bugs / regression-spec-13xx / verify-no-regression

## SF-6 KTV Mobile + PWA sweep (Tier 1)
Tier: 1
linear:
What: Mobile viewport :375 login/job list/nhận-hoàn thành job; offline + SW cache qua Playwright context offline; PWA install prompt manual checklist + screenshot; hard-reload hygiene (MF entry-poisoning) — walkthrough specs 08-mobile, 09-ktv-mobile, 08-pwa
Depends on: SF-1
Tasks: mobile-walk / pwa-offline-check / pwa-install-manual / sw-cache-hygiene / fix-found-bugs / regression-spec-14xx / verify-no-regression

## SF-7 Print/NVC + Admin sweep (Tier 1)
Tier: 1
linear:
What: In phiếu print-service, NVC adapter flows (runner run-nvc-private.sh pattern), dashboard, admin export, users.manage, webhook — walkthrough specs 05-nvc-api, 07-nvc-fe, 08-print-expansion, 08-export, 05-dashboard, 05-users, 09-webhook
Depends on: SF-1
Tasks: print-walk / nvc-walk / dashboard-walk / export-walk / users-walk / webhook-walk / fix-found-bugs / regression-spec-15xx / verify-no-regression

## SF-8 Convergence Regression (Tier 2)
Tier: 2
linear:
What: Merge SF-2 TRƯỚC TIÊN rồi SF-3..7 lên nhánh đích; full e2e suite 25 cũ + regression 10xx–15xx; reset-db replay trên nhánh đích; full monorepo typecheck + build; fix bug [PERM] queue; traceability bug-log P0–P2 ↔ regression specs; consolidate bug-log P3+ lên epic; final browser walkthrough smoke
Depends on: SF-2, SF-3, SF-4, SF-5, SF-6, SF-7
Tasks: merge-order / full-suite-run / reset-db-replay / cross-flow-sanity / perm-bug-queue-fix / bug-traceability / p3-log-consolidate / final-walkthrough
