# SF-14 Design Hand-off — Màn Settlement (đối soát COD)

**User gate:** Đã chọn **Hướng B — Summary-cards first** (2026-09-03).
**Fidelity target:** `docs/superpowers/designs/sf-14/direction-b.html` (self-contained HTML, JS demo thật: expand, modal confirm, segmented filter).
**Design system:** tokens từ `packages/shared` design-tokens.ts (primary #EB6E09 + gradient, pill tags có dot, radius 16/8/999/20, shadow scale, Roboto body 14) — kỹ thuật giống DashboardPage SF-9 (CSS/SVG thuần, KHÔNG chart lib), antd4 components.

## Layout contract (bắt buộc)

1. **FilterBar:** RangePicker kỳ (from/to) bên trái + nút Export CSV bên phải.
2. **4 KPI cards** hàng ngang: Đơn hoàn tất · COD kỳ vọng · Đã thu (progress bar thu/kỳ vọng) · Chênh lệch (âm = đỏ).
3. **Segmented filter** theo trạng thái: Tất cả / Đủ / Thiếu thu / Lệch tiền — lọc rows bảng.
4. **Table per shop:** shop (pill tag + dot) · progress bar thu % · tổng đơn · kỳ vọng · đã thu · chênh lệch. Row expandable → drill-down order cards (PENDING / LỆCH TIỀN), per-order PENDING có nút Xác nhận thu → modal nhập số tiền thực thu (prefill kỳ vọng).
5. **Nav:** entry "Đối soát COD" (`/settlement`) append CUỐI NAV_ROUTES, permission `settlement.view`, Manager + Admin.

## States

- Empty kỳ (không có confirmations) → empty-state.
- Loading → skeleton (pattern SF-6).
- Modal confirm: prefill expected, input collected (optional — trống = đủ), confirm → API → refresh.

## Cột CSV export (khớp màn hình)

`shop_code, shop_name, total_orders, total_expected, total_collected, diff_amount, pending_count, mismatch_count` + section drill-down đơn lệch nếu có.
