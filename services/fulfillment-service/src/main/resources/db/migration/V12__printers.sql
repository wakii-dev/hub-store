-- SF-21 (FI-266) — printers registry chuyển DB-backed tại fulfillment-service
-- (spec D1: authority = fulfillment DB; print-service giữ registry in-memory).
-- Seed: đủ 6 máy in canonical-seed (api/seed/canonical-seed.json) — shop 30201
-- 2 máy (1 bill + 1 a4), 4 shop còn lại 1 máy mỗi shop (a4). ON CONFLICT DO
-- NOTHING — idempotent, không đè state đã sửa tay qua CRUD.
-- Review-nhóm-2 P1: thêm cột location (spec D9 — "sửa được: name/location/
-- printerIp/mac/type"; seed lấy từ canonical-seed.json) — branch CHƯA merge,
-- V8 sửa trực tiếp (không tạo V11).
CREATE TABLE IF NOT EXISTS printers (
  shop_code  varchar NOT NULL,
  printer_id varchar NOT NULL,
  name       varchar,
  location   varchar,
  printer_ip varchar,
  mac        varchar,
  type       varchar NOT NULL CHECK (type IN ('bill', 'a4')),
  PRIMARY KEY (shop_code, printer_id)
);

INSERT INTO printers (shop_code, printer_id, name, location, printer_ip, mac, type) VALUES
  ('30201', 'PRN-30201-01', 'HP LaserJet M404',     'Khu soạn A',     '192.168.30.21', 'AA:BB:CC:30:21:01', 'bill'),
  ('30201', 'PRN-30201-02', 'Brother HL-L2350DW',   'Khu soạn B',     '192.168.30.22', 'AA:BB:CC:30:21:02', 'a4'),
  ('30202', 'PRN-30202-01', 'HP LaserJet M404',     'Quầy thu ngân',  '192.168.30.21', 'AA:BB:CC:30:22:01', 'a4'),
  ('30203', 'PRN-30203-01', 'Canon LBP2900',        'Khu soạn',       '192.168.30.21', 'AA:BB:CC:30:23:01', 'a4'),
  ('30204', 'PRN-30204-01', 'HP LaserJet P1102',    'Quầy thu ngân',  '192.168.30.21', 'AA:BB:CC:30:24:01', 'a4'),
  ('30205', 'PRN-30205-01', 'Brother HL-L2350DW',   'Khu soạn',       '192.168.30.21', 'AA:BB:CC:30:25:01', 'a4')
ON CONFLICT (shop_code, printer_id) DO NOTHING;
