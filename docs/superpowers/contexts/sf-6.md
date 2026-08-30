# SF-6 Context Pack — Convergence + QA

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: docs/superpowers/specs/ict-service-support-rebuild-spec.md · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-1..SF-5 (TẤT CẢ merged vào story-base). Đây là tier cuối — story-verify final chạy trên output của bạn.

## Spec slice (SF-6 chịu trách nhiệm)

1. **usePermissions thật**: thay stub all-allowed của SF-1 bằng implementation 3 roles §2:
   - Coordinator (`Coordinate_Fulfillment_List`, `Coordinate_Fulfillment_Shop`) → D1 + D2 + Print
   - Warehouse Ops (`WarehouseOps_CN_PickingList_View|Batch_Create|PickingList_Print`) → D2 + Print
   - Manager (`ServiceOrder_List`, `ServiceOrder_Update`) → tất cả
   - Route gating (`RoleGate`): không đủ quyền → redirect/403 page; ẩn menu/entry không đủ quyền. Auth flow E2E mock: "đăng nhập" (fake SSO) → token → Bearer → role áp dụng.
2. **Luồng E2E §8 ĐẦY ĐỦ** (browser, Rule 0 tầng 3 FLOW): đơn đến (seed) → D1 filter → tick 3 đơn cùng kho → CreateBatchingModal (DnD, suggest, shipper, TG) → tạo phiếu → D2 thấy phiếu → hủy phiếu + lý do → **đơn quay lại D1 filter Chưa soạn (UI THẬT qua D1)** → tạo lại → In (D3) → Hoàn tất soạn (§8 bước 6 — batchStatus Đã soạn). Chứng minh từng bước bằng screenshot/log trong Linear comment.
3. **i18n completeness audit**: scan code còn hardcoded string UI → checklist pass/fail (output: Linear comment có checklist tick).
4. **URL state cross-screen audit**: filter D1 + D2 giữ qua reload → checklist.
5. **COD/format audit**: VI `15.000.000đ` / EN `15,000,000 ₫` / formatPeriodOfTime nhất quán cả 3 screens → checklist.
6. **Build**: `vite build` pass; Dockerfile + nginx.conf SPA fallback (`try_files ... /index.html`) — **cấu hình mẫu, không phải deliverable deploy** (§10).
7. **Full §8b regression**: chạy TOÀN BỘ checklist 4 screens (9+7+5+4 dòng) → báo từng dòng pass/fail.
8. **README**: cách chạy dev/test/build, mock data, role switcher, known-limitations (D9 StrictMode, D10 a11y DnD, spike verdicts).
9. **Final gate**: story-verify sạch + tổng hợp kết quả cho STORY-COMPLETE.

## Touch map

```
src/auth/permissions.ts + RoleGate  ← SF-6 SỞ HỮU (thay stub SF-1 — giữ interface usePermissions)
src/app/layout/ (menu theo role)     ← chỉnh nhỏ
Dockerfile, nginx.conf, README.md    ← SF-6 SỞ HỮU (tạo mới)
tests/e2e/ (walkthrough specs)       ← SF-6 SỞ HỮU
src/** khác                          ← READ-ONLY — phát hiện bug screen khác: KHÔNG tự fix, báo BLOCKED/escalate
```
KHÔNG đụng: seed db.ts, handlers (trừ khi bug chặn E2E — khi đó flag, không sửa lén).

## ACCEPTANCE (user-visible)

- Chọn role Coordinator → thấy đủ D1/D2/Print; chọn Warehouse Ops → không thấy D1; Manager → tất cả. Chạy trực tiếp route không đủ quyền → bị chặn.
- Luồng E2E §8 chạy trọn từ đầu đến cuối KHÔNG reload tay, dữ liệu nhất quán (tạo → thấy → hủy → revert → tạo lại → in → hoàn tất).
- Toàn bộ checklist §8b (25 dòng) pass — chứng minh bằng browser thật.
- `vite build` + `docker build` (cấu hình mẫu) thành công; README đủ cho người mới chạy app.

## Boundary (KHÔNG làm)

- KHÔNG refactor code screens (chỉ fix bug chặn E2E, và phải flag).
- KHÔNG thêm feature mới; KHÔNG deploy thật (chỉ cấu hình mẫu).
- KHÔNG đổi acceptance criteria.
