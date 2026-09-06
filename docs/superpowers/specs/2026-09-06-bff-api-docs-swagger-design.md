# BFF API Docs (OpenAPI/Swagger) — Epic Design Spec

> Story: FI-326 · Branch đích: `story/fi326-api-docs-swagger` ·
> Ngày: 2026-09-06 · Status: VALIDATED (spec-critic + plan-critic REVISE đã áp, story-validate OK)

---

## 0. IDEA-BRIEF (8 chiều)

- **Task** — "Viết API docs Swagger" = tạo tài liệu API chuẩn OpenAPI 3.x cho
  **toàn bộ REST surface của BFF gateway** (Fastify 5, :8080) — **84 operations**
  trong 21 file đăng ký route (19 `routes/*.ts` + webhook nested-scope + 2 health
  trong `app.ts`) + Swagger UI để browse/try-it-out. KHÔNG đổi behavior endpoint nào.
- **Output** — (1) spec OpenAPI multi-file nằm trong repo
  (`services/bff-gateway/openapi/`), (2) Swagger UI serve từ BFF ở
  `/documentation` (dev-only flag), (3) drift-guard test chống spec↔code lệch,
  (4) README section trỏ tới docs.
- **Users** — dev team (FE đọc contract cho `packages/api-client`, BE, QA viết
  e2e, người mới onboard), product owner; integrators bên ngoài (webhook sàn
  TMĐT `POST /webhooks/orders`).
- **Constraints (MUST)** — không phá runtime BFF (30 test files + 31 e2e specs
  vẫn xanh); khớp truth hiện có (DTO `api-contracts`, error envelope
  `{statusCode,message,code?,details?}`, `Paginated{items,total,page,pageSize}`,
  role matrix `KNOWN_ROLES`); không leak secrets/dev credentials vào spec
  (31 BFF test files + 31 e2e specs là regression surface).
- **Input** — source thật `routes/*.ts` (19 route files, 82 registrations,
  webhook `/webhooks/orders` là nested-scope trong webhooks.ts) + 2 health
  trong `app.ts` = 84 ops + `packages/shared/src/api-contracts/*`
  (typed DTO ~28 ops) + `src/mappers/*` (shape response) + `plugins/auth.ts`
  (roles/skip-list) + REQUIREMENTS.md §5 (18 endpoints gốc — đã drift).
  Dev token cho try-it-out: `python3 e2e/scripts/mint_sf11.py
  <manager|coordinator|admin> /tmp/auth.json` (script có sẵn trong repo).
- **Context** — browser chỉ nói REST với BFF; services nội bộ gRPC (proto =
  SSOT, có sẵn, không tài liệu hóa lại). Repo KHÔNG có swagger/openapi nào
  (grep = 0). Fastify 5.2.1, KHÔNG có JSON schema/zod trên routes (validation
  manual inline → 422 `VALIDATION_ERROR` + `details[]`).
- **Success criteria** — Swagger UI mở được ở dev; đủ 84/84 operations đúng
  method/path; schemas khớp response thật; try-it-out chạy được với dev token;
  drift-guard bắt được thêm/xóa route; toàn bộ test + e2e hiện có vẫn xanh.
- **Out-of-scope** — gRPC docs (proto là SSOT; spec chỉ link); đổi behavior/API
  nào; auth mới; API versioning scheme; docs cho services nội bộ.

## 1. Problem

BFF là bề mặt REST duy nhất nhưng docs thật sự = 0: REQUIREMENTS §5 chốt 18
endpoints gốc, code hiện thực 84 — drift 4.6x đã xảy ra và không có cơ chế nào
ngăn tiếp diễn. Hệ quả: dev mới/FE/QA đọc 3853 dòng `routes/*.ts` để hiểu
contract; integrators không có gì cho webhook; mỗi SF mới làm drift thêm.

## 2. Phase-0 impact (tóm tắt — agent đã đọc code thật)

