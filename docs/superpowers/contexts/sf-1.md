# SF-1 Context Pack — Foundation (toolchain + root spec + shared components + drift-guard + UI mount + pilot system)

> Đọc file này THAY VÌ tự tổng hợp từ bracket + epic + comments.
> Epic spec: `docs/superpowers/specs/2026-09-06-bff-api-docs-swagger-design.md` ·
> Plan: `docs/superpowers/plans/2026-09-06-fi326-api-docs-swagger-plan.md` ·
> Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`

## Spec slice (chỉ phần SF-1 chịu trách nhiệm)

1. **Toolchain (D1)** — standalone OpenAPI 3.x YAML multi-file là SSOT của
   docs; deps mới trong `services/bff-gateway/package.json`:
   `@fastify/swagger@^9` (mode `static`, `specification.path` + `baseDir`
   trỏ thư mục `openapi/` — multi-file `$ref` resolve được) +
   `@fastify/swagger-ui@^6`. TASK ĐẦU TIÊN = compat verify: boot harness với
   2 plugin + Fastify 5.2.1 đọc mini-spec → verdict go/fallback ghi vào
   Linear notes. **Fallback đúng**: bundle multi-file → 1 YAML (script nhỏ)
   rồi serve qua `swagger-ui-dist` + `@fastify/static` — fallback thay cách
   spec-loading, KHÔNG chỉ cách serve UI.
2. **Root `openapi/openapi.yaml`** — info (title "Hub Store BFF API"),
   server dev `http://localhost:8080` (URL canonical — KHÔNG parametrize
   theo PORT_BFF boot thực tế), đúng 12 tags theo BẢNG PIN trong
   spec §4 (System/Orders/Master Data/Batches/Intake/Webhooks/Field
   Service/Delivery/COD Settlement/Print/Administration/Realtime &
   Transfers — tổng 84 ops), securitySchemes đúng 3 tên:
   `bearerAuth` (HTTP bearer, JWT), `webhookHmac` (apiKey header
   `X-Signature`), `accessTokenQuery` (apiKey query `access_token`).
   **Pre-wire root cho tier-1**: root `$ref` sẵn tới CẢ 8 paths file +
   TẠO 7 STUB file `paths/{fulfillment,batches,intake,tech,delivery,
   cod-print,platform}.yaml` với nội dung `paths: {}` — tier-1 chỉ fill
   stub của mình, KHÔNG bao giờ chạm root (tránh merge-conflict 7-way).
3. **Components (dùng chung)** — `components/envelopes.yaml`: `ErrorEnvelope`
   `{statusCode:int, message:string, code?:string, details?:ErrorDetail[]}`,
   `ErrorDetail` `{field, message}`, `Paginated<T>` `{items, total, page,
   pageSize}` (nguồn truth `packages/shared/src/api-contracts/envelopes.ts`
   — READ-ONLY, khớp 1:1) + response templates 401/403/404/422/502
   (`code` values thật: `UNAUTHENTICATED`, `PERMISSION_DENIED`, `NOT_FOUND`,
   `VALIDATION_ERROR`, `UPSTREAM_UNAVAILABLE`, `BAD_REQUEST`, `INTERNAL` —
   đọc `lib/envelope.ts` + `app.ts` setErrorHandler + `lib/grpc-error.ts`).
   `components/enums.yaml`: CHỈ enum dùng chung ≥2 domains (KNOWN_ROLES 7:
   Coordinator/WarehouseOps/Manager/Admin/WarehouseEmployee/
   InsideTechnician/OutsideTechnician — `plugins/auth.ts`, batchStatus,
   orderStatus nếu ≥2 domains dùng). `components/parameters.yaml`:
   page/pageSize + path params chuẩn hoá (`code`, `fulfillCode`, `userId`,
   `orderCode`, `batchCode`, `shopCode`, `printerId`).
4. **Pilot `paths/system.yaml` (3 ops, tag System, KHÔNG `security`)** —
   shapes THẬT từ code: `GET /healthz` → 200 `{status:'ok'}` (`app.ts:80`);
   `GET /health` → 200 `{status:'ok', db:{fulfillment:'ok'|'disabled'}}` |
   503 `{statusCode:503, status:'degraded', db:{fulfillment:'down'}}`
   (`app.ts:87-99`); `GET /version` → 200 `{version: string|null}`
   (`routes/meta.ts` — APP_VERSION env ?? null).
5. **Plugin mount** — `src/plugins/api-docs.ts` (mới): env
   `BFF_ENABLE_API_DOCS === '1'` (pattern `=== '1'` như
   `ENABLE_DEV_RESET_PASSWORD` trong `config.ts`) → register swagger static
   + swagger-ui tại prefix `/documentation`; unset → KHÔNG register (prod
   fail-safe — "không mount thay vì dựa vào doc"). Wire 3-5 dòng trong
   `app.ts`.
