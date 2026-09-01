# SF-8 Plan — Orders remote: D1b CreateBatchingModal (FI-242)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §5 SF-8) · Context pack: docs/superpowers/contexts/sf-8.md · Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md · Epic: FI-233
> Worktree: sf-8-create-batching-modal (branch VuHoi/sf-8-create-batching-modal — merge ngược về story/fi233-polyglot-grpc-mf, KHÔNG đụng main)
> Base: SF-7 merged (D1 + placeholder CreateBatchModal tại apps/orders/src/features/CreateBatchModal.tsx) + SF-4 merged (Go batching RPC qua BFF REST).
> DnD: SPIKE 3 verdict PINNED — react-sortable-hoc@2.0.0 + array-move@3.0.1 (docs/superpowers/spikes/dnd-react18.md).

## Meta (không checkbox)
- Boundary: apps/orders/src/batching/** (modal + api slice) + apps/orders/src/i18n.ts (keys batching) + apps/orders/package.json (DnD deps) + ĐIỂM LẮP DUY NHẤT D1Page.tsx (đổi import + truyền selectedRows). READ-ONLY: packages/**, services/**, apps/shell/**, apps/fulfillment/**, mọi file D1 SF-7 khác.
- Contracts PINNED (KHÔNG đổi): packages/shared/api-contracts/batching.ts (PackingSuggestRequest/Response, CreateBatchRequest, RecalculateDistanceRequest/Response, DeliveryStaffDto) + BFF routes/batches.ts. FE gọi BFF REST (axios singleton :8080) — KHÔNG gọi gRPC trực tiếp.
- Error envelope: gRPC reject → 422 `{statusCode, message, code, details: [{field, message}]}` — map details[] → AntD message, modal GIỮ state.
- Success flow: đóng modal + invalidate `Fulfillment/LIST` (D1 refetch — đơn đổi batchStatus=1); cross-remote D2 thấy nhờ `refetchOnMountOrArgChange: true` (api-client singleton, SF-1) — KHÔNG code thêm.
- antd4 + vitest jsdom: window.matchMedia stub sẵn trong setup; RTL afterEach(cleanup) thủ công; DnD test theo recipe spike-3 (macrotask flush, getBoundingClientRect mock, clientX/Y).
- Verify Rule 0: 3 tầng — DOM (modal 1310×918, DnD reorder, shipper select, date picker) / VISUAL (screenshot so production-clone tone AntD4 #EB6E09) / FLOW (D1 → chọn đơn → bulk tạo phiếu → suggest → DnD → shipper → ngày → submit → phiếu tạo + error UX khi Go reject khác kho).
- Rolling review: code-reviewer ĐỘC LẬP trên diff SF → verdict /tmp/story/fi233/reviewer-sf8.md; APPROVED mới merge (merge ngược: merge story branch vào local + update-ref FULL refname + ancestor-guard); audit comment 1 tổng cuối run lên FI-242; story-verify sf-8 sạch → Done → cleanup.

## Tasks

- [x] Task 1 — modal-shell: apps/orders/src/batching/CreateBatchingModal.tsx — Modal 1310×918 (width 1310, body ~918), bảng đơn đã chọn 8 cột (Thứ tự giao [stopOrder render index+1] | Mã đơn RSA | Địa chỉ KH | Khoảng cách km [distance? "—"] | TG hẹn giao [formatPeriodOfTime deliveryTime] | Trạng thái [StatusTag orderStatus] | SL SP | COD [formatVnd]); rows qua PROPS (HubStoreOrderFilterItem[] — interface pin, KHÔNG re-fetch); footer Tạo phiếu (submit) + Đóng.
- [x] Task 2 — dnd-sortable-stoporder: deps react-sortable-hoc@2.0.0 + array-move@3.0.1 vào apps/orders; SortableHandle (drag handle cột 1) + SortableRow + SortableContainer theo skeleton spike-3; onSortEnd → arrayMove → state rows mới → stopOrder = index+1; cột "Thứ tự giao" render số thứ tự hiện hành.
- [x] Task 3 — packing-suggest-ui: nút "Gợi ý đóng gói" → batchingApi packingSuggest (POST /fulfillment/batches/packing-suggest, body {orderCodes}) → render nhóm (mỗi group 1 badge/màu + tổng km; group orderCodes tô màu tương ứng trên bảng — UI nhóm theo tone AntD4).
- [x] Task 4 — recalc-distance: nút "Tính lại khoảng cách" → batchingApi recalculateDistance (POST .../recalculate-distance, body {orderCodes}) → merge distance mới vào rows state theo orderCode.
- [x] Task 5 — them-don-search: khu "Thêm đơn" — Select search mode + nút thêm; query POST /fulfillment/filter {shopCodes:[kho của selection], batchStatus:[0], excludeFulfillCodes: codes hiện tại} — chỉ đơn Chưa soạn cùng kho; chọn → append CUỐI danh sách (stopOrder tăng dần).
- [x] Task 6 — delivery-staff-select: useGetDeliveryStaffQuery (api-client stub đã có URL) → AntD Select gán shipper; lọc staff theo shopCode của selection (DeliveryStaffDto.shopCode); bắt buộc chọn trước khi tạo phiếu.
- [x] Task 7 — datepicker-time-hint: DatePicker/Range chọn TG giao; hint từ GET /order-promising/time-delivery (TimeDeliveryResponse.timeSlots[]) — hiển thị gợi ý slot gần hint (click hint → set giá trị).
- [x] Task 8 — create-batch-mutation: batchingApi createBatch mutation (POST /fulfillment/batches/create, body {orderCodes, shipperId, deliveryTime}) — orderCodes theo stopOrder hiện hành; validate FE: có shipper + deliveryTime + ≥1 đơn.
- [x] Task 9 — error-ux-reject: onError — parse error envelope details[] ({field,message}) → message.error (join messages); modal giữ nguyên state (KHÔNG đóng, KHÔNG reset).
- [x] Task 10 — success-flow: onSuccess — message.success + invalidateTags [{type:'Fulfillment', id:'LIST'}] + onClose + reset state local modal.
- [x] Task 11 — i18n-keys-tests-walkthrough: keys createBatch.* VI+EN đầy đủ; unit tests vitest (mock api-client): DnD đổi stopOrder (recipe spike-3), thêm đơn filter payload đúng (shopCodes/batchStatus=0/excludeFulfillCodes), error mapping details[]→message, create payload theo stopOrder; acceptance walkthrough browser 3 tầng ACCEPTANCE (tầng 3: D1 → chọn đơn cùng kho → bulk tạo phiếu → modal → suggest → DnD → shipper → TG → submit → assert API phiếu mới + đơn batchStatus=1; error UX: devtools chèn đơn khác kho → Go reject → message); code-reviewer ĐỘC LẬP → merge story branch + audit → story-verify → Done → cleanup.
