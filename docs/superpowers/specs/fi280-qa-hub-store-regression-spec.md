# EPIC SPEC: Test toàn bộ website hub-store + fix bug (QA regression story)

## IDEA-BRIEF
- **Task**: QA pass TOÀN BỘ user-facing flows (25 domain specs đã có làm checklist walkthrough) qua browser thật; ghi bug theo rubric; fix ngay bug P0/P1/P2; P3 chỉ log; thêm Playwright regression spec cho bug P0–P2 đã fix.
- **Output**: website hub-store (web shell + orders + fulfillment + batching/D1 + KTV mobile + print + audit + area/settlement/users/dashboard/export/webhook/exception/map/intake/D2C/tech-service) không còn bug P0–P2 mở; regression specs xanh; bug-log hoàn chỉnh.
- **Users**: staff kho (web :3000), KTV (mobile web :375), admin/audit.
- **Constraints**: giữ behavior đúng spec FI-245 (postgres-production); fix nhỏ gọn không đổi kiến trúc; không đụng main trực tiếp — mọi việc trên nhánh đích story; SF song song bắt buộc private-port seam.
- **Input**: codebase main @ d107f2f (sau merge FI-245 28/28 SF); 25 e2e specs hiện có (checklist walkthrough); seed data; scripts boot-all/wait-db/seed-db/reset-db.
- **Context**: FI-245 vừa merge; CI GitHub Actions bị khóa billing (không ảnh hưởng test local); stack local: web :3000, keycloak :8081, postgres :5432, kafka, print-service :50053.
- **Success criteria**: (1) Tier 0 baseline: full-stack boot 7/7 ports + 25 e2e specs chạy xong có báo cáo đỏ/xanh; (2) mọi domain flow walkthrough PASS qua browser (Rule 0: DOM→VISUAL→FLOW); (3) 0 bug P0–P2 mở; (4) regression specs cho bug đã fix PASS trong convergence; (5) bug-log (P3+) trên epic.
- **Out-of-scope**: load/perf test, pentest sâu, feature mới, đổi kiến trúc, sửa CI billing (việc user).

## TRIAGE RUBRIC (Tier 0 chuẩn hóa — ground truth cho mọi SF)
- **P0** — chặn flow chính hoàn toàn (không login được, không tạo order, data mất)
- **P1** — sai behavior người dùng thấy (sai số liệu, sai permission, sai trạng thái sau thao tác)
- **P2** — UI/UX sai so với spec/thiết kế (layout vỡ, i18n sai, trạng thái không cập nhật realtime)
- **P3** — cosmetic/polish (spacing, wording, animation) + **latency/perf issues** → chỉ LOG lên epic, không fix trong story (trừ khi chặn hẳn flow → nâng P0)
- **Escape hatch**: 1 SF tìm > 8 bug P2 → STOP fix, log hết lên epic + escalate coordinator trước khi fix tiếp (tránh SF phình vô hạn). SF-7 nặng nhất (7 specs) — chấp nhận chạy dài hơn các SF khác, coordinator không đánh Done sớm.
- Bug report template (mỗi bug 1 comment trên SF issue): `[P<n>][<DOMAIN>] <title> / repro steps / expected vs actual / evidence (screenshot/DOM) / fix commit hash / regression spec <range>-<n>`

## WAVE SCHEDULE (Tier 1 — 6 SF, cap 4 song song)
- **Wave 1: SF-2, SF-4, SF-7 + 1 slot (SF-3 hoặc SF-5 tùy RAM)** — SF-2 BẮT BUỘC wave 1 (chủ permission files, nhận bug `[PERM]` từ các SF khác); SF-7 nặng nhất nên vào sớm.
- Wave 2: các SF còn lại.

