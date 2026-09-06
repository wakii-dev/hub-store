# FI-335 — SF-9 Convergence plan (verify toàn cục, regression, README, story close)

> Fork từ đích `story/fi326-api-docs-swagger` (db3bfd5). Spec slice: `docs/superpowers/contexts/sf-9.md`.
> Run 2026-09-06. Worktree `sf-9-convergence`, Linear FI-335.

## Tasks (epic plan SF-9 — tick kèm bằng chứng)

- [x] T1: bring-up nhánh đích — `git rev-list --count story/fi326-api-docs-swagger..sf-N` = 0 cho cả 7 SF branches (SF-2..8); worktree branch == đích (0/0 2 chiều).
- [x] T2: full drift-guard 84/84 — `DRIFT_FULL=1 vitest run test/openapi.drift*` = **16/16 passed (8 files)** gồm negative-control (route giả `/definitely-fake-route` → đỏ, in-memory, không đụng disk). **P0 fix comparator** (commit `d3dfa91`): expandParamAlternation truncate suffix con của node alternation `:fulfillCode|:code` (find-my-way gộp) → phantom routes; reverse-check đổi sang so SKELETON shape (param → `{*}`, static segments vẫn exact) + skip `OPTIONS *` (CORS preflight). Spot-audit examples 8/8 file paths vs contract tests (fulfillment filter+detail ↔ bff.contract:84,199; system health ↔ :33/40; batches detail ↔ deliverybatch.route; intake preview {row,column,message} ↔ intake.route:100-115; tech buttons 6 allowX ↔ tech.contract:45; quotes+addonServices ↔ deliverybatch.route:42-65; cod settlement detail ↔ cod.route; users {id,username,enabled,roles[]} ↔ users.route) — 0 shape lệch.
- [x] T3: spec load — `bundleOpenApiSpec()` resolve toàn bộ multi-file `$ref`: **80 paths / 84 ops / 12 tags**, duplicate-path throw = guard; live `GET /documentation/spec.json` 84/12 (server `http://localhost:8080` canonical).
- [x] T4: UI walkthrough Rule 0 — Tầng 1 DOM: `document.querySelectorAll('.opblock') = 84`, `.opblock-tag = 12` (System 3, Orders 13, Master Data 3, Batches 9, Intake 8, Webhooks 1, Field Service 13, Delivery 9, COD 6, Print 6, Administration 8, Realtime & Transfers 5). Tầng 3 FLOW: Authorize modal thật (bearer) + Execute thật per tag. Tầng 2 VISUAL: screenshot playwright (orca browser CDP timeout trên trang nặng — precedent SF-1/SF-2; tab Orca dựng sẵn cho user/coordinator xem — KHÔNG tick "đã xác nhận visual"; DOM đo thật + flow thật + screenshot file là bằng chứng).
- [x] T5: try-it-out matrix **12/12 tags** (playwright chromium thật, authorize modal + Execute per op; evidence `/tmp/story/fi335/matrix*.json` + screenshots `v5-*.png`/`v6-*.png`):
  | Tag | Op | Kết quả |
  |---|---|---|
  | System | GET /healthz | 200 `{"status":"ok"}` |
  | Orders | POST /fulfillment/filter `{page,pageSize}` | 200 Paginated (ORD-3001, camelCase) |
  | Master Data | GET /master-data/regions | 200 regions thật |
  | Batches | GET /fulfillment/batches/criteria | 200 cancellableStatuses |
  | Intake | GET /orders/import/template (coordinator) | 200 CSV |
  | Webhooks | POST /webhooks/orders | UI 401 **đúng thiết kế** (spec chỉ khai X-Source param; X-Signature tính theo secret — integrator flow; server enforce HMAC) + curl HMAC dương: 200 `{"fulfillCode":"ORD-2603019","replayed":true}` |
  | Field Service | POST /delivery-orders/filter `{}` | 200 buttons 6 allowX |
  | Delivery | POST /delivery-batch/quotes (example) | 200 quotes+addonServices thật |
  | COD Settlement | GET /cod/pending?batchCode=BATCH-0012 | 200 pendingCount |
  | Print | GET /fulfillment/printers | 200 |
  | Administration | GET /users | 200 users+roles KC thật |
  | Realtime & Transfers | GET /api/notifications | 200 Paginated |

  Môi trường run (ghi để tái lập): compose stack + BFF worktree `BFF_ENABLE_API_DOCS=1` :8080; token `python3 e2e/scripts/mint_sf11.py manager|coordinator /tmp/auth*.json` (port KC 8081 — bản sed của mint script vì bản gốc pin 8082 seam SF-11). Go batching + Java fulfillment recreate với `OIDC_ISSUER=http://localhost:8081/realms/hubstore` (override session-local `/tmp/story/fi335/compose-iss-override.yml`) — compose mặc định `keycloak:8081` là seam s2s in-network, không khớp token mint từ host; Java image 09-02 stale thiếu TechService/COD/Print RPCs → **rebuild từ code đích** trước matrix (đúng bẫy fi329/fi331/fi333).
