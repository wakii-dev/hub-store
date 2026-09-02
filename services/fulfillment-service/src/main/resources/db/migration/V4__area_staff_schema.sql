-- FI-245 SF-17 — Flyway V4: area-staff schema (DB fulfillment, public schema).
-- Số V4 là CHỦ Ý (V2/V3 epic reserve SF-7/SF-14 — tránh merge collision).
-- Bảng regions V1 có sẵn (code/name/type/parent_code): V4 chỉ mở rộng master
-- tĩnh + thêm 2 bảng service employee. Khớp spec 2026-09-02-sf17 §3.

-- Master regions mở rộng: thêm tỉnh/phường ngoài 11 rows seed (canonical-seed).
-- ON CONFLICT DO NOTHING → idempotent, không đụng seed rows sẵn có.
INSERT INTO regions (code, name, type, parent_code) VALUES
  ('25', 'T. Thừa Thiên Huế', 'province', NULL),
  ('2502', 'Phường Vĩnh Ninh', 'ward', '25'),
  ('2503', 'Phường Tây Lộc', 'ward', '25'),
  ('2504', 'Phường Thuận Lộc', 'ward', '25'),
  ('92', 'Quảng Nam', 'province', NULL),
  ('9201', 'Phường Hội An', 'ward', '92'),
  ('9202', 'Phường Điện Ngọc', 'ward', '92'),
  ('9203', 'Phường Thanh Hà', 'ward', '92'),
  ('31', 'Gia Lai', 'province', NULL),
  ('3101', 'Phường Hoa Lư', 'ward', '31'),
  ('3102', 'Phường Tây Sơn', 'ward', '31'),
  ('3103', 'Phường Điện Biên', 'ward', '31'),
  ('30', 'Đắk Lắk', 'province', NULL),
  ('3001', 'Phường Tân Lập', 'ward', '30'),
  ('3002', 'Phường Khánh Xuân', 'ward', '30'),
  ('3003', 'Phường Thành Nhất', 'ward', '30'),
  ('34', 'Khánh Hòa', 'province', NULL),
  ('3401', 'Phường Lộc Thọ', 'ward', '34'),
  ('3402', 'Phường Vĩnh Hải', 'ward', '34'),
  ('3403', 'Phường Vĩnh Trường', 'ward', '34'),
  ('58', 'Bà Rịa - Vũng Tàu', 'province', NULL),
  ('5801', 'Phường Thắng Nhất', 'ward', '58'),
  ('5802', 'Phường Thắng Tam', 'ward', '58'),
  ('5803', 'Phường Nguyễn An Ninh', 'ward', '58')
ON CONFLICT (code) DO NOTHING;

-- Định nghĩa NV phụ trách khu vực (SF-17). API KHÔNG có delete —
-- off-switch là toggle is_active; FK cascade chỉ để dọn DB trực tiếp.
CREATE TABLE service_employees (
  id              BIGSERIAL PRIMARY KEY,
  employee_code   VARCHAR(32)  NOT NULL UNIQUE,
  full_name       VARCHAR(128) NOT NULL,
  title_code      VARCHAR(32)  NOT NULL,
  payment_account VARCHAR(32)  NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Khu vực phụ trách: flat region_codes (node tỉnh = toàn tỉnh, node phường lẻ).
CREATE TABLE service_employee_regions (
  id            BIGSERIAL PRIMARY KEY,
  employee_code VARCHAR(32) NOT NULL REFERENCES service_employees(employee_code) ON DELETE CASCADE,
  region_code   VARCHAR(16) NOT NULL REFERENCES regions(code),
  UNIQUE (employee_code, region_code)
);

-- Lookup regions theo employee (list filter region_code + expand row FE).
CREATE INDEX idx_service_employee_regions_employee
  ON service_employee_regions (employee_code);