- **Touch map**: mới `services/bff-gateway/openapi/**` (spec), deps
  `@fastify/swagger@9` + `@fastify/swagger-ui@6` (đã verify tồn tại trên
  registry — Fastify 5 line), `app.ts` (+5-10 dòng register plugin dev-only),
  `plugins/auth.ts` (skip-list prefix `startsWith('/documentation')` — phủ UI
  assets + `/documentation/json` + `oauth2-redirect.html`; pattern prefix là
  MỚI trong file này — guard hiện dùng exact-path), test mới drift-guard
  (vitest, harness `test/harness.ts` có sẵn — SF-1 thêm 1 option
  `devResetPassword` vào HarnessOptions để guard boot đủ route conditional),
  README. **KHÔNG chạm 19 route files** — zero runtime-path change.
  Regression surface: 31 test files trong `services/bff-gateway/test/` + 31
  e2e specs.
- **Second-order**: (a) schema-in-route BỊ LOẠI — Ajv pre-handler đổi 422→400
  và response-serialization lọc field ngoài schema → vỡ `bff.contract.test.ts`
  + e2e; (b) YAML trong `services/bff-gateway/` tự vào Docker image (COPY cả
  thư mục) và ngoài tsc scope — không cần sửa gì; (c) 2 URL mới (`/documentation`,
  JSON) là surface mới — dev-only mount theo precedent `ENABLE_DEV_RESET_PASSWORD`
  (fail-safe: prod không flag → 404 thay vì dựa vào doc); (d) examples synthetic
  — KHÔNG copy dev credentials từ README/realm JSON.
- **Hiện trạng DTO**: `api-contracts` phủ ~28 ops; ~56 ops (tech, serviceEmployees,
  users, d2c, notifications, avatar, events, webhooks, transfer, batching-presets,
  meta, cod extension) hand-write schema từ route code + mappers.
- **Case đặc biệt phải đúng**: SSE `/events` (hijack, `text/event-stream`,
  auth qua query `access_token` — securityScheme `apiKey in query` riêng);
  multipart `POST /avatar` (≤5MB) + `POST /orders/import/preview`; binary
  response `POST /fulfillment/print` (PDF) + `GET /avatar/:userId` (image) +
  **4** CSV (`/fulfillment/orders/export.csv` BOM, `/cod/settlement.csv` BOM,
  `/d2c-orders/export` BOM, **GET `/orders/import/template`** — text/csv +
  `Content-Disposition: attachment`, kiểm BOM trong `templateCsv()`); HMAC
  webhook (headers `X-Signature`, `X-Source`); dev-only
  `/auth/reset-password` (đánh dấu `x-dev-only`); notifications 2 paths
  `/notifications` + `/api/notifications` = alias cùng handler — document
  CẢ HAI (drift-guard đếm 2, không gộp); role gates per-endpoint (`security`
  + description khớp matrix — nguồn truth `plugins/auth.ts` + guard từng route).

## 3. Decisions (user chốt 2026-09-06)

| # | Decision | Chọn |
|---|----------|------|
| D1 | Toolchain | **Standalone OpenAPI YAML multi-file** — spec là SSOT của docs; `@fastify/swagger` mode `static` + `@fastify/swagger-ui` đọc file. KHÔNG schema-in-route (vi phạm constraint runtime), KHÔNG swagger-jsdoc, KHÔNG codegen TS-types |
| D2 | Swagger UI host | **BFF serve, dev-only flag** `BFF_ENABLE_API_DOCS=1` (precedent `ENABLE_DEV_RESET_PASSWORD`) — prod/K8s không flag = không mount |
| D3 | Ngôn ngữ spec | **Tiếng Anh** (summary/description); thuật ngữ nghiệp vụ giữ nguyên (fulfillCode, batch, COD). Comment code tiếng Việt không đổi |
| D4 | Scope gRPC | **REST-only** — proto file là SSOT cho gRPC; endpoint có gốc gRPC ghi link `.proto` tương ứng trong description |

