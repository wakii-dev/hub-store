# SF-4 Fulfillment lifecycle + Ops sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đi trọn fulfillment lifecycle + 5 ops flows qua browser thật (Rule 0 3 tầng), fix bug P0–P2 trong domain, viết regression specs 12xx, verify-no-regression.

**Architecture:** QA sweep theo checklist specs hiện có; boot full stack riêng private-port (seam E2E_*); mọi mutation đi qua UI walkthrough được check audit trail; bug report template `[P<n>][<DOMAIN>]` lên FI-284.

**Tech Stack:** Playwright e2e (walkthrough specs làm checklist), React/antd UI, Go fulfillment-service + BFF, Postgres seed canonical.

**Linear Issue:** FI-284

---

### Task 1: Boot private-port stack + state prep

**Files:** Create `scripts/run-sf4-private.sh` (nếu chưa có seam runner tái dụng được) hoặc dùng runner có sẵn trong /tmp/story.

- [x] **Step 1.1:** Tìm seam runner pattern (run-nvc-private.sh tại /tmp/story/fi233/ hoặc trong repo scripts/) — đọc để hiểu E2E_SHELL_URL/E2E_BFF_URL/E2E_PROXY/E2E_PG_SEAM + port layout
- [x] **Step 1.2:** Boot full stack port riêng (KHÔNG share Kafka/Keycloak với stack khác đang chạy) — check ports trống trước
- [x] **Step 1.3:** Verify boot: 7/7 services health + login UI được (Rule 0 tầng 1: DOM, tầng 2: screenshot)
- [x] **Step 1.4:** Tự lập state: seed canonical + đủ orders shop 30201 unbatched cho 06-exception

### Task 2: Lifecycle walkthrough (prep→assign staff→driver→deliver)

**Files:** không sửa code trừ khi phát hiện bug.

- [x] **Step 2.1:** Browser flow: chọn đơn → tạo batch (prep) → hoàn tất soạn → assign staff/driver → deliver. Screenshot mỗi bước (VISUAL), snapshot DOM (DOM), đi trọn flow (FLOW)
- [x] **Step 2.2:** Verify trạng thái đơn chuyển đúng sau mỗi mutation (UI badge + API check)
- [x] **Step 2.3:** Bug tìm thấy → log template + fix ngay nếu P0–P2

### Task 3: Audit-trail check + 08-audit-viewer walkthrough

- [x] **Step 3.1:** Sau mỗi mutation UI ở Task 2 → check audit entry ghi đúng actor/action (GET /fulfillment/audit hoặc /audit UI), đợi poll ~15s (fire-and-forget)
- [x] **Step 3.2:** Walkthrough /audit viewer: filter actor/action, range picker, forbidden checks (coordinator/admin không thấy nav-audit)
- [x] **Step 3.3:** Bug → log + fix P0–P2

### Task 4: 05-area walkthrough + fix [P1][AREA]

- [x] **Step 4.1:** Walkthrough /area-staff: list, create (admin), verify payment account, TreeSelect provinces, toggle active, coordinator 403 view-only
- [x] **Step 4.2:** Root-cause baseline bug POST /service-employees 403 (1/2 test đỏ): xác định đúng role/token nào bị 403 oan
- [x] **Step 4.3:** Fix trong domain (KHÔNG đụng usePermissions.tsx — bug permission file → [PERM] lên FI-282)
- [x] **Step 4.4:** Re-run 05-area PASS

### Task 5: 05-settlement walkthrough

- [x] **Step 5.1:** Walkthrough /hub-store-order/batch: cod-badge, Xác nhận thu (batch + order); /settlement: KPI, shop table, segment, row expand cod-order-card
- [x] **Step 5.2:** Đối soát số tiền COD UI ↔ DB/CSV export khớp
- [x] **Step 5.3:** Bug → log + fix P0–P2

### Task 6: 05-tech-service walkthrough + fix [P1][TECH]

- [x] **Step 6.1:** Walkthrough /hub-store-order/tech: delivery tab + tel: links, filter dStatus, installation tab, staff tab + detail modal
- [x] **Step 6.2:** Root-cause baseline bug: SO-0001 NEW không có nút Gán KTV (tech-assign-SO-0001 missing)
- [x] **Step 6.3:** Fix trong domain; re-run 05-tech-service PASS (§5 assign flow: modal → suggest → confirm → toast)

### Task 7: 06-exception + cancel/edge cases walkthrough + fix [P1][EXCEPTION]

- [ ] **Step 7.1:** Tự lập state: ≥2 unbatched orders shop 30201
- [ ] **Step 7.2:** Walkthrough cascade: tạo batch → hoàn tất soạn → mark-fail → redeliver (201 rồi 422 double) → old-order-link trên D1; GET /orders/{code}/audit
- [ ] **Step 7.3:** Root-cause cascade 0/4 baseline; fix P0–P2
- [ ] **Step 7.4:** Cancel/edge cases: hủy đơn từng trạng thái, boundary states
- [ ] **Step 7.5:** Re-run 06-exception PASS

### Task 8: Regression specs 12xx (tự lập state)

- [ ] **Step 8.1:** Viết `e2e/tests/12xx-sf4-regression.spec.ts` (range 12xx) phủ các bug đã fix — tự lập state, KHÔNG import/sửa sf11-helpers.ts
- [ ] **Step 8.2:** Chạy PASS trên stack private-port

### Task 9: verify-no-regression

- [ ] **Step 9.1:** Re-run walkthrough specs domain (03-audit, 05-area, 05-settlement, 05-tech-service, 06-exception) trên stack sau fix — tất cả PASS
- [ ] **Step 9.2:** Browser walkthrough smoke cuối (Rule 0 FLOW): login → lifecycle chính → logout

### Task 10: Merge + gate + Done

- [ ] **Step 10.1:** Phase 5 verify ACCEPTANCE từng dòng (context pack) + code-reviewer độc lập trên diff
- [ ] **Step 10.2:** Merge no-ff vào story/qa-hub-store-regression (conflict improvements-log giữ CẢ HAI) + audit comment merge-hash lên FI-284
- [ ] **Step 10.3:** GATE CỨNG: `~/.claude/bin/story-verify <sf>` sạch
- [ ] **Step 10.4:** Set FI-284 Done (SAU merge)
