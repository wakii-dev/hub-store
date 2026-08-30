# SF-4 Context Pack — Orders remote: D1 + D1c

> Đọc file này THAY VÌ tự tổng hợp. Spec: docs/superpowers/specs/ict-service-support-mf-spec.md (§5 SF-4) · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-1, SF-2 (api thật :8080), SF-3 (shell router + exposes). Đọc exposes contract trong sf-1.md — expose ĐÚNG `orders/D1Page`.

## Spec slice (SF-4 chịu trách nhiệm)

1. **Remote scaffold**: thay placeholder `orders/D1Page` bằng app thật; namespace i18n `orders.*`; RTK store per-remote; RTK Query slices consume fulfillment API (:8080, qua api-client baseApi — tag `Fulfillment`).
2. **8 filters (2 hàng × 4 cột)** — FilterBar primitives shared: Số đơn hàng (text) / Trạng thái soạn hàng (multi, 4 batchStatus) / TG dự kiến giao (datetime range) / Địa chỉ (multi tỉnh→phường từ regions) / Kho CN (multi) / Trạng thái đơn (multi) / TG tạo đơn (date range) / TG KH mong muốn (datetime range) + Reset. **URL state** (useUrlState) — reload giữ filter (§8b D1).
3. **Bảng 8 cột**: fulfillCode 120 fixed-left (click copy mã) / batchStatus 180 StatusTag / kho CN 320 (shopName + address) / batchCode 150 — **link → navigate `/hub-store-order/batch`** (cross-remote qua RRD singleton — REQUIREMENTS §3 "Link → D2") / originalTime 220 formatPeriodOfTime / deliveryTime 230 (edit — #4) / thao tác (expand + xem chi tiết) / expand → items[].
4. **Edit deliveryTime**: chỉ khi đơn CHƯA có batchCode (rule §9); `PUT /fulfillment/{code}/delivery-time`; invalidate tag Fulfillment.
5. **Selection + BulkActionBar**: hiện khi tick; "Tạo phiếu soạn" primary — **disabled nếu selection khác kho**; "Chuyển kho CN khác" secondary — **disabled nếu ≠1 row**; hint "Lọc đơn theo kho để tạo phiếu soạn". **EXPOSE điểm mount modal cho SF-5: giữ props contract — modal nhận full rows qua props (interface pin §2/§3 v2). Bạn có thể dựng placeholder disabled nút Tạo phiếu (SF-5 thay) — KHÔNG tự viết modal.**
6. **Pagination**: "Tổng N mã" (showTotal) + page size + "Đi đến trang thứ".
7. **D1c HubStoreTransferModal**: select kho đích + confirm → `POST /fulfillment/{code}/assign-shop-hub` → refresh; **disable với `isDebtSplittingOrder=true`**; hiển thị history chuyển kho (`POST /{code}/history` — semantics ĐỌC).
8. i18n keys `orders.*` (VI/EN, không hardcoded).
9. Unit tests (mock api-client): same-shop enable/disable, edit rule, filters mapping.
10. **Acceptance walkthrough §8b D1** (browser Rule 0) — đúng checklist trong ACCEPTANCE dưới.

## Touch map

```
apps/orders/** (trừ skeleton exposes tên)   ← SF-4 SỞ HỮU; SF-5 thêm modal subtree sau
packages/shared, packages/api-client        ← READ-ONLY (frozen sau SF-2)
apps/shell/**, apps/fulfillment/**          ← KHÔNG đụng
services/fulfillment-api/**                 ← KHÔNG đụng (thiếu gì → REQUIREMENT-GAP epic FI-232)
```

## ACCEPTANCE (user-visible — §8b D1, đủ 9 dòng)

- Mở `/hub-store-order/order` → bảng + 8 filters đúng layout.
- Filter batchStatus = Chưa soạn → chỉ đơn Chưa soạn.
- Filter Kho = 30201 → chỉ đơn kho 30201.
- Tick 3 đơn cùng kho → "Tạo phiếu soạn" enable.
- Tick 3 đơn KHÁC kho → disable.
- Tick 1 đơn + "Chuyển kho" → modal select kho đích; confirm → đơn đổi kho.
- Pagination "Tổng N mã" đúng + page size 10 + goto page.
- Expand row → items[] sản phẩm.
- Reload → filter giữ nguyên (URL).

## Boundary (KHÔNG làm)

- KHÔNG viết CreateBatchingModal (SF-5) — chỉ expose điểm mount + rows props contract.
- KHÔNG đụng fulfillment remote, shell, backend.
- KHÔNG test cross-remote (phiếu hiện ở D2 — SF-7).