## FILE-OWNERSHIP (chống xung đột cross-SF khi song song)
- **SF-2 DUY NHẤT được sửa** shared permission files: `packages/shared/src/hooks/usePermissions.tsx` (ROLES/PERMISSIONS/PERMISSION_MATRIX), nav config ẩn-hiện menu, `packages/shared/src/index.ts` phần exports permission.
- SF khác tìm bug permission/shared-formatter → LOG bug lên issue mình + comment pointer lên issue SF-2 (tag `[PERM]`); SF-2 fix trong worktree của nó (nó còn chạy song song). Bug permission phát hiện SAU khi SF-2 merge → queue vào SF-8 convergence fix.
- Formatters/shared utils khác: bug trong file shared không thuộc SF nào sở hữu → fix trong SF tìm ra, nhưng PHẢI re-run typecheck + node test của packages/shared trước commit (semantic conflict risk thấp vì fix điểm).
- **CẤM sửa `e2e/tests/sf11-helpers.ts`** (helper dùng chung) — regression specs 10xx–15xx tự chứa helper của mình, KHÔNG import/sửa helper chung.
- Migration DB: QA fixes KHÔNG thêm bảng mới; nếu bắt buộc → cập nhật reset-db.sh CÙNG commit (table-gap lesson).
- **Exit criteria chuẩn mọi SF sweep**: 0 bug P0–P2 mở trong domain + regression specs range xanh + verify-no-regression (re-run specs domain) PASS.

## SF STRUCTURE (8 SF — dependency bracket; mapping đầy đủ 25 specs)
Coverage map (mọi spec thuộc đúng 1 SF; specs = walkthrough checklist + verify-no-regression base):
- SF-1: — (baseline chạy cả 25)
- SF-2: 02-role-matrix
- SF-3: 01-main-flow, 04-regression-8b, 05-intake, 05-d2c, 07-order-ops
- SF-4: 03-audit, 08-audit-viewer, 05-area, 05-settlement, 05-tech-service, 06-exception
- SF-5: 05-kafka, 07-realtime, 08-map
- SF-6: 08-mobile, 09-ktv-mobile, 08-pwa
- SF-7: 05-nvc-api, 07-nvc-fe, 08-print-expansion, 08-export, 05-dashboard, 05-users, 09-webhook
- SF-8: full suite (25 cũ + regression mới)

### SF-1 Baseline + Rubric (Tier 0 — tuần tự, NO parallel)
Boot-verify full stack trên main @ d107f2f: `E2E=1 bash scripts/boot-all.sh` 7/7 ports + realm import. Chạy full Playwright suite hiện có (25 specs, serial) → baseline đỏ/xanh. Viết rubric + coverage map (bản trên) vào docs. **Ownership cap: chỉ fix bug INFRA/seed/boot/fixture** (làm specs đỏ vì môi trường); bug app thật → log lên epic, route sang SF domain tương ứng theo coverage map. Probe /tmp toolchains (ts-proto, grpc-java plugin) còn sống không — nếu chết rebuild.
Tasks: boot-verify / e2e-baseline-run / rubric-doc / fix-infra-reds (mỗi spec đỏ baseline: fix-infra commit HOẶC routing entry sang SF domain) / route-app-bugs / toolchain-probe

### SF-2 Auth + Role Matrix sweep (Tier 1)
Browser quét: login 5 roles (**Coordinator / WarehouseOps / Manager / Admin / WarehouseEmployee** — tên đúng ROLES trong usePermissions.tsx), logout, permission matrix từng role (menu/nút ẩn-hiện đúng PERMISSION_MATRIX), OIDC redirect/callback. Session expiry: test logout + 401-refresh-fail → redirect login qua UI; TTL-expiry thật = manual checklist (đợi/xóa cookie) — không sửa realm TTL. **Sở hữu permission files (xem FILE-OWNERSHIP) + nhận bug `[PERM]` từ SF khác.** Verify-no-regression: re-run 02-role-matrix sau fix. Regression specs: **10xx**.
Tasks: login-5-roles / permission-matrix-walk / session-handling / fix-found-bugs / receive-perm-bugs / regression-spec / verify-no-regression

### SF-3 Orders CRUD + D2C + Intake sweep (Tier 1)
Tạo/sửa/xóa order, search/filter, phân trang, order detail, validate form, i18n vi/en toggle; intake flow (05-intake), D2C consumer flow (05-d2c), order ops (07-order-ops). Regression specs: **11xx**.
Tasks: crud-walk / intake-walk / d2c-walk / order-ops-walk / validation-i18n-walk / fix-found-bugs / regression-spec / verify-no-regression

