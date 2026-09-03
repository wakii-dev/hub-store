-- V8__transfer_tickets.sql — SF-28 (V3 reserved SF-14)
CREATE TABLE transfer_tickets (
  id BIGSERIAL PRIMARY KEY,
  ticket_code VARCHAR(32) NOT NULL UNIQUE,
  order_fulfill_code VARCHAR(64) NOT NULL REFERENCES orders(fulfill_code),
  from_hub VARCHAR(128),
  to_hub VARCHAR(128) NOT NULL,
  reason TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  created_by VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by VARCHAR(128),
  confirmed_at TIMESTAMPTZ
);
CREATE INDEX idx_transfer_tickets_order ON transfer_tickets(order_fulfill_code);
CREATE SEQUENCE IF NOT EXISTS transfer_ticket_code_seq START 1;
