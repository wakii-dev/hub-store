# SF-5 Context Pack — Orders remote: D1b CreateBatchingModal

> Đọc file này THAY VÌ tự tổng hợp. Spec: docs/superpowers/specs/ict-service-support-mf-spec.md (§5 SF-5 + tier-gate) · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-4 (merged — D1 + điểm mount modal + rows props contract). ĐỌC TRƯỚC: docs/superpowers/spikes/dnd-react18.md — lib DnD BẮT BUỘC theo verdict.

## Spec slice (SF-5 chịu trách nhiệm)

1. **Modal shell 1310×918** mở từ nút "Tạo phiếu soạn" (SF-4 để điểm mount) — nhận **full rows qua props** (interface pin — KHÔNG re-fetch lúc mở).
2. **Bảng đơn đã chọn** (sortable): Thứ tự giao | Mã đơn RSA | Địa chỉ KH | Khoảng cách (km) | TG hẹn giao | Trạng thái | SL SP | COD (VND).
3. **DnD sortable** (theo spike verdict: react-sortable-hoc+array-move, hoặc dnd-kit nếu verdict fallback — FLAG deviation trong notes): kéo thả → stopOrder cập nhật toàn bộ.
4. **Packing suggest**: `POST /fulfillment/batches/packing-suggest` + UI gợi ý nhóm theo khoảng cách.
5. **Recalculate distance**: `POST /fulfillment/batches/recalculate-distance` + nút tính lại km.
6. **Thêm đơn**: search qua `POST /fulfillment/filter` với `shopCode` + `excludeFulfillCodes` (BE chỉ trả batchStatus=0 cùng kho — SF-2 đã chốt) → thêm vào CUỐI bảng.
7. **Gán shipper**: `DeliveryStaffSelect` — `GET /master-data/delivery-staff` (endpoint bổ sung SF-2).
8. **Chọn TG giao**: DatePicker + hint từ `GET /order-promising/time-delivery` (D4).
9. **Tạo phiếu**: `POST /fulfillment/batches/create` (BE reject đơn batchStatus≠0) — gửi thứ tự stopOrder theo DnD + shipper + TG giao.
10. **Success flow**: đóng modal + same-remote tag invalidation (Fulfillment/Batches); **cross-remote (D2 thấy phiếu) KHÔNG phải việc bạn** — cơ chế `refetchOnMount: 'always'` đã chốt §2, SF-7 verify.
11. i18n keys `orders.createBatch.*`.
12. Tests: DnD đổi stopOrder, payload create đúng thứ tự, thêm đơn vào cuối.
13. **Acceptance walkthrough §8b D1b — 6/7 dòng** (browser Rule 0). **Tier-gate: KHÔNG test "phiếu xuất hiện ở D2" (cross-SF → SF-7); gate của bạn test mutation qua API thật (phiếu sinh, đơn đổi status) — kiểm bằng response/GET batches trực tiếp.**

## Touch map

```
apps/orders/src/.../create-batch/**   ← SF-5 SỞ HỮU (Modal, SortableTable, AddOrderSearch, ShipperSelect, PackingSuggest)
apps/orders BulkActionBar (điểm mount) ← chỉnh NHỎ, giữ props contract SF-4
packages/shared, api-client            ← READ-ONLY frozen
apps/fulfillment/**, apps/shell/**     ← KHÔNG đụng
services/fulfillment-api/**            ← KHÔNG đụng
docs/superpowers/spikes/dnd-react18.md ← READ-ONLY — verdict quyết định lib
```

## ACCEPTANCE (user-visible — §8b D1b, 6/7 dòng)

- Mở modal từ 3 đơn cùng kho → bảng 8 cột hiện.
- Kéo thả hàng → thứ tự giao (stopOrder) đổi.
- "Packing suggest" → gợi ý nhóm hiện.
- Search + thêm đơn → thêm vào cuối.
- Gán shipper (dropdown staff) + TG giao (DatePicker + gợi ý) chọn được.
- Tạo phiếu → modal đóng, D1 refresh; (API) phiếu sinh + đơn batchStatus=1 đúng thứ tự DnD.

## Boundary (KHÔNG làm)

- KHÔNG verify D2 UI (SF-7); KHÔNG sửa backend/shell/fulfillment remote; KHÔNG đổi rows props contract.
