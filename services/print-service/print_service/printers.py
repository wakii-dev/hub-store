"""Printers registry — load từ canonical seed (SF-2 authored, READ-ONLY).

Spec §3.5: printers theo shopCode (PHẢI gồm 30201). KHÔNG seed riêng —
fail-fast nếu seed thiếu/không hợp lệ.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from ._proto import seed_path

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Printer:
    printer_id: str
    name: str
    shop_code: str
    location: str


def load_printers(path=None) -> list[Printer]:
    """Load printers từ canonical seed. Fail-fast nếu file/mảng printers lỗi."""
    seed_file = path if path is not None else seed_path()
    with open(seed_file, encoding="utf-8") as f:
        seed = json.load(f)
    printers = seed.get("printers")
    if not isinstance(printers, list) or not printers:
        raise ValueError(f"canonical seed '{seed_file}' không có printers[]")

    registry: list[Printer] = []
    for raw in printers:
        printer_id = raw.get("printerId")
        shop_code = raw.get("shopCode")
        if not printer_id or not shop_code:
            raise ValueError(f"printer thiếu printerId/shopCode: {raw!r}")
        registry.append(
            Printer(
                printer_id=printer_id,
                name=raw.get("name", ""),
                shop_code=shop_code,
                location=raw.get("location", ""),
            )
        )
    logger.info("Loaded %d printers từ %s", len(registry), seed_file)
    return registry


def filter_by_shop(printers: list[Printer], shop_code: str) -> list[Printer]:
    """Filter theo shopCode. shopCode rỗng → trả toàn bộ (defensive — BFF luôn truyền shop)."""
    if not shop_code:
        return list(printers)
    return [p for p in printers if p.shop_code == shop_code]
