# SF-8 Context Pack — Orders remote: D1b CreateBatchingModal
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §5 SF-8). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 4 (deps SF-7, SF-4). SF-7 (cùng remote orders) và SF-4 (Go) đã merge.

## Spec slice (SF-8 chịu trách nhiệm)
1. **CreateBatchingModal 1310×918** — lắp vào placeholder SF-7 để lại, trigger "Tạo phiếu soạn" trên D1:
   - **Danh sách đơn đã chọn**: bảng sortable — cột Thứ tự giao | Mã đơn RSA | Địa chỉ KH | Khoảng cách (km) | TG hẹn giao | Trạng thái | SL SP | COD. **Rows nhận qua PROPS từ D1 selection** (interface pin — KHÔNG re-fetch).
   - **DnD sortable → stopOrder** (lib theo SPIKE 3 verdict SF-1): kéo thả đổi THỨ TỰ GIAO.
   - **Packing suggest**: gọi handler → gợi ý nhóm đơn theo khoảng cách (UI nhóm/màu).
   - **Recalculate distance**: nút tính lại km.
   - **Thêm đơn**: search đơn CÙNG kho (`POST /fulfillment/filter` + `shopCode` + `excludeFulfillCodes`) — chỉ trả đơn batchStatus=0; thêm vào cuối danh sách.
   - **DeliveryStaffSelect**: dropdown từ `GET /master-data/delivery-staff`.
   - **TG giao**: DatePicker + hint từ `GET /order-promising/time-delivery` (D4).
2. **Tạo phiếu**: `POST /fulfillment/batches/create` — mutation thật qua Go (validate rule 1 server-side).
   - **Error UX**: backend reject (khác kho / đơn ≠0) → AntD message với message từ error envelope `details[]` — KHÔNG crash, modal giữ state.
   - **Success flow**: modal đóng + same-remote tag invalidation (Fulfillment/Batches); cross-remote thấy phiếu nhờ default `refetchOnMount:'always'` (SF-1) — KHÔNG code thêm cho cross-remote.
3. i18n keys `orders.*` (VI + EN). Unit tests (mock api-client): DnD đổi stopOrder, thêm đơn filter payload, error mapping.
4. **Tier-gate**: gate test mutation QUA HỆ THỐNG THẬT (phiếu sinh + đơn đổi batchStatus=1, assert qua API) — **KHÔNG test "phiếu hiện ở D2"** (cross-remote → SF-11).

## Touch map (SF-8 sở hữu)
```
apps/orders/src/batching/**        (modal + slices bổ sung — KHÔNG đụng file D1 SF-7 ngoài điểm lắp placeholder)
apps/orders/i18n/** (bổ sung keys batching)
```
READ-ONLY: mọi thứ khác. Lắp modal = thay placeholder component SF-7 để lại — sửa tối thiểu file SF-7 (1 điểm import/trigger).

## ACCEPTANCE (user-visible — §8b D1b, walkthrough browser Rule 0)
- Mở modal → danh sách đơn đã chọn hiện đúng selection D1.
- Kéo thả hàng → thứ tự giao (stopOrder) thay đổi.
- "Packing suggest" → gợi ý nhóm theo khoảng cách hiển thị.
- Thêm đơn (search) → đơn thêm vào cuối (chỉ thấy đơn Chưa soạn cùng kho).
- Gán shipper dropdown có data; DatePicker + hint TG giao hiện.
- Tạo phiếu → thành công: modal đóng; assert API thấy phiếu mới + đơn đổi Đang soạn.
- Tạo phiếu với đơn khác kho (bypass FE bằng devtools) → backend reject + message hiển thị.

## Boundary (KHÔNG làm)
- KHÔNG test/verify "phiếu hiện ở D2" (SF-11).
- KHÔNG sửa Go/Java/BFF; KHÔNG sửa D1 table/bulk logic SF-7 (ngoài điểm lắp).
- KHÔNG đổi lib DnD nếu không có spike verdict mới (fallback = REQUIREMENT-GAP).
