# print-service (Python) — SF-5

gRPC service :50053 — printers registry + print jobs + 5 PDF templates (reportlab).

> Owned by SF-5 (FI-239) · Epic FI-233 · Spec: `docs/superpowers/specs/ict-service-support-polyglot-spec.md` §3.7 · Context pack: `docs/superpowers/contexts/sf-5.md`
> Proto (source of truth, SF-2 authored): `api/proto/hubstore/print/v1/print.proto` · Seed: `api/seed/canonical-seed.json` (KHÔNG seed riêng)

## Chạy standalone

```sh
cd services/print-service
./run.sh                      # tạo .venv lần đầu + pip install + start :50053
```

`run.sh` KHÔNG đi qua turbo — service chạy độc lập (spec pin). Env: `PRINT_SERVICE_SEED_PATH` override đường dẫn seed (mặc định `<repo-root>/api/seed/canonical-seed.json`).

Smoke (terminal khác, sau khi service chạy):

```sh
cd services/print-service
.venv/bin/python smoke.py                      # ListPrinters(30201) + Print(bill) → PDF bytes
.venv/bin/python smoke.py --print-type delivery --out /tmp/vandon.pdf
```

`smoke.py` gọi gRPC THẬT qua socket :50053: `ListPrinters("30201")` in danh sách máy in, rồi `Print` với fat payload từ canonical seed → ghi PDF ra file (`/tmp/hubstore-print.pdf` mặc định).

## RPC

| RPC | Input | Output | Ghi chú |
|---|---|---|---|
| `ListPrinters` | `shop_code` | `printers[]{id, name, shop_code}` | filter theo shopCode — seed gồm 30201 |
| `Print` | `batch_payload` (bytes JSON Batch), `print_type` (1-5), `printer_id` | `pdf_content` (PDF bytes) | stateless — payload do BFF hydrate; job status in-memory |

PrintType: `1 bill · 2 delivery · 3 handover_receipt · 4 goods_handover · 5 installation_acceptance`. `UNSPECIFIED` → `INVALID_ARGUMENT`; payload hỏng/thiếu shape Batch → `INVALID_ARGUMENT`; render lỗi → `INTERNAL` + job `FAILED`.

## Test

```sh
cd services/print-service
.venv/bin/python -m pytest tests -q      # 31 tests: 5 templates, printers, servicer, jobs
```

## Cấu trúc

```
services/print-service/
├── run.sh                  # standalone launcher (:50053)
├── smoke.py                # smoke gRPC client (thật socket)
├── requirements.txt        # pinned: grpcio 1.83.1, protobuf 7.36.0, reportlab 4.3.1
├── print_service/
│   ├── server.py           # grpc bootstrap :50053
│   ├── servicer.py         # ListPrinters + Print impl (print.proto SF-2)
│   ├── printers.py         # registry từ canonical seed (fail-fast)
│   ├── jobs.py             # in-memory job registry (QUEUED→RENDERED/FAILED)
│   ├── fonts.py            # font Unicode tiếng Việt (Arial → fallback chain)
│   ├── _proto.py           # import bridge api/proto/gen/python
│   └── templates/          # 5 PDF templates + registry (PrintType → renderer)
└── tests/                  # pytest (31 tests)
```

## Boundary (spec §5 pin)

- KHÔNG gọi Go/Java — `batch_payload` đến từ BFF (spec §3.7).
- KHÔNG sửa proto/seed/BFF; KHÔNG FE; KHÔNG endpoint printAll ("In tất cả" = FE gọi 5 lần).
- printer_id không khớp registry → warning log, vẫn render (stateless — printer chỉ metadata; decision flag trong audit).
