# SF-7 Context Pack — Orders remote: D1 + D1c
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §5 SF-7). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 3 (deps SF-2, SF-3, SF-6). BFF + Java service + Shell đã merge — bạn test trên HỆ THỐNG THẬT.

## Spec slice (SF-7 chịu trách nhiệm)
1. **Remote scaffold hoàn chỉnh** (`apps/orders/`): exposes `orders/D1Page`, i18n namespace `orders.*`, điền entry orders vào `remotes.config.json` (pre-seed SF-1 — KHÔNG sửa shell code, KHÔNG đụng entry fulfillment).
2. **RTK Query slices** consume BFF REST (axiosBaseQuery, tags Fulfillment/MasterData, inherit default `refetchOnMount:'always'`).
3. **D1 Danh sách đơn hàng** (`/hub-store-order/order`, title "Danh sách đơn hàng kho chi nhánh"):
   - **8 filters** (2 hàng × 4 cột): Số đơn (text) / Trạng thái soạn (multi, BatchStatus) / TG dự kiến giao (datetime range) / Địa chỉ (multi tỉnh→phường — **fetch `GET /master-data/regions`**) / Kho CN (multi — **fetch `GET /master-data/shops`**) / Trạng thái đơn (multi) / TG tạo đơn (date range) / TG KH mong muốn (datetime range) + Reset.
   - **URL state**: filter ↔ URL query; reload giữ nguyên filter.
   - **Bảng 8 cột**: fulfillCode (fixed-left 120, link copy) / batchStatus StatusTag (180) / shop name+address (320) / batchCode (150, **link → navigate `/hub-store-order/batch`** — cross-remote nav qua RRD singleton) / originalTime formatPeriodOfTime (220) / deliveryTime (230, **edit chỉ khi đơn batchStatus=0** — rule §9) / thao tác expand+chi tiết / (expand) items[] sản phẩm.
   - **Selection + BulkActionBar**: tick hiện 2 nút — "Tạo phiếu soạn" (primary, disable nếu selection KHÁC kho; mở CreateBatchingModal — placeholder, SF-8 lắp) + "Chuyển kho CN khác" (secondary, disable nếu ≠1 row) + hint "Lọc đơn theo kho để tạo phiếu soạn".
   - **Pagination**: "Tổng N mã" + page size + "Đi đến trang thứ".
4. **D1c HubStoreTransferModal**: select kho đích + confirm; disable nếu `isDebtSplittingOrder=true`; gọi assign-shop-hub; hiển thị history (POST semantics = READ).
5. i18n keys `orders.*` (VI gốc + EN).
6. Unit tests (mock api-client): filter logic, bulk enable/disable, COD format, useUrlState.

## Touch map (SF-7 sở hữu)
```
apps/orders/**               (ngoài skeleton SF-1)
remotes.config.json          (CHỈ entry orders)
apps/orders/i18n/** (namespace orders.*)
```
READ-ONLY: apps/shell/**, apps/fulfillment/**, packages/**, services/**, api/**.

## ACCEPTANCE (user-visible — §8b D1, walkthrough browser Rule 0)
- Mở `/hub-store-order/order` → bảng + 8 filters; data thật từ Java qua BFF.
- Filter "Trạng thái soạn hàng"=Chưa soạn → chỉ đơn Chưa soạn; filter Kho=30201 → chỉ đơn 30201.
- Tick 3 đơn CÙNG kho → "Tạo phiếu soạn" enable; KHÁC kho → disable.
- Tick 1 đơn + "Chuyển kho" → modal select kho đích.
- Pagination "Tổng N mã" đúng + page size + goto page.
- Expand row → items[]; URL state giữ filter sau reload.
- Gate note: batchCode link chỉ assert navigation attempt (URL change) — D2 render là SF-9.

## Boundary (KHÔNG làm)
- KHÔNG D1b CreateBatchingModal thật (SF-8 — bạn để placeholder modal entry).
- KHÔNG sửa shell/AppLayout (SF-6); KHÔNG sửa entry fulfillment trong remotes.config.
- KHÔNG test cross-remote (SF-11); KHÔNG sửa proto/BFF/Java.
- Detail endpoint `GET /fulfillment/{fulfillCode}`: expand row dùng items[] từ filter — waive FE consumer (pin §3.8).
