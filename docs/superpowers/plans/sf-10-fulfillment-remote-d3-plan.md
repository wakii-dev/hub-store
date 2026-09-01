# SF-10 Plan — Fulfillment remote D3 Print Shipment (FI-243)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md v3 §5 SF-10 + §3.7 ·
> Context pack: docs/superpowers/contexts/sf-10.md · Bracket: FI-233 · Linear: FI-243.
> Branch: VuHoi/sf-10-print-shipment → merge vào story/fi233-polyglot-grpc-mf (chỉ khi reviewer APPROVED).
> BOUNDARY: apps/fulfillment/src/print module (PrintPage + printApi + PdfPreview) + i18n keys + 1 điểm
> optimizeDeps trong vite.config (spike bắt buộc; expose `./PrintPage` + route shell ĐÃ CÓ từ SF-9).
> READ-ONLY: shell, orders, packages, services, api, phần còn lại của apps/fulfillment.

## Kiến trúc chốt (từ codebase probe — không đoán)

- **Route + expose đã có:** shell `App.tsx` route `/hub-store-order/batch/print` (permission
  `fulfillment.print`) lazy-load `fulfillment/PrintPage`; vite.config exposes `./PrintPage` →
  `src/pages/PrintPage.tsx`. SF-10 REPLACE nội dung stub (stub tự đánh dấu "SF-10 thay").
- **?batchCode= từ URL:** `useSearchParams` (react-router-dom singleton). D2 đã navigate
  `?batchCode=<code>` (SF-9 Task 7 verified).
- **Endpoints (verified services/bff-gateway/src/routes/print.ts + api-contracts/print.ts):**
  `GET /fulfillment/print/printers?shopCode=` → JSON `{items: PrinterDto[]}` (printerId/name/shopCode) ·
  `POST /fulfillment/print` `{batchCode, printType, printerId}` → **application/pdf BYTES, KHÔNG envelope**.
- **shopCode nguồn:** `GET /fulfillment/batches/:code` → `BatchDto.shopCode` (verified batching.ts:128).
  Seed: BATCH-0001 (ACTIVE, shop 30201); printers registry seed có 30201.
- **Blob không qua axiosBaseQuery** (không hỗ trợ `responseType`): POST print dùng
  `getAxiosInstance()` trực tiếp (token interceptor vẫn chạy — singleton contract). GET printers +
  batch detail vẫn RTKQ `api.injectEndpoints` (pattern SF-9 batchesApi).
- **react-pdf theo SPIKE 2 verdict (GO, react-pdf 10.5.0 / pdfjs-dist 5.4.296):**
  worker qua `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'` +
  `pdfjs.GlobalWorkerOptions.workerSrc = workerUrl`; vite.config `optimizeDeps.include: ['pdfjs-dist']`
  + `exclude: ['pdfjs-dist/build/pdf.worker.min.mjs']` (combo duy nhất verified);
  `pdfjs-dist@5.4.296` exact pin (cùng version react-pdf pin — caveat 4 cho phép); cần
  `src/vite-env.d.ts` (`vite/client` types cho `?url`). pdf.js +600kB → viewer lazy-load
  `React.lazy(() => import('../print/PdfPreview'))` (spike caveat 3). Risk cross-origin worker
  (remote :3002 vs shell :3000): Vite 5 dev CORS default ON → dev pass; prod verify là SF-11.
- **vitest:** mock `react-pdf` (Document/Page — pdf.js không chạy trong jsdom) + mock
  `@hub-store/api-client` (api.injectEndpoints → hooks giả) + mock axios instance cho POST print.
  `afterEach(cleanup)` thủ công (vitest globals off).
- **i18n:** append keys `print.*` vào `fulfillmentResources` VI+EN (không sửa keys SF-9);
  update `page.print.subtitle` stub.

## Tasks

- [ ] Task 1 — printApi: `src/api/printApi.ts` — injectEndpoints (getBatchDetail GET
      /fulfillment/batches/:code; getPrinters GET /fulfillment/print/printers?shopCode=) +
      helper `printDocument({batchCode, printType, printerId}): Promise<Uint8Array>` qua
      getAxiosInstance (responseType 'blob' → arrayBuffer; lỗi: response.data là Blob →
      .text() → JSON.parse envelope message).
- [ ] Task 2 — vite config + env types: `vite.config.ts` +optimizeDeps (include pdfjs-dist /
      exclude worker mjs); `src/vite-env.d.ts` NEW (`/// <reference types="vite/client" />`).
- [ ] Task 3 — PdfPreview: `src/print/PdfPreview.tsx` — lazy module: pdfjs worker wiring +
      `<Document file={{data}}>` + `<Page scale>`; props {bytes, zoom}; loading/error states.
- [ ] Task 4 — PrintPage shell: 5 Tabs (PRINT_TYPES; labels i18n `print.tab.*`), đọc
      ?batchCode= (không có → Result warning), batch detail + printers query wiring,
      zoom Slider 50–200%, active tab → load PDF bytes (cache per tab).
- [ ] Task 5 — In + feedback: Select máy in (disable khi chưa chọn; printers empty → hint),
      nút In → printDocument(active tab) → message.success job; lỗi envelope → message.error.
- [ ] Task 6 — "In tất cả": 5 calls TUẦN TỰ (for-of PRINT_TYPES, await từng call — pin §3.7,
      KHÔNG printAll) + Progress hiển thị (done/total + tên phiếu đang in); disable In/In tất
      cả khi đang chạy; tổng kết thành công/thất bại.
- [ ] Task 7 — i18n keys `print.*` VI + EN (tabs, printer, zoom, actions, feedback, progress,
      states) + update subtitle. Lazy-load viewer trong PrintPage (React.lazy + Suspense).
- [ ] Task 8 — Unit tests: PrintPage.test.tsx (tabs 5 render + switching, printers từ query,
      print call payload đúng {batchCode, printType, printerId}, In tất cả tuần tự — assert
      call order + await tuần tự, feedback message) + printApi.test.ts (printDocument payload +
      blob→bytes + error envelope parse). Mock react-pdf + api-client + axios.
- [ ] Task 9 — Browser walkthrough Rule 0 3 tầng (backend stack: Java :50051 + Go :50052 +
      print :50053 + BFF :8080 + shell :3000 + fulfillment :3002): DOM (5 tabs, select, zoom) →
      VISUAL (screenshot so production-clone tone) → FLOW (D2 → In → PrintPage → từng tab PDF
      bytes thật → chọn printer → In → feedback; In tất cả + progress). Screenshots lưu
      /tmp/story/fi233/screens/sf10-*.
- [ ] Task 10 — Code-reviewer độc lập (verdict /tmp/story/fi233/reviewer-sf10.md) → fix P0/P1 →
      APPROVED → verifier PASS → merge story/fi233-polyglot-grpc-mf (merge ngược + update-ref
      full refname + ancestor guard) + audit comment tổng (batch-audit) → story-verify sf-10
      sạch → FI-243 Done → cleanup worktree + branch (KHÔNG đích).

## Acceptance (§8b D3 — walkthrough gate Rule 0)

- Navigate từ D2 (nút In) hoặc mở thẳng `/hub-store-order/batch/print?batchCode=BATCH-0001` → 5 tabs đúng tên.
- Tab active → PDF preview load (bytes thật print-service qua BFF) + zoom slider hoạt động.
- Printer dropdown có data từ API (shopCode batch).
- Click "In" → feedback thành công.
- "In tất cả" → 5 PDF lần lượt + progress.
