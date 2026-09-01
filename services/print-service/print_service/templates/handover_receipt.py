"""Template handover_receipt — Bàn giao shipper (PrintType 3).

Nội dung tối thiểu (context pack): shipper, danh sách đơn.
"""
from __future__ import annotations

from reportlab.lib.units import mm
from reportlab.platypus import Spacer

from .base import (data_table, format_time_range, header, meta_table, render,
                   signature_block)

TITLE = "BIÊN BẢN BÀN GIAO ĐƠN HÀNG CHO SHIPPER"


def build_story(batch: dict) -> list:
    items = batch.get("items", [])
    delivery_time = batch.get("deliveryTime") or {}
    # Payload BFF hydrate có thể kèm shipperName — fallback shipperId.
    shipper = batch.get("shipperName") or batch.get("shipperId", "")

    body_rows = []
    for idx, item in enumerate(items, start=1):
        products = ", ".join(
            f"{p.get('productName', '')} x{p.get('quantity', 0)}"
            for p in item.get("items", [])
        )
        body_rows.append([
            idx,
            item.get("orderCode", ""),
            item.get("customerAddress", ""),
            products,
            item.get("totalQuantity", ""),
        ])

    story: list = []
    header(story, TITLE, f"Mã phiếu: {batch.get('batchCode', '')}")
    story.append(meta_table([
        ("Shipper nhận giao", f"<b>{shipper}</b>"),
        ("Kho bàn giao", batch.get("shopCode", "")),
        ("TG hẹn giao", format_time_range(delivery_time.get("from"), delivery_time.get("to"))),
        ("Số đơn bàn giao", len(items)),
    ]))
    story.append(Spacer(1, 4 * mm))
    story.append(data_table(
        ["STT", "Mã đơn", "Địa chỉ giao", "Sản phẩm", "Tổng SL"],
        body_rows,
        col_widths=[12 * mm, 28 * mm, None, 60 * mm, 18 * mm],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(signature_block("ĐẠI DIỆN KHO BÀN GIAO", "SHIPPER NHẬN ĐƠN"))
    return story


def render_handover_receipt(batch: dict) -> bytes:
    return render(build_story(batch), TITLE)
