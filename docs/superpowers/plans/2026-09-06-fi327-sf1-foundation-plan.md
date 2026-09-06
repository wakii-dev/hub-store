# Plan: SF-1 Foundation — toolchain + root spec + drift-guard + Swagger UI
Date: 2026-09-06 | Linear: FI-327 | Worktree: sf-1-api-docs-foundation | Story: FI-326
Spec slice: docs/superpowers/contexts/sf-1.md (khung CỨNG — không đổi) · Epic spec §4-5 · Bracket SF-1

## 0. Root cause analysis (WHY)

- **Root cause**: BFF là bề mặt REST duy nhất (84 ops) nhưng docs = 0; code tiến nhanh hơn docs
  (REQUIREMENTS §5 chốt 18 endpoints → thực tế 84, drift 4.6x) và không có cơ chế nào ngăn tiếp diễn.
- **Current state**: dev/FE/QA đọc 3853 dòng `routes/*.ts` để hiểu contract; integrators webhook không có gì.
- **Expected outcome**: SF-1 tạo NỀN cho 7 SF domain kế thừa — root spec + shared components + drift-guard +
  Swagger UI mount flag-gated + pilot System 3 ops. UI mở được với flag, schemas khớp code thật, drift-guard
  bắt được lệch, spec load pass.
- **Constraints**: KHÔNG đổi runtime behavior (31 test files + 31 e2e specs là regression surface); schema-in-route
  BỊ LOẠI (Ajv đổi 422→400 + serialization lọc field); config.ts/route files KHÔNG trong touch map.
- **Strategy**: standalone OpenAPI YAML multi-file là SSOT (D1); BFF serve UI dev-only flag (D2); spec tiếng Anh (D3);
  REST-only (D4). Tier-1 fork SAU khi SF-1 merge — root/components KHÔNG bị sửa lại sau fork.

## 1. Problem

Nền docs chưa tồn tại: chưa có deps swagger, chưa có thư mục `openapi/`, chưa có UI, chưa có guard — mọi SF domain
đều blocked. SF-1 là duy nhất được chạm `test/harness.ts` (thêm 1 option).

## 2. Scope

- **In scope**: deps `@fastify/swagger@^9` + `@fastify/swagger-ui@^6`; `openapi/` root + components + pilot
  system.yaml + 7 stub; plugin `api-docs.ts` flag-gated; guard skip-list `/documentation`; drift-guard test +
  HarnessOptions.devResetPassword; browser verify Rule 0; regression BFF xanh.
- **Out of scope**: author paths domain (SF-2..8); sửa `src/routes/**`; sửa components/root SAU khi tier-1 fork;
  README/CHANGELOG (SF-9); gRPC docs.
- **Success criteria (ACCEPTANCE — user-visible, từ context pack, binary)**:
  1. `BFF_ENABLE_API_DOCS=1 pnpm --filter @hub-store/bff-gateway dev` → mở `http://localhost:8080/documentation`:
     Swagger UI render, sidebar thấy tag System với 3 ops — evidence browser Rule 0 (DOM/VISUAL/FLOW).
  2. Try-it-out trong UI: `GET /healthz` → 200 `{"status":"ok"}` THẬT; `GET /version` → 200 version có/null.
  3. Flag unset → `/documentation` 404 (fail-safe) + app boot bình thường.
  4. Thêm route giả vào spec (in-memory negative control) → drift test ĐỎ với message method+path rõ; bỏ → xanh.
  5. `pnpm --filter @hub-store/bff-gateway test` toàn workspace BFF xanh.

## 3. Touch map (PIN từ context pack — không mở rộng)

```
services/bff-gateway/
├─ openapi/                                  # TẠO MỚI
│  ├─ openapi.yaml                           #   root + pre-wire refs 8 paths file
│  ├─ components/{envelopes,enums,parameters}.yaml
│  └─ paths/system.yaml                      # pilot (SF-1 author)
│  └─ paths/{fulfillment,batches,intake,tech,delivery,cod-print,platform}.yaml  # 7 STUB paths:{}
├─ src/plugins/api-docs.ts                   # TẠO MỚI
├─ src/app.ts                                # EDIT: 1 dòng register plugin
├─ src/plugins/auth.ts                       # EDIT: +1 skip prefix /documentation
├─ test/openapi.drift.test.ts                # TẠO MỚI + export helper
├─ test/harness.ts                           # EDIT: HarnessOptions + devResetPassword (SF-1 DUY NHẤT)
└─ package.json                              # EDIT: +2 deps
```
READ-ONLY (nguồn shapes): `src/routes/**`, `src/lib/{envelope,grpc-error}.ts`, `packages/shared/src/api-contracts/envelopes.ts`,
`src/plugins/auth.ts` KNOWN_ROLES. Consumers/regression: 31 test files `services/bff-gateway/test/`, dev boot
`src/server.ts`, guard `plugins/auth.ts`. Shared surfaces: 2 URL mới `/documentation`, `/documentation/json`
(dev-only, flag-gated) — KHÔNG đổi route/DB/env schema nào (flag mới = additive).