Quyết định nhỏ agent tự quyết theo conventions (flag ở đây): spec đặt
`services/bff-gateway/openapi/` (travel với service, vào image tự nhiên);
multi-file `$ref` theo domain; drift-guard là vitest test trong BFF (chạy cùng
`pnpm --filter @hub-store/bff-gateway test`); examples synthetic chuẩn hoá
(`ORD-000123`, shop `SHOP-001`...); không đăng `security` cho public endpoints,
`bearerAuth` mặc định mọi endpoint còn lại, `webhookHmac` riêng cho webhook,
`accessTokenQuery` riêng cho SSE.

## 4. Architecture

```
services/bff-gateway/
├─ openapi/
│  ├─ openapi.yaml              # root: info, servers (dev :8080), 12 tags
│  │                            # (bảng dưới), securitySchemes (bearerAuth,
│  │                            # webhookHmac, accessTokenQuery), $ref
│  ├─ components/
│  │  ├─ envelopes.yaml         # Paginated<T>, ErrorEnvelope, ErrorDetail,
│  │  │                         # responses 401/403/404/422/502 templates
│  │  ├─ enums.yaml             # CHỈ enums dùng chung ≥2 domains
│  │  │                         # (KNOWN_ROLES, common status)
│  │  └─ parameters.yaml        # page/pageSize, code params dùng chung
│  │                            # NOTE: schema/enum riêng từng domain viết
│  │                            # INLINE trong paths file của domain —
│  │                            # SF-2..8 KHÔNG sửa components/ (tránh
│  │                            # xung đột 7 SF song song)
│  └─ paths/
│     ├─ system.yaml            # healthz, health, version (3 — SF-1 pilot)
│     ├─ fulfillment.yaml       # 16 ep (SF-2)
│     ├─ batches.yaml           # 7 + presets 2 (SF-3)
│     ├─ intake.yaml            # 8 + webhook 1 (SF-4)
│     ├─ tech.yaml              # tech 7 + serviceEmployees 6 (SF-5)
│     ├─ delivery.yaml          # delivery-batch 6 + d2c 3 (SF-6)
│     ├─ cod-print.yaml         # cod 6 + print 3 + printers 3 (SF-7)
│     └─ platform.yaml          # users 5 + avatar 2 + notifications 2 +
│                               # transfer 2 + events 1 + auth 1 (SF-8)
├─ test/openapi.drift.test.ts   # so route thật (harness app routes) ↔
│                              # spec.paths — FAIL khi lệch
└─ src/plugins/api-docs.ts      # register swagger-ui (static spec) khi
                               # BFF_ENABLE_API_DOCS=1 (app.ts gọi)
```

### Bảng 12 tags (PIN — SF-1 viết root theo bảng; SF-2..8 dùng đúng tên)

| # | Tag | Ops | Path file (owner SF) |
|---|-----|-----|----------------------|
| 1 | System | 3 | system.yaml (SF-1) |
| 2 | Orders | 13 | fulfillment.yaml (SF-2) |
| 3 | Master Data | 3 | fulfillment.yaml (SF-2) |
| 4 | Batches | 9 | batches.yaml (SF-3) |
| 5 | Intake | 8 | intake.yaml (SF-4) |
| 6 | Webhooks | 1 | intake.yaml (SF-4) |
| 7 | Field Service | 13 | tech.yaml (SF-5) |
| 8 | Delivery | 9 | delivery.yaml (SF-6) |
| 9 | COD Settlement | 6 | cod-print.yaml (SF-7) |
| 10 | Print | 6 | cod-print.yaml (SF-7) |
| 11 | Administration | 8 | platform.yaml (SF-8) |
| 12 | Realtime & Transfers | 5 | platform.yaml (SF-8) |
|   | **Tổng** | **84** | |

Nhóm tag: 1 tag = 1 domain nghiệp vụ, mỗi tag thuộc đúng 1 path file (SF
ownership tách bạch — drift-guard per-file dễ map). Master Data tách khỏi
Orders dù cùng file (3 GET public-read khác bản chất mutation orders);
Realtime & Transfers gom feed/SSE/notifications + transfer tickets của
platform.yaml. (Quyết định nhóm — agent tự quyết theo nguyên tắc trên, đã
flag tại đây.)

