"""Template registry — map PrintType (proto enum value) → renderer. 1 chỗ."""
from __future__ import annotations

from typing import Callable

# Import bridge gen protos trước khi dùng print_pb2.
from .._proto import print_pb2  # noqa: F401  (side-effect: sys.path)
from . import (bill, delivery, goods_handover, handover_receipt,
               installation_acceptance)

Renderer = Callable[[dict], bytes]

RENDERERS: dict[int, Renderer] = {
    print_pb2.PRINT_TYPE_BILL: bill.render_bill,
    print_pb2.PRINT_TYPE_DELIVERY: delivery.render_delivery,
    print_pb2.PRINT_TYPE_HANDOVER_RECEIPT: handover_receipt.render_handover_receipt,
    print_pb2.PRINT_TYPE_GOODS_HANDOVER: goods_handover.render_goods_handover,
    print_pb2.PRINT_TYPE_INSTALLATION_ACCEPTANCE: installation_acceptance.render_installation_acceptance,
}

PRINT_TYPE_NAMES: dict[int, str] = {
    print_pb2.PrintType.Value(name): name.removeprefix("PRINT_TYPE_").lower()
    for name in print_pb2.PrintType.keys()
    if name != "PRINT_TYPE_UNSPECIFIED"
}


def render_pdf(print_type: int, batch: dict) -> bytes:
    """Dispatch theo PrintType. Raise ValueError nếu UNSPECIFIED/không hỗ trợ."""
    renderer = RENDERERS.get(print_type)
    if renderer is None:
        raise ValueError(
            f"print_type không hợp lệ: {print_type} "
            f"(hỗ trợ: {sorted(PRINT_TYPE_NAMES)})"
        )
    return renderer(batch)
