## 2026-09-02 — FI-246 (FI-245 SF-1)
- **what**: `~/.claude/bin/story-verify` chọn bracket bằng glob `*.md` (file đầu alphabetically) — repo chứa 3 bracket (fi233/fi245/ict-rebuild) → B3/B4/B5 đọc nhầm story cũ (review:FI-234, dest:story/fi233-*) → VIOLATION ảo chặn gate.
- **where**: story-verify verify_sf() bracket loop.
- **suggested change (APPLIED)**: ưu tiên orca worktree metadata (`linkedLinearIssue` + `baseRef` từ `orca worktree list --json`), bracket glob chỉ fallback. Đã sửa + verify.
- **residual (chưa sửa)**: B2 plan-matching `*sf-N*` cũng match plan của story cũ (sf-1-fe-foundation-plan.md từ FI-233) — PASS là trùng hợp; cân nhắc anchor theo context pack/plan cùng story.

## 2026-09-02 — FI-245 SF-2 (FI-247)
- **story-verify B3 verdict marker**: reviewer agent trả verdict tiếng Việt ("ĐÁNH GIÁ: ĐƯỢC PHÊ DUYỆT") → grep "VERDICT: APPROVED" trượt, B3 FAIL dù review APPROVED thật. Coordinator phải post comment Linear chứa literal marker thủ công. Suggested: story-verify fallback cũng grep file `reviewer-<sf>.md` (không chỉ `code-reviewer-<sf>*.md`) + prompt reviewer agent ép verdict line tiếng Anh literal.

## 2026-09-03 — FI-245 SF-15 (FI-260)
- **In-memory seq vs persistent DB (FI-245)**: MockClient.seq reset 1000 mỗi boot, bookings row persist qua restart → duplicate MOCK-1001 → 23505 → booking 500. Chỉ phát hiện ở e2e post-merge (ngày hôm sau, DB còn data). Pattern: mọi counter/sequence in-memory persist vào DB FI-245 phải seed từ DB lúc boot (SeedSeq). Suggested: thêm checklist item "state in-memory có persist counterpart?" vào review template.
- **Shared dev DB + sibling migrations**: shared fulfillment DB có flyway V2/V4 (SF-13/SF-17 worktree) mà worktree hiện tại không có file → boot fail validation. Workaround private-run: SPRING_FLYWAY_VALIDATE_ON_MIGRATE=false (không đụng shared state). Suggested: boot-all chuẩn sẽ tự hết khi các SF merge; cân nhắc env flag chính thức cho dev-run.
- **Orca CLI read-back flaky**: `orca linear issue <id> --comments --json` thỉnh thoảng trả ok:true nhưng KHÔNG có key result (comments post ok:true và story-verify đọc được) — không được kết luận "comment không tồn tại" từ read-back fail. Đã có ghi chú tương tự (comment list) trong memory 30/8.
## 2026-09-02 — FI-245 SF-13 (FI-258)
- **Flyway V2 collision với SF-7**: SF-13 tạo `V2__intake_schema.sql` (cột intake trên orders + bảng `activity_log` contract SF-7: id BIGSERIAL PK, actor, action, target, detail JSONB, created_at). **Rule merge chốt: V2 này canonical cho activity_log — khi SF-7 merge, file `V2__activity_log.sql` của SF-7 phải DROP (bảng đã tồn tại, DDL trùng contract) và SF-7 renumber sang version kế tiếp.** Không drop → Flyway fail boot "found more than one migration with version 2".
- **Field-number reservation `HubStoreOrderFilterItem`**: SF-13 dùng 16-20 (customer_name/customer_phone/fail_reason/fail_note/old_fulfill_code). SF khác thêm field message này phải lấy 21+ — tránh wire-number collision khi merge branch song song.

## 2026-09-02 — FI-258 (SF-13) — orca task deps post-create gap
- **What:** `orca orchestration task-create` hỗ trợ `--deps` lúc tạo, nhưng không có lệnh thêm deps SAU khi task đã tạo (không có `task-update --add-deps`).
- **Where:** orca orchestration CLI.
- **Impact:** coordinator phải enforce dispatch order thủ công (flat task list, tự theo dõi DAG trong plan) — sai lệch một bước là worker chạy thiếu dependency.
- **Suggested change:** thêm `orca orchestration task-update --id <id> --add-deps '["<taskId>"]'` (hoặc `task-deps add`).

