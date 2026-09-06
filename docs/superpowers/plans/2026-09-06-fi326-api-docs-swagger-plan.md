# FI-326 API Docs Swagger — Epic Plan (SF DAG + task inventory)

> Spec: docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md ·
> Bracket: docs/superpowers/brackets/fi326-api-docs-swagger.md ·
> Branch đích: `story/fi326-api-docs-swagger` (APPROVE tạo từ main)

## DAG (tiers)

```
Tier 0: SF-1 foundation
Tier 1: SF-2 orders · SF-3 batching · SF-4 intake+webhook · SF-5 tech ·
        SF-6 delivery+d2c · SF-7 cod+print · SF-8 platform   (song song,
        mỗi SF fork từ nhánh đích SAU khi SF-1 merged)
Tier 2: SF-9 convergence
```

## Task inventory per SF

### SF-1 Foundation (Tier 0) — 11 tasks
1. Compat verify: cài `@fastify/swagger@^9` + `@fastify/swagger-ui@^6`, boot
   harness static-mode mini-spec → verdict go/fallback (`swagger-ui-dist` +
   `@fastify/static`) — ghi verdict vào Linear notes
2. `openapi/openapi.yaml` root: info (title Hub Store BFF API, version theo
   package), server dev `http://localhost:8080` (URL canonical — KHÔNG
   parametrize theo PORT_BFF per-SF, spec là tài liệu), **12 tags**
   (bảng pin spec §4), securitySchemes
   `bearerAuth` (JWT Bearer) / `webhookHmac` (header X-Signature) /
   `accessTokenQuery` (query access_token)
3. `components/envelopes.yaml`: ErrorEnvelope + ErrorDetail + Paginated +
   responses 401/403/404/422/502 templates (shape khớp `lib/envelope.ts` +
   `app.ts` error handler — code BAD_REQUEST/INTERNAL/UNAUTHENTICATED/...)
4. `components/enums.yaml`: KNOWN_ROLES (7), batchStatus, orderStatus,
   deliveryStatus… (nguồn `packages/shared` enums — READ-ONLY tham chiếu)
5. `components/parameters.yaml`: page/pageSize, path param `code`/`fulfillCode`
   /`userId`/`orderCode`/`batchCode`/`shopCode`/`printerId` chuẩn hoá
6. `paths/system.yaml`: GET /healthz + GET /health (200/503 degraded shapes)
   + GET /version — 3 pilot public, không `security`. **Pre-wire root cho
   tier-1**: root `$ref` sẵn tới CẢ 8 paths file + tạo 7 STUB file
   (`paths: {}` — fulfillment/batches/intake/tech/delivery/cod-print/
   platform.yaml); tier-1 chỉ fill stub của mình, KHÔNG chạm root nữa
   (tránh xung đột merge 7-way trên file SF-1-owned)
7. `src/plugins/api-docs.ts` + wire `app.ts`: env `BFF_ENABLE_API_DOCS=1` →
   register swagger static + swagger-ui prefix `/documentation`; unset →
   không mount (fail-safe)
8. `plugins/auth.ts` skip-list: `/documentation` prefix (UI assets + `/json`)
   — chỉ khi flag bật; không đổi behavior route khác
9. `test/openapi.drift.test.ts`: harness app routes ↔ spec.paths.
   **Semantics PIN**: (a) test TỰ KHÁM PHÁ mọi `paths/*.yaml` tồn tại —
   assertion per-file (SF-1 xanh với đúng 3 ops, không đòi 84); (b)
   assertion NGƯỢC "mọi route harness phải thuộc SOME spec file" (full
   check) CHỈ BẬT ở SF-9 (env flag `DRIFT_FULL=1`); (c) mỗi SF domain tạo
   test file RIÊNG `test/openapi.drift.<domain>.test.ts` gọi helper export
   của SF-1 với file paths của mình — không ai sửa file drift chung;
   (d) FAIL message chỉ rõ method+path lệch. Rules: normalize `:param` →
   `{param}` 2 chiều trước khi so (note: find-my-way regex-param `:p(re)`
   chỉ lấy phần tên trước `(`); boot qua HarnessOptions option
   `devResetPassword: true` (SF-1 thêm option — harness hiện hardcode false
   → route conditional /auth/reset-password sẽ không mount) +
   BFF_ENABLE_API_DOCS unset khi extract (tránh bắt nhầm /documentation
   routes); **negative control** (exit criteria): thêm route giả vào spec →
   test ĐỎ → revert (chứng minh guard bắt được lệch, không phải luôn-xanh)