- **Drift-guard principle**: test load app từ `test/harness.ts` (mock gRPC có
  sẵn), extract registered routes, so với `spec.paths`. Thêm/xóa route mà
  không sửa spec = test đỏ. Chạy trong CI job `unit` hiện có (vitest BFF) —
  không job mới. Rules PIN:
  - **Normalize `:param` → `{param}`** (2 chiều) trước khi so — route dùng
    find-my-way colon style, OpenAPI dùng braces.
  - **Boot drift test với dev-reset-password BẬT**: harness hiện hardcode
    `devResetPassword: false` → `/auth/reset-password` không mount → guard
    red-giả hoặc bỏ sót. SF-1 thêm option `devResetPassword` vào
    `HarnessOptions` (duy nhất SF-1 được chạm harness — SF khác READ-ONLY).
  - **Drift test chạy với `BFF_ENABLE_API_DOCS` unset** (flag-off) — tránh
    extraction bắt nhầm routes `/documentation` của plugin docs.
  - FAIL message chỉ rõ method + path lệch (thiếu spec / thiếu route).
- **UI mount**: `BFF_ENABLE_API_DOCS=1` (pattern `=== '1'` như
  `ENABLE_DEV_RESET_PASSWORD`) → register `@fastify/swagger` (static,
  `specification.path` + `baseDir` trỏ thư mục openapi/ — multi-file $ref
  resolve được) + `@fastify/swagger-ui` tại prefix `/documentation`; skip-list
  guard thêm prefix `startsWith('/documentation')`. Unset → plugin không
  register (prod fail-safe), guard không đổi behavior gì.
- **Compat verify** (SF-1 làm đầu tiên): boot app với 2 plugin 9.x/6.x +
  Fastify 5.2.1 trong harness — nếu static-mode/`$ref` resolve lỗi → fallback
  ĐÚNG: **bundle multi-file → 1 file YAML** (bundle script nhỏ) rồi serve
  file đó qua `swagger-ui-dist` + `@fastify/static` (fallback thay cách
  spec-loading, không chỉ cách serve UI). Ghi verdict vào SF-1 notes.

## 5. Acceptance criteria (epic, user-visible, binary)

1. `BFF_ENABLE_API_DOCS=1 pnpm --filter @hub-store/bff-gateway dev` → mở
   `http://localhost:8080/documentation` thấy UI với **84 operations phân
   đúng 12 tags** theo bảng §4 (đếm được trên UI sidebar).
2. Try-it-out: lấy dev token bằng `python3 e2e/scripts/mint_sf11.py manager
   /tmp/auth.json` rồi gọi thành công `GET /master-data/regions` +
   **`POST /fulfillment/filter`** (body example có sẵn trong spec — sửa verb:
   route thật là POST) từ UI (200 + shape khớp schema); `GET /healthz` chạy
   không token.
3. Drift-guard: thêm 1 route giả (hoặc xóa 1 op khỏi spec) → vitest đỏ với
   message chỉ rõ method+path lệch; revert → xanh.
4. Spec lint/validate pass (parser swagger plugin load được toàn bộ $ref —
   build UI không broken link).
5. `pnpm test` (toàn workspace) + e2e Playwright hiện có VẪN XANH — không
   test nào phải sửa.
6. Secrets audit BINARY: `grep -rE
   "gY0pM9SO7QEmqil_lWHQ|GSzIMCBcUNtcbKwnTn_o" services/bff-gateway/openapi/`
   = 0 hit (2 dev-password literal từ README) + không có field `password`
   example mang giá trị thật (examples dùng `"string"`/`••••••••`).
7. README có section "API docs" trỏ cách mở UI + đọc spec YAML.

## 6. SF split (9 SF — tier bracket)

