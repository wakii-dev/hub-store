"""Pytest fixtures — seed thật từ canonical-seed.json (KHÔNG tự seed riêng)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SERVICE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from print_service._proto import print_pb2  # noqa: E402
from print_service.jobs import JobRegistry  # noqa: E402
from print_service.printers import load_printers  # noqa: E402
from print_service.servicer import PrintServicer  # noqa: E402


@pytest.fixture(scope="session")
def seed() -> dict:
    with open(SERVICE_DIR / "../../api/seed/canonical-seed.json", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture()
def batch_payload(seed) -> bytes:
    """Fat payload mẫu — batch đầu tiên của seed (BATCH-0001, shop 30201)."""
    return json.dumps(seed["batches"][0], ensure_ascii=False).encode("utf-8")


@pytest.fixture()
def servicer(seed):
    return PrintServicer(load_printers(), JobRegistry())


class FakeContext:
    """grpc.ServicerContext tối thiểu cho unit test (abort → RpcError-like)."""

    def __init__(self):
        self.code = None
        self.details = None

    def abort(self, code, details):
        # grpc.RpcError với code/details — giống hành vi servicer thật khi abort.
        err = grpc_abort_error(code, details)
        self.code, self.details = code, details
        raise err


class grpc_abort_error(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code
        self._details = details


@pytest.fixture()
def context():
    return FakeContext()


@pytest.fixture()
def print_types():
    return {
        "bill": print_pb2.PRINT_TYPE_BILL,
        "delivery": print_pb2.PRINT_TYPE_DELIVERY,
        "handover_receipt": print_pb2.PRINT_TYPE_HANDOVER_RECEIPT,
        "goods_handover": print_pb2.PRINT_TYPE_GOODS_HANDOVER,
        "installation_acceptance": print_pb2.PRINT_TYPE_INSTALLATION_ACCEPTANCE,
    }
