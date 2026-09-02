## 2026-09-02 — FI-246 (FI-245 SF-1)
- **what**: `~/.claude/bin/story-verify` chọn bracket bằng glob `*.md` (file đầu alphabetically) — repo chứa 3 bracket (fi233/fi245/ict-rebuild) → B3/B4/B5 đọc nhầm story cũ (review:FI-234, dest:story/fi233-*) → VIOLATION ảo chặn gate.
- **where**: story-verify verify_sf() bracket loop.
- **suggested change (APPLIED)**: ưu tiên orca worktree metadata (`linkedLinearIssue` + `baseRef` từ `orca worktree list --json`), bracket glob chỉ fallback. Đã sửa + verify.
- **residual (chưa sửa)**: B2 plan-matching `*sf-N*` cũng match plan của story cũ (sf-1-fe-foundation-plan.md từ FI-233) — PASS là trùng hợp; cân nhắc anchor theo context pack/plan cùng story.

## 2026-09-02 — FI-245 SF-2 (FI-247)
- **story-verify B3 verdict marker**: reviewer agent trả verdict tiếng Việt ("ĐÁNH GIÁ: ĐƯỢC PHÊ DUYỆT") → grep "VERDICT: APPROVED" trượt, B3 FAIL dù review APPROVED thật. Coordinator phải post comment Linear chứa literal marker thủ công. Suggested: story-verify fallback cũng grep file `reviewer-<sf>.md` (không chỉ `code-reviewer-<sf>*.md`) + prompt reviewer agent ép verdict line tiếng Anh literal.

## 2026-09-02 — FI-245 SF-13 (FI-258)
- **Flyway V2 collision với SF-7**: SF-13 tạo `V2__intake_schema.sql` (cột intake trên orders + bảng `activity_log` contract SF-7: id BIGSERIAL PK, actor, action, target, detail JSONB, created_at). **Rule merge chốt: V2 này canonical cho activity_log — khi SF-7 merge, file `V2__activity_log.sql` của SF-7 phải DROP (bảng đã tồn tại, DDL trùng contract) và SF-7 renumber sang version kế tiếp.** Không drop → Flyway fail boot "found more than one migration with version 2".
- **Field-number reservation `HubStoreOrderFilterItem`**: SF-13 dùng 16-20 (customer_name/customer_phone/fail_reason/fail_note/old_fulfill_code). SF khác thêm field message này phải lấy 21+ — tránh wire-number collision khi merge branch song song.

## 2026-09-02 — FI-258 (SF-13) — orca task deps post-create gap
- **What:** `orca orchestration task-create` hỗ trợ `--deps` lúc tạo, nhưng không có lệnh thêm deps SAU khi task đã tạo (không có `task-update --add-deps`).
- **Where:** orca orchestration CLI.
- **Impact:** coordinator phải enforce dispatch order thủ công (flat task list, tự theo dõi DAG trong plan) — sai lệch một bước là worker chạy thiếu dependency.
- **Suggested change:** thêm `orca orchestration task-update --id <id> --add-deps '["<taskId>"]'` (hoặc `task-deps add`).
