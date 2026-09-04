# Plan — FI-283 SF-3 Orders CRUD + D2C + Intake sweep (QA regression hub-store)

Worktree: /Users/hoivu/orca/workspaces/service-support-clone/sf-3-qa-orders (VuHoi/sf-3-qa-orders)
Nhánh đích: story/qa-hub-store-regression. Tier 1 (epic đã chạy Phase 0-2).
Boundary: apps/orders/** + e2e/tests/11xx-*; CẤM usePermissions.tsx / nav config / sf11-helpers.ts.

## Tasks

- [x] T1 boot-private-stack: container pg :55461 + kc :8182 (realm import SF-2) + migrate (golang-migrate batching, Flyway auto java) + seed-db (PGHOST seam) + run-private.sh (shell:3020 orders:3021 fulfillment:3022 bff:8096 java:50071 go:50072 py:50073, proxy 8290:8080→8096) + mint auth storageStates (auth.setup pattern) — DONE, 7/7 ports UP (lưu ý: daemon Docker flap 2 lần — containers tôi đã set restart=unless-stopped; 8086 bị sf5-kafka-ui chiếm → BFF dời 8096; python port vars đúng là GRPC_PRINT_PORT/PRINT_HEALTH_PORT)
- [ ] T2 walk-01-main-flow: browser Rule 0 3 tầng theo 01-main-flow.spec.ts (tạo phiếu → D2 cross-remote → hủy → revert → in PDF → hoàn tất soạn)
- [ ] T3 walk-04-regression-8b: pagination/goto page 2 (URL page=2) — KIỂM CHỨNG bug 404 GET /orders?page (routing entry SF-4) + expand row + URL state + transfer modal + D2 search/filter
- [ ] T4 walk-05-intake: template download + import preview lỗi row/column + confirm +8 + tạo đơn thủ công
- [ ] T5 walk-05-d2c: bảng 12 đơn + filter carrier/khung giờ + expand + note modal + export guard 31 ngày + role guard WarehouseEmployee/Coordinator
- [ ] T6 walk-07-order-ops: transfer ticket + badge + history + tách nợ gate + delivery time + wizard preset + role gates 403
- [ ] T7 validation-i18n: form create order thiếu trường/sai format + i18n vi/en toggle trên màn orders (spec slice yêu cầu, specs cũ không phủ)
- [x] T8 fix-found-bugs: bug P0-P2 fix ngay (commit riêng từng fix); P3 log-only; >8 P2 → STOP — DONE (2×P2 fix: modal testid 651d2e9, SĐT FE validation 3c87ab9; P3 log-only: avatar 404 by-design, "Please enter 0,productCode" interpolation, "Import có 1 dòng lỗi." sai ngữ cảnh manual-create; verdict 404 GET /orders?page = PHANTOM — route không tồn tại, UI dùng POST /fulfillment/filter)
- [x] T9 regression-spec-11xx: e2e/tests/11xx-* tự lập state (KHÔNG import sf11-helpers.ts) cho bug đã fix + PASS — DONE (1100-orders-modal-validation-regression.spec.ts 4/4 PASS, commit d467981)
- [x] T10 verify-no-regression: re-run 5 walkthrough specs domain PASS trên stack private — DONE (reset-db + seed sạch, chạy lần lượt từng file: 01=3, 04=4, 05-intake=3, 05-d2c=6, 07=7 → 23/23 PASS; ghi chú: chạy combined 1-process bị flake load DnD wizard 01 + 05-d2c(e) timing — lỗi load, không phải regression)
- [ ] T11 code-review độc lập (code-reviewer agent) trên diff — APPROVED mới merge
- [ ] T12 merge story/qa-hub-store-regression (no-ff, conflict improvements-log giữ CẢ HAI) + audit comment merge-hash
- [ ] T13 story-verify sạch → FI-283 Done → orca orchestration task-update task_a7c6bc13f2d0 completed

## ACCEPTANCE (context pack)
1. Từng walkthrough spec PASS (DOM+VISUAL+FLOW) hoặc bug đã fix
2. 0 bug P0-P2 mở trong domain
3. Regression 11xx PASS (tự lập state)
4. verify-no-regression PASS
