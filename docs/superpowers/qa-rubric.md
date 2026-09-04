# QA RUBRIC — hub-store regression story (FI-280)

> **GROUND TRUTH cho SF-2..7** — copy từ epic spec `docs/superpowers/specs/fi280-qa-hub-store-regression-spec.md`
> (APPROVED 2026-09-04). SF nào đổi rubric phải REQUIREMENT-GAP comment lên epic FI-280 trước.
> Baseline run: SF-1 (FI-281), 2026-09-04, base commit d107f2f (main), worktree `sf-1-qa-baseline`.

## TRIAGE RUBRIC (P0–P3)

- **P0** — chặn flow chính hoàn toàn (không login được, không tạo order, data mất)
- **P1** — sai behavior người dùng thấy (sai số liệu, sai permission, sai trạng thái sau thao tác)
- **P2** — UI/UX sai so với spec/thiết kế (layout vỡ, i18n sai, trạng thái không cập nhật realtime)
- **P3** — cosmetic/polish (spacing, wording, animation) + **latency/perf issues** → chỉ LOG lên epic, không fix trong story (trừ khi chặn hẳn flow → nâng P0)

**Escape hatch:** 1 SF tìm > 8 bug P2 → STOP fix, log hết lên epic + escalate coordinator trước khi fix tiếp (tránh SF phình vô hạn). SF-7 nặng nhất (7 specs) — chấp nhận chạy dài, coordinator không đánh Done sớm.

**Bug report template** (mỗi bug 1 comment trên SF issue):

```
[P<n>][<DOMAIN>] <title>
/ repro steps
/ expected vs actual
/ evidence (screenshot/DOM)
/ fix commit hash
/ regression spec <range>-<n>
```

## COVERAGE MAP (25 specs ↔ SF)

Mọi spec thuộc đúng 1 SF; specs = walkthrough checklist + verify-no-regression base:

| SF | Linear | Specs |
|----|--------|-------|
| SF-1 | FI-281 | — (baseline chạy cả 25) |
| SF-2 | FI-282 | 02-role-matrix |
| SF-3 | FI-283 | 01-main-flow, 04-regression-8b, 05-intake, 05-d2c, 07-order-ops |
| SF-4 | FI-284 | 03-audit, 08-audit-viewer, 05-area, 05-settlement, 05-tech-service, 06-exception |
| SF-5 | FI-285 | 05-kafka, 07-realtime, 08-map |
| SF-6 | FI-286 | 08-mobile, 09-ktv-mobile, 08-pwa |
| SF-7 | FI-287 | 05-nvc-api, 07-nvc-fe, 08-print-expansion, 08-export, 05-dashboard, 05-users, 09-webhook |
| SF-8 | FI-288 | full suite (25 cũ + regression mới 10xx–15xx) |

Routing bug-app: orders→SF-3 · fulfillment/audit→SF-4 · batching/kafka/realtime→SF-5 · mobile/pwa→SF-6 · print/nvc/admin/dashboard/export/users/webhook→SF-7 · permission/shared-perm-files→SF-2 (tag `[PERM]`).

## FILE-OWNERSHIP (chống xung đột cross-SF)

- **SF-2 DUY NHẤT được sửa** shared permission files: `packages/shared/src/hooks/usePermissions.tsx` (ROLES/PERMISSIONS/PERMISSION_MATRIX), nav config ẩn-hiện menu, `packages/shared/src/index.ts` phần exports permission.
- SF khác tìm bug permission/shared-formatter → LOG bug lên issue mình + comment pointer lên issue SF-2 (tag `[PERM]`); SF-2 fix trong worktree của nó. Bug permission phát hiện SAU khi SF-2 merge → queue vào SF-8 convergence fix.
- Formatters/shared utils khác: bug trong file shared không thuộc SF nào sở hữu → fix trong SF tìm ra, nhưng PHẢI re-run typecheck + node test của packages/shared trước commit.
- **CẤM sửa `e2e/tests/sf11-helpers.ts`** (helper dùng chung) — regression specs 10xx–15xx tự chứa helper của mình, KHÔNG import/sửa helper chung.
- Migration DB: QA fixes KHÔNG thêm bảng mới; nếu bắt buộc → cập nhật reset-db.sh CÙNG commit (table-gap lesson).
- **Exit criteria chuẩn mọi SF sweep:** 0 bug P0–P2 mở trong domain + regression specs range xanh + verify-no-regression (re-run specs domain) PASS.

## EXECUTION NOTES

- SF-1 tuần tự trước; SF-2..7 song song (cap 4) qua worktrees fork từ nhánh đích `story/qa-hub-store-regression`, private-port seam E2E_SHELL_URL/E2E_PROXY/E2E_PG_SEAM (pattern run-nvc-private.sh); **mỗi SF boot FULL stack riêng port riêng — Kafka + Keycloak KHÔNG share** (realm redirect chỉ trỏ :3000 chung, share sẽ vỡ auth); nếu RAM không đủ 4 stack → serialize 2 lượt. SF-8 cuối.
- Regression specs mới: số range 10xx–15xx theo SF (tránh trùng số khi merge), tự lập state, KHÔNG phụ thuộc mutation của specs 01–09.
- Kafka chết ≠ bug app — check canary (05-kafka) trước khi fix.
- Latency/perf = P3 log-only (rubric).

## ENVIRONMENT SETUP (SF-1 ghi nhận — SF sau cần biết)

