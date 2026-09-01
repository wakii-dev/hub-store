# SF-7 Plan — Orders remote: D1 + D1c (FI-240)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §5 SF-7) · Context pack: docs/superpowers/contexts/sf-7.md · Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md · Epic: FI-233
> Worktree: sf-7-orders-remote-d1 (branch VuHoi/sf-7-orders-remote-d1 — merge ngược về story/fi233-polyglot-grpc-mf, KHÔNG đụng main)
> Base: skeleton SF-1 trong apps/orders (exposes `orders/D1Page` :3001, i18n skeleton, vite federation verdict SPIKE 1 PINNED — không đổi plugin/version).
> Test trên HỆ THỐNG THẬT: fulfillment-service Java :50051 + BFF :8080 + shell :3000 (đã merge từ SF-2/SF-3/SF-6).

## Meta (không checkbox)
- Boundary: CHỈ apps/orders/** + remotes.config.json (entry orders đã pre-seed — chỉ verify, không đụng entry fulfillment). READ-ONLY: apps/shell/**, apps/fulfillment/**, packages/**, services/**, api/**.
- **Không sửa packages/api-client** dù slice stub comment mời SF-7 edit: touch map pack là authoritative (READ-ONLY packages/**). URL stubs đã đúng contract (`/fulfillment/filter`, `/master-data/regions|shops`). Type/cast tại app; mutations + history query mới inject qua `api.injectEndpoints` TỪ app (đúng thiết kế singleton: "add endpoints via injectEndpoints").
- **Datetime → ISO-8601 offset**: Java filter parse `OffsetDateTime.parse` — format string của DateRange primitive (`YYYY-MM-DD HH:mm`) parse-fail sẽ silently thành Instant.MIN/MAX → filter sai im lặng. FE convert qua moment `.toISOString()` trước khi gửi.
- **Range filter ↔ URL**: useUrlState chỉ hỗ trợ `string | string[]` → mỗi range serialize 2 param riêng (`deliveryFrom`/`deliveryTo`, `createdFrom`/`createdTo`, `originalFrom`/`originalTo`).
- Verify Rule 0: 3 tầng (DOM đo / screenshot so tokens / flow login→filter→bulk→transfer→pagination→expand→URL-reload→batchCode-nav) qua shell host :3000.
- Rolling review: code-reviewer ĐỘC LẬP verdict /tmp/story/fi233/reviewer-sf7.md — APPROVED mới merge (commit-tree + update-ref FULL refname + ancestor-guard), audit comment merge-hash lên FI-240.
- Linear FI-240 → Done CHỈ SAU story-verify sf-7 sạch; cleanup worktree + branch sau Done.

## Tasks

- [ ] Task 1 — remote-scaffold-orders: verify skeleton (vite federation exposes orders/D1Page :3001 + remotes.config.json entry orders khớp + shell lazy import). Không đổi exposes contract; chỉ nâng cấp nội dung D1Page + i18n resources.
- [ ] Task 2 — rtkq-slices (app-level): apps/orders/src/api/ordersApi.ts — injectEndpoints mutations `updateDeliveryTime` (PUT /fulfillment/{code}/delivery-time) + `assignShopHub` (POST /fulfillment/{code}/assign-shop-hub) + query `getAssignHistory` (POST /fulfillment/{code}/history — READ semantics); tag invalidation Fulfillment LIST. Typed wrapper cast cho useListOrdersQuery/useGetRegionsQuery/useGetShopsQuery.
- [ ] Task 3 — filters-8-urlstate: FilterBar 2×4 đủ 8 field (Số đơn text / Trạng thái soạn multi BatchStatus / TG dự kiến giao DateTimeRange / Địa chỉ multi tỉnh→phường grouped / Kho CN multi shops / Trạng thái đơn multi OrderStatus / TG tạo đơn DateRange / TG KH mong muốn DateTimeRange) + Reset; URL state qua useUrlState (range = 2 param); reload giữ filter.
- [ ] Task 4 — regions-shops-fetch: useGetRegionsQuery + useGetShopsQuery → options Địa chỉ (grouped tỉnh→phường) + Kho CN; format datetime ISO convert helper (moment) có unit test.
- [ ] Task 5 — table-8-cols: fulfillCode fixed-left 120 link copy / batchStatus StatusTag 180 / shop name+address 320 / batchCode 150 link navigate /hub-store-order/batch (RRD singleton) / originalTime formatPeriodOfTime 220 / deliveryTime 230 edit chỉ khi batchStatus=0 (inline edit → mutation) / thao tác (expand + chi tiết) / (expand) items[] + COD formatVnd.
- [ ] Task 6 — expandable-items: expand row render items[] (productCode, productName, quantity) + COD đơn (formatVnd).
- [ ] Task 7 — selection-bulk-bar: rowSelection; "Tạo phiếu soạn" primary (disable nếu selection khác kho → mở CreateBatchingModal PLACEHOLDER) + "Chuyển kho CN khác" secondary (disable nếu ≠1 row → HubStoreTransferModal) + hint "Lọc đơn theo kho để tạo phiếu soạn".
- [ ] Task 8 — pagination-total: antd Pagination "Tổng N mã" (showTotal) + pageSizeChanger + quickJumper "Đi đến trang thứ" (locale vi_VN từ shell); page/pageSize vào URL state.
- [ ] Task 9 — edit-delivery-time: inline edit cell deliveryTime (chỉ batchStatus=0 — §9 rule 3; render read-only khi ≠0) → DateTimeRange popup → PUT mutation → refetch list.
- [ ] Task 10 — transfer-modal-history (D1c): HubStoreTransferModal — select kho đích (shops, loại kho hiện tại) + confirm; disable khi isDebtSplittingOrder=true; assign-shop-hub mutation; sau confirm hiển thị history (getAssignHistory) + invalidate list.
- [ ] Task 11 — i18n-keys: namespace `orders.*` VI gốc + EN đầy đủ (filters, columns, bulk, modal, hint, pagination).
- [ ] Task 12 — unit-tests: filter logic (build query params từ URL state + ISO convert), bulk enable/disable theo selection, COD format, useUrlState round-trip; vitest run green toàn workspace app orders.
- [ ] Task 13 — acceptance-walkthrough-d1: boot Java :50051 + BFF :8080 + orders :3001 + shell :3000; login Coordinator → /hub-store-order/order; browser verify 3 tầng ACCEPTANCE (bảng + 8 filters data thật; filter batchStatus=0 & Kho=30201; tick cùng kho enable Tạo phiếu / khác kho disable; transfer modal; pagination Tổng N mã + goto; expand items; URL reload giữ filter; batchCode link assert URL change); code-reviewer ĐỘC LẬP → merge story branch + audit comment → story-verify → Done → cleanup.
