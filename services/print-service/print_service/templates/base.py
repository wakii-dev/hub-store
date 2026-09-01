"""Shared helpers cho 5 PDF templates (reportlab platypus)."""
from __future__ import annotations

import io
import json
from datetime import datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..fonts import font_name

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

# Bố cục chung: tiêu đề phiếu + khối meta + bảng + chữ ký.
STYLE_TITLE = ParagraphStyle("Title", font_size=16, leading=20, alignment=1, space_after=4)
STYLE_SUB = ParagraphStyle("Sub", font_size=10, leading=14, alignment=1)
STYLE_LABEL = ParagraphStyle("Label", font_size=10, leading=14)
STYLE_CELL = ParagraphStyle("Cell", font_size=9, leading=12)
STYLE_NOTE = ParagraphStyle("Note", font_size=9, leading=12, textColor=colors.grey)


def parse_payload(batch_payload: bytes) -> dict[str, Any]:
    """Parse fat payload (canonical JSON của Batch). Raise ValueError nếu hỏng."""
    try:
        data = json.loads(batch_payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"batch_payload không phải JSON hợp lệ: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("batch_payload phải là JSON object (Batch)")
    if not data.get("batchCode") or not isinstance(data.get("items"), list):
        raise ValueError("batch_payload thiếu batchCode/items[] (shape Batch §3.4)")
    return data


def render(story: list, title: str) -> bytes:
    """Render story (platypus flowables) → PDF bytes (in-memory)."""
    font_name()  # đảm bảo font đã đăng ký trước khi Paragraph fix fontName
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=16 * mm, bottomMargin=16 * mm,
        title=title, author="hub-store-order print-service",
    )
    doc.build(story)
    return buf.getvalue()


def header(story: list, title: str, subtitle: str = "") -> None:
    """Tiêu đề phiếu (giữa trang) + phụ đề."""
    story.append(Paragraph(f"<b>{title}</b>",
                           ParagraphStyle("TitleF", parent=STYLE_TITLE, fontName=font_name())))
    if subtitle:
        story.append(Paragraph(subtitle,
                               ParagraphStyle("SubF", parent=STYLE_SUB, fontName=font_name())))
    story.append(Spacer(1, 4 * mm))


def meta_table(rows: list[tuple[str, str]]) -> Table:
    """Khối meta 2 cột (nhãn: giá trị)."""
    style = ParagraphStyle("MetaL", parent=STYLE_LABEL, fontName=font_name())
    data = [[Paragraph(f"<b>{k}</b>", style), Paragraph(str(v), style)] for k, v in rows]
    t = Table(data, colWidths=[45 * mm, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    return t


def data_table(header_row: list[str], body_rows: list[list[str]], col_widths=None) -> Table:
    """Bảng dữ liệu có header — style chung 5 phiếu."""
    cell = ParagraphStyle("CellF", parent=STYLE_CELL, fontName=font_name())
    data = [[Paragraph(f"<b>{h}</b>", cell) for h in header_row]]
    for row in body_rows:
        data.append([Paragraph(str(c), cell) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8E8E8")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#999999")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def format_vnd(amount) -> str:
    """COD amount — format VI (D2: 15.000.000đ)."""
    try:
        value = int(amount)
    except (TypeError, ValueError):
        return str(amount or 0)
    return f"{value:,}".replace(",", ".") + "đ"


def format_time_range(time_from: str, time_to: str) -> str:
    """TG hẹn 'HH:mm DD/MM/YYYY – HH:mm DD/MM/YYYY' (locale-neutral số — D5+D13)."""

    def fmt(raw: str) -> str:
        try:
            dt = datetime.fromisoformat(raw)
            return dt.strftime("%H:%M %d/%m/%Y")
        except (TypeError, ValueError):
            return str(raw or "")

    return f"{fmt(time_from)} – {fmt(time_to)}"


def signature_block(left_label: str, right_label: str) -> Table:
    """Khối chữ ký 2 cột (ngày ... bên trái, ký tên bên phải)."""
    style = ParagraphStyle("SigF", parent=STYLE_LABEL, fontName=font_name(), alignment=1)
    data = [
        [Paragraph(left_label, style), Paragraph(right_label, style)],
        [Paragraph("", style), Paragraph("", style)],
        [Paragraph("", style), Paragraph("", style)],
        [Paragraph("", style), Paragraph("", style)],
    ]
    t = Table(data, colWidths=[None, None], rowHeights=[8 * mm, 10 * mm, 10 * mm, 10 * mm])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return t
