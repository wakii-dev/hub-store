package com.hubstore.fulfillment.store;

import java.time.Instant;
import java.util.List;

/**
 * Store transfer_tickets (SF-28, spec §3 Q6). Interface tách impl để unit test
 * dựng fake in-memory (pattern TechOrderRepository); Postgres impl bean duy nhất
 * (in-memory KHÔNG wire vào Spring context — chỉ sống trong unit test).
 * Lifecycle: tối đa 1 ticket PENDING/order — check qua {@link #existsPendingByOrder}.
 */
public interface TransferTicketRepository {

    record TransferTicketRecord(
            String ticketCode,
            String orderFulfillCode,
            String fromHub,
            String toHub,
            String reason,
            String status,
            String createdBy,
            Instant createdAt) {
    }

    /** Đơn đã có ticket PENDING chưa (chặn trùng — BFF map ALREADY_EXISTS → 409). */
    boolean existsPendingByOrder(String orderFulfillCode);

    /**
     * INSERT 1 ticket PENDING — ticket_code sinh từ sequence trong CÙNG statement
     * ('TT-' || lpad(nextval(...), 4, '0')); gọi trong transaction của service.
     */
    TransferTicketRecord insert(String orderFulfillCode, String fromHub, String toHub,
                                String reason, String createdBy);

    /** Tickets theo danh sách mã đơn (+ status tùy chọn), mới nhất trước. */
    List<TransferTicketRecord> findByOrders(List<String> orderFulfillCodes, String status);
}
