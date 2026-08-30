# SF-3 Context Pack — D2 Danh sách phiếu soạn

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: docs/superpowers/specs/ict-service-support-rebuild-spec.md · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-1 (merged — dùng db contract + StatusTag + formatters). Chạy PARALLEL với SF-2 (cùng tier 1).

## Spec slice (SF-3 chịu trách nhiệm)

1. **Handlers batches** (mutate `mocks/db.ts` đúng contract SF-1):
   - `POST /fulfillment/batches/filter` → list BatchingItem (§4), hỗ trợ 3 filters + pagination.
   - `GET /fulfillment/batches/{code}` → detail (đủ items[]).
   - `GET /fulfillment/batches/criteria` → config trạng thái cho phép hủy (chưa hoàn tất).
   - `PUT /fulfillment/batches/{code}/cancel` → mutation: phiếu hủy + **TẤT CẢ đơn trong phiếu revert batchStatus=0 (Chưa soạn)** — không mất đơn.
   - `PUT /fulfillment/complete-picking` → mutation: phiếu + đơn batchStatus=2 (Đã soạn) — quyết định D11.
2. **3 filters + URL state** (useUrlState SF-1): Số phiếu/Số đơn (text search) / Trạng thái phiếu (StatusSelect) / Thời gian tạo phiếu (DatePicker) + reload giữ filter.
3. **Bảng 8 cột**: stopOrder (thứ tự giao) / orderCode (mã đơn RSA) / customerAddress / distance (km) / `fromDeliveryTime–toDeliveryTime` / orderStatus StatusTag / totalQuantity / codAmount — **VND format "15.000.000đ"** (VI).
4. **Expand row** → chi tiết + items[] sản phẩm.
5. **Hủy phiếu**: nút Hủy chỉ enable khi criteria cho phép → modal confirm + input LÝ DO (bắt buộc) → gọi cancel → refresh → assert đơn đã revert.
6. **Nút "Hoàn tất soạn"** (D11): batch-level action ở D2 — confirm → complete-picking → batchStatus đổi Đã soạn.
7. **Nút In + navigation**: điều hướng `/hub-store-order/batch/print?batchCode=<code>` (SF-5 consume param này) — chỉ nút + route, KHÔNG build trang print.
8. **Revert-consistency test**: assert qua db state + batches API của SF-3 (gọi cancel rồi GET batch/đơn qua db export hoặc handler trực tiếp) — **KHÔNG gọi filter handler của SF-2**; verify cross-screen "đơn quay lại D1" là việc SF-6.
9. i18n keys `batch.*` (VI/EN đủ).
10. Unit tests: filters, cancel gating theo criteria, COD format.
11. **Acceptance walkthrough** §8b D2 (browser, Rule 0) — đúng 5 dòng.

## Touch map

```
src/pages/batch-list/            ← SF-3 SỞ HỮU (BatchListPage, BatchFilters, BatchTable, CancelBatchModal)
src/mocks/handlers/batches.ts    ← SF-3 SỞ HỮU (filter/detail/criteria/cancel/complete-picking)
src/api/batchesApi.ts            ← SF-3 SỞ HỮU
src/mocks/db.ts                  ← READ-ONLY (mutation qua handler, không thêm seed)
src/components/, src/utils/       ← READ-ONLY consume
```
KHÔNG đụng: `src/pages/order-list/` (kể cả link D1→D2 của SF-2 — họ own), `src/pages/print/` (SF-5), `src/mocks/handlers/fulfillment.ts` (SF-2).

## ACCEPTANCE (user-visible — §8b D2, 5 dòng)

- Mở `/hub-store-order/batch` → bảng phiếu hiện với seed data.
- Search theo mã phiếu → đúng phiếu; filter trạng thái → lọc đúng.
- Hủy phiếu (đúng criteria) → confirm + lý do → phiếu hủy, đơn revert Chưa soạn (kiểm qua db/API).
- COD format "15.000.000đ" đúng (VI).
- Nút In điều hướng đúng route print với batchCode.

## Boundary (KHÔNG làm)

- KHÔNG build trang print / PDF (SF-5 — chỉ route + param).
- KHÔNG verify "đơn thấy lại ở D1" qua UI D1 (SF-6).
- KHÔNG sửa db.ts seed (contract SF-1).
