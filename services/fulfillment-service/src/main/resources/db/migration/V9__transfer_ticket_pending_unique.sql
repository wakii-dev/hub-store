-- V9__transfer_ticket_pending_unique.sql — SF-28 code-review P1:
-- race duplicate PENDING (existsPendingByOrder → insert không có lock, READ
-- COMMITTED cho phép 2 tx cùng pass check) → unique partial index là safety
-- net. Service giữ check-then-insert (message thân thiện) và catch
-- unique_violation (SQLState 23505 trên index này) → ALREADY_EXISTS (409).
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_tickets_one_pending
  ON transfer_tickets(order_fulfill_code) WHERE status = 'PENDING';
