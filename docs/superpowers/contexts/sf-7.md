# SF-7 Context Pack — Convergence + QA

> Đọc file này THAY VÌ tự tổng hợp. Spec: docs/superpowers/specs/ict-service-support-mf-spec.md (§5 SF-7) · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-5, SF-6 (TẤT CẢ merged vào story-base). Tier cuối — final story-verify chạy trên output của bạn.

## Spec slice (SF-7 chịu trách nhiệm)

1. **E2E Playwright**: webServer config chạy `pnpm dev` (turbo orchestrate api+shell+2 remotes — KHÔNG boot tay 4 process); viết 1-2 luồng §8 chính cross-remotes: đơn (seed) → D1 filter → tick 3 đơn cùng kho → D1b modal (DnD, suggest, shipper, TG) → tạo phiếu → **navigate sang fulfillment remote** (1 bước riêng: **click link batchCode ở cột Phiếu soạn hàng D1 → D2 mở đúng phiếu đó** — verify task của SF-4) → D2 thấy phiếu → hủy + lý do → đơn revert → tạo lại → In (D3) → Hoàn tất soạn (§8 bước 6).
2. **Cross-remote invalidation verify** theo cơ chế chốt §2 (`refetchOnMount: 'always'`): tạo phiếu ở orders → navigate sang fulfillment → D2 hiện phiếu mới (không stale cache).
3. **Role matrix verify** 3 roles §2 qua role switcher: Coordinator đủ D1/D2/Print; WarehouseOps KHÔNG thấy D1; Manager tất cả; route trực tiếp không đủ quyền → bị chặn.
4. **i18n completeness audit**: scan hardcoded string cả 3 apps → checklist pass/fail (output: Linear comment có checklist tick).
5. **COD/format audit**: VI `15.000.000đ` / EN `15,000,000 ₫` / formatPeriodOfTime nhất quán → checklist.
6. **Build all + docker-compose cấu hình mẫu**: `pnpm build` từng app pass (publicPath prod theo spike verdict; **turbo cache TẮT cho federation build** — remoteEntry stale); docker-compose: api + nginx static shell/remotes — cấu hình MẪU, không phải deliverable deploy (§10).
7. **README full**: chạy dev/test/build/E2E, kiến trúc monorepo, port map, role switcher, JWT dev secret, known-limitations (StrictMode, DnD a11y, spike verdicts, endpoint delivery-staff là scope addition).
8. **Full §8b regression**: TOÀN BỘ checklist 4 screens (9+7+5+4 dòng) — từng dòng pass/fail.
9. **Final gate + STORY-CLOSE verify**: story-verify sạch; tổng hợp SF→merge-hash map cho STORY-COMPLETE.

## Touch map

```
e2e/** (Playwright specs + config)   ← SF-7 SỞ HỮU
docker-compose.yml, README.md        ← SF-7 SỞ HỮU (tạo mới; Dockerfile per-app chỉnh nhỏ nếu thiếu)
turbo.json (đổi cache flag cho build federation) ← chỉnh NHỎ
src apps/** packages/** services/**  ← READ-ONLY — bug phát hiện: KHÔNG tự fix, báo BLOCKED/escalate (trừ bug chặn hoàn toàn E2E — khi đó fix + FLAG LỚN trong notes)
```

## ACCEPTANCE (user-visible)

- E2E Playwright luồng §8 chạy xanh end-to-end trên app thật (không msw) — chứng minh bằng run report.
- Tạo phiếu ở D1 → D2 thấy NGAY khi navigate sang (invalidation đúng).
- 3 roles phân quyền đúng matrix; role switcher hoạt động.
- `pnpm build` tất cả xanh; docker-compose config mẫu chạy được (ít nhất api + shell).
- Full §8b (25 dòng) pass — từng dòng có bằng chứng.

## Boundary (KHÔNG làm)

- KHÔNG refactor code screens; KHÔNG feature mới; KHÔNG deploy thật/CI-CD; KHÔNG đổi acceptance criteria.
- Fix bug chặn E2E phải flag tường minh (SF nào own file đó tự fix là chuẩn).
