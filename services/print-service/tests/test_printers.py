"""Tests — printers registry + ListPrinters filter đúng shopCode (gồm 30201)."""
from print_service.printers import filter_by_shop, load_printers


def test_load_printers_from_canonical_seed():
    printers = load_printers()
    assert len(printers) >= 6  # seed: 2×30201 + 4 shop khác
    assert all(p.printer_id and p.name and p.shop_code for p in printers)


def test_seed_includes_shop_30201():
    printers = load_printers()
    shop_30201 = filter_by_shop(printers, "30201")
    assert len(shop_30201) >= 1
    assert {p.shop_code for p in shop_30201} == {"30201"}
    assert any(p.printer_id == "PRN-30201-01" for p in shop_30201)


def test_filter_by_shop_returns_only_matching_shop():
    printers = load_printers()
    for shop in ("30201", "30202", "30203"):
        matched = filter_by_shop(printers, shop)
        assert matched, f"shop {shop} phải có printer trong seed"
        assert all(p.shop_code == shop for p in matched)


def test_filter_by_shop_empty_returns_all():
    printers = load_printers()
    assert filter_by_shop(printers, "") == printers


def test_filter_unknown_shop_returns_empty():
    assert filter_by_shop(load_printers(), "99999") == []
