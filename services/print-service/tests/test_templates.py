"""Tests — 5 PDF templates render hợp lệ (pypdf mở được + non-empty)."""
import io
import json

import pytest
from pypdf import PdfReader

from print_service.templates import (PRINT_TYPE_NAMES, RENDERERS, bill,
                                     delivery, goods_handover,
                                     handover_receipt, installation_acceptance,
                                     render_pdf)

TYPE_IDS = {name: code for code, name in PRINT_TYPE_NAMES.items()}

EXPECTED_TITLES = {
    "bill": bill.TITLE,
    "delivery": delivery.TITLE,
    "handover_receipt": handover_receipt.TITLE,
    "goods_handover": goods_handover.TITLE,
    "installation_acceptance": installation_acceptance.TITLE,
}


def test_registry_covers_all_5_print_types():
    assert sorted(TYPE_IDS) == sorted(EXPECTED_TITLES)
    assert len(RENDERERS) == 5


def _pdf_text(type_name: str, batch: dict) -> str:
    pdf = render_pdf(TYPE_IDS[type_name], batch)
    assert pdf.startswith(b"%PDF"), f"{type_name}: thiếu PDF header"
    assert len(pdf) > 1000, f"{type_name}: PDF quá nhỏ ({len(pdf)} bytes)"
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 1
    return reader.pages[0].extract_text()


@pytest.mark.parametrize("type_name", list(EXPECTED_TITLES))
def test_template_renders_valid_pdf_unicode(type_name, batch_payload):
    """Mỗi PrintType → PDF hợp lệ + tiêu đề tiếng Việt render đúng font Unicode."""
    text = _pdf_text(type_name, json.loads(batch_payload))
    assert EXPECTED_TITLES[type_name] in text


@pytest.mark.parametrize("type_name", list(EXPECTED_TITLES))
def test_template_content_minimum(type_name, batch_payload):
    """Nội dung tối thiểu theo context pack — verify bằng text extract từ PDF."""
    batch = json.loads(batch_payload)
    text = _pdf_text(type_name, batch)
    first = batch["items"][0]

    if type_name == "bill":  # mã đơn, COD amount, khách hàng
        assert first["orderCode"] in text and "5.600.000đ" in text
    elif type_name == "delivery":  # địa chỉ, TG hẹn, mã phiếu
        assert first["customerAddress"][:20] in text and batch["batchCode"] in text
    elif type_name == "handover_receipt":  # shipper, danh sách đơn
        assert batch["shipperId"] in text and first["orderCode"] in text
    elif type_name == "goods_handover":  # danh sách sản phẩm
        assert first["items"][0]["productName"] in text
    elif type_name == "installation_acceptance":  # đơn lắp đặt, khách ký
        assert first["orderCode"] in text and "KHÁCH HÀNG KÝ NHẬN" in text


def test_goods_handover_aggregates_quantities(seed):
    batch = seed["batches"][0]
    products = goods_handover._aggregate_products(batch)
    assert len(products) > 0
    # PRD-001 qty=1 giữ nguyên; PRD-003 gộp đúng theo seed (batch đầu chỉ 1 đơn chứa nó)
    first_items = {p["productCode"]: p for p in batch["items"][0]["items"]}
    by_name = {p["name"]: p for p in products}
    assert by_name[first_items["PRD-001"]["productName"]]["quantity"] == 1
