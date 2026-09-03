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
 * Postgres store cho d2c_orders (SF-18, FI-263) — mirror pattern
 * PostgresOrderRepository: dynamic WHERE + scalar-subquery COUNT(*) + LATERAL
 * OFFSET/LIMIT trong 1 statement (1 snapshot — page vượt last vẫn giữ total),
 * ORDER BY id ASC (≡ surrogate insert order), ILIKE literal-substring với
 * escape % _ \. Plain class KHÔNG stereotype — bean wiring do config lo.
 *
 * Mapping lưu ý:
 * - timestamptz → OffsetDateTime → Instant (record); filter bounds Instant → UTC.
 * - Slot filter: (push_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::time so "HH:mm";
 *   push_time NULL không bao giờ match (predicate tường minh IS NOT NULL).
 */
public class PostgresD2cOrderRepository implements D2cOrderRepository {

    private final JdbcTemplate jdbc;

    public PostgresD2cOrderRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    // ---------------- reads ----------------

    /**
     * INVARIANT như PostgresOrderRepository.filter: 1 query duy nhất — total từ
     * count-subquery với CÙNG WHERE động (build 1 lần, tái dùng); anchor row qua
     * LEFT JOIN LATERAL → page vượt last page vẫn trả total đúng.
     */
    @Override
    public D2cFilterResult filter(D2cOrderFilter f) {
        StringBuilder where = new StringBuilder(" WHERE TRUE");
        List<Object> params = new ArrayList<>();

        if (!isBlank(f.search())) {
            // ILIKE ≡ literal-substring case-insensitive — escape %/_/\ trong input
            // người dùng; match order_code HOẶC delivery_id.
            String like = "%" + escapeLike(f.search()) + "%";
            where.append(" AND (order_code ILIKE ? ESCAPE '\\' OR delivery_id ILIKE ? ESCAPE '\\')");
            params.add(like);
            params.add(like);
        }
        if (!f.statuses().isEmpty()) {
            where.append(" AND status IN (").append(placeholders(f.statuses().size())).append(")");
            params.addAll(f.statuses());
        }
        if (!f.carriers().isEmpty()) {
            where.append(" AND carrier IN (").append(placeholders(f.carriers().size())).append(")");
            params.addAll(f.carriers());
        }
        if (!f.shops().isEmpty()) {
            where.append(" AND shop IN (").append(placeholders(f.shops().size())).append(")");
            params.addAll(f.shops());
        }
        if (!f.exportEmployees().isEmpty()) {
            where.append(" AND export_employee IN (").append(placeholders(f.exportEmployees().size())).append(")");
            params.addAll(f.exportEmployees());
        }
        if (!isBlank(f.productCategory())) {
            // Exact match — không substring.
            where.append(" AND product_category = ?");
            params.add(f.productCategory());
        }
        if (!isBlank(f.productType())) {
            where.append(" AND product_type = ?");
            params.add(f.productType());
        }
        // Instant bounds: NULL push_time tự nhiên không match (NULL so sánh → NULL).
        if (f.createdFrom() != null) {
            where.append(" AND created_at >= ?");
            params.add(utc(f.createdFrom()));
        }
        if (f.createdTo() != null) {
            where.append(" AND created_at <= ?");
            params.add(utc(f.createdTo()));
        }
        if (f.pushFrom() != null) {
            where.append(" AND push_time >= ?");
            params.add(utc(f.pushFrom()));
        }
        if (f.pushTo() != null) {
            where.append(" AND push_time <= ?");
            params.add(utc(f.pushTo()));
        }
        // Slot "HH:mm" — time-of-day VN; NULL push_time không bao giờ match.
        if (!isBlank(f.pushSlotFrom())) {
            where.append(" AND push_time IS NOT NULL ")
                    .append("AND (push_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= ?::time");
            params.add(f.pushSlotFrom());
        }
        if (!isBlank(f.pushSlotTo())) {
            where.append(" AND push_time IS NOT NULL ")
                    .append("AND (push_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::time <= ?::time");
            params.add(f.pushSlotTo());
        }

        // page/pageSize đã normalize trong D2cOrderFilter (page≥1, 1..500).
        int page = f.page();
        int pageSize = f.pageSize();

        // 1 statement: count subquery (cùng WHERE) anchor row + lateral page rows.
        // Anchor row (0 items) → order_code NULL → chỉ đọc total, không map order.
        String whereSql = where.toString();
        String sql = "SELECT c.total_all, d.* FROM (SELECT count(*) AS total_all FROM d2c_orders" + whereSql + ") c "
                + "LEFT JOIN LATERAL (SELECT " + COLS + " FROM d2c_orders" + whereSql
                + " ORDER BY id ASC OFFSET ? LIMIT ?) d ON TRUE";
        List<Object> args = new ArrayList<>(params);
        args.addAll(params);
        args.add((long) (page - 1) * pageSize);
        args.add(pageSize);

        return jdbc.query(sql, rs -> {
            List<D2cOrderRecord> items = new ArrayList<>();
            long total = 0;
            while (rs.next()) {
                total = rs.getLong("total_all");
                if (rs.getString("order_code") != null) {
                    items.add(MAPPER.mapRow(rs, rs.getRow()));
                }
            }
            return new D2cFilterResult(items, total);
        }, args.toArray());
    }

    @Override
    public Optional<D2cOrderRecord> findByCode(String orderCode) {
        return jdbc.query("SELECT " + COLS + " FROM d2c_orders WHERE order_code = ?",
                MAPPER, orderCode).stream().findFirst();
    }

    // ---------------- mutations ----------------

    /** Note khóa order_code — UPDATE ... RETURNING * (1 round-trip, atomic). */
    @Override
    public Optional<D2cOrderRecord> updateNote(String orderCode, String note) {
        return jdbc.query("UPDATE d2c_orders SET note = ? WHERE order_code = ? RETURNING " + COLS,
                MAPPER, note, orderCode).stream().findFirst();
    }

    // ---------------- helpers ----------------

    private static final String COLS = """
            id, order_code, order_id_inter, delivery_id, carrier, shop, export_employee,
            export_time, push_time, receiver_name, receiver_phone, receiver_address,
            service_type, product_category, product_type, is_debt_splitting, note,
            status, created_at""";

    private static final RowMapper<D2cOrderRecord> MAPPER = PostgresD2cOrderRepository::mapRow;

    private static D2cOrderRecord mapRow(ResultSet rs, int n) throws SQLException {
        return new D2cOrderRecord(
                rs.getString("order_code"),
                rs.getString("order_id_inter"),
                rs.getString("delivery_id"),
                rs.getString("carrier"),
                rs.getString("shop"),
                rs.getString("export_employee"),
                instant(rs, "export_time"),
                instant(rs, "push_time"),
                rs.getString("receiver_name"),
                rs.getString("receiver_phone"),
                rs.getString("receiver_address"),
                rs.getString("service_type"),
                rs.getString("product_category"),
                rs.getString("product_type"),
                rs.getBoolean("is_debt_splitting"),
                orEmpty(rs.getString("note")),
                rs.getString("status"),
                instant(rs, "created_at"),
                rs.getLong("id"));
    }

    /** JDBC 4.2: timestamptz → OffsetDateTime → Instant (nullable). */
    private static Instant instant(ResultSet rs, String col) throws SQLException {
        OffsetDateTime dt = rs.getObject(col, OffsetDateTime.class);
        return dt == null ? null : dt.toInstant();
    }

    private static OffsetDateTime utc(Instant i) {
        return OffsetDateTime.ofInstant(i, ZoneOffset.UTC);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    /** Escape % _ \ cho ILIKE literal-substring (ESCAPE '\'). */
    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String placeholders(int n) {
        return String.join(", ", Collections.nCopies(n, "?"));
    }
}
