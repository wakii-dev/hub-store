# SF-5 Context Pack — print-service (Python)
> Đọc file này THAY VÌ tự tổng hợp. Spec thực thi: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3.7). Bracket: docs/superpowers/brackets/fi233-polyglot-grpc-mf.md. Epic: FI-233.
> Tier 2 (dep SF-2). Stateless PDF generator — nhận fat payload từ BFF, KHÔNG gọi service nào.

## Spec slice (SF-5 chịu trách nhiệm)
1. **grpcio bootstrap** (`services/print-service/`, Python ≥3.11, :50053, grpcio + grpcio-tools). Run script riêng — KHÔNG thêm vào turbo.
2. **Printers registry**: load từ `api/seed/canonical-seed.json` (SF-2 authored) — printers theo shopCode (PHẢI gồm 30201). KHÔNG tự seed riêng.
3. **Proto server impl** (đúng `print.proto` SF-2):
   - `list-printers(shopCode)` → danh sách máy in
   - `print(batchPayload, printType, printerId) → PDF bytes` — batchPayload do BFF hydrate từ Go rồi push (bạn KHÔNG gọi Go/Java); job status in-memory (job id + trạng thái).
4. **5 PDF templates (reportlab)** — 1 template/PrintType:
   | PrintType | Phiếu | Nội dung tối thiểu |
   |-----------|-------|--------------------|
   | `bill` | Biên bản (phiếu thu COD) | mã đơn, COD amount, khách hàng |
   | `delivery` | Vận đơn (label giao) | địa chỉ, TG hẹn, mã phiếu |
   | `handover_receipt` | Bàn giao shipper | shipper, danh sách đơn |
   | `goods_handover` | Bàn giao kho | danh sách sản phẩm |
   | `installation_acceptance` | Nghiệm thu lắp đặt | đơn lắp đặt, khách ký |
   PDF render được (bytes hợp lệ — verify bằng pdfium/pypdf mở được).
5. **Unit tests (pytest)**: 5 templates sinh PDF hợp lệ; list-printers filter đúng shopCode; print trả bytes; job status tracking.

## Touch map (SF-5 sở hữu)
```
services/print-service/**
```
READ-ONLY: api/proto/**, api/seed/**, packages/shared/**, mọi service/app khác.

## ACCEPTANCE (user-visible)
- Service chạy standalone :50053 theo README; smoke gRPC call thành công.
- pytest pass: 5 PDF render hợp lệ (mở được, không rỗng); printers trả đúng theo shopCode seed.
- print() trả PDF bytes non-empty cho mỗi PrintType với payload mẫu.

## Boundary (KHÔNG làm)
- KHÔNG gọi Go/Java (batchPayload đến từ BFF); KHÔNG sửa proto/seed/BFF; KHÔNG FE.
- KHÔNG print aggregation/"In tất cả" endpoint (FE gọi 5 lần — pin §3.7); thiếu gì → REQUIREMENT-GAP lên epic FI-233.