10. Browser verify Rule 0: UI load được, 3 pilot ops render, try-it-out
    `/healthz` 200 thật; screenshot/đọc DOM làm bằng chứng
11. Regression: `pnpm --filter @hub-store/bff-gateway test` toàn xanh;
    commit atomic + tick plan file

### SF-2 Orders domain (Tier 1, deps SF-1) — 12 tasks
1. `paths/fulfillment.yaml`: POST /fulfillment/filter (FilterOrdersRequest →
   Paginated[HubStoreOrderFilterItem]) + GET /fulfillment/orders/export.csv
   (query mirror body, CSV binary + BOM note)
2. GET /fulfillment/{fulfillCode} — OrderDetail (items[], shop hub… từ mapper)
3. GET /fulfillment/audit — Manager-only: security + AuditEntry schema + 403
4. Mutations: POST /fulfillment/{code}/assign-shop-hub · POST …/history ·
   PUT …/note · PUT …/delivery-time (422 details[] shapes riêng từng endpoint)
5. PUT /fulfillment/complete-picking (batchCode body → BatchDto)
6. GET dashboard-stats + GET order-status-stats (aggregation schemas)
7. GET /fulfillment/time-slots + GET /order-promising/time-delivery
8. Master-data: GET /master-data/{regions,delivery-staff,shops}
9. Cross-check: schema ↔ `mappers/fulfillment.ts` + `api-contracts/
   fulfillment.ts` (READ-ONLY — không sửa package shared) — checklist từng
   field name camelCase
10. Drift-guard scoped pass 16 ops (test riêng slice prefix /fulfillment,
    /master-data, /order-promising)
11. Try-it-out smoke: /master-data/regions + /fulfillment/filter với dev
    token (200, shape khớp schema) — bằng chứng browser
12. UI walkthrough tag Orders (Rule 0) + vitest BFF xanh + commit

### SF-3 Batching (Tier 1, deps SF-1) — 8 tasks
1. POST /fulfillment/batches/packing-suggest + POST …/create
2. POST …/batches/filter + GET …/batches/criteria
3. GET …/batches/{code} + PUT …/batches/{code}/cancel (batchStatus revert 0)
4. POST …/batches/recalculate-distance (+ OrderDistance[])
5. GET /batching/criteria-presets + POST /batching/criteria-preset-select
6. Cross-check vs `api-contracts/batching.ts` + `mappers/batching.ts`
7. Drift-guard scoped 9 ops + try-it-out /fulfillment/batches/criteria
8. UI walkthrough + vitest + commit

### SF-4 Intake + webhook (Tier 1, deps SF-1) — 9 tasks
1. POST /orders (IntakeOrderDto — api-contracts/intake)
2. Import flow: GET /orders/import/template (**text/csv +
   `Content-Disposition: attachment`** — kiểm BOM trong `templateCsv()`,
   phản ánh đúng) + POST /orders/import/preview (multipart/form-data file)
   + POST /orders/import/confirm (bulk)
3. POST /orders/{code}/fail + POST /orders/{code}/redeliver (state notes)
4. GET /orders/{code}/audit + GET /orders/by-batch/{batchCode}
5. POST /webhooks/orders — security `webhookHmac`; headers X-Signature/X-Source
   (đúng `lib/hmac.ts`), raw JSON body, response shapes + external-facing
   description (retry semantics, signature scheme) cho integrators
6. Cross-check vs `api-contracts/intake.ts` + `mappers/intake.ts` +
   `lib/webhook-mapping.ts` (READ-ONLY)
7. Drift-guard scoped 9 ops
8. Try-it-out: /orders/import/template (JWT) + webhook example curl với
   signature sinh đúng scheme (verify với server dev thật)
9. UI walkthrough + vitest + commit

### SF-5 Tech + service employees (Tier 1, deps SF-1) — 10 tasks
1. POST /delivery-orders/filter (DeliveryFilterBody)
2. POST /service-orders/filter (InstallationFilterBody)
3. Lifecycle: POST /service-orders/{code}/{assign,accept,complete,reschedule}
   (4 mutation schemas + trạng thái lỗi 409/422 nếu route có)
