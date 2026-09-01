"""Template bill — Biên bản / phiếu thu COD (PrintType 1).

Nội dung tối thiểu (context pack): mã đơn, COD amount, khách hàng.
"""
from __future__ import annotations

from reportlab.lib.units import mm
from reportlab.platypus import Spacer

from .base import (data_table, format_vnd, header, meta_table, render,
                   signature_block)

TITLE = "BIÊN BẢN BÀN GIAO HÀNG - PHIẾU THU COD"


def build_story(batch: dict) -> list:
    items = batch.get("items", [])
    body_rows = []
    total_cod = 0
    for idx, item in enumerate(items, start=1):
        cod = item.get("codAmount") or 0
        total_cod += int(cod or 0)
        body_rows.append([
            idx,
            item.get("orderCode", ""),
            item.get("customerAddress", ""),
            format_vnd(cod),
        ])

    story: list = []
    header(story, TITLE, f"Mã phiếu: {batch.get('batchCode', '')}")
    story.append(meta_table([
        ("Kho giao", batch.get("shopCode", "")),
        ("Số đơn", len(items)),
        ("Tổng tiền thu COD", f"<b>{format_vnd(total_cod)}</b>"),
    ]))
    story.append(Spacer(1, 4 * mm))
    story.append(data_table(
        ["STT", "Mã đơn", "Khách hàng (địa chỉ)", "Tiền COD"],
        body_rows,
        col_widths=[12 * mm, 32 * mm, None, 34 * mm],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(signature_block("NGƯỜI GIAO HÀNG", "KHÁCH HÀNG (NGƯỜI NHẬN)"))
    return story


def render_bill(batch: dict) -> bytes:
    return render(build_story(batch), TITLE)
