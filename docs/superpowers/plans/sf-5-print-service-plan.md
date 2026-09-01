# SF-5 Plan — print-service Python (FI-239)

> Spec: docs/superpowers/specs/ict-service-support-polyglot-spec.md (v3 §3.7) · Context pack: docs/superpowers/contexts/sf-5.md · Epic: FI-233
> Worktree: sf-5-print-python (fork/merge qua story/fi233-polyglot-grpc-mf — KHÔNG đụng main)
> Base: 10837c5 (SF-2 merged). print.proto + canonical seed là SOURCE OF TRUTH — KHÔNG đổi .proto, KHÔNG seed riêng.
> Toolchain: Python ≥3.11 (máy: 3.14) + venv riêng trong services/print-service — KHÔNG thêm vào turbo (spec pin).

## Meta (không checkbox)
- Stateless PDF generator — NHẬN fat payload từ BFF, KHÔNG gọi Go/Java (P1 pin §3.7).
- Rolling review: code-reviewer ĐỘC LẬP theo nhóm (core-service / templates / tests+readme) trước merge.
- PDF validity = pypdf mở được + non-empty (context pack pin).
- Merge: no-ff vào story/fi233-polyglot-grpc-mf (update-ref FULL refname + ancestor-guard), audit comment FI-239.
- Linear FI-239 → Done CHỈ SAU story-verify sạch.

## Tasks

- [x] Task 1 — grpcio bootstrap: `services/print-service/` — requirements.txt (pinned grpcio, protobuf, reportlab; dev: pytest, pypdf), .gitignore (venv/__pycache__), `run.sh` (tạo venv + pip install + start :50053), `print_service/server.py` (grpc.aio hoặc sync server, serve PrintService), `print_service/__main__.py`, port 50053. KHÔNG touch turbo.json. (commit 105ac17 — grpcio 1.83.1 + protobuf 7.36.0 khớp gencode SF-2)
- [x] Task 2 — printers registry: `print_service/printers.py` load từ `api/seed/canonical-seed.json` (path resolve từ repo root — service chạy standalone vẫn tìm được), map sang proto Printer{id, name, shop_code}. PHẢI gồm shop 30201. KHÔNG seed riêng. (commit 105ac17 — fail-fast seed lỗi, env override PRINT_SERVICE_SEED_PATH)
- [x] Task 3 — impl ListPrinters: `print_service/servicer.py` — ListPrinters(shopCode) filter đúng shopCode; shopCode rỗng → toàn bộ (BFF luôn truyền shop; empty = defensive). (commit 105ac17)
- [x] Task 4 — impl Print: nhận batch_payload (bytes JSON canonical), print_type, printer_id → dispatch theo template → trả PrintResponse{pdf_content}. Job status in-memory (`print_service/jobs.py`: job id + status QUEUED→RENDERED, job id sinh mỗi call). Payload không parse được JSON → InvalidArgument; print_type UNSPECIFIED → InvalidArgument; print_id không có trong registry → warning log (stateless — vẫn render, printer_id chỉ metadata) — flag decision trong report. (commit 105ac17 — unknown printer_id: warning + vẫn render, stateless)
- [x] Task 5 — template bill (Biên bản/phiếu thu COD): mã đơn, COD amount, khách hàng (từ batch items + shop context). Font Unicode TTF (Vietnamese diacritics) — đăng ký 1 chỗ `print_service/fonts.py` với fallback chain font hệ thống. (commit 762eefa — Arial macOS + DejaVu Linux)
- [x] Task 6 — template delivery (Vận đơn): địa chỉ, TG hẹn (from–to), mã phiếu (batchCode + orderCode per stop). (commit 762eefa)
- [x] Task 7 — templates handover_receipt (bàn giao shipper: shipper + danh sách đơn) + goods_handover (bàn giao kho: danh sách sản phẩm tổng hợp từ items). (commit 762eefa — OrderedDict gộp theo productCode)
- [x] Task 8 — template installation_acceptance (nghiệm thu lắp đặt: đơn lắp đặt + ô khách ký). Registry `templates/__init__.py` map PrintType → renderer (1 chỗ). (commit 762eefa)
- [x] Task 9 — pytest: 5 templates sinh PDF hợp lệ (pypdf open + non-empty + đúng số trang); list-printers filter shopCode đúng (gồm 30201); print trả bytes non-empty mỗi PrintType (end-to-end qua servicer, payload mẫu từ canonical seed); job status tracking; error cases (payload hỏng, UNSPECIFIED). Chạy bằng venv service. (commit Task 9-10 — 31/31 pass)
- [ ] Task 10 — README + verify + merge: README chạy standalone :50053 (smoke gRPC call mẫu — grpcurl hoặc python client snippet); verify từng dòng ACCEPTANCE context pack (service chạy, smoke OK, pytest pass, print bytes non-empty 5/5); code-reviewer APPROVED; merge no-ff vào story branch; audit comment FI-239. (README + smoke đã xong — commit c46520d; tick SAU review APPROVED + merge; review round 1: CHANGES-REQUESTED P1 premature tick → fix)

## ACCEPTANCE checklist (từ context pack — verifier dùng)
- [ ] Service chạy standalone :50053 theo README; smoke gRPC call thành công.
- [ ] pytest pass: 5 PDF render hợp lệ (mở được, không rỗng); printers trả đúng theo shopCode seed.
- [ ] print() trả PDF bytes non-empty cho mỗi PrintType với payload mẫu.
- [ ] Boundary: KHÔNG gọi Go/Java; KHÔNG sửa proto/seed/BFF; KHÔNG FE; KHÔNG printAll.
