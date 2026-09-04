# Plan — FI-285 SF-5 Batching/D1 + Realtime sweep (Tier 1)

Epic: FI-280 qa-hub-store-regression. Bracket: docs/superpowers/brackets/fi280-qa-hub-store-regression.md (SF-5).
Context pack: docs/superpowers/contexts/fi280-sf-5.md. Linear: FI-285.
Worktree: /Users/hoivu/orca/workspaces/service-support-clone/sf-5-qa-batching (branch VuHoi/sf-5-qa-batching).
Merge target: story/qa-hub-store-regression (no-ff; improvements-log conflict giữ CẢ HAI).

## Nguyên tắc
- Walkthrough = browser thật Rule 0 3 tầng (DOM→VISUAL→FLOW); specs hiện có (05-kafka, 07-realtime, 08-map) làm CHECKLIST, không chỉ "spec pass".
- KAFKA CHẾT ≠ BUG APP — canary kafka TRƯỚC khi fix bất kỳ bug realtime (Task 2 trước Task 5).
- Bug → comment FI-285 theo template [P<n>][<DOMAIN>]; fix P0–P2 ngay, P3+latency chỉ log; >8 bug P2 → STOP escalate epic.
- CẤM sửa: packages/shared/src/hooks/usePermissions.tsx, nav config, e2e/tests/sf11-helpers.ts.
- Regression spec 13xx: tự lập state, KHÔNG import sf11-helpers.

## Private seam SF-5 (KHÔNG share Kafka/Keycloak/port với SF-4 hay stack chính)
Port block: shell :4310 · orders :4311 · fulfillment :4312 · BFF :4295 · Java :52081 (health 52083) ·
Go :52082 (health 52084) · print :52085 (health 52086) · postgres sf5-postgres :56443 ·
keycloak sf5-keycloak :8283 · kafka sf5-kafka host :9094 (internal 29092) · kafka-ui sf5-kafka-ui :8086.
Kafka: docker chạy riêng trên network sf5-net (kafka KRaft apache/kafka:3.9.0 + init-topics.sh + kafka-ui),
KAFKA_ENABLED='true' (đúng chữ) qua worktree .env (Go run.sh source .env OVERWRITE shell export — SF-27 spec §runbook) + KAFKA_BOOTSTRAP_SERVERS=localhost:9094.
Gotcha spec 05-kafka hardcode KAFKA_UI=:8085 (shared) — walkthrough dùng kafka-ui riêng :8086; spec là checklist.

## Tasks
### Task 1 — Seam runner + kafka canary infra
Files: scripts/run-sf5-private.sh (new; adapt 7594fd5 run-sf4-private.sh — kafka on, port block mới),
worktree .env (local-only, KHÔNG commit).
Verify: kafka broker sống + 3 topics (order-events/batch-events/notification-events) + kafka-ui :8086 trả envelope topics.
### Task 2 — Kafka canary + 05-kafka walkthrough (browser)
Checklist 05-kafka: login coordinator qua UI :4310 → D1 → assign shop-hub → order.assigned trên order-events;
create batch (UI tạo batch) → batch.created trên batch-events; verify bằng kafka-ui REST :8086 (SSE parse pattern spec).
Kafka canary PASS mới được đổ lỗi cho app ở Task 5.
### Task 3 — 07-realtime walkthrough (browser 2 tab)
Spec A: page A gán shop qua UI (bulk-transfer modal) → page B row đổi KHÔNG reload ~5s (SSE).
Spec B: chặn /events trên page B → polling update (~9s). DOM+screenshot mỗi bước.
### Task 4 — 08-map walkthrough (browser)
Test 1: batch list → tracking modal → tab bản đồ → markers stopOrder + warehouse + popup (seed planningMap).
Test 2: tech map tab → pins theo trạng thái + popup tel: + note thiếu toạ độ.
### Task 5 — fix-found-bugs
Fix P0–P2 trong touch map (services/batching-service, apps/orders/src/batching, D1 page); [PERM] → log + comment FI-282; P3 chỉ log.
### Task 6 — Regression spec 13xx + verify-no-regression
Files: e2e/tests/13xx-sf5-batching-realtime.spec.ts (tự lập state, không import sf11-helpers) — phủ: create batch,
DnD grouping nếu có UI, realtime SSE update, kafka publish (private seam env), map render.
Re-run walkthrough domain sau fix (verify-no-regression).
### Task 7 — Review + merge + gates
code-reviewer độc lập trên diff → merge no-ff vào story/qa-hub-store-regression (ancestor-guard + update-ref) →
audit comment merge-hash → story-verify sạch → FI-285 Done.

## ACCEPTANCE (từ context pack — Phase 5 kiểm từng dòng)
1. Từng walkthrough spec đi trọn qua browser PASS (DOM+VISUAL+FLOW) hoặc bug đã fix.
2. 0 bug P0–P2 mở trong domain (bug-log comment hoàn chỉnh từng bug trên FI-285).
3. Regression specs range 13xx PASS (tự lập state).
4. verify-no-regression: walkthrough specs domain re-run PASS sau fix.
