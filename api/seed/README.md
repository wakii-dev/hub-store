Seed data — owned by SF-2

- `canonical-seed.json` — canonical fixture (spec §3.3/§3.5): MỘT nguồn, cả 3
  services (fulfillment Java / batching Go / print Python) deserialize từ đúng
  file này lúc boot. Shape orders khớp `OrderDetail`
  (`@hub-store/shared` api-contracts), batches khớp `Batch` (§3.4).
- `validate.py` — validator ràng buộc (python3 stdlib only). Chạy:
  `python3 api/seed/validate.py` — exit 0 = pass.

Ràng buộc chính: ≥25 đơn trải ≥4 kho; shop 30201 ≥5 đơn batchStatus=0;
đủ 4 batchStatus (status 3 "vượt trọng lượng" đặt tay 1-2 đơn); đủ 3
orderStatus; ≥1 isDebtSplittingOrder; batches đủ 3 trạng thái với
items[].orderCode trỏ đúng orders seed; printers theo shopCode gồm 30201;
regions hierarchical ward→province.
