package com.hubstore.fulfillment.store;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

/**
 * Postgres store cho cod_confirmations (SF-14, FI-259) — mirror pattern
 * PostgresD2cOrderRepository: JdbcTemplate, timestamptz ↔ Instant qua helper
 * utc()/instant() (copy local, không import chéo). Plain class KHÔNG stereotype —
 * bean wiring do CodRepositoryConfig lo (@ConditionalOnProperty
 * fulfillment.store=postgres).
 *
 * D7: path theo batch (findPendingByBatch/confirmBatch/aggregate/detail) JOIN
 * orders (o.fail_reason IS NULL) — đơn FAILED không tính. confirmOne KHÔNG join
 * (D7 liệt kê tường minh, per-order confirm action của ops).
 */
public class PostgresCodConfirmationRepository implements CodConfirmationRepository {

    private final JdbcTemplate jdbc;

    public PostgresCodConfirmationRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    // ---------------- reads ----------------

    @Override
    public List<CodConfirmation> findPendingByBatch(String batchCode) {
        return jdbc.query("SELECT " + COLS + " FROM cod_confirmations c "
                + "JOIN orders o ON o.fulfill_code = c.fulfill_code "
                + "WHERE c.status = 0 AND c.batch_code = ? AND o.fail_reason IS NULL "
                + "ORDER BY c.id ASC", MAPPER, batchCode);
    }

    @Override
    public Optional<CodConfirmation> findByFulfillCode(String fulfillCode) {
        return jdbc.query("SELECT " + COLS + " FROM cod_confirmations c "
                        + "WHERE c.fulfill_code = ? ORDER BY c.id ASC LIMIT 1",
                MAPPER, fulfillCode).stream().findFirst();
    }

    /**
     * GROUP BY shop theo kỳ — SQL spec §5: pending/mismatch là SUM CASE, diff =
     * expected − COALESCE(collected, 0); JOIN fail_reason IS NULL (D7).
     */
    @Override
    public List<SettlementShopRow> aggregate(Instant from, Instant to) {
        String sql = "SELECT c.shop_code, c.shop_name, COUNT(*) AS total_orders, "
                + "SUM(c.expected_amount) AS total_expected, "
                + "SUM(COALESCE(c.collected_amount, 0)) AS total_collected, "
                + "SUM(c.expected_amount - COALESCE(c.collected_amount, 0)) AS diff_amount, "
                + "SUM(CASE WHEN c.status = 0 THEN 1 ELSE 0 END) AS pending_count, "
                + "SUM(CASE WHEN c.status = 1 AND c.collected_amount <> c.expected_amount "
                + "THEN 1 ELSE 0 END) AS mismatch_count "
                + "FROM cod_confirmations c JOIN orders o ON o.fulfill_code = c.fulfill_code "
                + "WHERE c.completed_at >= ? AND c.completed_at < ? AND o.fail_reason IS NULL "
                + "GROUP BY c.shop_code, c.shop_name ORDER BY c.shop_code";
        return jdbc.query(sql, (rs, n) -> new SettlementShopRow(
                        rs.getString("shop_code"), rs.getString("shop_name"),
                        rs.getLong("total_orders"), rs.getLong("total_expected"),
                        rs.getLong("total_collected"), rs.getLong("diff_amount"),
                        rs.getInt("pending_count"), rs.getInt("mismatch_count")),
                utc(from), utc(to));
    }

    @Override
    public List<CodConfirmation> detail(String shopCode, Instant from, Instant to,
            boolean onlyMismatch) {
        StringBuilder sql = new StringBuilder("SELECT " + COLS + " FROM cod_confirmations c "
                + "JOIN orders o ON o.fulfill_code = c.fulfill_code "
                + "WHERE o.fail_reason IS NULL AND c.completed_at >= ? AND c.completed_at < ?");
        List<Object> params = new ArrayList<>(List.of(utc(from), utc(to)));
        if (shopCode != null && !shopCode.isBlank()) {
            sql.append(" AND c.shop_code = ?");
            params.add(shopCode);
        }
        // onlyMismatch: chưa thu (PENDING) HOẶC đã confirm nhưng lệch tiền.
        if (onlyMismatch) {
            sql.append(" AND (c.status = 0 OR (c.status = 1 "
                    + "AND c.collected_amount <> c.expected_amount))");
        }
        sql.append(" ORDER BY c.id ASC");
        return jdbc.query(sql.toString(), MAPPER, params.toArray());
    }

    // ---------------- mutations ----------------

