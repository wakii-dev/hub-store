"""Tests — Servicer Print: trả PDF bytes non-empty + job status + error cases.

End-to-end tầng servicer (gRPC thật) — payload mẫu từ canonical seed,
không mock renderer. Smoke server thật (ListPrinters + Print qua socket)
nằm ở README smoke client.
"""
import grpc
import pytest

from print_service._proto import print_pb2
from print_service.jobs import JobRegistry
from print_service.printers import load_printers
from print_service.servicer import PrintServicer
from tests.conftest import FakeContext


@pytest.fixture()
def svc():
    return PrintServicer(load_printers(), JobRegistry())


def _print_request(batch_payload: bytes, print_type: int, printer_id="PRN-30201-01"):
    return print_pb2.PrintRequest(
        batch_payload=batch_payload, print_type=print_type, printer_id=printer_id
    )


def test_list_printers_filters_shop_code(svc):
    resp = svc.ListPrinters(print_pb2.ListPrintersRequest(shop_code="30201"), FakeContext())
    assert len(resp.printers) >= 1
    assert all(p.shop_code == "30201" for p in resp.printers)
    assert resp.printers[0].id == "PRN-30201-01"


def test_list_printers_all_shops_when_empty(svc):
    resp = svc.ListPrinters(print_pb2.ListPrintersRequest(shop_code=""), FakeContext())
    assert len(resp.printers) == 6  # seed có đúng 6 printers


@pytest.mark.parametrize("print_type", [1, 2, 3, 4, 5])
def test_print_returns_nonempty_pdf_bytes_per_print_type(svc, context, batch_payload, print_type):
    resp = svc.Print(_print_request(batch_payload, print_type), context)
    assert resp.pdf_content.startswith(b"%PDF")
    assert len(resp.pdf_content) > 1000


def test_print_creates_job_then_marks_rendered(svc, context, batch_payload):
    resp = svc.Print(_print_request(batch_payload, print_pb2.PRINT_TYPE_BILL), context)
    assert len(resp.pdf_content) > 0
    jobs = [svc.jobs.get(f"JOB-{i:06d}") for i in range(1, 10)]
    jobs = [j for j in jobs if j]
    assert len(jobs) == 1
    assert jobs[0].status == "RENDERED"
    assert jobs[0].pdf_size == len(resp.pdf_content)
    assert jobs[0].print_type == "bill"
    assert jobs[0].batch_code == "BATCH-0001"


def test_print_unspecified_type_rejected(svc, context, batch_payload):
    with pytest.raises(Exception) as exc:
        svc.Print(_print_request(batch_payload, print_pb2.PRINT_TYPE_UNSPECIFIED), context)
    assert context.code == grpc.StatusCode.INVALID_ARGUMENT


def test_print_corrupt_payload_rejected(svc, context):
    with pytest.raises(Exception):
        svc.Print(_print_request(b"khong-phai-json{{", print_pb2.PRINT_TYPE_BILL), context)
    assert context.code == grpc.StatusCode.INVALID_ARGUMENT


def test_print_payload_not_object_rejected(svc, context):
    with pytest.raises(Exception):
        svc.Print(_print_request(b"[1,2,3]", print_pb2.PRINT_TYPE_BILL), context)
    assert context.code == grpc.StatusCode.INVALID_ARGUMENT


def test_print_missing_items_rejected(svc, context):
    with pytest.raises(Exception):
        svc.Print(_print_request(b'{"batchCode":"X"}', print_pb2.PRINT_TYPE_BILL), context)
    assert context.code == grpc.StatusCode.INVALID_ARGUMENT


def test_print_unknown_printer_still_renders_with_warning(svc, context, batch_payload):
    """Stateless — printer_id chỉ metadata: không chặn, chỉ log (decision flag trong report)."""
    resp = svc.Print(_print_request(batch_payload, print_pb2.PRINT_TYPE_BILL, printer_id="PRN-KHONG-TON-TAI"), context)
    assert resp.pdf_content.startswith(b"%PDF")


def test_job_registry_tracks_failed_on_internal_error(seed, batch_payload, monkeypatch):
    svc = PrintServicer(load_printers(), JobRegistry())
    monkeypatch.setattr(
        "print_service.templates.render_pdf",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    ctx = FakeContext()
    with pytest.raises(Exception):
        svc.Print(_print_request(batch_payload, print_pb2.PRINT_TYPE_BILL), ctx)
    assert ctx.code == grpc.StatusCode.INTERNAL
    job = svc.jobs.get("JOB-000001")
    assert job is not None and job.status == "FAILED"
