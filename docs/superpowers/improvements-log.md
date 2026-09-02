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
