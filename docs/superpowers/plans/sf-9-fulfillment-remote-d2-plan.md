# SF-9 Plan — Fulfillment remote D2 Danh sách phiếu soạn hàng (FI-241)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md v3 §5 SF-9 ·
> Context pack: docs/superpowers/contexts/sf-9.md · Bracket: FI-233 · Epic linear: FI-241.
> Branch: VuHoi/sf-9-fulfillment-remote-d2 → merge vào story/fi233-polyglot-grpc-mf (chỉ khi reviewer APPROVED).
> BOUNDARY: apps/fulfillment/** + (entry đã pre-seed). READ-ONLY: shell, orders, packages, services, api.
> PrintPage = SF-10 — chỉ giữ stub + nút navigate.

## Kiến trúc chốt (từ codebase probe — không đoán)

- **Data shape (verified qua seed + BFF mappers):** `POST /fulfillment/batches/filter` →
  paginated `BatchDto[]` (Batch.items[] = BatchingItem; BatchingItem.items[] = Product).
  Row D2 = **BatchingItem** (8 cột là field của item), flatten từ page batch:
  `batches.flatMap(b => b.items.map(item => ({batch: b, item})))`. Expand row → products.
- **Batch actions (Hủy / Hoàn tất / In) là batch-level** → cột action dùng antd4
  `onCell rowSpan` gộp 1 cell/phiếu (items của 1 batch liên tiếp vì flatMap theo batch).
- **Endpoints trong apps/fulfillment** (KHÔNG sửa packages/api-client — READ-ONLY theo
  context pack; stub slices của SF-1 ở packages được để nguyên, flag cho SF-7/SF-11
  consolidate): `api.injectEndpoints` từ singleton `@hub-store/api-client` — pattern
  code-splitting chuẩn RTKQ, không re-create api.
- **Store:** `createAppStore()` từ api-client (SF-1 thiết kế "per-remote store") —
  BatchListPage + standalone App wrap `<Provider store>`.
- **Endpoints BFF (verified routes/batches.ts + fulfillment.ts):**
  `POST /fulfillment/batches/filter` (paginated envelope) ·
  `GET /fulfillment/batches/criteria` → `{cancellableStatuses: [0]}` ·
  `PUT /fulfillment/batches/:code/cancel` `{reason}` ·
  `PUT /fulfillment/complete-picking` `{batchCode}` ·
  `GET /fulfillment/batches/:code` (detail — dùng cho reserve, list đã đủ).
- **Filters ↔ URL state** (`useUrlState` shared): `search` string · `status` string[]
  (comma-joined) · `createdAt` "YYYY-MM-DD" (single DatePicker — BFF wrap full-day range).
- **Mutation success/failure:** invalidatesTags `Batches LIST` → refetch; error từ
  envelope (`error.data.message`) → `message.error`.

## Tasks

- [x] Task 1 — RTKQ batches slices + store: `apps/fulfillment/src/api/batchesApi.ts`
      (typed theo @hub-store/shared api-contracts: filterBatches, getBatchCriteria,
      cancelBatch, completePicking; tags Batches) + `store.ts` (createAppStore) +
      Provider wrap trong BatchListPage & standalone App.
- [x] Task 2 — Filters 3 + URL state: TextSearch (Số phiếu/Số đơn) · MultiSelect
      Trạng thái phiếu (3 option BatchEntityStatus) · DatePicker Thời gian tạo ·
      FilterBar Search/Reset wiring.
- [x] Task 3 — Bảng 8 cột + COD + flatten + rowSpan action column + pagination envelope
      (server-paginated batches; total từ envelope).
- [x] Task 4 — Expand detail: BatchingItem.items[] Product list (sub-table).
- [x] Task 5 — Hủy phiếu: Modal confirm + reason (bắt buộc), criteria-gated disable,
      error envelope → message, success → invalidate + message.
- [x] Task 6 — "Hoàn tất soạn" (D11): batch ACTIVE → Modal.confirm →
      PUT complete-picking → invalidate.
- [x] Task 7 — Nút In → `navigate('/hub-store-order/batch/print?batchCode=...')`
      (URL assert; PrintPage giữ stub SF-10).
- [x] Task 8 — i18n keys `fulfillment.*` VI + EN (title/filters/columns/actions/messages).
- [x] Task 9 — Unit tests (vitest + RTL, mock @hub-store/api-client): flatten+rowSpan,
      COD format VI, criteria gating, cancel flow (confirm+reason+mutation),
      filter→query args mapping, URL state round-trip.
- [x] Task 10 — Browser walkthrough Rule 0 3 tầng (shell :3000 → BFF :8080 →
      Java :50051 + Go :50052): login → /hub-store-order/batch data thật → search →
      filter status → hủy ACTIVE (confirm+reason, đơn revert) → complete picking →
      nút In đổi URL. Screenshots từng bước.
      (Verdict: PASS toàn bộ flow — cancel BATCH-0006 → message "Đã hủy phiếu" +
      modal portal removed + row "Đã hủy" live + RSA-700402 batchStatus=0;
      complete BATCH-0003 → "Hoàn tất" + RSA-700203 batchStatus=2 + nút Hoàn tất ẩn;
      In → /hub-store-order/batch/print?batchCode=BATCH-0001 → SF-10 stub.
      ⚠ Screenshot pixel-level KHÔNG chụp được: orca CDP captureScreenshot timeout
      persistent + computer-use a11y helper down — đã verify bằng a11y DOM snapshot +
      network entries + backend curl asserts; cần user xác nhận bằng mắt lần mở sau.)
- [x] Task 11 — Code-reviewer độc lập (verdict /tmp/story/fi233/reviewer-sf9.md) →
      fix P0/P1 → APPROVED → merge vào story/fi233-polyglot-grpc-mf (commit-tree +
      update-ref full refname + ancestor guard) + audit comment → story-verify sạch →
      FI-241 Done → cleanup worktree + branch.
      (APPROVED attempt 1 sau fix 6bc4df0; merge 7955430 CAS + ancestor guard OK;
      audit comment c0d22450 trên FI-241.)

## Acceptance (§8b D2 — walkthrough gate)

- Mở /hub-store-order/batch → bảng data thật từ Go qua BFF.
- Search mã phiếu → đúng phiếu; filter trạng thái → lọc đúng.
- Hủy phiếu ACTIVE → confirm + reason → CANCELLED; đơn revert Chưa soạn.
- Hủy COMPLETED → nút disable theo criteria (+ backend reject message nếu force).
- COD "15.000.000đ" (VI).
- Hoàn tất soạn → COMPLETED + đơn Đã soạn.
- Nút In → URL /hub-store-order/batch/print?batchCode=... (KHÔNG render page — SF-10).
