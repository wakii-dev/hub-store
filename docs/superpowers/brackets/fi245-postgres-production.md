# Story: FI-245 — Production persistence: PostgreSQL + Docker + real auth

Destination: story/fi245-postgres-production

## SF-1 Postgres infra + seed pipeline
Tier: 0
linear:
What: compose postgres (2 DB qua initdb, healthcheck, volume) + env wiring cho app services + keycloak block + wait-db.sh dùng chung; seed pipeline script + reset util (deliverable — test standalone/dry-run; CHỈ chạy được sau khi migration của SF-2/SF-3 có — full-chain verify là SF-5); compose cleanup seed remnant (SEED_PATH/CANONICAL_SEED_PATH/depends_on cũ); .env.example
Depends on: —
Tasks: compose-postgres / initdb-2-databases / healthcheck-wiring / app-services-env-wiring / keycloak-service-block / wait-db-script / seed-pipeline-script / reset-db-util / db-seed-compose-wiring (depends_on migrate+seed completed-successfully) / compose-cleanup-seed-remnant / env-example-credentials / compose-config-verify

## SF-2 Orders Java → Postgres
Tier: 1
linear:
What: PostgresOrderRepository implements OrderRepository (11 method giữ nguyên semantics — filter COUNT(*) OVER() 1 query + LIKE escape, findByCodes CASE-ordering, findByFulfillCode dual ORD/RSA match, mutate transaction, history table), Flyway orders schema V1 + migrate-on-boot, seed-verify-on-boot fail-loud, datasource env + fail-loud impl selection, run.sh wait-db, unit test giữ InMemory + integration test skip-when-no-DB; acceptance standalone: migrate + seed-db.sh → data đúng
Depends on: SF-1
Tasks: flyway-orders-schema / postgres-repo-impl / filter-window-count-escape / findbycodes-ordering / dual-code-match / mutate-transaction / history-table-mapping / distinctshops-sql / seed-verify-boot / flyway-wiring-boot / datasource-config-env / impl-selection-conditional / runsh-wait-db / unit-tests-inmemory / integration-test-db

## SF-3 Batches Go → Postgres
Tier: 1
linear:
What: BatchStore interface + pgx v5 PostgresStore (Transition CAS SQL, CreateWithNextCode sequence + bootstrap setval max-seed khi trống, List ordering giữ semantics), bỏ LoadSeedFile (data do seed pipeline), golang-migrate batches schema V1, boot không phụ thuộc Java; acceptance standalone: migrate + seed-db.sh → BATCH-0001 thấy
Depends on: SF-1
Tasks: batchstore-interface / golang-migrate-batches-schema / pgx-impl-store / transition-cas-sql / create-next-code-sequence / list-ordering-semantics / remove-loadseedfile / migrate-entrypoint / go-mod-pin / dockerfile-update / unit-tests

## SF-4 OIDC auth thật (Keycloak)
Tier: 1
linear:
What: Keycloak realm import (roles Coordinator/WarehouseOps/Manager + users mẫu password literal dev-only trong realm JSON — KHÔNG env-substitution), shell login PKCE + silent renew + logout (pin oidc-client-ts), BFF verify JWKS (refresh unknown kid) + map realm_access.roles → x-user-role, loại fake-JWT khỏi runtime path, E2E login helper storageState
Depends on: SF-1
Tasks: keycloak-realm-import / roles-users-seed / shell-login-pkce / silent-renew-logout / bff-jwks-verify / roles-claim-map / remove-fakejwt-runtime / e2e-login-helper / e2e-specs-pass-auth

## SF-5 Convergence — production compose + E2E + deploy docs
Tier: 2
linear:
What: full compose chain verify (postgres → migrate one-shot → db-seed completed → apps — psql thấy ORD-3001/BATCH-0001 qua compose up); docker compose up --build full stack E2E với DB + auth thật; persistence proof restart; E2E 13/13 với E2E=1; boot-all.sh update; README deploy + backup pg_dump; security re-check. READ-ONLY apps/** (SF-6 sở hữu song song)
Depends on: SF-2, SF-3, SF-4
Tasks: compose-full-chain-verify / compose-full-build / persistence-restart-proof / e2e-13-green / bootall-update / readme-deploy-guide / backup-doc / security-recheck / audit-comment

## SF-6 UI/UX hiện đại hóa toàn web — antd4 refresh
Tier: 2
linear:
Design: mock-prototype
What: design-first bắt buộc (3 hướng HTML prototype shell+D1 → user chọn gate → hand-off direction); theme LESS tokens mới (palette #EB6E09, radius, shadow, spacing, typography), skeletons/empty-states, micro-interactions, login wrapper polish; phạm vi shell + D1 + D1b + D2 + D3 — 1 design system thống nhất; KHÔNG antd5; KHÔNG đổi testids/DOM mà E2E phụ thuộc; KHÔNG đổi business logic
Depends on: SF-2, SF-3, SF-4
Tasks: design-3-directions-user-gate / theme-tokens-LESS / shell-nav-refresh / login-wrapper / d1-orders-refresh / d1b-batching-modal-refresh / d2-fulfillment-refresh / d3-print-refresh / skeleton-empty-states / visual-verify-3-tiers
