#!/usr/bin/env python3
"""
Validator — api/seed/canonical-seed.json (SF-2 / FI-235, spec §3.5 + §3.3).

Assert TẤT CẢ ràng buộc seed:
  - shape: { orders, batches, deliveryStaff, printers, regions } — MỘT nguồn,
    cả 3 services (Java/Go/Python) deserialize từ đúng file này.
  - orders: ≥25, trải ≥4 kho; shop 30201 ≥5 đơn batchStatus=0; đủ 4 batchStatus
    (status 3 "Lỗi vượt trọng lượng" đặt tay 1-2 đơn); đủ 3 orderStatus;
    ≥1 isDebtSplittingOrder; mỗi đơn đủ fields §4 (OrderDetail shape).
  - batches: đủ 3 trạng thái §3.4; items[].orderCode TRỎ ĐÚNG orderCode trong
    orders; đơn trong phiếu ACTIVE → batchStatus=1, COMPLETED → 2;
    phiếu CANCELLED → đơn đã revert batchStatus=0.
  - deliveryStaff gắn shopCode; printers theo shopCode GỒM 30201;
    regions hierarchical {code, name, type: province|ward, parentCode?}.

Stdlib only. Exit 0 = pass; exit 1 + danh sách lỗi = fail.
"""
import json
import sys
from pathlib import Path

SEED_PATH = Path(__file__).parent / "canonical-seed.json"

ORDER_REQUIRED = [
    "fulfillCode", "orderCode", "statusCode", "batchStatus", "batchCode",
    "shopAssignment", "originalTime", "deliveryTime", "orderStatus", "items",
    "codAmount", "totalQuantity", "isDebtSplittingOrder", "customerAddress",
    "distance", "note", "history",
]
# batchStatus order-level (REQUIREMENTS §4): 0 Chưa soạn / 1 Đang soạn /
# 2 Đã soạn / 3 Lỗi vượt trọng lượng
BATCH_STATUSES = {0, 1, 2, 3}
# orderStatus: 0 Chờ duyệt / 1 Đã duyệt / 2 Từ chối duyệt
ORDER_STATUSES = {0, 1, 2}
# Batch entity status (spec §3.4): 0 ACTIVE / 1 COMPLETED / 2 CANCELLED
BATCH_ENTITY_STATUSES = {0, 1, 2}

errors: list[str] = []


def check(cond: bool, msg: str) -> bool:
    if not cond:
        errors.append(msg)
    return cond


def check_time_range(tr, label: str) -> None:
    if not check(isinstance(tr, dict) and {"from", "to"} <= set(tr), f"{label}: thiếu from/to"):
        return
    check(bool(tr["from"]) and bool(tr["to"]), f"{label}: from/to rỗng")
    check(tr["from"] < tr["to"], f"{label}: from >= to ({tr['from']} !< {tr['to']})")


