package com.hubstore.fulfillment.store;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Postgres store cho SF-19 (đơn dịch vụ kỹ thuật) — GIỮ ĐÚNG semantics từng
 * method của InMemoryTechOrderRepository (parity là việc của IT). Plain class
 * KHÔNG stereotype — bean wiring do TechRepositoryConfig lo
 * (@ConditionalOnProperty fulfillment.store=postgres). @Transactional trên
 * assignTechnician: Spring Boot auto-transaction-management wrap bean qua proxy.
 *
 * Mapping lưu ý (so khớp in-memory):
 * - id BIGSERIAL = surrogate insert order seed → ORDER BY id ≡ in-memory list order.
 * - technicians.seq ≡ in-memory list order (suggest tie-break activeCount asc, seq asc).
 * - times: timestamptz → OffsetDateTime (JDBC 4.2 getObject); delivery_date → LocalDate.
 * - items JSONB ::text → Jackson List<TechModels.TechItem>;
 *   coordination/timeline passthrough text.
 * - Today default (plan §4): dateFrom+dateTo đều null → delivery_date = CURRENT_DATE
 *   (repo-side, khớp in-memory LocalDate.now() — timezone JVM/DB phải khớp).
 */
public class PostgresTechOrderRepository implements TechOrderRepository {

    private final JdbcTemplate jdbc;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public PostgresTechOrderRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    // ---------------- reads ----------------

    /**
     * INVARIANT như PostgresOrderRepository: 1 query duy nhất — total từ scalar
     * subquery COUNT(*) với CÙNG WHERE động (build 1 lần, tái dùng); anchor qua
     * LEFT JOIN LATERAL nên page vượt last page vẫn trả total đúng.
     */
    @Override
    public TechModels.DeliveryPage filterDelivery(TechModels.DeliveryFilter f) {
        StringBuilder where = new StringBuilder(" WHERE TRUE");
        List<Object> params = new ArrayList<>();

        if (present(f.statuses())) {
            where.append(" AND status IN (").append(placeholders(f.statuses().size())).append(")");
            params.addAll(f.statuses());
        }
        if (isNotBlank(f.driverName())) {
            // ILIKE ≡ containsIgnoreCase — escape %/_/\ giữ literal-substring semantics.
            where.append(" AND driver_name ILIKE ? ESCAPE '\\'");
            params.add("%" + escapeLike(f.driverName()) + "%");
        }
        if (present(f.categoryL1())) {
            where.append(" AND EXISTS (SELECT 1 FROM jsonb_array_elements(items) it ")
                    .append("WHERE it->>'categoryL1' IN (").append(placeholders(f.categoryL1().size())).append("))");
            params.addAll(f.categoryL1());
        }
        if (present(f.categoryL2())) {
            where.append(" AND EXISTS (SELECT 1 FROM jsonb_array_elements(items) it ")
                    .append("WHERE it->>'categoryL2' IN (").append(placeholders(f.categoryL2().size())).append("))");
            params.addAll(f.categoryL2());
        }
        if (isNotBlank(f.regionCode())) {
            where.append(" AND region_code = ?");
            params.add(f.regionCode());
        }
        if (isNotBlank(f.province())) {
            where.append(" AND province = ?");
            params.add(f.province());
        }
        // Today default (plan §4): cả from+to null → today (repo-side CURRENT_DATE).
        if (f.dateFrom() == null && f.dateTo() == null) {
            where.append(" AND delivery_date = CURRENT_DATE");
        } else {
            if (f.dateFrom() != null) {
                where.append(" AND delivery_date >= ?");
                params.add(java.sql.Date.valueOf(f.dateFrom()));
            }
            if (f.dateTo() != null) {
                where.append(" AND delivery_date <= ?");
                params.add(java.sql.Date.valueOf(f.dateTo()));
            }
        }

        int page = Math.max(f.page(), 1);
        int pageSize = f.pageSize() <= 0 ? 10 : f.pageSize();
        return queryDeliveryPage(where.toString(), params, page, pageSize);
    }

