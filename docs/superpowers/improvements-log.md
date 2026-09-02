## 2026-09-02 — FI-246 (FI-245 SF-1)
- **what**: `~/.claude/bin/story-verify` chọn bracket bằng glob `*.md` (file đầu alphabetically) — repo chứa 3 bracket (fi233/fi245/ict-rebuild) → B3/B4/B5 đọc nhầm story cũ (review:FI-234, dest:story/fi233-*) → VIOLATION ảo chặn gate.
- **where**: story-verify verify_sf() bracket loop.
- **suggested change (APPLIED)**: ưu tiên orca worktree metadata (`linkedLinearIssue` + `baseRef` từ `orca worktree list --json`), bracket glob chỉ fallback. Đã sửa + verify.
- **residual (chưa sửa)**: B2 plan-matching `*sf-N*` cũng match plan của story cũ (sf-1-fe-foundation-plan.md từ FI-233) — PASS là trùng hợp; cân nhắc anchor theo context pack/plan cùng story.

## 2026-09-02 — FI-245 SF-2 (FI-247)
- **story-verify B3 verdict marker**: reviewer agent trả verdict tiếng Việt ("ĐÁNH GIÁ: ĐƯỢC PHÊ DUYỆT") → grep "VERDICT: APPROVED" trượt, B3 FAIL dù review APPROVED thật. Coordinator phải post comment Linear chứa literal marker thủ công. Suggested: story-verify fallback cũng grep file `reviewer-<sf>.md` (không chỉ `code-reviewer-<sf>*.md`) + prompt reviewer agent ép verdict line tiếng Anh literal.
