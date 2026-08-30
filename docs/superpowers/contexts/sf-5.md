# SF-5 Context Pack — D3 Print Shipment

> Đọc file này THAY VÌ tự tổng hợp. Epic spec: docs/superpowers/specs/ict-service-support-rebuild-spec.md · Bracket: docs/superpowers/brackets/ict-service-support-rebuild.md
> Dep: SF-3 (merged — route print nhận `?batchCode=` từ D2). ĐỌC TRƯỚC: docs/superpowers/spikes/react-pdf-vite.md — implement theo verdict (worker config là phần khó nhất).

## Spec slice (SF-5 chịu trách nhiệm)

1. **Route + page**: `/hub-store-order/batch/print` — đọc `?batchCode=` (SF-3 đã điều hướng sang); nếu thiếu batchCode → empty state hướng dẫn quay lại D2.
2. **5 tabs** đúng thứ tự + label (i18n): Biên bản (`bill` — phiếu thu COD) / Vận đơn (`delivery` — label giao hàng) / Bàn giao (`handover_receipt` — bàn giao shipper) / Bàn giao hàng (`goods_handover` — bàn giao kho) / Lắp đặt (`installation_acceptance` — nghiệm thu lắp đặt).
3. **react-pdf integration** theo spike SF-1: pdfjs worker config Vite đúng (`?url` / optimizeDeps), lazy-mount tab active (perf — KHÔNG mount 5 PDF cùng lúc).
4. **Mock PDF data 5 loại phiếu**: fixtures LOCAL trong `src/pages/print/fixtures/` (KHÔNG đụng db.ts — touch map SF-1); handler `GET /fulfillment/print/data?batchCode=&type=` trả data phiếu (tự định nghĩa shape hợp lý, ghi rõ trong file).
5. **PDF preview + zoom slider**: react-pdf Document/Page, zoom 50–200%.
6. **Printers**: `GET /fulfillment/print/printers?shopCode=` (printers từ seed SF-1) → dropdown chọn máy in.
7. **In**: `POST /fulfillment/print` (body: batchCode, printType, printerCode) → handler trả kết quả success/fail → feedback UI (message success/error).
8. **"In tất cả"**: in 5 loại một lượt → feedback tổng hợp.
9. i18n keys `print.*` (VI/EN).
10. Unit tests: tabs render, zoom state, printer select wiring, print payload đúng.
11. **Acceptance walkthrough** §8b D3 — đúng 4 dòng (browser, Rule 0; PDF preview phải NHÌN THẬT bằng screenshot — tầng 2 visual).

## Touch map

```
src/pages/print/                 ← SF-5 SỞ HỮU (PrintPage, PdfTab, PdfPreview, PrinterSelect, fixtures/)
src/mocks/handlers/print.ts      ← SF-5 SỞ HỮU (printers + print + print/data)
src/api/printApi.ts              ← SF-5 SỞ HỮU
vite.config.ts (CHỈ thêm pdf worker config nếu spike yêu cầu)  ← chỉnh cẩn trọng, ghi trong commit message
src/mocks/db.ts                  ← READ-ONLY (printers là seed SF-1)
```
KHÔNG đụng: `src/pages/order-list/` (SF-2/4), `src/pages/batch-list/` (SF-3), batches handlers.

## ACCEPTANCE (user-visible — §8b D3, 4 dòng)

- Mở print từ D2 (hoặc route trực tiếp với batchCode) → 5 tab hiện đúng tên/thứ tự.
- PDF preview load THẬT (thấy nội dung PDF) + zoom slider kéo được 50–200%.
- Chọn máy in → dropdown từ API (seed printers).
- Click "In" → gửi lệnh → feedback kết quả hiện; "In tất cả" chạy 5 loại.

## Boundary (KHÔNG làm)

- KHÔNG có máy in thật / OS print dialog thật — mock API phản hồi là đủ.
- KHÔNG sửa D2 (nút In là của SF-3) — chỉ consume `?batchCode=`.
- KHÔNG đổi seed db.ts.