### SF-4 Fulfillment lifecycle + Ops sweep (Tier 1)
Prep → assign staff → driver → deliver lifecycle qua UI đúng trạng thái; **audit trail: chỉ kiểm mutations đi qua UI trong walkthrough**; area-staff phân công (05-area), settlement/đối soát COD (05-settlement), tech-service (05-tech-service), exception (06-exception), cancel/edge cases. Regression specs: **12xx**.
Tasks: lifecycle-walk / audit-trail-check / area-walk / settlement-walk / tech-service-walk / exception-walk / edge-cases / fix-found-bugs / regression-spec / verify-no-regression

### SF-5 Batching/D1 + Realtime sweep (Tier 1)
Tạo batch, DnD grouping, D1 page realtime update qua Kafka side-channel, quotes NVC; map tracking (08-map). **Kafka chết ≠ bug app — spec 05-kafka là canary, check canary trước khi fix.** Regression specs: **13xx**.
Tasks: batching-walk / d1-realtime-check / map-walk / kafka-canary / fix-found-bugs / regression-spec / verify-no-regression

### SF-6 KTV Mobile + PWA sweep (Tier 1)
Mobile viewport :375 — login, job list, nhận/hoàn thành job (08-mobile, 09-ktv-mobile); offline mode + SW cache qua Playwright (context offline, 08-pwa); **PWA install prompt = manual checklist + screenshot evidence** (browser automation không click được native prompt). Hard-reload khi sweep — MF entry-poisoning + SW cache che bug mới; KHÔNG curl bare `/src/*.ts` trên MF dev server. Regression specs: **14xx**.
Tasks: mobile-walk / pwa-offline-check / pwa-install-manual / sw-cache-hygiene / fix-found-bugs / regression-spec / verify-no-regression

### SF-7 Print/NVC + Admin sweep (Tier 1)
In phiếu (print-service :50053, 08-print-expansion), NVC adapter flows (05-nvc-api + 07-nvc-fe — runner pattern `run-nvc-private.sh` từ /tmp/story/fi233, rebuild nếu /tmp chết), dashboard (05-dashboard), admin export (08-export), users.manage (05-users), webhook (09-webhook). Regression specs: **15xx**.
Tasks: print-walk / nvc-walk / dashboard-walk / export-walk / users-walk / webhook-walk / fix-found-bugs / regression-spec / verify-no-regression

### SF-8 Convergence Regression (Tier 2)
Merge tuần tự: **SF-2 TRƯỚC TIÊN** (chủ shared perm files — SF sau rebase lên perm-fix thay vì conflict), rồi SF-3..7. Private-port seam khi chạy song song. Full e2e suite (25 cũ + regression mới 10xx–15xx) trên nhánh đích. **Reset-db replay: reset-db + boot lại trên nhánh đích sau merge** (chứng minh reset-db không vỡ — table-gap lesson). Cross-flow sanity: **full monorepo typecheck + build** (semantic conflict thường nổ ở bff routes/formatters import, không chỉ shared) + 02-role-matrix. Fix bug `[PERM]` queue từ sau merge SF-2. **Traceability: đối chiếu bug-log P0–P2 ↔ regression specs — mỗi bug fix có đúng 1 spec trong 10xx–15xx và spec đó PASS.** Consolidate bug-log P3+ → comment cuối lên epic. Final browser walkthrough smoke.
Tasks: merge-order / full-suite-run / reset-db-replay / cross-flow-sanity / perm-bug-queue-fix / bug-traceability / p3-log-consolidate / final-walkthrough

## EXECUTION NOTES
- SF-1 tuần tự trước; SF-2..7 song song (cap 4) qua worktrees fork từ nhánh đích, private-port seam E2E_SHELL_URL/E2E_PROXY/E2E_PG_SEAM (pattern run-nvc-private.sh); **mỗi SF boot FULL stack riêng port riêng — Kafka + Keycloak KHÔNG share** (realm redirect chỉ trỏ :3000 chung, share sẽ vỡ auth); nếu RAM không đủ 4 stack → coordinator serialize 2 lượt. SF-8 cuối.
- Regression specs mới: số range 10xx–15xx theo SF (tránh trùng số khi merge), tự lập state, KHÔNG phụ thuộc mutation của specs 01–09.
- Kafka chết ≠ bug app — check canary trước khi fix.
- Latency/perf = P3 log-only (rubric).
