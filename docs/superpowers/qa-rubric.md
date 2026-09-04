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

> Verdict 25/25 — chạy serial workers=1, E2E=1 reset+seed trước run. Chi tiết đỏ/xanh xem comment baseline trên FI-281.

_(điền sau baseline run — bảng verdict + spec đỏ đã xử lý)_