    /** Trùng fulfill_code bỏ qua im lặng — eager PENDING chèn an toàn khi re-complete. */
    @Override
    public void insertPendingIfAbsent(CodConfirmation c) {
        jdbc.update("INSERT INTO cod_confirmations (fulfill_code, batch_code, shop_code, shop_name, "
                        + "expected_amount, collected_amount, collected_by, collected_at, completed_at, status) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (fulfill_code) DO NOTHING",
                c.fulfillCode(), c.batchCode(), c.shopCode(), c.shopName(), c.expectedAmount(),
                c.collectedAmount(), c.collectedBy(), utc(c.collectedAt()), utc(c.completedAt()),
                c.status());
    }

    /**
     * Bulk confirm CHỈ PENDING của batch với collected = expected; đơn FAILED của
     * batch không đụng (subquery mirror JOIN D7). Trả số row cập nhật.
     */
    @Override
    public int confirmBatch(String batchCode, String collectedBy, Instant collectedAt) {
        return jdbc.update("UPDATE cod_confirmations c SET status = 1, "
                        + "collected_amount = c.expected_amount, collected_by = ?, collected_at = ? "
                        + "WHERE c.status = 0 AND c.batch_code = ? AND c.fulfill_code IN "
                        + "(SELECT o.fulfill_code FROM orders o WHERE o.fail_reason IS NULL)",
                collectedBy, utc(collectedAt), batchCode);
    }

    /**
     * D3: last-write-wins (re-confirm CONFIRMED được). collectedAmount null =
     * lấy expected — branch 2 SQL thay COALESCE(?, expected) để pgjdbc không lạc
     * type với param NULL.
     */
    @Override
    public int confirmOne(String fulfillCode, Long collectedAmount,
            String collectedBy, Instant collectedAt) {
        String sql = "UPDATE cod_confirmations SET status = 1, "
                + (collectedAmount == null
                        ? "collected_amount = expected_amount"
                        : "collected_amount = ?")
                + ", collected_by = ?, collected_at = ? WHERE fulfill_code = ?";
        return collectedAmount == null
                ? jdbc.update(sql, collectedBy, utc(collectedAt), fulfillCode)
                : jdbc.update(sql, collectedAmount, collectedBy, utc(collectedAt), fulfillCode);
    }

    /** D8: xóa CHỈ PENDING — CONFIRMED là dữ liệu lịch sử, giữ nguyên. */
    @Override
    public int deletePendingByFulfillCodes(List<String> fulfillCodes) {
        if (fulfillCodes == null || fulfillCodes.isEmpty()) {
            // "IN ()" là SQL hỏng — rỗng trả 0 ngay.
            return 0;
        }
        return jdbc.update("DELETE FROM cod_confirmations WHERE status = 0 AND fulfill_code IN ("
                + placeholders(fulfillCodes.size()) + ")", fulfillCodes.toArray());
    }

    // ---------------- helpers ----------------

    /** Cột đủ tên c.* — JOIN orders trùng tên cột (batch_code, shop_code…) phải qualify. */
    private static final String COLS = """
            c.id, c.fulfill_code, c.batch_code, c.shop_code, c.shop_name, c.expected_amount,
            c.collected_amount, c.collected_by, c.collected_at, c.completed_at, c.status""";

    private static final RowMapper<CodConfirmation> MAPPER = PostgresCodConfirmationRepository::mapRow;

    private static CodConfirmation mapRow(ResultSet rs, int n) throws SQLException {
        Object collected = rs.getObject("collected_amount");
        return new CodConfirmation(
                rs.getString("fulfill_code"), rs.getString("batch_code"),
                rs.getString("shop_code"), rs.getString("shop_name"),
                rs.getLong("expected_amount"),
                collected == null ? null : rs.getLong("collected_amount"),
                rs.getString("collected_by"),
                instant(rs, "collected_at"), instant(rs, "completed_at"),
                rs.getInt("status"));
    }

    /** JDBC 4.2: timestamptz → OffsetDateTime → Instant (nullable). */
    private static Instant instant(ResultSet rs, String col) throws SQLException {
        OffsetDateTime dt = rs.getObject(col, OffsetDateTime.class);
        return dt == null ? null : dt.toInstant();
    }

    /** Instant → UTC; null đi qua null (collected_at NULL khi PENDING). */
    private static OffsetDateTime utc(Instant i) {
        return i == null ? null : OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static String placeholders(int n) {
        return String.join(", ", Collections.nCopies(n, "?"));
    }
}
