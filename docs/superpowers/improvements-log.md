## 2026-09-02 — FI-246 (FI-245 SF-1)
- **what**: `~/.claude/bin/story-verify` chọn bracket bằng glob `*.md` (file đầu alphabetically) — repo chứa 3 bracket (fi233/fi245/ict-rebuild) → B3/B4/B5 đọc nhầm story cũ (review:FI-234, dest:story/fi233-*) → VIOLATION ảo chặn gate.
- **where**: story-verify verify_sf() bracket loop.
- **suggested change (APPLIED)**: ưu tiên orca worktree metadata (`linkedLinearIssue` + `baseRef` từ `orca worktree list --json`), bracket glob chỉ fallback. Đã sửa + verify.
- **residual (chưa sửa)**: B2 plan-matching `*sf-N*` cũng match plan của story cũ (sf-1-fe-foundation-plan.md từ FI-233) — PASS là trùng hợp; cân nhắc anchor theo context pack/plan cùng story.

## 2026-09-02 — FI-245 SF-2 (FI-247)
- **story-verify B3 verdict marker**: reviewer agent trả verdict tiếng Việt ("ĐÁNH GIÁ: ĐƯỢC PHÊ DUYỆT") → grep "VERDICT: APPROVED" trượt, B3 FAIL dù review APPROVED thật. Coordinator phải post comment Linear chứa literal marker thủ công. Suggested: story-verify fallback cũng grep file `reviewer-<sf>.md` (không chỉ `code-reviewer-<sf>*.md`) + prompt reviewer agent ép verdict line tiếng Anh literal.

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