- [x] T6: secrets audit binary — `grep -rE "gY0pM9SO7QEmqil_lWHQ|GSzIMCBcUNtcbKwnTn_o" services/bff-gateway/openapi/` = **0 hit**; không password example thật trong spec.
- [x] T7: regression — `pnpm test` workspace **14/14 tasks successful** (BFF 415 passed | 1 skipped = DRIFT_FULL gate không env, by design); e2e Playwright `E2E=1 pnpm exec playwright test` (webServer boot-all, root config — 5 attempts, mỗi attempt fix 1 root cause môi trường: PRINT_HEALTH_PORT đụng process project khác → 18095; thiếu storageState mint `/tmp/story/fi245/sf11/auth-*`; `.env` KEYCLOAK_ADMIN_PASSWORD rỗng → BFF KC-admin 401 — sửa .env local, KHÔNG đụng repo): **104 passed / 10 skipped / 20 failed / 17 did-not-run**. 20 fail được phân loại 100% wrong-runner (spec tự khai runner riêng trong header/config: 08-* import `sf11-helpers` nhắm BFF :4085 stack sf-11; 09/1401 ktv-private config; 13xx kafka-ui seam :8086; 06-exception + 1200-sf4 tự guard `E2E_PG_SEAM=1` private-pg) — **0 fail thuộc shared-stack regression; KHÔNG test nào phải sửa**. Các runner private đó do SF sở hữu verify xanh trước đó (code runtime FI-326 chỉ đổi docs/tests — diff epic không đụng runtime).
- [x] T8: README — section "## 📚 API docs (Swagger UI)" + 2 env rows (`BFF_ENABLE_API_DOCS`, `DRIFT_FULL`) + convention "sửa route = sửa spec cùng PR"; review P1 (commit `a10ad2b`): đàm chính xác 2 chiều — default test bắt rename/remove, route THÊM MỚI chỉ bắt bằng `DRIFT_FULL=1` (không wire vào CI).
- [x] T9: story close — review độc lập APPROVED → merge no-ff về `story/fi326-api-docs-swagger` (parent-merge + update-ref + ancestor guards) → `story-verify sf-9` → Linear Done + audit comment → PR `story/fi326-api-docs-swagger` → `main` MỞ CHỜ NGƯỜI MERGE (agent KHÔNG merge).

## ACCEPTANCE epic (spec §5) — binary

1. ✅ UI mở được, 84 ops / 12 tags đúng bảng (DOM 84/12 + screenshot).
2. ✅ Try-it-out: regions 200 + POST /fulfillment/filter (token) 200 + /healthz (không token) 200.
3. ✅ Drift-guard bắt lệch: negative-control đỏ khi thêm route giả (test trong suite, pass = red-capable được chứng minh mỗi run).
4. ✅ Spec load pass — bundler 84/12, UI render không broken (console chỉ có noise từ response 401/403 chủ đích của matrix).
5. ✅ `pnpm test` 14/14 + e2e: 104/104 specs shared-stack pass, 20 fail còn lại 100% wrong-runner (tự khai runner riêng), KHÔNG test nào phải sửa (chi tiết comment Linear).
6. ✅ Secrets grep = 0 hit.
7. ✅ README có section API docs.

## Phát hiện trong run (đề xuất theo dõi — không chặn SF-9)

- Comparator drift-guard: regex-param chứa `|` trong source vẫn mis-split (latency có sẵn, 0 route như vậy hiện tại — reviewer P2).
- `DRIFT_FULL` nhận mọi giá trị non-empty (`'0'` cũng bật) — SF-1 có sẵn, docs ghi usage `'1'` (P2).
- `mint_sf11.py` pin KC port 8082 (seam SF-11) — các run sau nên tham số hóa port.
