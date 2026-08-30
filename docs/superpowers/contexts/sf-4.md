# SF-4 Context Pack — D1b CreateBatchingModal

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: docs/superpowers/specs/ict-service-support-rebuild-spec.md · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-2 (merged — D1 + filter handler mở rộng). ĐỌC TRƯỚC: docs/superpowers/spikes/dnd-react18.md (verdict DnD lib BẮT BUỘC theo theo).

## Spec slice (SF-4 chịu trách nhiệm)

1. **Modal shell 1310×918** mở từ nút "Tạo phiếu soạn" trên D1 — nhận **full rows qua props** từ selection D1 (interface pinned §2 spec — KHÔNG re-fetch lúc mở).
2. **Bảng đơn đã chọn** (sortable): cột Thứ tự giao | Mã đơn RSA | Địa chỉ KH | Khoảng cách (km) | TG hẹn giao | Trạng thái | SL SP | COD.
3. **DnD sortable** (react-sortable-hoc + array-move nếu spike SF-1 verdict GO; nếu verdict fallback dnd-kit → dùng dnd-kit và FLAG trong notes — deviation §6 cần user biết): kéo thả → stopOrder cập nhật lại toàn bộ.
4. **Packing suggest**: `POST /fulfillment/batches/packing-suggest` (handler tự viết, mutate-free — tính gợi ý nhóm theo khoảng cách từ db) + UI gợi ý nhóm.
5. **Recalculate distance**: `POST /fulfillment/batches/recalculate-distance` — handler + nút tính lại km.
6. **Thêm đơn**: search đơn cùng kho (qua `POST /fulfillment/filter` với `shopCode` + `excludeFulfillCodes` — handler SF-2 đã mở rộng) → chọn → đơn thêm vào CUỐI bảng.
7. **Gán shipper**: `DeliveryStaffSelect` — dropdown delivery staff (từ seed SF-1 db).
8. **Chọn TG giao**: DatePicker + gợi ý từ `GET /order-promising/time-delivery` (handler mock trả slot gợi ý — quyết định D4).
9. **Tạo phiếu**: `POST /fulfillment/batches/create` — mutation db đúng contract SF-1: sinh batchCode, đơn đổi batchStatus=1, gán stopOrder theo thứ tự DnD, gán shipper + TG giao.
10. **Success flow**: tạo xong → đóng modal → D1 refresh (invalidate tag Fulfillment/Batches đúng scheme).
11. i18n keys `order.createBatch.*` (VI/EN).
12. Tests: DnD đổi stopOrder, create mutation đúng (đơn đổi status trong db), thêm đơn vào cuối.
13. **Acceptance walkthrough** §8b D1b — đúng 7 dòng TRỪ dòng "phiếu xuất hiện ở D2" (cross-SF → SF-6; gate của bạn test mutation qua handler/db, KHÔNG test UI D2).

## Touch map

```
src/pages/order-list/modals/CreateBatchingModal.tsx  ← SF-4 SỞ HỮU (cùng subtree: SortableTable, AddOrderSearch, ShipperSelect, PackingSuggest)
src/mocks/handlers/batches.ts (CHỈ thêm: packing-suggest, recalculate-distance, create)  ← SF-4 sở hữu 3 handler này
src/mocks/handlers/master-data.ts (CHỈ append time-delivery — file + regions do SF-2 tạo trước, dep SF-2→SF-4 có)  ← SF-4 chỉnh
src/api/batchesApi.ts (thêm endpoints)  ← SF-4 chỉnh (SF-3 đã tạo base — merge từ story-base)
src/pages/order-list/BulkActionBar.tsx (điểm mount modal)  ← chỉnh NHỎ, giữ contract props SF-2
src/mocks/db.ts  ← READ-ONLY (mutation qua handler)
docs/superpowers/spikes/dnd-react18.md  ← READ-ONLY — verdict quyết định lib
```
KHÔNG đụng: `src/pages/batch-list/` (SF-3), `src/pages/print/` (SF-5), seed data db.ts.

## ACCEPTANCE (user-visible — §8b D1b, 6/7 dòng)

- Mở modal từ 3 đơn cùng kho → bảng đơn đã chọn hiện đủ 8 cột.
- Kéo thả hàng → thứ tự giao (stopOrder) đổi theo.
- Click "Packing suggest" → gợi ý nhóm theo khoảng cách hiện.
- Search + thêm đơn → đơn thêm vào cuối bảng.
- Gán shipper → dropdown staff hiện và chọn được; TG giao → DatePicker + gợi ý.
- Tạo phiếu → modal đóng, D1 refresh; (handler) đơn đổi batchStatus + sinh batchCode trong db.

## Boundary (KHÔNG làm)

- KHÔNG kiểm "phiếu xuất hiện ở D2" qua UI D2 (SF-6 convergence).
- KHÔNG sửa handler filter của SF-2 (chỉ consume `shopCode` + `excludeFulfillCodes`).
- KHÔNG build print (SF-5).