    /** Khớp in-memory: KHÔNG today-default; có date filter → NULL expected_time excluded. */
    @Override
    public TechModels.InstallationPage filterInstallation(TechModels.InstallationFilter f) {
        StringBuilder where = new StringBuilder(" WHERE TRUE");
        List<Object> params = new ArrayList<>();

        if (present(f.statuses())) {
            where.append(" AND status IN (").append(placeholders(f.statuses().size())).append(")");
            params.addAll(f.statuses());
        }
        if (isNotBlank(f.technicianCode())) {
            where.append(" AND technician_code = ?");
            params.add(f.technicianCode());
        }
        if (present(f.categoryL1())) {
            where.append(" AND EXISTS (SELECT 1 FROM jsonb_array_elements(items) it ")
                    .append("WHERE it->>'categoryL1' IN (").append(placeholders(f.categoryL1().size())).append("))");
            params.addAll(f.categoryL1());
        }
        if (present(f.categoryL2())) {
            where.append(" AND EXISTS (SELECT 1 FROM jsonb_array_elements(items) it ")
                    .append("WHERE it->>'categoryL2' IN (").append(placeholders(f.categoryL2().size())).append("))");
            params.addAll(f.categoryL2());
        }
        if (isNotBlank(f.regionCode())) {
            where.append(" AND region_code = ?");
            params.add(f.regionCode());
        }
        if (isNotBlank(f.province())) {
            where.append(" AND province = ?");
            params.add(f.province());
        }
        // Date filter trên expected_time::date — NULL excluded tự nhiên (NULL compare).
        if (f.dateFrom() != null) {
            where.append(" AND expected_time::date >= ?");
            params.add(java.sql.Date.valueOf(f.dateFrom()));
        }
        if (f.dateTo() != null) {
            where.append(" AND expected_time::date <= ?");
            params.add(java.sql.Date.valueOf(f.dateTo()));
        }

        int page = Math.max(f.page(), 1);
        int pageSize = f.pageSize() <= 0 ? 10 : f.pageSize();
        return queryInstallationPage(where.toString(), params, page, pageSize);
    }

    @Override
    public Optional<TechModels.InstallationOrder> findInstallation(String serviceOrderCode) {
        return jdbc.query("SELECT " + INSTALLATION_COLS + " FROM installation_orders "
                        + "WHERE service_order_code = ? ORDER BY id ASC LIMIT 1",
                INSTALLATION_ROW_MAPPER, serviceOrderCode).stream().findFirst().map(Row::order);
    }

    @Override
    public Optional<TechModels.Technician> findTechnician(String code) {
        return jdbc.query("SELECT code, name, type, region_code FROM technicians "
                        + "WHERE code = ? LIMIT 1",
                (rs, n) -> mapTechnician(rs), code).stream().findFirst();
    }

    // ---------------- mutations ----------------

    /**
     * 1 transaction (@Transactional): SELECT FOR UPDATE installation, validate
     * technician + trạng thái (ISE khớp in-memory), UPDATE technician_code,
     * INSERT history (from = technician cũ hoặc NULL khi lần đầu).
     */
    @Override
    @Transactional
    public TechModels.InstallationOrder assignTechnician(String serviceOrderCode, String technicianCode,
                                                         String changedBy, Instant changedAt) {
        Row row = jdbc.query("SELECT " + INSTALLATION_COLS + " FROM installation_orders "
                        + "WHERE service_order_code = ? ORDER BY id ASC LIMIT 1 FOR UPDATE",
                INSTALLATION_ROW_MAPPER, serviceOrderCode).stream().findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Installation order không tồn tại: " + serviceOrderCode));
        TechModels.Technician tech = findTechnician(technicianCode)
                .orElseThrow(() -> new IllegalArgumentException(
                        "Technician không tồn tại: " + technicianCode));
        if (!TechModels.assignableStatus(row.order().status())) {
            throw new IllegalStateException("Không gán được KTV ở trạng thái "
                    + row.order().status() + ": " + serviceOrderCode);
        }
        jdbc.update("UPDATE installation_orders SET technician_code = ? WHERE id = ?",
                tech.code(), row.id());
        jdbc.update("INSERT INTO installation_assignment_history "
                        + "(service_order_code, from_technician_code, to_technician_code, changed_by, changed_at) "
                        + "VALUES (?, ?, ?, ?, ?)",
                serviceOrderCode, row.order().technicianCode(), tech.code(),
                changedBy == null ? "fulfillment-service" : changedBy,
                OffsetDateTime.ofInstant(changedAt, ZoneOffset.UTC));
        return new TechModels.InstallationOrder(
                row.order().serviceOrderCode(), row.order().deliveryOrderCode(), tech.code(),
                row.order().status(), row.order().expectedTime(), row.order().timelineJson(),
                row.order().serviceFee(), row.order().feeAdjust(), row.order().items(),
                row.order().regionCode(), row.order().province(), row.order().createdAt());
    }

