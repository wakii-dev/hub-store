-- SF-21 (FI-266) — print errors per-đơn (spec D2): BFF record trên failure
-- path của lệnh IN THẬT (preview printerId='' KHÔNG record). Badge D3 =
-- count per order_code; sort đơn theo count desc.
CREATE TABLE print_errors (
  id bigserial PRIMARY KEY,
  order_code varchar NOT NULL,
  batch_code varchar,
  print_type varchar NOT NULL,
  printer_id varchar,
  error_message text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_print_errors_order ON print_errors (order_code);
CREATE INDEX idx_print_errors_batch_order ON print_errors (batch_code, order_code);