4. GET /technicians/suggest?regionCode
5. GET /service-employees + GET /service-employees/{code}
6. POST /service-employees + PUT /service-employees/{code} +
   PUT /service-employees/{code}/active
7. POST /service-employees/payment-account/verify (bank account schema)
8. Cross-check vs `mappers/tech.ts` + `mappers/staffArea.ts` (READ-ONLY)
9. Drift-guard scoped 13 ops + try-it-out /technicians/suggest
10. UI walkthrough + vitest + commit

### SF-6 Delivery last-mile + D2C (Tier 1, deps SF-1) — 9 tasks
1. POST /delivery-batch/quotes + POST …/planning/confirm + POST …/booking
2. POST …/cancel-delivery-order + POST …/cancel-batch
3. GET /delivery-batch/searchbookingdetail
4. POST /d2c-orders/filter
5. PUT /d2c-orders/{orderCode}/note + GET /d2c-orders/export (CSV BOM)
6. Cross-check vs `api-contracts/delivery-batch.ts` + mappers (READ-ONLY)
7. Drift-guard scoped 9 ops
8. Try-it-out: delivery-batch/quotes + d2c export CSV (binary download)
9. UI walkthrough + vitest + commit

### SF-7 COD + print + printers (Tier 1, deps SF-1) — 11 tasks
1. POST /cod/confirm + POST /cod/confirm-batch (collectedAmount, VN date
   format note)
2. GET /cod/pending + GET /cod/settlement (from/to bounds)
3. GET /cod/settlement.csv (CSV) + GET /cod/settlement/detail (per-shop)
4. GET /fulfillment/print/printers + POST /fulfillment/print (PDF binary
   response — `format: binary`)
5. GET /fulfillment/print-errors/counts
6. Printers CRUD: GET /fulfillment/printers + POST + PUT …/{shopCode}/{printerId}
7. Cross-check vs `api-contracts/settlement.ts` + `print.ts` +
   `mappers/print.ts` (READ-ONLY)
8. Drift-guard scoped 12 ops
9. Try-it-out: /cod/pending + /fulfillment/print/printers (200 shapes)
10. Verify PDF binary response trong UI (download hoạt động — không
    corrupt). Prerequisite: print-job context thật (batch/order + printer
    registered) — nếu dev stack thiếu → seed qua `scripts/seed-db.sh`/seed
    JSON trước, hoặc hạ evidence bar về: content-type `application/pdf` +
    magic bytes `%PDF` ở đầu body
11. UI walkthrough + vitest + commit

### SF-8 Platform/admin (Tier 1, deps SF-1) — 12 tasks
1. GET /users + POST /users (username pattern `^[a-zA-Z0-9._-]{3,64}$`,
   password min 8, role enum — ghi đúng validation 422)
2. POST /users/{userId}/set-password + PUT /users/{userId}/enabled (self-lock
   note) + DELETE /users/{userId}
3. POST /avatar (multipart ≤5MB) + GET /avatar/{userId} (image binary,
   content-type thật)
4. GET /notifications + GET /api/notifications — 2 alias CÙNG handler
   (nginx strip `/api` khi compose; dev gọi thẳng — nguồn thật
   `routes/notifications.ts`): doc 1 operation logic, 2 paths; response
   `{items,total}` (không echo page/pageSize), 503
   NOTIFICATIONS_UNAVAILABLE shape
5. POST /fulfillment/{code}/transfer-tickets + GET /fulfillment/transfer-tickets
6. GET /events — SSE: security `accessTokenQuery`, `text/event-stream`,
   event payload schemas (từ `lib/realtime-events.ts`), connection-cap note
7. POST /auth/reset-password — `x-dev-only: true` + description rõ điều kiện
   mount (ENABLE_DEV_RESET_PASSWORD) + public security note
8. Cross-check vs `mappers/staffArea.ts` + libs (READ-ONLY)
9. Drift-guard scoped 13 ops
10. Try-it-out: GET /notifications với dev token
11. SSE accuracy: curl thật `?access_token=…` nhận event-stream (verify với
    server dev) — bằng chứng
12. UI walkthrough + vitest + commit

### SF-9 Convergence (Tier 2, deps SF-2..8) — 9 tasks
1. Nhánh đích bring-up: verify mọi tier-1 merged (rev-list count = 0 mỗi
   sf-branch), pull nhánh đích
