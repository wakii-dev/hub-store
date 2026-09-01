"""Template delivery — Vận đơn / label giao hàng (PrintType 2).

Nội dung tối thiểu (context pack): địa chỉ, TG hẹn, mã phiếu.
"""
from __future__ import annotations

from reportlab.lib.units import mm
from reportlab.platypus import Spacer

from .base import (data_table, format_time_range, header, meta_table, render,
                   signature_block)

TITLE = "VẬN ĐƠN GIAO HÀNG"


def build_story(batch: dict) -> list:
    items = batch.get("items", [])
    delivery_time = batch.get("deliveryTime") or {}

    body_rows = []
    for item in items:
        body_rows.append([
            item.get("stopOrder", ""),
            batch.get("batchCode", ""),
            item.get("orderCode", ""),
            item.get("customerAddress", ""),
            format_time_range(item.get("fromDeliveryTime"), item.get("toDeliveryTime")),
        ])

    story: list = []
    header(story, TITLE, f"Mã phiếu: {batch.get('batchCode', '')}")
    story.append(meta_table([
        ("Kho giao", batch.get("shopCode", "")),
        ("TG hẹn giao", format_time_range(delivery_time.get("from"), delivery_time.get("to"))),
        ("Số điểm giao", len(items)),
    ]))
    story.append(Spacer(1, 4 * mm))
    story.append(data_table(
        ["Chặng", "Mã phiếu", "Mã đơn", "Địa chỉ giao", "TG hẹn"],
        body_rows,
        col_widths=[14 * mm, 30 * mm, 28 * mm, None, 52 * mm],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(signature_block("NGƯỜI GIAO HÀNG", "NGƯỜI NHẬN"))
    return story


def render_delivery(batch: dict) -> bytes:
    return render(build_story(batch), TITLE)
