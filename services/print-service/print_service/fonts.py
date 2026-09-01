"""Font registration — 1 chỗ (reportlab base-14 KHÔNG đủ Vietnamese diacritics).

Fallback chain font hệ thống có Unicode coverage tiếng Việt:
macOS Arial/Verdana/Tahoma → Linux DejaVuSans. Font đầu tiên đăng ký được wins.
"""
from __future__ import annotations

import logging
import platform
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

logger = logging.getLogger(__name__)

_REGISTERED = False
_FONT_NAME = ""


def font_name() -> str:
    """Tên font family đã đăng ký (đăng ký lazy nếu chưa)."""
    register_fonts()
    return _FONT_NAME

# (regular, bold) candidates — (font_name, path)
_CANDIDATES: list[tuple[str, Path, Path]] = [
    ("Arial", Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
     Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")),
    ("Verdana", Path("/System/Library/Fonts/Supplemental/Verdana.ttf"),
     Path("/System/Library/Fonts/Supplemental/Verdana Bold.ttf")),
    ("Tahoma", Path("/System/Library/Fonts/Supplemental/Tahoma.ttf"),
     Path("/System/Library/Fonts/Supplemental/Tahoma Bold.ttf")),
    ("DejaVuSans", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
     Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")),
]

_FALLBACK_MAC_FONT_DIRS = [Path("/System/Library/Fonts/Supplemental"), Path("/Library/Fonts")]


def register_fonts() -> str:
    """Đăng ký font family Unicode. Trả về tên font đã dùng. Idempotent."""
    global _REGISTERED, _FONT_NAME
    if _REGISTERED:
        return _FONT_NAME

    errors: list[str] = []
    for name, regular, bold in _CANDIDATES:
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont(name, str(regular)))
            pdfmetrics.registerFont(TTFont(f"{name}-Bold", str(bold)))
            pdfmetrics.registerFontFamily(name, normal=name, bold=f"{name}-Bold",
                                          italic=name, boldItalic=f"{name}-Bold")
            logger.info("Registered font family %s", name)
            _REGISTERED, _FONT_NAME = True, name
            return name
        errors.append(f"{name}: {regular} / {bold} không tồn tại")

    # macOS container khác có thể thiếu Supplemental — quét thêm thư mục font.
    if platform.system() == "Darwin":
        for font_dir in _FALLBACK_MAC_FONT_DIRS:
            for ttf in sorted(font_dir.glob("*.ttf")):
                try:
                    pdfmetrics.registerFont(TTFont("HubStoreFallback", str(ttf)))
                    pdfmetrics.registerFontFamily("HubStoreFallback", normal="HubStoreFallback",
                                                  bold="HubStoreFallback", italic="HubStoreFallback",
                                                  boldItalic="HubStoreFallback")
                    logger.warning("Fallback font %s (không có bold riêng)", ttf)
                    _REGISTERED, _FONT_NAME = True, "HubStoreFallback"
                    return "HubStoreFallback"
                except Exception:  # noqa: BLE001 — ttf không đọc được → thử font kế
                    continue

    raise RuntimeError("Không đăng ký được font Unicode nào. Tried:\n" + "\n".join(errors))


def page_size():
    return A4
