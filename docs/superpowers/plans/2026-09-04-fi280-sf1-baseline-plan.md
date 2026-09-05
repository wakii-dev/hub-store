# SF-1 Baseline + Rubric Implementation Plan (FI-281)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, sequential — Tier 0 NO parallel). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng baseline đỏ/xanh 25 e2e specs + rubric ground truth cho SF-2..7.

**Architecture:** Boot full stack qua boot-all.sh (E2E=1 reset trước), chạy Playwright serial với E2E_REUSE, phân loại spec đỏ infra-vs-app theo touch map, materialize rubric từ epic spec.

**Tech Stack:** Docker compose (postgres/keycloak/kafka), Java/Go/Python services, BFF Node, Playwright, Vite MF shell.

**Linear Issue:** FI-281

**Worktree:** `sf-1-qa-baseline` (branch `VuHoi/sf-1-qa-baseline`) — merge target `story/qa-hub-store-regression`.

---

### Task 1: boot-verify — full stack 7/7 ports

**Files:** none (verify-only; fix `scripts/*` chỉ nếu boot bug)

- [x] Step 1: Kill listener cũ trên app ports (boot-all tự làm) — chạy `E2E=1 BOOT_ONLY=1 bash scripts/boot-all.sh` với log `/tmp/story/fi280-sf1/`
- [x] Step 2: Verify 7/7 ports: `for p in 3000 8080 50051 50052 50053 5432 8081; do nc -z localhost $p; done` — tất cả mở
- [x] Step 3: Verify realm: `curl -sf http://localhost:8081/realms/hubstore` — HTTP 200
- [x] Step 4: Verify shell responsive: `curl -sf http://localhost:3000` — HTML trả về
- [x] Step 5: Ghi kết quả (boot ok/bug infra tìm thấy) — nếu boot fail → fix infra trước khi qua Task 2

### Task 2: e2e-baseline-run — 25 specs serial

**Files:** none (chạy-only; output = report)

- [x] Step 1: `cd e2e && E2E_REUSE=1 npx playwright test 2>&1 | tee /tmp/story/fi280-sf1/baseline-run1.log` — serial workers=1 (config đã set)
- [x] Step 2: Parse verdict từng spec (passed/failed/flaky) từ log; lưu bảng
- [x] Step 3: Với MỖI spec đỏ: re-run 1 lần `E2E_REUSE=1 npx playwright test <spec>` chống flake (kafka indexing-delay, máy load — known)
- [x] Step 4: Chốt baseline verdict 25/25; lưu file `/tmp/story/fi280-sf1/baseline-verdicts.md`

### Task 3: rubric-doc — qa-rubric.md ground truth

**Files:** Create: `docs/superpowers/qa-rubric.md`

- [x] Step 1: Copy từ epic spec `docs/superpowers/specs/fi280-qa-hub-store-regression-spec.md`: TRIAGE RUBRIC (P0–P3 + escape hatch + bug template), COVERAGE MAP (25 specs ↔ SF-1..8), FILE-OWNERSHIP, EXECUTION NOTES
- [x] Step 2: Thêm section BASELINE FI-281: verdict 25/25 từ Task 2 (ngày chạy, commit base)
- [x] Step 3: Commit `docs(sf-1): qa-rubric.md — rubric + coverage map + ownership + baseline`

### Task 4: fix-infra-reds — spec đỏ do môi trường

**Files:** Modify (chỉ nếu cần): `scripts/*`, `e2e/fixtures/*`, `e2e/playwright.config.ts` (infra-level), `docker-compose.yml`

- [x] Step 1: Với từng spec đỏ chốt ở Task 2: phân loại root cause — infra (docker/seed/boot/fixture/port) vs app (behavior sai)
- [x] Step 2: Infra → fix + re-run spec đó → PASS → commit `fix(e2e): <mô tả>` (1 commit/nhóm fix)
- [x] Step 3: App bug → KHÔNG fix — ghi vào danh sách route (Task 5)
- [x] Step 4: Nếu 0 spec đỏ → task này no-op, ghi "0 red, no fix needed"

### Task 5: route-app-bugs — bug app lên epic

**Files:** none (Linear comment)

- [x] Step 1: Mỗi bug app từ Task 4: comment lên epic FI-280 theo template `[P<n>][<DOMAIN>] <title> / repro / expected vs actual / evidence / fix: route → SF-<domain>`
- [x] Step 2: Routing theo coverage map: orders→SF-3, fulfillment/audit→SF-4, batching/kafka→SF-5, mobile/pwa→SF-6, print/nvc/admin→SF-7, perm→SF-2
- [x] Step 3: Ghi routing entries vào qa-rubric.md baseline section (append + commit)

### Task 6: toolchain-probe — /tmp ts-proto + grpc-java plugin

**Files:** none (probe + rebuild nếu chết)

- [x] Step 1: Probe grpc-java plugin: `ls /tmp/sf1-spikes/bin` + thử chạy binary `--version` → sống/chết
- [x] Step 2: Probe ts-proto npm dir: tìm path /tmp npm dir từ memory fi233-story-patterns (`/tmp/story/fi233` hoặc glob /tmp/*ts-proto*); chết → rebuild `npm install --prefix /tmp/story/fi280-sf1/ts-proto-tool ts-proto` (theo memory)
- [x] Step 3: Ghi kết quả lên FI-281 (sống/chết/rebuilt + path mới)

---

## Verification (Phase 5)
Kiểm từng dòng ACCEPTANCE context pack fi280-sf-1.md (5 dòng) + browser verify Rule 0 + code-reviewer độc lập + merge no-ff vào story/qa-hub-store-regression + `~/.claude/bin/story-verify sf-1` sạch → FI-281 Done.