2. Full drift-guard 84/84 chạy trên nhánh đích — xanh (bật
   `DRIFT_FULL=1` — assertion mọi route thuộc SOME spec file) +
   **spot-audit examples**: đối chiếu examples/response schema của ≥1 op
   đại diện mỗi file paths với contract tests thật (`test/*.contract.test.ts`)
   — bắt shape lệch R2-c
3. Spec load pass: parser load toàn bộ $ref multi-file — 0 broken link
4. UI walkthrough TOÀN BỘ 12 tags trên nhánh đích (browser Rule 0, evidence)
5. Try-it-out matrix: ≥1 endpoint mỗi tag × 12 tags chạy OK
6. Secrets audit: grep dev passwords/token thật trong `openapi/` = 0 hit
7. Regression: `pnpm test` workspace + e2e Playwright (`E2E=1 bash
   scripts/boot-all.sh` rồi `cd e2e && pnpm exec playwright test`; hoặc
   runner pattern `e2e/scripts/run-*-private.sh` nếu cần stack riêng) —
   toàn xanh
8. README section "API docs" (cách bật flag, mở UI, đọc spec) + ghi
   drift-guard vào conventions
9. Story close: merge state sạch, Linear audit comment (SF→hash map), PR
   nhánh đích → main chuẩn bị cho người merge

## Parallelism + môi trường boot tier-1 (PIN — agents không tự quyết)

- **Wave policy (cap-4)**: tier-1 = 7 SF > 4 in-flight slots → chạy 2 wave:
  wave 1 = SF-2, SF-3, SF-4, SF-5 · wave 2 = SF-6, SF-7, SF-8. Wave 2 fork
  từ nhánh đích SAU khi wave-1 SF tương ứng merged (nhánh đích tiến —
  re-fork/base mới nhất trước khi start; SF bị queue rebase/fork lại từ
  nhánh đích mới nếu nhánh đích tiến trước khi start).
- **Port phân hoạch per-SF (boot BFF thật để try-it-out)**: SF-2 `PORT_BFF=18081`,
  SF-3 `18082`, SF-4 `18083`, SF-5 `18084`, SF-6 `18085`, SF-7 `18086`,
  SF-8 `18087` — tránh port war khi chạy chồng. Spec server URL giữ
  canonical `http://localhost:8080` (tài liệu, không theo port boot).
- **Bootstrap mỗi worktree SF**: copy `.env` từ main worktree (gitignored —
  worktree mới KHÔNG có; `config.ts` load dotenv path tương đối → thiếu
  .env = OIDC/secret mặc định lệch, try-it-out 401/503 bí ẩn).
- **Stack yêu cầu cho try-it-out**: main compose stack (postgres + keycloak
  + 4 services gRPC + BFF) chạy sẵn từ main worktree; SF worktree chỉ boot
  BFF riêng với PORT_BFF override khi cần smoke isolated, hoặc dùng BFF
  chính :8080 (đơn giản nhất — khuyến nghị mặc định; port riêng chỉ khi
  cần test boot độc lập).
- **Merge topology**: mỗi SF run TỰ merge nhánh của mình về nhánh đích khi
  Done (chuỗi merge-ngược + ancestor-guard — merge-playbook; nhánh đích có
  thể tiến giữa các merge — KHÔNG branch -f). Coordinator giám sát; SF-9
  chỉ bắt đầu sau khi cả 7 merged (rev-list count = 0 từng branch).
- **File tách bạch tier-1**: mỗi SF 1 paths/*.yaml (SF-1 pre-wire root refs
  + stub — tier-1 fill stub, root/components/plugin/harness/drift-test-file
  READ-ONLY). Mỗi SF 1 drift test file riêng `test/openapi.drift.<domain>.test.ts`.

## Verification per SF (lặp cấu trúc, không duplicate nội dung)

Mỗi SF: drift-guard scoped + try-it-out smoke đại diện + UI walkthrough tag
mình + vitest BFF — đúng 4 lớp, gate story-test yêu cầu browser evidence.
SF-9 cộng toàn cục (84/84 + regression e2e + secrets audit).
Dev token (mọi try-it-out): `python3 e2e/scripts/mint_sf11.py
<manager|coordinator|admin> /tmp/auth.json` — script có sẵn, không tự viết
mint mới. Secrets audit binary: grep 2 literal password dev trong openapi/
= 0 hit (xem spec §5 AC6).
