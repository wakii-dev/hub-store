#!/usr/bin/env python
"""Smoke client — gọi gRPC THẬT :50053 (ACCEPTANCE: smoke call thành công).

Usage:
    .venv/bin/python smoke.py                          # ListPrinters + Print bill → /tmp/hubstore-print.pdf
    .venv/bin/python smoke.py --print-type delivery    # 1 trong 5 PrintType
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from print_service._proto import print_pb2, print_pb2_grpc

REPO_ROOT = Path(__file__).resolve().parents[2]

PRINT_TYPES = {name: getattr(print_pb2, f"PRINT_TYPE_{name.upper()}") for name in
               ("bill", "delivery", "handover_receipt", "goods_handover", "installation_acceptance")}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--print-type", default="bill", choices=sorted(PRINT_TYPES))
    parser.add_argument("--shop", default="30201")
    parser.add_argument("--out", default="/tmp/hubstore-print.pdf")
    args = parser.parse_args()

    with grpc_insecure_channel() as channel:
        stub = print_pb2_grpc.PrintServiceStub(channel)

        printers = stub.ListPrinters(print_pb2.ListPrintersRequest(shop_code=args.shop))
        print(f"ListPrinters({args.shop}) → {len(printers.printers)} máy in:")
        for p in printers.printers:
            print(f"  - {p.id}  {p.name}  ({p.shop_code})")
        if not printers.printers:
            print("FAIL: không có printer", file=sys.stderr)
            return 1

        seed = json.loads((REPO_ROOT / "api/seed/canonical-seed.json").read_text(encoding="utf-8"))
        batch = seed["batches"][0]
        resp = stub.Print(print_pb2.PrintRequest(
            batch_payload=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            print_type=PRINT_TYPES[args.print_type],
            printer_id=printers.printers[0].id,
        ))
        Path(args.out).write_bytes(resp.pdf_content)
        size = len(resp.pdf_content)
        ok = resp.pdf_content.startswith(b"%PDF") and size > 0
        print(f"Print({args.print_type}) → {size} bytes → {args.out}  {'OK' if ok else 'FAIL'}")
        return 0 if ok else 1


def grpc_insecure_channel():
    import grpc

    return grpc.insecure_channel("localhost:50053")


if __name__ == "__main__":
    raise SystemExit(main())
