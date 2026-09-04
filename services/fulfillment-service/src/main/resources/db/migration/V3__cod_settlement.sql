-- SF-14 (FI-259): COD confirmations + settlement. V3 slot reserved bởi V5 header
-- ("V3 dành SF-14"). Snapshot pattern: expected_amount/shop_name/... chụp lúc hoàn tất
-- phiếu (batch_status=2 PREPARED) — completed_at là anchor kỳ đối soát.
-- CREATE TABLE không IF NOT EXISTS — V3 chạy đúng 1 lần trên DB sạch (Flyway track version).
CREATE TABLE cod_confirmations (
  id              BIGSERIAL PRIMARY KEY,
  fulfill_code    VARCHAR UNIQUE NOT NULL,   -- FK logic sang orders (không FK cứng — orders seed pipeline xóa/nap lại)
  batch_code      VARCHAR,
  shop_code       VARCHAR,
  shop_name       VARCHAR,                   -- snapshot lúc hoàn tất (tránh lệch code/name khi shop rename/chuyển kho)
  expected_amount BIGINT NOT NULL,           -- snapshot cod_amount lúc hoàn tất
  collected_amount BIGINT,                   -- NULL khi PENDING
  collected_by    VARCHAR,                   -- username xác nhận
  collected_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ NOT NULL,      -- anchor kỳ đối soát
  status          INT NOT NULL DEFAULT 0     -- 0 = PENDING, 1 = CONFIRMED
);
CREATE INDEX idx_cod_confirmations_completed_at ON cod_confirmations (completed_at);
CREATE INDEX idx_cod_confirmations_batch ON cod_confirmations (batch_code);
CREATE INDEX idx_cod_confirmations_shop ON cod_confirmations (shop_code, completed_at);
