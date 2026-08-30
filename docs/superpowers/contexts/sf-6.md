# SF-6 Context Pack — Fulfillment remote: D2 + D3

> Đọc file này THAY VÌ tự tổng hợp. Spec: docs/superpowers/specs/ict-service-support-mf-spec.md (§5 SF-6) · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-1, SF-2 (api thật), SF-3 (shell). Chạy PARALLEL với SF-4 (cùng tier 2). Đọc exposes contract sf-1.md — expose ĐÚNG `fulfillment/BatchListPage` + `fulfillment/PrintPage`.

## Spec slice (SF-6 chịu trách nhiệm)

1. **Remote scaffold**: 2 expose modules đúng contract; namespace `fulfillment.*`; RTK store per-remote; slices batches API (tag `Batches`).
2. **D2 — 3 filters + URL state**: Số phiếu/Số đơn (text) / Trạng thái phiếu (StatusSelect từ `GET /batches/criteria`) / Thời gian tạo phiếu (DatePicker); reload giữ filter.
3. **Bảng 8 cột**: stopOrder / orderCode (mã RSA) / customerAddress / distance (km) / fromDeliveryTime–toDeliveryTime / orderStatus StatusTag / totalQuantity / codAmount (**VND `15.000.000đ`** VI).
4. **Expand row** → detail + items[].
5. **Hủy phiếu**: enable theo criteria → modal confirm + lý do BẮT BUỘC → `PUT /batches/{code}/cancel` (BE revert đơn batchStatus=0) → refresh.
6. **"Hoàn tất soạn"** (D11): confirm → `PUT /fulfillment/complete-picking` → batch+đơn batchStatus=2.
7. **Nút In** → navigate `/hub-store-order/batch/print?batchCode=<code>` (param pin — PrintPage đọc; cross-remote nav qua RRD singleton).
8. **D3 Print**: route đọc `?batchCode=` (thiếu → empty state quay lại D2); **5 tabs** đúng thứ tự: Biên bản (bill) / Vận đơn (delivery) / Bàn giao (handover_receipt) / Bàn giao hàng (goods_handover) / Lắp đặt (installation_acceptance).
9. **react-pdf** theo spike verdict (`docs/superpowers/spikes/react-pdf-remote.md`): preview **PDF bytes từ BE** (`POST /fulfillment/print` trả application/pdf — contract chốt §3, KHÔNG có endpoint data riêng; cần khác → REQUIREMENT-GAP lên epic FI-232), lazy-mount tab active; zoom slider 50–200%.
10. **Printers**: `GET /fulfillment/print/printers?shopCode=` → dropdown.
11. **In + feedback**: POST print (batchCode, printType, printerCode) → success/error message; **"In tất cả"** = 5 loại một lượt + feedback tổng hợp.
12. i18n keys `fulfillment.*` (VI/EN).
13. Unit tests: filters, cancel gating, COD format, print payload.
14. **Acceptance walkthrough §8b D2 (5 dòng) + D3 (4 dòng)** (browser Rule 0; PDF preview phải NHÌN THẬT — tầng 2 visual screenshot).

## Touch map

```
apps/fulfillment/** (trừ skeleton exposes tên) ← SF-6 SỞ HỮU
packages/shared, api-client                     ← READ-ONLY frozen
apps/shell/**, apps/orders/**                   ← KHÔNG đụng
services/fulfillment-api/**                     ← KHÔNG đụng
docs/superpowers/spikes/react-pdf-remote.md     ← READ-ONLY — verdict quyết định config
```

## ACCEPTANCE (user-visible — §8b D2 + D3, 9 dòng)

- Mở `/hub-store-order/batch` → bảng phiếu; search mã phiếu đúng; filter trạng thái đúng.
- Hủy phiếu (đúng criteria) → confirm + lý do → phiếu hủy, đơn revert (kiểm qua API/GET).
- COD format "15.000.000đ".
- Nút In → route print với batchCode đúng.
- Print: 5 tabs đúng tên/thứ tự; PDF preview NHÌN THẬT + zoom 50–200%; máy in dropdown từ API; In → feedback; In tất cả chạy 5 loại.

## Boundary (KHÔNG làm)

- KHÔNG đụng orders remote / shell / backend; KHÔNG test cross-remote invalidation (SF-7); KHÔNG máy in thật (mock API đủ).
- SF nặng nhất — nếu Phase 3 detail >15 tasks → tách D3 thành SF riêng, báo PM trước.