## 2026-09-02 — FI-258 (SF-13) — activity_log V5 collision thực tế (SF-7 merge-before)
- **What:** SF-7 đã tạo `V5__activity_log.sql` (epic shape `target_type`/`target_id` NOT NULL, IF NOT EXISTS coexist) TRƯỚC khi SF-13 merge — đảo ngược giả định cũ của spec D9 ("SF-13 V2 canonical, SF-7 drop V2"). DB dev chung bị reset giữa chừng → V5 áp trước, `activity_log` không có cột `target` → V2 cũ `CREATE TABLE` chết.
- **Resolution:** V2 viết lại IDEMPOTENT 2 chiều (CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN IF NOT EXISTS `target` + index tên riêng `idx_activity_log_target_code` tránh trùng tên index V5). Cả 2 thứ tự apply (V2-first / V5-first) cho shape coexist. SF-13 chỉ ghi/đọc cột `target` — deprecated ở tầng converge (đúng comment phối hợp trong V5 của SF-7).
- **Bài học cross-SF:** merge rule dạng "A canonical, B phải drop" dễ vỡ khi 2 SF merge-before song song. Migration bảng chia sẻ giữa 2 SF nên idempotent từ đầu (IF NOT EXISTS + ADD COLUMN IF NOT EXISTS + index namespaced).
- **Ghi đè entry cũ:** "V2 canonical, SF-7 drop V2__activity_log.sql + renumber" — KHÔNG còn đúng; giữ làm audit trail.

## 2026-09-02 — FI-258 (SF-13) — flyway out-of-order tradeoff
- **What:** bật `spring.flyway.out-of-order: true` (application.yml) để V2__intake_schema không bị Flyway skip im lặng trên DB đã áp V5 watermark cao hơn (round-2 review P1).
- **Tradeoff ghi nhận:** migration mới trong tương lai có version thấp hơn watermark sẽ áp out-of-order im lặng thay vì fail — chấp nhận được ở service này (repo không có down-migration; version mới luôn tăng). SF khác thêm migration nhớ đặt version > max watermark.
## 2026-09-02 — FI-262 (FI-245 SF-17)
- **what**: `orca orchestration task-create --run <run-của-coordinator-khác>` → `consumer_fenced` (terminal này không bind run đó). SF chạy trong worktree riêng không thể append DAG vào run story.
- **where**: orca-superpowers-workflow Phase 3 Bridge 3 (mẫu lệnh dùng chung 1 run cho cả story).
- **suggested change**: mỗi SF/MF tạo run riêng (run-create) thay vì reuse run story; hoặc tài liệu hoá `run-use --id` để bind trước (đã thấy trong memory nhưng không đủ với consumer_fenced).
- **residual**: không — tạo run mới `run_578551edc89b` giải quyết.
- **what**: ports E2E hardcode (3000/50051/50052/50053/8080/3001/3002 + keycloak 8081) không có env override; 2 SF song song không thể chạy E2E đồng thời → phải serialize bằng tay (user phải chọn đợi/stop).
- **where**: scripts/boot-all.sh PORTS kill-list + playwright.config baseURL + packages/api-client baseURL :8080 + realm redirect :3000.
- **suggested change**: PORT_* env suite (boot-all, playwright baseURL, api-client, realm redirect) để mỗi worktree boot stack port riêng; hoặc tài liệu hoá quy ước "1 stack E2E tại một thời điểm + coordinator đăng ký lịch".
- **what**: keycloak realm JSON chỉ áp khi volume `keycloak-data` mới — thêm user mới vào realm (vd Admin SF-17) không có tác dụng trên dev volume cũ → auth.setup fail khó hiểu.
- **where**: compose keycloak --import-realm + boot-all.sh.
- **suggested change**: boot-all.sh thêm check user mới (token probe) + flag `RESET_KC=1` để reset volume keycloak-data tự động; hoặc import user bù qua kcadm khi thiếu.

## 2026-09-02 — FI-245 SF-27 (FI-273)
- **what**: story-verify B3 false-FAIL do Linear comment indexing delay (vài phút) — comment VERDICT: APPROVED đã post thành công (ok:true) nhưng `orca linear issue --comments` chưa trả về → B3:FAIL. Re-run sau delay → PASS (comment xuất hiện).
- **where**: story-verify verify_sf() B3 — đọc comments một lần, không retry.
- **suggested change**: B3 khi không thấy marker → sleep 60-90s rồi fetch lại 1 lần trước khi FAIL (phân biệt "chưa index" vs "không có marker"). Related: entry SF-2 (verdict marker tiếng Việt) — cùng hàm B3, nên fix chung.
- **status**: OPEN — coordinator workaround bằng re-run, chưa sửa bin script.