## 4. Design

- **Approach**: đúng D1-D4 epic. Compat verify task ĐẦU — **probe đã chạy (/tmp sandbox, chưa đụng repo)**:
  `@fastify/swagger@9.8.1` static mode chỉ `yaml.parse` root file (source `lib/mode/static.js` — KHÔNG resolve
  external `$ref`; `/documentation/json` trả `paths: {$ref}` thô) → **verdict FALLBACK** (đúng nhánh PIN):
  bundle multi-file → 1 doc (bundler function nhỏ, resolve map-level file-ref + JSON-pointer ref, dùng `yaml`)
  rồi serve qua `swagger-ui-dist` + `@fastify/static` (UI assets + `spec.json` in-memory) — fallback thay cách
  spec-loading, KHÔNG chỉ cách serve UI. Verdict + evidence ghi Linear notes ở T1; deps cuối = `yaml` +
  `swagger-ui-dist` + `@fastify/static` (không cài 2 plugin swagger chết).
- **Flag pattern**: plugin tự đọc `process.env.BFF_ENABLE_API_DOCS === '1'` (pattern `=== '1'` như
  `ENABLE_DEV_RESET_PASSWORD` trong `config.ts:198`). `config.ts` KHÔNG trong touch map → không thêm BffConfig field
  (deviation có chủ đích, flag ở Linear notes). Harness boot = flag off mặc định → extraction sạch.
- **Skip-list**: `request.url.startsWith('/documentation')` đặt cạnh các public-skip hiện có — phủ UI assets +
  `/documentation/json` + `oauth2-redirect.html` + query strings. KHÔNG prefix `/document…` khác — string chuẩn.
- **Drift-guard semantics** (PIN spec slice a-h): auto-discovery `openapi/paths/*.yaml` per-file; full reverse check
  (mọi route ∈ SOME file) CHỈ khi `DRIFT_FULL=1`; normalize `:param` ↔ `{param}` 2 chiều (find-my-way regex-param
  `:p(re)` lấy tên trước `(`); HarnessOptions `devResetPassword` (default false giữ nguyên behavior); flag-off khi
  extract; FAIL message `method+path`; export helper cho per-domain test file; negative control in-memory
  (parse spec → thêm fake path → comparator phải ném lỗi) — không đụng file trên disk.
- **Alternatives dismissed**: schema-in-route (vỡ contract test + e2e); swagger-jsdoc (comment-driven drift im lặng);
  codegen TS-types (ngoài D1); parametrize server URL theo PORT_BFF (spec = tài liệu, URL canonical :8080).
- **Edge cases**: public pilot ops KHÔNG khai `security`; 503 degraded shape /health; version null-able;
  find-my-way `:param(regex)` sanitize; webhook nested-scope route (SF-4 lo, nhưng full-check DRIFT_FULL ở SF-9
  phải thấy nó thuộc intake.yaml).
- **Non-functional**: security — examples synthetic (`ORD-000123`, `SHOP-001`), 0 secret/dev-credential; perf —
  plugin chỉ mount khi flag; maintenance — helper export để SF-2..8 không sửa file chung.

## 5. Implementation outline — 11 tasks (DAG tuyến tính, single-dev inline)