    @Override
    public List<TechModels.AssignmentHistoryEntry> assignmentHistory(String serviceOrderCode) {
        return jdbc.query(
                "SELECT service_order_code, from_technician_code, to_technician_code, changed_by, changed_at "
                        + "FROM installation_assignment_history WHERE service_order_code = ? "
                        + "ORDER BY changed_at ASC, id ASC",
                (rs, n) -> new TechModels.AssignmentHistoryEntry(
                        rs.getString("service_order_code"),
                        rs.getString("from_technician_code"),
                        rs.getString("to_technician_code"),
                        rs.getString("changed_by"),
                        rs.getObject("changed_at", OffsetDateTime.class)),
                serviceOrderCode);
    }

    // ---------------- SF-25 mutations (spec §4.2) ----------------

    /** Guard + UPDATE chung 3 SF-25 mutations — @Transactional như assign:
     *  SELECT FOR UPDATE, verify owner + trạng thái (ISE khớp in-memory),
     *  UPDATE status/expected_time + timeline = timeline || entry::jsonb. */
    private TechModels.InstallationOrder mutateInstallation(String serviceOrderCode, String technicianCode,
                                                            Set<String> allowedFrom, String newStatus,
                                                            String timelineNote, OffsetDateTime newExpectedTime,
                                                            OffsetDateTime at, String stateErrorPrefix) {
        Row row = jdbc.query("SELECT " + INSTALLATION_COLS + " FROM installation_orders "
                        + "WHERE service_order_code = ? ORDER BY id ASC LIMIT 1 FOR UPDATE",
                INSTALLATION_ROW_MAPPER, serviceOrderCode).stream().findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Installation order không tồn tại: " + serviceOrderCode));
        if (!technicianCode.equals(row.order().technicianCode())) {
            throw new IllegalStateException(
                    "Đơn " + serviceOrderCode + " không thuộc KTV " + technicianCode);
        }
        if (!allowedFrom.contains(row.order().status())) {
            throw new IllegalStateException(
                    stateErrorPrefix + row.order().status() + ": " + serviceOrderCode);
        }
        String entry = TechModels.appendTimeline(null,
                at.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME), newStatus, timelineNote, technicianCode);
        if (newExpectedTime != null) {
            jdbc.update("UPDATE installation_orders SET status = ?, expected_time = ?, "
                            + "timeline = timeline || ?::jsonb WHERE id = ?",
                    newStatus, newExpectedTime, entry, row.id());
        } else {
            jdbc.update("UPDATE installation_orders SET status = ?, timeline = timeline || ?::jsonb "
                            + "WHERE id = ?", newStatus, entry, row.id());
        }
        return new TechModels.InstallationOrder(
                row.order().serviceOrderCode(), row.order().deliveryOrderCode(), technicianCode,
                newStatus, newExpectedTime != null ? newExpectedTime : row.order().expectedTime(),
                TechModels.appendTimeline(row.order().timelineJson(),
                        at.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME), newStatus, timelineNote,
                        technicianCode),
                row.order().serviceFee(), row.order().feeAdjust(), row.order().items(),
                row.order().regionCode(), row.order().province(), row.order().createdAt());
    }

    @Override
    @Transactional
    public TechModels.InstallationOrder acceptInstallation(String serviceOrderCode, String technicianCode,
                                                           OffsetDateTime at) {
        return mutateInstallation(serviceOrderCode, technicianCode,
                Set.of("CONFIRMED", "RESCHEDULED"), "PROCESSING", "KTV nhận việc", null, at,
                "Không nhận được việc ở trạng thái ");
    }

    @Override
    @Transactional
    public TechModels.InstallationOrder completeInstallation(String serviceOrderCode, String technicianCode,
                                                             OffsetDateTime at) {
        return mutateInstallation(serviceOrderCode, technicianCode,
                Set.of("PROCESSING"), "DELIVERED", "Hoàn tất lắp đặt", null, at,
                "Không hoàn tất được ở trạng thái ");
    }

    @Override
    @Transactional
    public TechModels.InstallationOrder rescheduleInstallation(String serviceOrderCode, String technicianCode,
                                                               OffsetDateTime newExpectedTime, String note,
                                                               OffsetDateTime at) {
        return mutateInstallation(serviceOrderCode, technicianCode,
                Set.of("CONFIRMED", "PROCESSING", "REDELIVERY", "RESCHEDULED"), "RESCHEDULED",
                note == null ? "" : note, newExpectedTime, at, "Không dời lịch được ở trạng thái ");
    }

    // ---------------- suggest ----------------

    /** Workload = count đơn active (status NOT IN DELIVERED/CANCELLED/RETURNED);
     *  sort COALESCE(cnt,0) ASC, seq ASC ≡ in-memory stable sort theo list order. */
    @Override
    public List<TechModels.SuggestedTechnician> suggestTechnicians(String regionCode) {
        return jdbc.query(
                "SELECT t.code, t.name, t.type, t.region_code, COALESCE(w.cnt, 0) AS active_count "
                        + "FROM technicians t LEFT JOIN ("
                        + "  SELECT technician_code, count(*) AS cnt FROM installation_orders "
                        + "  WHERE technician_code IS NOT NULL "
                        + "    AND status NOT IN ('DELIVERED','CANCELLED','RETURNED') "
                        + "  GROUP BY technician_code"
                        + ") w ON w.technician_code = t.code "
                        + "WHERE t.region_code = ? ORDER BY COALESCE(w.cnt, 0) ASC, t.seq ASC",
                (rs, n) -> new TechModels.SuggestedTechnician(mapTechnician(rs), rs.getInt("active_count")),
                regionCode);
    }

    // ---------------- helpers ----------------

    private static final String DELIVERY_COLS = """
            id, code, status, driver_name, driver_phone,
            receiver_name, receiver_phone, receiver_lat, receiver_long,
            sender_name, sender_phone, sender_lat, sender_long,
            fee, tip, items::text AS items, region_code, province,
            coordination::text AS coordination, delivery_date, created_at""";

    private static final String INSTALLATION_COLS = """
            id, service_order_code, delivery_order_code, technician_code, status,
            expected_time, timeline::text AS timeline, service_fee, fee_adjust,
            items::text AS items, region_code, province, created_at""";

    /** Row + surrogate id — mutations UPDATE theo id. */
    private record Row(long id, TechModels.InstallationOrder order) {
    }

    private static final RowMapper<Row> INSTALLATION_ROW_MAPPER = (rs, n) ->
            new Row(rs.getLong("id"), mapInstallation(rs));

    /**
     * 1 statement: count subquery (cùng WHERE) anchor row + lateral page rows.
     * Anchor row → code/service_order_code NULL → chỉ đọc total, không map order.
     */
    private TechModels.DeliveryPage queryDeliveryPage(String whereSql, List<Object> params,
                                                      int page, int pageSize) {
        String sql = "SELECT c.total_all, d.* FROM (SELECT count(*) AS total_all FROM delivery_orders"
                + whereSql + ") c LEFT JOIN LATERAL (SELECT " + DELIVERY_COLS
                + " FROM delivery_orders" + whereSql + " ORDER BY id ASC OFFSET ? LIMIT ?) d ON TRUE";
        List<Object> args = new ArrayList<>(params);
        args.addAll(params);
        args.add((long) (page - 1) * pageSize);
        args.add(pageSize);
        return jdbc.query(sql, rs -> {
            List<TechModels.DeliveryOrder> items = new ArrayList<>();
            long total = 0;
            while (rs.next()) {
                total = rs.getLong("total_all");
                if (rs.getString("code") != null) {
                    items.add(mapDelivery(rs));
                }
            }
            return new TechModels.DeliveryPage(items, total);
        }, args.toArray());
    }

    private TechModels.InstallationPage queryInstallationPage(String whereSql, List<Object> params,
                                                              int page, int pageSize) {
        String sql = "SELECT c.total_all, d.* FROM (SELECT count(*) AS total_all FROM installation_orders"
                + whereSql + ") c LEFT JOIN LATERAL (SELECT " + INSTALLATION_COLS
                + " FROM installation_orders" + whereSql + " ORDER BY id ASC OFFSET ? LIMIT ?) d ON TRUE";
        List<Object> args = new ArrayList<>(params);
        args.addAll(params);
        args.add((long) (page - 1) * pageSize);
        args.add(pageSize);
        return jdbc.query(sql, rs -> {
            List<TechModels.InstallationOrder> items = new ArrayList<>();
            long total = 0;
            while (rs.next()) {
                total = rs.getLong("total_all");
                if (rs.getString("service_order_code") != null) {
                    items.add(mapInstallation(rs));
                }
            }
            return new TechModels.InstallationPage(items, total);
        }, args.toArray());
    }

    private static TechModels.DeliveryOrder mapDelivery(ResultSet rs) throws SQLException {
        return new TechModels.DeliveryOrder(
                rs.getString("code"),
                rs.getString("status"),
                rs.getString("driver_name"),
                rs.getString("driver_phone"),
                contact(rs, "receiver"),
                contact(rs, "sender"),
                rs.getDouble("fee"),
                rs.getDouble("tip"),
                parseItems(rs.getString("items")),
                rs.getString("region_code"),
                rs.getString("province"),
                rs.getString("coordination"),
                rs.getObject("delivery_date", LocalDate.class),
                rs.getObject("created_at", OffsetDateTime.class));
    }

    private static TechModels.InstallationOrder mapInstallation(ResultSet rs) throws SQLException {
        return new TechModels.InstallationOrder(
                rs.getString("service_order_code"),
                rs.getString("delivery_order_code"),
                rs.getString("technician_code"),
                rs.getString("status"),
                rs.getObject("expected_time", OffsetDateTime.class),
                rs.getString("timeline"),
                rs.getDouble("service_fee"),
                rs.getDouble("fee_adjust"),
                parseItems(rs.getString("items")),
                rs.getString("region_code"),
                rs.getString("province"),
                rs.getObject("created_at", OffsetDateTime.class));
    }

    private static TechModels.Technician mapTechnician(ResultSet rs) throws SQLException {
        return new TechModels.Technician(
                rs.getString("code"), rs.getString("name"),
                rs.getString("type"), rs.getString("region_code"));
    }

    private static TechModels.Contact contact(ResultSet rs, String prefix) throws SQLException {
        return new TechModels.Contact(
                rs.getString(prefix + "_name"),
                rs.getString(prefix + "_phone"),
                (Double) rs.getObject(prefix + "_lat"),
                (Double) rs.getObject(prefix + "_long"));
    }

    private static List<TechModels.TechItem> parseItems(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return OBJECT_MAPPER.readValue(json, new TypeReference<List<TechModels.TechItem>>() {
            });
        } catch (Exception e) {
            throw new IllegalStateException("fulfillment: items JSONB hỏng — " + e.getMessage(), e);
        }
    }

    private static boolean present(List<String> list) {
        return list != null && !list.isEmpty();
    }

    private static boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }

    /** Escape % _ \ cho ILIKE literal-substring (ESCAPE '\'). */
    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String placeholders(int n) {
        return String.join(", ", Collections.nCopies(n, "?"));
    }
}