| SF | Tier | Domain | Ops | Touch |
|----|------|--------|-----|-------|
| SF-1 | 0 | Foundation: toolchain + root spec + shared components + drift-guard + UI mount + pilot 3 system endpoints | 3 | openapi root/components, plugin, guard skip-list, drift test |
| SF-2 | 1 | Orders domain (fulfillment.ts) | 16 | paths/fulfillment.yaml |
| SF-3 | 1 | Batching (batches + presets) | 9 | paths/batches.yaml |
| SF-4 | 1 | Intake + webhook | 9 | paths/intake.yaml |
| SF-5 | 1 | Tech + service employees | 13 | paths/tech.yaml |
| SF-6 | 1 | Delivery last-mile + D2C | 9 | paths/delivery.yaml |
| SF-7 | 1 | COD settlement + print + printers | 12 | paths/cod-print.yaml |
| SF-8 | 1 | Platform/admin (users, avatar, notifications, transfer, events SSE, auth dev-only) | 13 | paths/platform.yaml |
| SF-9 | 2 | Convergence: full drift 84/84 + UI walkthrough toàn tag + regression test/e2e + README + examples audit | 0 | README, audit-only |

Tổng ops: 3 + 16+9+9+13+9+12+13 = 84 ✓ · SF-9 = 9 tasks (≥6 policy ✓ —
liệt kê đầy đủ trong plan file).

**Anti-duplicate check** (SF-SCOPE LỚN): mechanics dùng lại (cách viết $ref,
chạy validator/lint, cách test drift, envelope components) nằm HẾT ở SF-1
(tier 0) — các SF domain chỉ AUTHOR slice của mình + chạy validator có sẵn;
không SF nào định nghĩa lại ErrorEnvelope/Paginated/enums. Không có pattern
nào lặp ≥2 SF với tư cách task-definition. Mỗi SF 8-13 tasks (đếm task:
author N endpoint groups + verify riêng) — không SF nào < 6 tasks.
**Tier-gate**: gate mỗi SF domain chỉ test slice mình (UI render tag đó +
drift guard scoped) — verify 84/84 TOÀN CỤC là việc SF-9 (convergence).

**Design field**: TẤT CẢ SF = `Design: none` (Swagger UI là tool chuẩn, không
custom UI surface — không designer phase).

## 7. Verification strategy

- Mỗi SF domain: (a) drift-guard scoped pass (routes slice ↔ spec slice),
  (b) UI render đúng tag/ops (browser walkthrough Rule 0 — không tự kết luận),
  (c) 1-2 try-it-out smoke với dev token cho endpoint đại diện (200 shape
  khớp schema), (d) vitest toàn BFF xanh.
- SF-9: acceptance 1-7 epic toàn bộ, chạy trên nhánh đích sau merge.
- Regression bắt buộc: `pnpm test` workspace + e2e suite (`E2E=1`) — SF-9.

## 8. Risks / notes

- **R1** — `@fastify/swagger@9` + `swagger-ui@6` static-mode compat Fastify
  5.2.1: versions tồn tại (verified registry) nhưng boot thực phải test —
  SF-1 task đầu, fallback `swagger-ui-dist` + `@fastify/static` được phép.
- **R2** — ~56/84 ops hand-write schema: rủi ro lệch shape thật → giảm bằng
  (a) đọc mapper + response thật trong route, (b) try-it-out smoke mỗi SF,
  (c) SF-9 spot-audit examples vs contract tests.
- **R3** — Spec drift sau story: drift-guard trong CI ngăn structural;
  description/example stale là chấp nhận được (process: sửa spec cùng PR đổi
  route — ghi vào README conventions).
- **R4** — `/documentation` skip-list: guard hiện dùng exact-path +
  `startsWith('/x?')` — thêm prefix `startsWith('/documentation')` là pattern
  MỚI, phải phủ UI assets + `/documentation/json` + `oauth2-redirect.html`;
  sai → UI trắng/401. Verify bằng browser thật (Rule 0), không chỉ curl.
- **R5** — KTV PWA/mobile FE gọi cùng BFF — không đổi gì runtime nên an toàn;
  SF-9 chạy đủ e2e (gồm 1401 KTV) để chốt.