| # | Task | Nội dung + exit criteria | Commit |
|---|------|--------------------------|--------|
| 1 | **Compat verify toolchain** | Cài `@fastify/swagger@9.x` + `@fastify/swagger-ui@6.x` (pin exact); mini-spec 2 file (root + system pilot tạm) → boot qua harness script `test/` tạm hoặc node script → `GET /documentation/json` chứa paths ĐÃ RESOLVE từ file con + UI assets serve được. **GO** nếu multi-file resolve; **FALLBACK** nếu không: viết bundle script + serve `swagger-ui-dist` qua `@fastify/static`, verdict + code theo hướng đó từ task 7. Verdict (go/fallback + version pin) ghi Linear notes. | `chore(bff): add swagger deps + compat verdict` |
| 2 | **Root `openapi/openapi.yaml`** | info (title `Hub Store BFF API`, version literal `0.1.0` — package.json không có field version), server `http://localhost:8080`, **12 tags đúng bảng PIN** epic §4 (System/Orders/Master Data/Batches/Intake/Webhooks/Field Service/Delivery/COD Settlement/Print/Administration/Realtime & Transfers — tổng 84), securitySchemes ĐÚNG 3 tên (`bearerAuth` HTTP bearer JWT / `webhookHmac` apiKey header `X-Signature` / `accessTokenQuery` apiKey query `access_token`), `$ref` tới cả 8 `paths/*.yaml`. Exit: YAML parse OK bằng yaml lib trong test tạm. | `feat(bff): openapi root spec — 12 tags + securitySchemes + pre-wire` |
| 3 | **`components/envelopes.yaml`** | `ErrorEnvelope {statusCode:int, message:string, code?:string, details?:ErrorDetail[]}` + `ErrorDetail {field,message}` khớp 1:1 `api-contracts/envelopes.ts` (READ-ONLY); `Paginated` base `{items[],total,page,pageSize}` + convention compose qua allOf (ghi description); response templates 401/403/404/422/503 với `code` thật từ `grpc-error.ts` (`UNAUTHENTICATED`,`PERMISSION_DENIED`,`NOT_FOUND`,`VALIDATION_ERROR`,`UPSTREAM_UNAVAILABLE`) + 400 `BAD_REQUEST`/500 `INTERNAL` từ `app.ts` setErrorHandler. **+409 `CONFLICT` + 422 `PRECONDITION_FAILED`** (plan-critic P1: `grpc-error.ts:125-153` phát 409 qua ≥4 domain tier-1 — printers/transfer/tech/fulfillment-assign, 422-PRECONDITION qua deliverybatch; không thêm giờ = 4 REQUIREMENT-GAP sau fork). **NOTE spec-typo**: context pack ghi "502" nhưng code thật = 503 `UPSTREAM_UNAVAILABLE` (grep 502 = 0 hit) → dùng 503, flag Linear notes. | `feat(bff): shared envelope components` |
| 4 | **`components/enums.yaml`** | KNOWN_ROLES 7 giá trị (nguồn `plugins/auth.ts:26-34` PIN); batchStatus/orderStatus CHỈ nếu probe ≥2 domains thật sự dùng (grep routes) — không đủ thì KHÔNG thêm (context pack: chỉ enum dùng chung ≥2 domains). | `feat(bff): shared enum components` |
| 5 | **`components/parameters.yaml`** | query `page`/`pageSize` (default theo code); path params `code`,`fulfillCode`,`userId`,`orderCode`,`batchCode`,`shopCode`,`printerId` chuẩn hoá (pattern từ routes thật). Exit testable: file parse OK + mỗi param có `name`/`in`/`schema`/`description`; bundler resolve được khi ref vào root (test tại T9 trọn gói). | `feat(bff): shared parameter components` |
| 6 | **`paths/system.yaml` + 7 stub** | Pilot 3 ops shapes THẬT (đã đọc code): `GET /healthz` → 200 `{status:'ok'}` (app.ts:80); `GET /health` → 200 `{status:'ok', db:{fulfillment:'ok'\|'disabled'}}` \| 503 `{status:'degraded', db:{fulfillment:'down'}}` (app.ts:87-99); `GET /version` → 200 `{version: string\|null}` (meta.ts) — tag System, KHÔNG `security`. Tạo 7 STUB `paths/{fulfillment,batches,intake,tech,delivery,cod-print,platform}.yaml` = `paths: {}` → root refs resolve đủ. Exit: load root qua yaml → refs không dangling. | `feat(bff): system pilot paths + tier-1 stubs` |
| 7 | **Plugin `src/plugins/api-docs.ts` + wire `app.ts`** *(chạy SAU T8 — plan-critic P0)* | `registerApiDocs(app)`: flag `process.env.BFF_ENABLE_API_DOCS === '1'` → bundle spec (bundler từ T1) + serve swagger-ui-dist qua `@fastify/static` prefix `/documentation` (index.html inline config + `/documentation/spec.json` in-memory); unset → KHÔNG register. `app.ts` +1 dòng `void app.register(registerApiDocs)`. Exit: boot harness flag=1 → inject `/documentation` + `/documentation/spec.json` 200 (skip-list đã có từ T8 → không 401); flag unset → **401 anonymous / 404 authed** (guard chạy trước routing — literal "404" của ACCEPTANCE chỉ đúng với caller có token; deviation pin Linear notes, semantics fail-safe "UI không được serve" giữ nguyên). | `feat(bff): api-docs plugin flag-gated + app wiring` |
| 8 | **Guard skip-list** *(chạy TRƯỚC T7 — no-op prefix check an toàn khi plugin chưa mount)* | `plugins/auth.ts`: thêm block `startsWith('/documentation')` return (cạnh public skips) — KHÔNG đổi behavior khác. Exit: `/fulfillment/filter` VẪN 401 không token (regression nhanh); skip mới không match route nào khác (grep prefix). | `feat(bff): auth skip-list /documentation prefix` |
| 9 | **Drift-guard `test/openapi.drift.test.ts` + helper** | `test/harness.ts`: HarnessOptions `devResetPassword?: boolean` → dòng 536 `devResetPassword: opts.devResetPassword ?? false`. Test: (a) auto-discovery `openapi/paths/*.yaml` — per-file assertion (3 ops system pass, stub rỗng pass); (b) reverse full check chỉ khi `DRIFT_FULL=1`; (c) normalize `:param`↔`{param}` 2 chiều + sanitize regex `(name)`; (d) boot `startHarness({devResetPassword:true})` + `BFF_ENABLE_API_DOCS` unset; (e) FAIL message method+path; (f) export helper `runOpenApiDrift(options)` cho SF-2..8; (g) negative control IN-MEMORY: parse system.yaml → thêm `GET /fake-route` → expect comparator throw message chứa method+path; hàm so spec-file riêng biệt nên test tự quay xanh khi bỏ mutation. **Điểm quyết định probe (plan-critic P1)**: extract routes probe `app.router.routes` TRƯỚC — shape không public/ổn → fallback `app.printRoutes({commonPrefix:false})` parse; quyết định ghi trong code comment. Exit: vitest file mới xanh + khẳng định negative đỏ. | `test(bff): openapi drift guard + harness option` |
| 10 | **Browser verify Rule 0 (3 tầng)** | Boot BFF :8080 `BFF_ENABLE_API_DOCS=1` (compose chết — host-run `pnpm --filter @hub-store/bff-gateway dev`, .env có sẵn OIDC_ISSUER; pilot ops public không cần KC). **T1 DOM**: orca snapshot — sidebar có tag System + 3 ops healthz/health/version. **T2 VISUAL**: screenshot Swagger UI lưu evidence. **T3 FLOW**: nút Try it out `/healthz` → Execute → response 200 `{"status":"ok"}` THẬT; `/version` → 200. Sau đó restart KHÔNG flag → `/documentation` **không serve UI (401 anonymous / 404 authed)** — ghi evidence. FAIL ở tầng nào → FIX trước khi qua reviewer. KHÔNG nói "UI hoạt động" khi chưa THẤY. | không commit (evidence → Linear) |
| 11 | **Regression + hygiene** | `pnpm --filter @hub-store/bff-gateway test` toàn xanh (32 file cũ + drift mới); `pnpm --filter @hub-store/bff-gateway build` (tsc) sạch; **secrets grep 0 hit**: `grep -rE "gY0pM9SO7QEmqil_lWHQ\|GSzIMCBcUNtcbKwnTn_o" services/bff-gateway/openapi/` (epic acceptance 6 — quét sớm trước 7 SF kế thừa); git status sạch, commits atomic. Exit: output test đính Linear. | `chore(bff): sf-1 foundation wrap-up` (nếu còn sót) |

