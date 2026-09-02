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