def main() -> int:
    raw = json.loads(SEED_PATH.read_text(encoding="utf-8"))

    check(set(raw) == {"orders", "batches", "deliveryStaff", "printers", "regions"},
          f"top-level keys phải đúng 5 mảng, thấy: {sorted(raw)}")
    if errors:
        return report()

    orders, batches = raw["orders"], raw["batches"]
    staff, printers, regions = raw["deliveryStaff"], raw["printers"], raw["regions"]

    # ---------------- orders ----------------
    check(len(orders) >= 25, f"orders cần ≥25, thấy {len(orders)}")
    fulfills = [o.get("fulfillCode") for o in orders]
    order_codes = [o.get("orderCode") for o in orders]
    check(len(fulfills) == len(set(fulfills)), "fulfillCode trùng lặp")
    check(len(order_codes) == len(set(order_codes)), "orderCode trùng lặp")

    shop_codes = set()
    for o in orders:
        fc = o.get("fulfillCode", "?")
        missing = [k for k in ORDER_REQUIRED if k not in o]
        check(not missing, f"{fc}: thiếu fields §4: {missing}")
        check(isinstance(o.get("items"), list) and len(o["items"]) > 0, f"{fc}: items[] rỗng")
        if isinstance(o.get("items"), list) and o["items"]:
            for it in o["items"]:
                check({"productCode", "productName", "quantity"} <= set(it),
                      f"{fc}: sản phẩm thiếu productCode/productName/quantity")
            check(o.get("totalQuantity") == sum(i["quantity"] for i in o["items"]),
                  f"{fc}: totalQuantity ≠ tổng quantity items")
        sa = o.get("shopAssignment") or {}
        check({"shopCode", "shopName", "address"} <= set(sa), f"{fc}: shopAssignment thiếu keys")
        if "shopCode" in sa:
            shop_codes.add(sa["shopCode"])
        check_time_range(o.get("originalTime"), f"{fc}.originalTime")
        check_time_range(o.get("deliveryTime"), f"{fc}.deliveryTime")
        check(isinstance(o.get("history"), list), f"{fc}: history không phải list")
        check(isinstance(o.get("codAmount"), int) and o["codAmount"] >= 0, f"{fc}: codAmount không hợp lệ")

    check(len(shop_codes) >= 4, f"cần trải ≥4 kho, thấy {len(shop_codes)}: {sorted(shop_codes)}")

    orders_30201_not_prepared = [o for o in orders
                                 if o["shopAssignment"]["shopCode"] == "30201"
                                 and o["batchStatus"] == 0]
    check(len(orders_30201_not_prepared) >= 5,
          f"shop 30201 cần ≥5 đơn batchStatus=0 (Chưa soạn), thấy {len(orders_30201_not_prepared)}")

    bs_values = {o["batchStatus"] for o in orders}
    check(bs_values == BATCH_STATUSES, f"batchStatus phải đủ 0-3, thấy {sorted(bs_values)}")
    bs3_count = sum(1 for o in orders if o["batchStatus"] == 3)
    check(1 <= bs3_count <= 2, f"batchStatus=3 (vượt trọng lượng) đặt tay 1-2 đơn, thấy {bs3_count}")

    os_values = {o["orderStatus"] for o in orders}
    check(os_values == ORDER_STATUSES, f"orderStatus phải đủ 0-2, thấy {sorted(os_values)}")

    check(any(o["isDebtSplittingOrder"] for o in orders), "cần ≥1 isDebtSplittingOrder=true")

    # ---------------- batches ----------------
    check(len(batches) >= 3, f"batches cần ≥3 (đủ 3 trạng thái), thấy {len(batches)}")
    batch_by_code = {}
    for b in batches:
        code = b.get("batchCode", "?")
        check(code not in batch_by_code, f"batchCode trùng: {code}")
        batch_by_code[code] = b
        check(b.get("status") in BATCH_ENTITY_STATUSES, f"{code}: status không hợp lệ: {b.get('status')}")
        for key in ("shopCode", "shipperId", "deliveryTime", "items", "createdAt"):
            check(key in b, f"{code}: thiếu field {key}")
        check_time_range(b.get("deliveryTime"), f"{code}.deliveryTime")
        seen_in_batch = set()
        for it in b.get("items", []):
            oc = it.get("orderCode")
            check(oc in set(order_codes),
                  f"{code}.items: orderCode '{oc}' KHÔNG trỏ vào orders seed (referential integrity)")
            check(oc not in seen_in_batch, f"{code}: orderCode '{oc}' lặp trong phiếu")
            seen_in_batch.add(oc)
            match = next((o for o in orders if o.get("orderCode") == oc), None)
            if match:
                check(match["shopAssignment"]["shopCode"] == b.get("shopCode"),
                      f"{code}: đơn {oc} kho {match['shopAssignment']['shopCode']} ≠ phiếu kho {b.get('shopCode')} (rule 1 §3.6)")
                # BatchingItem hiển thị khớp đơn nguồn
                check(it.get("codAmount") == match.get("codAmount"),
                      f"{code}.items[{oc}]: codAmount lệch với orders seed")
                check(it.get("totalQuantity") == match.get("totalQuantity"),
                      f"{code}.items[{oc}]: totalQuantity lệch với orders seed")
        for key in ("batchCode", "stopOrder", "orderCode", "customerAddress", "distance",
                    "fromDeliveryTime", "toDeliveryTime", "orderStatus", "orderType",
                    "items", "totalQuantity", "codAmount"):
            for it in b.get("items", []):
                check(key in it, f"{code}.items[{it.get('orderCode')}]: thiếu field BatchingItem {key}")

    bstatus_values = {b["status"] for b in batches}
    check(bstatus_values == BATCH_ENTITY_STATUSES,
          f"batches phải đủ 3 trạng thái 0/1/2, thấy {sorted(bstatus_values)}")

    # --- integrity: batchStatus đơn ↔ phiếu chứa đơn ---
    # 0 = chưa có phiếu / đã revert, 1 = trong phiếu ACTIVE, 2 = phiếu COMPLETED,
    # 3 = lỗi vượt trọng lượng (không thuộc phiếu).
    items_by_order_code = {}
    for b in batches:
        for it in b.get("items", []):
            items_by_order_code.setdefault(it.get("orderCode"), []).append(b)
    for o in orders:
        fc, oc, bs = o["fulfillCode"], o["orderCode"], o["batchStatus"]
        containing = items_by_order_code.get(oc, [])
        active_or_completed = [b for b in containing if b["status"] in (0, 1)]
        if bs in (1, 2):
            expect_status = 0 if bs == 1 else 1
            check(len(active_or_completed) == 1,
                  f"{fc}: batchStatus={bs} nhưng nằm trong {len(active_or_completed)} phiếu ACTIVE/COMPLETED")
            if len(active_or_completed) == 1:
                b = active_or_completed[0]
                check(b["status"] == expect_status,
                      f"{fc}: batchStatus={bs} nhưng phiếu {b['batchCode']} status={b['status']} (mong {expect_status})")
                check(o.get("batchCode") == b["batchCode"],
                      f"{fc}: batchCode '{o.get('batchCode')}' ≠ phiếu chứa đơn '{b['batchCode']}'")
        else:  # bs 0 hoặc 3
            check(not active_or_completed,
                  f"{fc}: batchStatus={bs} nhưng vẫn nằm trong phiếu ACTIVE/COMPLETED "
                  f"{[b['batchCode'] for b in active_or_completed]}")
            check(not o.get("batchCode"), f"{fc}: batchStatus={bs} nhưng vẫn có batchCode")
        # batchCode (nếu có) phải tồn tại và thực sự chứa đơn
        if o.get("batchCode"):
            b = batch_by_code.get(o["batchCode"])
            check(b is not None, f"{fc}: batchCode '{o['batchCode']}' không tồn tại trong batches")
            if b:
                codes_in_batch = {it.get("orderCode") for it in b["items"]}
                check(oc in codes_in_batch, f"{fc}: batchCode '{o['batchCode']}' không chứa orderCode '{oc}'")
        # đơn trong phiếu CANCELLED phải đã revert về 0
        for b in containing:
            if b["status"] == 2:
                check(bs == 0, f"{fc}: nằm trong phiếu CANCELLED {b['batchCode']} nhưng batchStatus={bs} (phải revert về 0, §9)")

    # ---------------- deliveryStaff ----------------
    check(len(staff) >= 3, f"deliveryStaff cần ≥3, thấy {len(staff)}")
    staff_ids = [s.get("staffId") for s in staff]
    check(len(staff_ids) == len(set(staff_ids)), "staffId trùng lặp")
    for s in staff:
        check(s.get("shopCode") in shop_codes,
              f"{s.get('staffId')}: shopCode '{s.get('shopCode')}' không có trong orders seed")
    check(any(s.get("shopCode") == "30201" for s in staff), "30201 cần có delivery staff")

    # ---------------- printers ----------------
    printer_shops = {p.get("shopCode") for p in printers}
    check("30201" in printer_shops, "printers PHẢI gồm shop 30201")
    for shop in sorted(shop_codes):
        check(shop in printer_shops, f"kho {shop} chưa có printer")
    printer_ids = [p.get("printerId") for p in printers]
    check(len(printer_ids) == len(set(printer_ids)), "printerId trùng lặp")

    # ---------------- regions ----------------
    region_codes = [r.get("code") for r in regions]
    check(len(region_codes) == len(set(region_codes)), "region code trùng lặp")
    provinces = {r["code"] for r in regions if r.get("type") == "province"}
    check(len(provinces) >= 1, "cần ≥1 tỉnh (type=province)")
    for r in regions:
        label = f"region {r.get('code')}"
        check(r.get("type") in ("province", "ward"), f"{label}: type phải 'province'|'ward'")
        check(bool(r.get("name")), f"{label}: name rỗng")
        if r.get("type") == "province":
            check("parentCode" not in r or not r["parentCode"], f"{label}: tỉnh không được có parentCode")
        else:  # ward
            check(bool(r.get("parentCode")), f"{label}: ward thiếu parentCode")
            check(r.get("parentCode") in provinces,
                  f"{label}: parentCode '{r.get('parentCode')}' không trỏ vào tỉnh nào")
    check(len(regions) > len(provinces), "cần ≥1 ward hierarchical (parentCode → province)")

    return report()


def report() -> int:
    if errors:
        print(f"FAIL — {len(errors)} lỗi:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("PASS — canonical-seed.json đạt toàn bộ ràng buộc spec §3.5")
    return 0


if __name__ == "__main__":
    sys.exit(main())