**DAG** (sau plan-critic FIX-P0: T8 chạy TRƯỚC T7): 1 → 2 → 3/4/5 (độc lập, tuần tự) → 6 → **8** (skip-list no-op) → **7** (plugin, cần verdict T1) → 9 (cần 2-8) → 10 (cần 7+8) → 11.

## 6. Risks & unknowns

- **R1 static-mode $ref**: `@fastify/swagger` static mode có thể KHÔNG resolve external `$ref` (biến thể theo minor
  version) — Task 1 probe TRƯỚC, fallback path đã PIN (bundle + swagger-ui-dist + @fastify/static).
- **R2 find-my-way routes access**: extract routes qua public surface — probe `app.router.routes` (Fastify 5) tại T9;
  nếu shape khác → dùng `app.printRoutes({commonPrefix:false})` parse, hoặc candidate-list từ spec + `app.hasRoute`
  cho hướng spec→code (per-file vẫn đủ; reverse full-check dùng printRoutes).
- **R3 502 vs 503 spec-typo**: đã probe code — 503 đúng; flag Linear notes, KHÔNG REQUIREMENT-GAP (resolvable).
- **R4 guard skip-list quá rộng?** `startsWith('/documentation')` chỉ match URL mới của plugin (không route nào
  khác bắt đầu bằng prefix này — grep xác nhận tại T8).
- **R5 port 8080**: compose hubstore không chạy (probe 000, docker chỉ có project khác) → host-run BFF :8080 an toàn;
  nếu chiếm lúc verify → dùng `PORT_BFF=18081` và mở UI tại đó (try-it-out vẫn target cùng origin — server URL
  canonical chỉ là default display; swagger-ui try-it-out theo server URL → cần chọn server trong UI hoặc chấp nhận
  URL :8080; ưu tiên giải phóng :8080).
- **Must verify trước khi code**: (đã probe) deps tồn tại registry 9.8.1/6.1.1 · branch = fork point story (0/0) ·
  .env đã copy · baseline test (đang chạy nền).
- **Unverified assumptions**: static-mode resolve multi-file (R1 — T1 trả lời); find-my-way public shape (R2 — T9).
