"""Template installation_acceptance — Nghiệm thu lắp đặt (PrintType 5).

Nội dung tối thiểu (context pack): đơn lắp đặt, khách ký.
"""
from __future__ import annotations

from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Spacer

from .base import (STYLE_NOTE, data_table, format_vnd, font_name, header,
                   meta_table, render, signature_block)

TITLE = "BIÊN BẢN NGHIỆM THU LẮP ĐẶT"


def _products_of(item: dict) -> str:
    return ", ".join(
        f"{p.get('productName', '')} x{p.get('quantity', 0)}"
        for p in item.get("items", [])
    )


def build_story(batch: dict) -> list:
    items = batch.get("items", [])

    body_rows = [
        [
            item.get("orderCode", ""),
            item.get("customerAddress", ""),
            _products_of(item),
            format_vnd(item.get("codAmount")),
        ]
        for item in items
    ]

    story: list = []
    header(story, TITLE, f"Mã phiếu: {batch.get('batchCode', '')}")
    story.append(meta_table([
        ("Kho lắp đặt", batch.get("shopCode", "")),
        ("Số đơn lắp đặt", len(items)),
    ]))
    story.append(Spacer(1, 4 * mm))
    story.append(data_table(
        ["Mã đơn", "Địa chỉ lắp đặt", "Thiết bị lắp đặt", "Tiền COD"],
        body_rows,
        col_widths=[28 * mm, None, 62 * mm, 30 * mm],
    ))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "Biên bản nghiệm thu: khách hàng xác nhận thiết bị đã được lắp đặt, "
        "vận hành ổn định và đúng danh mục nêu trên.",
        ParagraphStyle("NoteF", parent=STYLE_NOTE, fontName=font_name()),
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(signature_block("ĐẠI DIỆN LẮP ĐẶT", "KHÁCH HÀNG KÝ NHẬN"))
    return story


def render_installation_acceptance(batch: dict) -> bytes:
    return render(build_story(batch), TITLE)