- Worktree mới cần **root `.env`** (untracked, gitignored) TRƯỚC khi boot — compose fail-loud thiếu `POSTGRES_PASSWORD`/`JWT_DEV_SECRET`. Copy từ worktree đã có hoặc tái tạo theo `.env.example` (password postgres phải khớp volume hiện có — lấy từ `docker exec hub-store-postgres-1 printenv POSTGRES_PASSWORD`).
- Worktree mới cần `pnpm install` trước boot (BFF `tsx` cần node_modules).
- Kafka KHÔNG thuộc boot-all — spec 05-kafka skip khi `KAFKA_ENABLED=false` (default). Chạy enabled-mode theo runbook trong header spec 05-kafka.
- Boot: `E2E=1 BOOT_ONLY=1 bash scripts/boot-all.sh` rồi `E2E_REUSE=1 npx playwright test` (trong `e2e/`).

## BASELINE FI-281 (2026-09-04)

> Verdict 25/25 — chạy serial workers=1, `E2E=1 bash scripts/boot-all.sh` (reset+seed) trước run.
> Tally main-stack: **76 pass / 22 fail / 10 skipped / 8 did-not-run** (14.5m).
> Anti-flake: mọi đỏ dưới đây đỏ ở **2/2 runs** (run3 + final) — không có flake.
> Log đầy đủ: `/tmp/story/fi280-sf1/baseline-final.log` + comment baseline trên FI-281.

### Bảng verdict per spec (main-stack :3000/:8080)

| Spec | ✓ | ✘ | Ghi chú |
|------|---|---|---------|
| 01-main-flow | 3 | 0 | xanh |
| 02-role-matrix | 5 | 0 | xanh |
| 03-audit | 2 | 0 | xanh |
| 04-regression-8b | 4 | 0 | xanh |
| 05-area | 1 | 1 | ✘ POST /service-employees 403 → FI-280 `[P1][AREA]` |
| 05-d2c | 4 | 2 | ✘ filter GHN/khung-giờ 0 đơn + export 40d gate → FI-280 `[P1][D2C]` |
| 05-dashboard | 5 | 0 | xanh |
| 05-intake | 2 | 1 | ✘ tạo đơn thủ công không thấy mã mới → FI-280 `[P1][INTAKE]` |
| 05-kafka | 0 | 0 | skip-gate `KAFKA_ENABLED=false` (by-design); **seam enabled-mode: 3/3 ✓** |
| 05-nvc-api | 6 | 0 | 1 skip data-conditional (fee-limit không trigger được với seed — by-design) |
| 05-settlement | 6 | 0 | xanh |
| 05-tech-service | 4 | 1 | ✘ SO-0001 NEW không có nút Gán KTV → FI-280 `[P1][TECH]` |
| 05-users | 2 | 2 | ✘ 2 test → đã route FI-280 (users domain, SF-7) |
| 06-exception | 0 | 4 | ✘ cascade prep-timeout/mark-fail/redeliver → FI-280 `[P1][EXCEPTION]` |
| 07-nvc-fe | 4 | 0 | xanh |
| 07-order-ops | 7 | 0 | xanh |
| 07-realtime | 2 | 0 | xanh |
| 08-audit-viewer | 0 | 3 | **seam-gated by-design** (sf11StorageState fail-loud); **seam sf-11: 6/6 ✓** |
| 08-export | 0 | 3 | seam-gated by-design; **seam sf-11: 3/3 ✓** |
| 08-map | 2 | 0 | xanh (sf11-config URL từ run trước là wrong-seam noise) |
| 08-mobile | 0 | 2 | seam-gated by-design; **seam sf-11: 2/2 ✓** |
| 08-print-expansion | 12 | 1 | ✘ T11 kill :52053 by-design (sf-26 private print stack) |
| 08-pwa | 5 | 0 | xanh |
| 09-ktv-mobile | 0 | 2 | seam-gated by-design; **seam sf-25: 7/7 ✓** |
| 09-webhook | 0 | 0 | skip-gate `E2E_SF26=1` (by-design — chạy qua run-sf26-private.sh, 6 test) |

### Verdict lớp (baseline ground-truth cho SF-2..7)

1. **Xanh main-stack: 16 spec** — regression base cho sweep.
2. **Seam-gated by-design (đỏ trên main-stack là fail-loud ĐÚNG):** 08-audit-viewer, 08-export, 08-mobile, 09-ktv-mobile (→ sf-11/sf-25 seam, đã verify xanh trên seam riêng); 09-webhook + 05-kafka (skip-gate, đã verify xanh enabled-mode); 08-print-expansion T11 (sf-26 private print).
3. **App-bug candidates (đỏ 2/2, đã route FI-280):** 05-area (SF-4) · 05-d2c (SF-3) · 05-intake (SF-3) · 05-tech-service (SF-4) · 05-users (SF-7) · 06-exception cascade 4 test (SF-4). Tổng **11 test đỏ** + 11 test skip-by-design.

### Infra lessons (SF-2..7 boot seam PHẢI đọc)

- Root `.env` KHÔNG được chứa var mà seam runners override (`FULFILLMENT_DB_*`, `OIDC_*`, `GRPC_*`) — run.sh source `.env` clobber prefix env → Java bind sai port / verify sai issuer. boot-all export trực tiếp.
- Java `TokenAuthInterceptor` cần FULL issuer (`.../realms/hubstore`), BFF tự derive (`withRealm`) — bare base chỉ dùng được cho BFF.
- SF-12 health side-ports: Java `FULFILLMENT_HEALTH_PORT` (default :8083 đụng main-stack Java), Go `HEALTH_PORT` (default :8082 đụng keycloak) — seam runner luôn override.
- Port-guard trên port do container publish (:55443/:8082/...) phải skip process docker (docker_safe_kill) — kill docker-proxy giết daemon.
- KC 26 realm import: không khai báo explicit `service-account-*` user cho client `serviceAccountsEnabled` (duplicate → boot fail); grant realm-management roles idempotent sau boot.
- `exec env "${ARR[@]}" cmd` — bash không chấp nhận `VAR=x "${ARR[@]}" exec cmd`.