## 2026-09-03 — FI-276 (SF-3 Keycloak on k8s)

1. **story-verify B3: orca CLI `--comments` chớp nớt trả rỗng.**
   `orca linear issue FI-276 --comments --json` (bản CLI hiện tại) đôi lúc trả
   `result` không có key `comments` dù write comment ok:true ngay trước đó →
   B3 linear-check đọc 0 comments → FAIL/OUTBOX ảo dù VERDICT đã post.
   Suggested change: B3 thêm retry/GraphQL fallback khi `result.comments` thiếu
   key (khác với có key nhưng rỗng), hoặc CLI sửa để luôn trả comments array.

2. **story-verify OUTBOX grep khớp nhầm file story khác.**
   Fallback `grep -l "VERDICT: APPROVED" /tmp/story/*/code-reviewer-<sfp>*.md`
   không giới hạn thư mục story → khi story FI-272 chưa có verdict file,
   script bắt nhầm `/tmp/story/fi245/code-reviewer-sf-3.md` (review của
   "Batches Go → Postgres", KHÔNG liên quan) và báo OUTBOX sai.
   Suggested change: chặn pattern theo story dir đang chạy (ví dụ
   `/tmp/story/<story-slug>/`) hoặc soi header `Issue: FI-<id>` trong file
   trước khi tính OUTBOX.

3. **Linear write rate-limit chớp nớt (2500 req/h).**
   Cùng window: comment write ok, ngay sau đó `status set` rate-limited,
   5 phút sau tự thông. Nhiều SF chạy song song cùng bơm Linear.
   Suggested change: script/gate Linear-write nên backoff-retry (60s→180s→300s)
   thay vì fail ngay; hoặc orca CLI có sẵn retry với `Retry-After`.

## 2026-09-03 — FI-245 SF-23 (FI-268)
- **MF dev-server entry-poisoning (@module-federation/vite 1.21.1)**: nhánh fallback dev (`inject:"html"`, `!clientInjected`) bọc module TS/JS ĐẦU TIÊN được transform trước lần load index.html đầu thành "app entry" (bootstrap wrapper không có static exports) → module đó hỏng tại URL bare, mọi importer link-error, app chết tàng hình. Trigger thực tế: curl/đọc module bare URL trực tiếp sau khi restart dev server (debug). Rule: KHÔNG curl bare `/src/*.ts` trên MF dev server; nếu app chết "không rõ lý do" sau debug session → restart server và chỉ load qua page.
- **Story merge-back KHÔNG được假设 ancestor**: `story/fi245-postgres-production` tiến 71 commits trong lúc SF chạy. Update-ref mù = rewind base, mất work SF khác. Luôn `git merge-base --is-ancestor` trước; nếu không → merge base vào nhánh SF (conflicts keep-both: shared/index.ts exports, CreateBatchingModal imports, bff app.ts routes) rồi update-ref. Suggested: thêm check ancestor vào story-verify B4 (hiện chỉ check dest ref reachable).
- **`orca orchestration task-update` dùng `--id`** không phải `--task` (error validFlagsreveals). Note vào watchdog memory.
- **SW register sau MF bootstrap**: MF dev bootstrap execute main.tsx SAU `load` → `window.addEventListener('load')` treo vĩnh viễn. Pattern: `document.readyState === 'complete' ? register() : addEventListener(...)`.

## 2026-09-04 — FI-280 SF-1 (FI-281)
- **story-verify B2 substring-match bug (ĐÃ FIX trong ~/.claude/bin/story-verify)**: pattern `*sf1*` khớp nhầm `fi245-sf13-order-intake-plan.md` cho SF `sf-1` (sf13 ⊃ sf1) → B2 FAIL ảo với plan của SF khác. Fix: dash-boundary match (`sf1-`/`sf1_` + non-digit). Suggested by gate run FI-281 04/09.
- **orca linear read-back comments trả 0 despite comment tồn tại** (FI-280/FI-281 đều vậy, post ok:true có URL) — không tin read-back để dedupe; dùng transcript/URL trả về từ lệnh post. Flag: orca CLI bug chưa fix.
- **.env clobber class mở rộng**: root `.env` KHÔNG được chứa BẤT KỲ var nào seam runners override (đã chốt FULFILLMENT_DB_*/OIDC_*/GRPC_*); runner scripts nên export sau `source .env` thay vì prefix-env để tự phòng.
