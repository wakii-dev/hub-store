"""Template goods_handover — Bàn giao kho (PrintType 4).

Nội dung tối thiểu (context pack): danh sách sản phẩm (tổng hợp từ items).
"""
from __future__ import annotations

from collections import OrderedDict

from reportlab.lib.units import mm
from reportlab.platypus import Spacer

from .base import (data_table, format_time_range, header, meta_table, render,
                   signature_block)

TITLE = "PHIẾU BÀN GIAO HÀNG HÓA"


def _aggregate_products(batch: dict) -> list[dict]:
    """Gộp sản phẩm toàn batch: (productCode) → {name, quantity}."""
    products: "OrderedDict[str, dict]" = OrderedDict()
    for item in batch.get("items", []):
        for product in item.get("items", []):
            code = product.get("productCode", "")
            entry = products.setdefault(
                code, {"name": product.get("productName", ""), "quantity": 0}
            )
            try:
                entry["quantity"] += int(product.get("quantity") or 0)
            except (TypeError, ValueError):
                pass
    return list(products.values())


def build_story(batch: dict) -> list:
    products = _aggregate_products(batch)
    delivery_time = batch.get("deliveryTime") or {}

    body_rows = [
        [idx, p.get("name", ""), p["quantity"]]
        for idx, p in enumerate(products, start=1)
    ]

    story: list = []
    header(story, TITLE, f"Mã phiếu: {batch.get('batchCode', '')}")
    story.append(meta_table([
        ("Kho bàn giao", batch.get("shopCode", "")),
        ("TG hẹn giao", format_time_range(delivery_time.get("from"), delivery_time.get("to"))),
        ("Số mặt hàng", len(products)),
    ]))
    story.append(Spacer(1, 4 * mm))
    story.append(data_table(
        ["STT", "Tên sản phẩm", "Số lượng"],
        body_rows,
        col_widths=[14 * mm, None, 30 * mm],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(signature_block("NGƯỜI GIAO (KHO)", "NGƯỜI NHẬN"))
    return story


def render_goods_handover(batch: dict) -> bytes:
    return render(build_story(batch), TITLE)
