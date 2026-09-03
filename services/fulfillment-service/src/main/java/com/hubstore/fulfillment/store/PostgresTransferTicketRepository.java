package com.hubstore.fulfillment.store;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Postgres store transfer_tickets (SF-28) — plain class KHÔNG stereotype,
 * bean wiring do config lo (@ConditionalOnProperty fulfillment.store=postgres,
 * pattern PostgresOrderRepository T3). audit row ghi BFF-side (logActivity) —
 * Java KHÔNG append audit cho transfer.
 */
public class PostgresTransferTicketRepository implements TransferTicketRepository {

    private final JdbcTemplate jdbc;

    private static final RowMapper<TransferTicketRecord> ROW_MAPPER = (rs, n) ->
            mapTicket(rs);

    public PostgresTransferTicketRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public boolean existsPendingByOrder(String orderFulfillCode) {
        Integer c = jdbc.queryForObject(
                "SELECT count(*) FROM transfer_tickets WHERE order_fulfill_code = ? AND status = 'PENDING'",
                Integer.class, orderFulfillCode);
        return c != null && c > 0;
    }

    @Override
    public TransferTicketRecord insert(String orderFulfillCode, String fromHub, String toHub,
                                       String reason, String createdBy) {
        return jdbc.queryForObject(
                "INSERT INTO transfer_tickets (ticket_code, order_fulfill_code, from_hub, to_hub, "
                        + "reason, status, created_by) "
                        + "VALUES ('TT-' || lpad(nextval('transfer_ticket_code_seq')::text, 4, '0'), "
                        + "?, ?, ?, ?, 'PENDING', ?) "
                        + "RETURNING ticket_code, order_fulfill_code, from_hub, to_hub, reason, "
                        + "status, created_by, created_at",
                ROW_MAPPER, orderFulfillCode, fromHub, toHub, reason, createdBy);
    }

    @Override
    public List<TransferTicketRecord> findByOrders(List<String> orderFulfillCodes, String status) {
        if (orderFulfillCodes == null || orderFulfillCodes.isEmpty()) {
            return List.of();
        }
        StringBuilder sql = new StringBuilder("SELECT ticket_code, order_fulfill_code, from_hub, "
                + "to_hub, reason, status, created_by, created_at FROM transfer_tickets "
                + "WHERE order_fulfill_code IN (")
                .append(placeholders(orderFulfillCodes.size())).append(')');
        List<Object> args = new ArrayList<>(orderFulfillCodes);
        if (status != null && !status.isBlank()) {
            sql.append(" AND status = ?");
            args.add(status);
        }
        sql.append(" ORDER BY created_at DESC, id DESC");
        return jdbc.query(sql.toString(), ROW_MAPPER, args.toArray());
    }

    private static TransferTicketRecord mapTicket(ResultSet rs) throws SQLException {
        OffsetDateTime createdAt = rs.getObject("created_at", OffsetDateTime.class);
        return new TransferTicketRecord(
                rs.getString("ticket_code"),
                rs.getString("order_fulfill_code"),
                rs.getString("from_hub"),
                rs.getString("to_hub"),
                rs.getString("reason"),
                rs.getString("status"),
                rs.getString("created_by"),
                createdAt == null ? null : createdAt.toInstant());
    }

    private static String placeholders(int n) {
        return String.join(", ", Collections.nCopies(n, "?"));
    }
}
