# SF-9 Context Pack — Fulfillment remote: D2 Danh sách phiếu soạn
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §5 SF-9). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 3 (deps SF-2, SF-3, SF-4, SF-6). Bạn SỞ HỮU scaffold remote fulfillment — SF-10 thêm PrintPage vào remote này SAU bạn.

## Spec slice (SF-9 chịu trách nhiệm)
1. **Remote scaffold hoàn chỉnh** (`apps/fulfillment/`): exposes `fulfillment/BatchListPage`, i18n namespace `fulfillment.*`, điền entry fulfillment vào `remotes.config.json` (pre-seed SF-1 — KHÔNG sửa shell code, KHÔNG đụng entry orders).
2. **RTK Query slices batches** (consume BFF REST: batches filter/detail/cancel/criteria/complete-picking; tags Batches; inherit `refetchOnMount:'always'`).
3. **D2 Danh sách yêu cầu soạn hàng** (`/hub-store-order/batch`, title "Danh sách yêu cầu soạn hàng"):
   - **3 filters**: Số phiếu/Số đơn (text search) / Trạng thái phiếu (StatusSelect — 3 trạng thái Batch) / Thời gian tạo phiếu (DatePicker) + URL state (reload giữ filter).
   - **Bảng 8 cột**: Thứ tự giao (stopOrder) / Mã đơn RSA (orderCode) / Địa chỉ KH / Khoảng cách (km) / TG hẹn giao (fromDeliveryTime–toDeliveryTime) / Trạng thái đơn StatusTag / SL sản phẩm (totalQuantity) / **Tiền COD — VND format `15.000.000đ`** (D2).
   - **Expand detail** → items[] sản phẩm.
   - **Hủy phiếu**: confirm + reason input; criteria-gated (`GET /fulfillment/batches/criteria` — chỉ ACTIVE được hủy); gọi cancel → đơn revert Chưa soạn (mutation Go thật); backend reject (phiếu COMPLETED) → AntD message từ error envelope.
   - **"Hoàn tất soạn"** (D11): batch-level action → `PUT /fulfillment/complete-picking` (body `{batchCode}`) → batch COMPLETED + đơn Đã soạn.
   - **Nút In** → navigate `/hub-store-order/batch/print?batchCode=<code>` (param pin — PrintPage SF-10 đọc; KHÔNG render print page).
4. i18n keys `fulfillment.*` (VI + EN). Unit tests (mock api-client): filters, COD format, cancel flow, criteria gating.

## Touch map (SF-9 sở hữu)
```
apps/fulfillment/**            (scaffold + D2 — SF-10 sẽ THÊM module PrintPage, KHÔNG đụng file của bạn)
remotes.config.json            (CHỈ entry fulfillment)
apps/fulfillment/i18n/**
```
READ-ONLY: apps/shell/**, apps/orders/**, packages/**, services/**, api/**.

## ACCEPTANCE (user-visible — §8b D2, walkthrough browser Rule 0)
- Mở `/hub-store-order/batch` → bảng với data thật từ Go qua BFF.
- Search mã phiếu → đúng phiếu; filter trạng thái phiếu → lọc đúng.
- Click "Hủy phiếu" (phiếu ACTIVE) → confirm + reason → phiếu CANCELLED; assert API: đơn revert Chưa soạn.
- Hủy phiếu COMPLETED → backend reject + message (hoặc nút disable theo criteria).
- COD format "15.000.000đ".
- "Hoàn tất soạn" → phiếu COMPLETED + đơn Đã soạn (assert API).
- Nút In → URL đổi sang `/hub-store-order/batch/print?batchCode=...` (KHÔNG cần page render — SF-10).

## Boundary (KHÔNG làm)
- KHÔNG PrintPage/5 tabs/PDF (SF-10 — chỉ nút navigate).
- KHÔNG sửa shell (SF-6); KHÔNG đụng orders remote (SF-7/8).
- KHÔNG test cross-remote invalidation (SF-11); KHÔNG sửa proto/BFF/Go.
