# SF-2 Context Pack — D1 Danh sách đơn hàng + D1c Chuyển kho

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: docs/superpowers/specs/ict-service-support-rebuild-spec.md · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-1 (merged vào story-base — đọc spikes verdict + db contract trước khi code).

## Spec slice (SF-2 chịu trách nhiệm)

1. **Handler `POST /fulfillment/filter`**: pagination (page/pageSize) + search + 8 filter fields; trả `{ items, total }` dạng HubStoreOrderFilterItem (§4). **Mở rộng contract: nhận `excludeFulfillCodes: string[]` + trả theo `shopCode`** — SF-4 dùng cho "thêm đơn" (interface pinned §2 spec, bạn OWN phần handler).
1b. **Handler `GET /master-data/regions`** — SF-2 OWN file `src/mocks/handlers/master-data.ts` (phần regions; SF-4 sẽ append time-delivery vào cùng file — dep SF-2→SF-4 đã có nên an toàn). Đọc regions từ seed SF-1 db.ts.
2. **8 filters (2 hàng × 4 cột)** dùng FilterBar primitives SF-1: Số đơn hàng (text) / Trạng thái soạn hàng (multi) / TG dự kiến giao (datetime range) / Địa chỉ (multi tỉnh→phường từ `/master-data/regions`) / Kho CN xuất hàng (multi) / Trạng thái đơn (multi) / TG tạo đơn (date range) / TG KH mong muốn (datetime range) + nút Reset. State sync URL bằng `useUrlState` — **reload giữ nguyên filter (acceptance §8b D1 dòng cuối)**.
3. **Bảng 8 cột**: fulfillCode 120 fixed-left (link copy — click copy mã) / batchStatus 180 StatusTag / kho CN 320 (shopName + address) / batchCode 150 (link → `/hub-store-order/batch`, nếu có) / originalTime 220 formatPeriodOfTime / deliveryTime 230 (CÓ THỂ EDIT — xem #4) / thao tác (expand + xem chi tiết) / expand row → items[] sản phẩm.
4. **Edit deliveryTime**: inline/modal edit cột TG dự kiến giao — **chỉ cho phép khi đơn CHƯA có batchCode** (rule §9); gọi `PUT /fulfillment/{code}/delivery-time`; invalidate tag Fulfillment.
5. **Selection + BulkActionBar**: hiện khi tick chọn; nút "Tạo phiếu soạn" (primary, **disabled nếu selection khác kho** — emit event/props cho SF-4 mount, bạn chỉ cần expose điểm mount + pass rows) ; nút "Chuyển kho CN khác" (secondary, **disabled nếu ≠1 row**); hint "Lọc đơn theo kho để tạo phiếu soạn". Đơn `isDebtSplittingOrder` không cho chuyển kho.
6. **Pagination**: "Tổng N mã" + page size selector + "Đi đến trang thứ" (AntD showTotal + quick jumper).
7. **Handlers chuyển kho**: `POST /fulfillment/{code}/assign-shop-hub` (mutation db: đổi shopAssignment + append history) + `POST /fulfillment/{code}/history` (đọc history — endpoint POST theo production, giữ nguyên).
8. **D1c HubStoreTransferModal**: select kho đích (từ regions/shops) + confirm → gọi assign-shop-hub → refresh list.
9. **Hiển thị history** chuyển kho của đơn (trong modal hoặc expand — agent tự quyết hợp lý).
10. i18n keys `order.*` + `common.*` (VI/EN đủ, không hardcoded string).
11. Unit tests: filter logic + same-shop enable/disable + edit-deliveryTime rule.
12. **Acceptance walkthrough** §8b D1 (browser, Rule 0) — đúng 9 dòng checklist.

## Touch map

```
src/pages/order-list/           ← SF-2 SỞ HỮU (OrderListPage, OrderFilters, OrderTable, BulkActionBar, EditDeliveryTimeModal)
src/pages/order-list/modals/HubStoreTransferModal.tsx  ← SF-2 sở hữu
src/mocks/handlers/fulfillment.ts  ← SF-2 sở hữu handlers filter/assign/history/delivery-time
src/mocks/handlers/master-data.ts  ← SF-2 sở hữu (phần regions; SF-4 append time-delivery sau)
src/mocks/db.ts                 ← READ-ONLY (mutation qua handler, KHÔNG thêm seed — contract SF-1)
src/components/ (StatusTag, FilterBar, formatters)  ← READ-ONLY, consume
src/api/fulfillmentApi.ts       ← SF-2 sở hữu (RTK Query endpoints)
docs/superpowers/spikes/dnd-react18.md  ← READ-ONLY (không liên quan trực tiếp SF-2)
```
KHÔNG đụng: `src/pages/batch-list/`, `src/pages/print/`, `CreateBatchingModal.tsx` (SF-4 chỉ trừ điểm mount/export props contract).

## ACCEPTANCE (user-visible — §8b D1, 9 dòng)

- Mở `/hub-store-order/order` → bảng + 8 filters hiện đúng layout 2 hàng.
- Filter "Trạng thái soạn hàng" = Chưa soạn → chỉ đơn Chưa soạn; filter Kho = 30201 → chỉ kho 30201.
- Tick 3 đơn cùng kho → "Tạo phiếu soạn" enable.
- Tick 3 đơn KHÁC kho → "Tạo phiếu soạn" disable (§8b D1 dòng riêng — verifier kiểm).
- Tick 1 đơn + "Chuyển kho" → modal select kho đích; confirm → đơn đổi kho trong list.
- Pagination "Tổng N mã" đúng, page size 10, goto page chạy.
- Expand row → items[] sản phẩm hiện.
- Reload trang → filter vẫn giữ nguyên (URL state).
- Edit TG dự kiến giao được với đơn chưa có phiếu; đơn đã có phiếu bị khóa.

## Boundary (KHÔNG làm)

- KHÔNG code CreateBatchingModal (SF-4) — chỉ để điểm mount + rows contract.
- KHÔNG test "đơn xuất hiện lại sau hủy phiếu" (cross-SF → SF-6).
- KHÔNG đụng D2/D3 pages, batches handlers.
