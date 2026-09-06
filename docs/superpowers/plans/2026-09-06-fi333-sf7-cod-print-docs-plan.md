# FI-333 — SF-7 COD Settlement + Print docs (FI-326) — Plan

Spec slice: `docs/superpowers/contexts/sf-7.md` · Bracket: `docs/superpowers/brackets/fi326-api-docs-swagger.md`
File SF sở hữu: `services/bff-gateway/openapi/paths/cod-print.yaml` (fill stub) + drift test riêng.
Commit: `00f609e` — feat(bff): SF-7 author cod-print.yaml — 12 ops COD Settlement (6) + Print (6) + scoped drift test

## Tasks (bracket SF-7 — ticked khi hoàn thành)

- [x] T1 Author cod confirm + confirm-batch (2 ops — body DTOs từ api-contracts/settlement.ts: ConfirmCodBody/ConfirmBatchCodBody; per-code result; 400 BAD_REQUEST messages theo route)
- [x] T2 Author pending + settlement (GET /cod/pending?batchCode + GET /cod/settlement?from&to&page&pageSize — Paginated allOf + SettlementShopRow 8 fields; role gates Coordinator|WarehouseOps|Manager|Admin / Manager|Admin; kỳ [from,to) VN date ghi trong description)
- [x] T3 Author settlement.csv + detail (CSV BOM text/csv format:binary + GET /cod/settlement/detail Paginated SettlementDetailItem — status enum [0,1] CodCollectionStatus)
- [x] T4 Author print POST PDF + printers list (POST /fulfillment/print → application/pdf binary KHÔNG envelope; printType enum 5; GET /fulfillment/print/printers {items PrinterDto})
- [x] T5 Author print-errors counts (GET /fulfillment/print-errors/counts?batchCode → {items: [{orderCode, count}]})
- [x] T6 Author printers CRUD 3 ops (GET/POST /fulfillment/printers + PUT /{shopCode}/{printerId} — Admin gate, 409 duplicate, 404 update, full-replace body, params $ref ShopCodePath+PrinterIdPath)
- [x] T7 Cross-check settlement + print DTO + mapper (settlement.ts + print.ts + mappers/print.ts — camelCase §4, int64 Number hoá, dates ISO)
- [x] T8 Drift-guard scoped 12/12 (test/openapi.drift.cod-print.test.ts gọi describeOpenApiDrift — KHÔNG sửa file drift chung; vitest 38 files / 409 tests xanh)
- [x] T9 Try-it-out cod-pending + printers (Swagger UI :18087/documentation — authorize bearer manager token — Execute thật 200: pending {pendingCount,totalAmount} + printers {items PrinterDto}; fetch-remap seam 8080→18087 precedent fi331)
- [x] T10 PDF binary verify (UI POST /fulfillment/print → 200 content-type application/pdf content-length 47516 + body %PDF-1.4 ReportLab; curl cùng request → file 47516 bytes `PDF document, version 1.4, 1 pages`)
- [x] T11 UI walkthrough Rule 0 (DOM count: COD Settlement 6 + Print 6 ops render; screenshot CDP timeout — tab Orca mở cho user visual; flow thật qua clicks: expand tag/op, Try it out, Execute, đọc live response)

## ACCEPTANCE checklist (context pack sf-7.md)

- [x] `/documentation`: tag COD Settlement đủ 6 ops + Print đủ 6 ops render (DOM: {"COD Settlement":6,"Print":6})
- [x] Try-it-out token manager: GET /cod/pending → 200 shape khớp; GET /fulfillment/print/printers → 200; POST /fulfillment/print → 200 PDF binary (headers + magic bytes; curl file mở được)
- [x] Drift-guard scoped 12/12; BFF vitest toàn xanh (409/409, 38 files)
- [x] CSV BOM: GET /cod/settlement.csv → `ef bb bf` + text/csv + Content-Disposition attachment (curl verify)