6. **Guard skip-list** — `plugins/auth.ts`: thêm prefix
   `startsWith('/documentation')` (pattern MỚI — file này hiện dùng
   exact-path + `startsWith('/x?')`); phải phủ UI assets + `/documentation/json`
   + `oauth2-redirect.html`. KHÔNG đổi behavior route nào khác.
7. **Drift-guard** — `test/openapi.drift.test.ts` (mới, vitest): load app
   qua `startHarness()` (`test/harness.ts` — `HarnessOptions` interface
   dòng 421; hiện hardcode `devResetPassword: false` dòng 536) → extract
   registered routes → so `spec.paths`. Semantics PIN:
   (a) test TỰ KHÁM PHÁ mọi `paths/*.yaml` tồn tại — assertion PER-FILE
   (SF-1 xanh với đúng 3 ops của system.yaml, không đòi 84);
   (b) assertion NGƯỢC "mọi route harness phải thuộc SOME spec file" (full
   check) CHỈ BẬT khi env `DRIFT_FULL=1` (SF-9 dùng);
   (c) normalize `:param` → `{param}` 2 chiều trước khi so (note:
   find-my-way regex-param `:p(re)` lấy phần tên trước `(`);
   (d) thêm option `devResetPassword` vào `HarnessOptions` (SF-1 DUY NHẤT
   được chạm harness — SF khác READ-ONLY), boot drift test với option bật;
   (e) extract với `BFF_ENABLE_API_DOCS` unset (tránh bắt nhầm
   `/documentation` routes);
   (f) FAIL message chỉ rõ method+path (thiếu spec / thiếu route);
   (g) export helper để SF-2..8 viết test file RIÊNG
   `test/openapi.drift.<domain>.test.ts` gọi với file paths của mình —
   không ai sửa file drift chung;
   (h) **negative control** (exit criteria): thêm 1 route giả vào spec →
   test ĐỎ với message đúng → revert (chứng minh guard không luôn-xanh).
8. **Regression** — `pnpm --filter @hub-store/bff-gateway test` toàn xanh
   (31 test files hiện có không được phá).

## Touch map (files SF-1 tạo/sở hữu)

```
services/bff-gateway/
├─ openapi/                                  # TẠO MỚI — SF-1 sở hữu root + components
│  ├─ openapi.yaml                           #   + pre-wire refs 8 paths file
│  ├─ components/{envelopes,enums,parameters}.yaml
│  └─ paths/system.yaml                      # pilot (SF-1 author)
│  └─ paths/{fulfillment,batches,intake,tech,delivery,cod-print,platform}.yaml
│                                            # 7 STUB paths:{} — tier-1 fill
├─ src/plugins/api-docs.ts                   # TẠO MỚI
├─ src/app.ts                                # EDIT: register plugin (flag-gated)
├─ src/plugins/auth.ts                       # EDIT: skip-list prefix /documentation
├─ test/openapi.drift.test.ts                # TẠO MỚI + export helper
├─ test/harness.ts                           # EDIT: HarnessOptions thêm devResetPassword
└─ package.json                              # EDIT: +2 deps
```
READ-ONLY (nguồn shapes — không sửa): `src/routes/**`, `src/lib/**`,
`packages/shared/src/api-contracts/**`, `e2e/scripts/mint_sf11.py` (dùng
lấy dev token — không sửa).

## ACCEPTANCE (user-visible)

- `BFF_ENABLE_API_DOCS=1 pnpm --filter @hub-store/bff-gateway dev` → mở
  `http://localhost:8080/documentation`: Swagger UI render, sidebar thấy tag
  System với 3 ops (healthz/health/version) — evidence browser (Rule 0
  DOM/VISUAL/FLOW, không tự kết luận).
- Try-it-out trong UI: `GET /healthz` → 200 `{status:"ok"}` THẬT; `GET
  /version` → 200 có/null version.
- `BFF_ENABLE_API_DOCS` unset → `/documentation` 404 (fail-safe) + app boot
  bình thường.
- Thêm 1 route giả vào spec (hoặc comment-out route thật) → drift test ĐỎ
  với message method+path rõ; revert → xanh.
- `pnpm --filter @hub-store/bff-gateway test` toàn workspace BFF xanh.

## Boundary (KHÔNG làm)

- KHÔNG author paths domain (fulfillment/batches/intake/tech/delivery/
  cod-print/platform.yaml) — SF-2..8 sở hữu.
- KHÔNG sửa bất kỳ `src/routes/*.ts`, không đổi error/auth runtime behavior
  (skip-list chỉ thêm /documentation).
- KHÔNG sửa `components/` hoặc root spec SAU khi tier-1 fork — nếu SF domain
  phát hiện thiếu component chung → flag coordinator (REQUIREMENT-GAP),
  không tự sửa (7 SF song song sẽ xung đột).
- KHÔNG README/CHANGELOG — SF-9.
- Domain-specific schema/enum viết INLINE trong paths file — không thêm vào
  `components/enums.yaml` trừ khi ≥2 domains thật sự dùng.
