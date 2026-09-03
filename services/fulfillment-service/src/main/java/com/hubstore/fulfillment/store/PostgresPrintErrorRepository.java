package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.store.PrintErrorRepository.OrderErrorCount;
import com.hubstore.fulfillment.store.PrintErrorRepository.PrintError;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

/**
 * Postgres store SF-21 — pattern PostgresPrinterRepository: plain class
 * KHÔNG stereotype (wiring do PrintErrorRepositoryConfig), JdbcTemplate.
 * - insert: plain INSERT (id/occurred_at từ DB default).
 * - countsByBatch: GROUP BY order_code (index idx_print_errors_batch_order).
 */
public class PostgresPrintErrorRepository implements PrintErrorRepository {

    private final JdbcTemplate jdbc;

    public PostgresPrintErrorRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void insert(PrintError error) {
        jdbc.update("INSERT INTO print_errors "
                        + "(order_code, batch_code, print_type, printer_id, error_message) "
                        + "VALUES (?, ?, ?, ?, ?)",
                error.orderCode(), error.batchCode(), error.printType(),
                error.printerId(), error.errorMessage());
    }

    @Override
    public List<OrderErrorCount> countsByBatch(String batchCode) {
        return jdbc.query(
                "SELECT order_code, COUNT(*) AS cnt FROM print_errors "
                        + "WHERE batch_code = ? GROUP BY order_code",
                (rs, n) -> new OrderErrorCount(rs.getString("order_code"), rs.getLong("cnt")),
                batchCode);
    }
}
