package com.hubstore.fulfillment.store;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.v1.ShopAssignmentHistoryEntry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Postgres store — thay InMemoryOrderRepository (SF-2), GIỮ ĐÚNG semantics
 * từng method của in-memory (OrderRepository interface không đổi). Plain class
 * KHÔNG stereotype — bean wiring do config lo (T3, @ConditionalOnProperty
 * fulfillment.store=postgres). @Transactional trên method: Spring Boot
 * auto-transaction-management wrap bean qua proxy (CGLIB, class public non-final).
 *
 * Mapping lưu ý (so khớp in-memory):
 * - id BIGSERIAL = surrogate insert order seed → ORDER BY id ≡ in-memory
 *   insertion order; fulfill_code ASC chỉ tie-breaker tường minh (UNIQUE nên no-op).
 * - times: timestamptz → OffsetDateTime → toString() ISO. Khác biệt format nhẹ
 *   so với seed JSON raw string (VD +07:00 → UTC) — integration test so nội dung,
 *   không so exact string giữa 2 impl.
 * - OrderSeed.history: KHÔNG nhồi vào record — history đọc qua getHistory() từ
 *   bảng shop_assignment_history (in-memory chỉ dùng seed history lúc boot).
 */
public class PostgresOrderRepository implements OrderRepository {

    private final JdbcTemplate jdbc;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public PostgresOrderRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    // ---------------- reads ----------------

    /**
     * INVARIANT: 1 query duy nhất — total từ scalar subquery COUNT(*) với CÙNG
     * WHERE động (build 1 lần, tái dùng) — 1 statement = 1 snapshot, không race.
     * Total anchor qua LEFT JOIN LATERAL: subquery count luôn có ≥1 row, nên
     * page vượt last page (items rỗng) VẪN trả total đúng (in-memory: total =
     * matched.size() kể cả items rỗng — window count cũ mất total khi 0 row).
     */
    @Override
    public FilterResult filter(OrderFilter f) {
        StringBuilder where = new StringBuilder(" WHERE TRUE");
        List<Object> params = new ArrayList<>();

        if (f.fulfillCode() != null && !f.fulfillCode().isBlank()) {
            // ILIKE ≡ toLowerCase().contains() — escape %/_/\ trong input người dùng
            // để giữ literal-substring semantics (không wildcard).
            where.append(" AND fulfill_code ILIKE ? ESCAPE '\\'");
            params.add("%" + escapeLike(f.fulfillCode()) + "%");
        }
        if (!f.batchStatuses().isEmpty()) {
            where.append(" AND batch_status IN (").append(placeholders(f.batchStatuses().size())).append(")");
            params.addAll(f.batchStatuses());
        }
        if (!f.orderStatuses().isEmpty()) {
            where.append(" AND order_status IN (").append(placeholders(f.orderStatuses().size())).append(")");
            params.addAll(f.orderStatuses());
        }
        if (!f.shopCodes().isEmpty()) {
            // In-memory reject khi shopAssignment null → shop_code NULL không match IN — tự nhiên đúng.
            where.append(" AND shop_code IN (").append(placeholders(f.shopCodes().size())).append(")");
            params.addAll(f.shopCodes());
        }
        if (!f.regionCodes().isEmpty()) {
            // GIỮ heuristic substring D1: customerAddress chứa tên region (case-insensitive).
            // Escape %/_ trong r.name bằng ESCAPE '\' — tên region là literal, không wildcard.
            where.append(" AND EXISTS (SELECT 1 FROM regions r WHERE r.code IN (")
                    .append(placeholders(f.regionCodes().size()))
                    .append(") AND orders.customer_address ILIKE '%' || ")
                    .append("replace(replace(replace(r.name, '\\', '\\\\'), '%', '\\%'), '_', '\\_')")
                    .append(" || '%' ESCAPE '\\')");
            params.addAll(f.regionCodes());
        }
        appendOverlap(where, params, "delivery_time_from", "delivery_time_to", f.deliveryTime());
        appendOverlap(where, params, "original_time_from", "original_time_to", f.originalTime());
        // created_time: request có field nhưng seed orders KHÔNG có createdAt —
        // in-memory NHẬN nhưng KHÔNG filter → Postgres cũng vậy.
        if (f.excludeFulfillCodes() != null && !f.excludeFulfillCodes().isEmpty()) {
            where.append(" AND fulfill_code NOT IN (").append(placeholders(f.excludeFulfillCodes().size())).append(")");
            params.addAll(f.excludeFulfillCodes());
        }

        int page = Math.max(f.page(), 1);
        int pageSize = f.pageSize() <= 0 ? 10 : f.pageSize();

        // 1 statement: count subquery (cùng WHERE) anchor row + lateral page rows.
        // Anchor row (0 items) → fulfill_code NULL → chỉ đọc total, không map order.
        String whereSql = where.toString();
        String sql = "SELECT c.total_all, o.* FROM (SELECT count(*) AS total_all FROM orders" + whereSql + ") c "
                + "LEFT JOIN LATERAL (SELECT " + ORDER_COLS + " FROM orders" + whereSql
                + " ORDER BY id ASC, fulfill_code ASC OFFSET ? LIMIT ?) o ON TRUE";
        List<Object> args = new ArrayList<>(params);
        args.addAll(params);
        args.add((long) (page - 1) * pageSize);
        args.add(pageSize);

        FilterResult result = jdbc.query(sql, rs -> {
            List<SeedModels.OrderSeed> items = new ArrayList<>();
            long total = 0;
            while (rs.next()) {
                total = rs.getLong("total_all");
                if (rs.getString("fulfill_code") != null) {
                    items.add(mapOrder(rs));
                }
            }
            return new FilterResult(items, total);
        }, args.toArray());
        return result;
    }

    /**
     * Dual-match ORD/RSA (fix FI-237 giữ nguyên): fulfillCode (ORD-…) hoặc
     * orderCode (RSA-…). ORDER BY id + LIMIT 1 ≡ in-memory findFirst.
     */
    @Override
    public Optional<SeedModels.OrderSeed> findByFulfillCode(String fulfillCode) {
        return findRowDual(fulfillCode).map(OrderRow::order);
    }

    /** Mỗi code lookup độc lập (fulfillCode trước, orderCode sau) — codes chứa cả
     *  ORD-x và RSA-x của cùng order → 2 entries, GIỮ đúng in-memory; lạ → bỏ. */
    @Override
    public List<SeedModels.OrderSeed> findByCodes(List<String> fulfillCodes) {
        if (fulfillCodes == null || fulfillCodes.isEmpty()) {
            return List.of();
        }
        List<String> distinct = fulfillCodes.stream().distinct().toList();
        String sql = "SELECT " + ORDER_COLS + " FROM orders WHERE fulfill_code IN ("
                + placeholders(distinct.size()) + ") OR order_code IN (" + placeholders(distinct.size()) + ")";
        List<Object> args = new ArrayList<>(distinct);
        args.addAll(distinct);
        List<OrderRow> rows = jdbc.query(sql, ORDER_ROW_MAPPER, args.toArray());
        Map<String, SeedModels.OrderSeed> byFulfill = new java.util.HashMap<>();
        Map<String, SeedModels.OrderSeed> byOrder = new java.util.HashMap<>();
        for (OrderRow r : rows) {
            byFulfill.putIfAbsent(r.order().fulfillCode(), r.order());
            if (r.order().orderCode() != null) {
                byOrder.putIfAbsent(r.order().orderCode(), r.order());
            }
        }
        List<SeedModels.OrderSeed> out = new ArrayList<>();
        for (String code : fulfillCodes) {
            SeedModels.OrderSeed o = byFulfill.containsKey(code) ? byFulfill.get(code) : byOrder.get(code);
            if (o != null) {
                out.add(o);
            }
        }
        return out;
    }

    // ---------------- mutations ----------------

    /** 1 transaction (@Transactional): từng code dual-match FOR UPDATE; lạ skip;
     *  target=0 → clear batchCode (revert §9), target khác → giữ batchCode. */
    @Override
    @Transactional
    public List<SeedModels.OrderSeed> mutateBatchStatus(List<String> fulfillCodes, int targetBatchStatus) {
        List<SeedModels.OrderSeed> updated = new ArrayList<>();
        for (String code : fulfillCodes) {
            Optional<OrderRow> found = findRowDualForUpdate(code);
            if (found.isEmpty()) {
                continue;
            }
            OrderRow row = found.get();
            String batchCode = targetBatchStatus == 0 ? null : row.order().batchCode();
            jdbc.update("UPDATE orders SET batch_status = ?, batch_code = ? WHERE id = ?",
                    targetBatchStatus, batchCode, row.id());
            updated.add(row.order().withBatchStatus(targetBatchStatus, batchCode));
        }
        return updated;
    }

    /** 1 transaction: UPDATE shop + INSERT history (khớp in-memory append). */
    @Override
    @Transactional
    public SeedModels.OrderSeed assignShopHub(String fulfillCode, SeedModels.ShopAssignmentSeed targetShop,
                                              String changedBy, Instant changedAt) {
        Optional<OrderRow> found = findRowDualForUpdate(fulfillCode);
        OrderRow row = found.orElseThrow(() ->
                new IllegalArgumentException("Order không tồn tại: " + fulfillCode));
        jdbc.update("UPDATE orders SET shop_code = ?, shop_name = ?, shop_address = ? WHERE id = ?",
                targetShop.shopCode(), targetShop.shopName(), targetShop.address(), row.id());
        // History cột: occurred_at=changedAt, action=changedBy (seed map changedAt=timestamp,
        // changedBy=action — cùng contract). FK theo fulfill_code chuẩn (ORD-…): in-memory
        // key history theo param (RSA-param tạo list riêng) nhưng FK cấm orphan —
        // insert canonical code của order.
        jdbc.update("INSERT INTO shop_assignment_history (fulfill_code, occurred_at, action, note) "
                        + "VALUES (?, ?, ?, NULL)",
                row.order().fulfillCode(),
                OffsetDateTime.ofInstant(changedAt, ZoneOffset.UTC),
                changedBy == null ? "fulfillment-service" : changedBy);
        return row.order().withShopAssignment(targetShop);
    }

    @Override
    public SeedModels.OrderSeed updateDeliveryTime(String fulfillCode, SeedModels.TimeRangeSeed deliveryTime) {
        OrderRow row = requireOrder(fulfillCode);
        jdbc.update("UPDATE orders SET delivery_time_from = ?, delivery_time_to = ? WHERE id = ?",
                toTs(deliveryTime == null ? null : deliveryTime.from()),
                toTs(deliveryTime == null ? null : deliveryTime.to()),
                row.id());
        return row.order().withDeliveryTime(deliveryTime);
    }

    @Override
    public SeedModels.OrderSeed updateNote(String fulfillCode, String note) {
        OrderRow row = requireOrder(fulfillCode);
        jdbc.update("UPDATE orders SET note = ? WHERE id = ?", note, row.id());
        return row.order().withNote(note);
    }

    /**
     * Tra THẲNG theo fulfill_code column — KHÔNG dual-match (in-memory: historyByCode
     * key là fulfillCode gốc, truyền RSA-code → miss → empty — GIỮ ĐÚNG).
     * Map proto: changedAt=occurred_at ISO, changedBy=action; fromShop/toShop để
     * proto default empty (DB history không lưu shops); cột note không có proto
     * field tương ứng — bỏ qua.
     */
    @Override
    public List<ShopAssignmentHistoryEntry> getHistory(String fulfillCode) {
        return jdbc.query(
                "SELECT fulfill_code, occurred_at, action FROM shop_assignment_history "
                        + "WHERE fulfill_code = ? ORDER BY occurred_at ASC, id ASC",
                (rs, n) -> {
                    String changedAt = iso(rs.getObject("occurred_at", OffsetDateTime.class));
                    return ShopAssignmentHistoryEntry.newBuilder()
                            .setFulfillCode(rs.getString("fulfill_code"))
                            .setChangedAt(changedAt == null ? "" : changedAt)
                            .setChangedBy(rs.getString("action") == null ? "" : rs.getString("action"))
                            .build();
                },
                fulfillCode);
    }

    // ---------------- master data ----------------

    /** ORDER BY seq (surrogate insert order, V1) ≡ in-memory seed order. */
    @Override
    public List<SeedModels.RegionSeed> regions() {
        return jdbc.query("SELECT code, name, type, parent_code FROM regions ORDER BY seq ASC",
                (rs, n) -> new SeedModels.RegionSeed(rs.getString(1), rs.getString(2),
                        rs.getString(3), rs.getString(4)));
    }

    @Override
    public List<SeedModels.DeliveryStaffSeed> deliveryStaff() {
        return jdbc.query("SELECT staff_id, name, shop_code, phone FROM delivery_staff ORDER BY seq ASC",
                (rs, n) -> new SeedModels.DeliveryStaffSeed(rs.getString(1), rs.getString(2),
                        rs.getString(3), rs.getString(4)));
    }

    /** DISTINCT ON (shop_code) + ORDER BY shop_code, id = first-seen per code,
     *  sort theo shopCode — khớp in-memory derive (LinkedHashMap + sort). */
    @Override
    public List<SeedModels.ShopSeed> distinctShops() {
        return jdbc.query(
                "SELECT DISTINCT ON (shop_code) shop_code, shop_name, shop_address "
                        + "FROM orders WHERE shop_code IS NOT NULL ORDER BY shop_code ASC, id ASC",
                (rs, n) -> new SeedModels.ShopSeed(rs.getString(1), rs.getString(2), rs.getString(3)));
    }

    // ---------------- helpers ----------------

    private static final String ORDER_COLS = """
            id, fulfill_code, order_code, status_code, batch_status, batch_code,
            shop_code, shop_name, shop_address, original_time_from, original_time_to,
            delivery_time_from, delivery_time_to, order_status, items::text AS items,
            cod_amount, total_quantity, is_debt_splitting_order, customer_address,
            distance, note, customer_name, customer_phone, old_fulfill_code,
            fail_reason, fail_note, failed_at, created_time""";

    /** Row + surrogate id — mutations UPDATE theo id (chính xác hơn dual-match). */
    private record OrderRow(long id, SeedModels.OrderSeed order) {
    }

    private static final RowMapper<OrderRow> ORDER_ROW_MAPPER = (rs, n) ->
            new OrderRow(rs.getLong("id"), mapOrder(rs));

    private static SeedModels.OrderSeed mapOrder(ResultSet rs) throws SQLException {
        String shopCode = rs.getString("shop_code");
        SeedModels.ShopAssignmentSeed shop = shopCode == null ? null
                : new SeedModels.ShopAssignmentSeed(shopCode, rs.getString("shop_name"), rs.getString("shop_address"));
        return new SeedModels.OrderSeed(
                rs.getString("fulfill_code"),
                rs.getString("order_code"),
                rs.getInt("status_code"),
                rs.getInt("batch_status"),
                rs.getString("batch_code"),
                shop,
                mapRange(ts(rs, "original_time_from"), ts(rs, "original_time_to")),
                mapRange(ts(rs, "delivery_time_from"), ts(rs, "delivery_time_to")),
                rs.getInt("order_status"),
                parseItems(rs.getString("items")),
                rs.getLong("cod_amount"),
                rs.getInt("total_quantity"),
                rs.getBoolean("is_debt_splitting_order"),
                rs.getString("customer_address"),
                (Double) rs.getObject("distance"),
                rs.getString("note"),
                List.of(),
                // SF-13 intake columns.
                rs.getString("customer_name"),
                rs.getString("customer_phone"),
                rs.getString("old_fulfill_code"),
                rs.getString("fail_reason"),
                rs.getString("fail_note"),
                instant(ts(rs, "failed_at")),
                instant(ts(rs, "created_time")));
    }

    /** items JSONB → List<ProductSeed>; cả from+to NULL → range null
     *  (≡ in-memory orderRange==null). */
    private static SeedModels.TimeRangeSeed mapRange(OffsetDateTime from, OffsetDateTime to) {
        if (from == null && to == null) {
            return null;
        }
        return new SeedModels.TimeRangeSeed(iso(from), iso(to));
    }

    private static List<SeedModels.ProductSeed> parseItems(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return OBJECT_MAPPER.readValue(json, new TypeReference<List<SeedModels.ProductSeed>>() {
            });
        } catch (Exception e) {
            throw new IllegalStateException("fulfillment: items JSONB hỏng — " + e.getMessage(), e);
        }
    }

    /** JDBC 4.2: timestamptz → OffsetDateTime (ResultSet không có getOffsetDateTime). */
    private static OffsetDateTime ts(ResultSet rs, String col) throws SQLException {
        return rs.getObject(col, OffsetDateTime.class);
    }

    private Optional<OrderRow> findRowDual(String code) {
        return jdbc.query("SELECT " + ORDER_COLS + " FROM orders "
                        + "WHERE fulfill_code = ? OR order_code = ? ORDER BY id ASC LIMIT 1",
                ORDER_ROW_MAPPER, code, code).stream().findFirst();
    }

    private Optional<OrderRow> findRowDualForUpdate(String code) {
        return jdbc.query("SELECT " + ORDER_COLS + " FROM orders "
                        + "WHERE fulfill_code = ? OR order_code = ? ORDER BY id ASC LIMIT 1 FOR UPDATE",
                ORDER_ROW_MAPPER, code, code).stream().findFirst();
    }

    private OrderRow requireOrder(String fulfillCode) {
        return findRowDualForUpdate(fulfillCode).orElseThrow(() ->
                new IllegalArgumentException("Order không tồn tại: " + fulfillCode));
    }

    /**
     * Range overlap khớp in-memory overlaps(): khoảng filter trống (from+to blank)
     * → bỏ điều kiện; order range cả 2 cột NULL → EXCLUDE (in-memory orderRange==null
     * → false); cột đơn lẻ NULL = unbounded (in-memory parseOrMin/parseOrMax).
     * Unbounded phía filter (parse lỗi/blank) → bỏ bound tương ứng.
     */
    private void appendOverlap(StringBuilder where, List<Object> params,
                               String fromCol, String toCol, SeedModels.TimeRangeSeed filterRange) {
        if (filterRange == null || (isBlank(filterRange.from()) && isBlank(filterRange.to()))) {
            return;
        }
        OffsetDateTime fFrom = parseOrNull(filterRange.from());
        OffsetDateTime fTo = parseOrNull(filterRange.to());
        where.append(" AND NOT (").append(fromCol).append(" IS NULL AND ").append(toCol).append(" IS NULL)");
        if (fTo != null) {
            where.append(" AND (").append(fromCol).append(" IS NULL OR ").append(fromCol).append(" <= ?)");
            params.add(fTo);
        }
        if (fFrom != null) {
            where.append(" AND (").append(toCol).append(" IS NULL OR ").append(toCol).append(" >= ?)");
            params.add(fFrom);
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** ISO datetime → OffsetDateTime; blank/parse lỗi → null (= unbounded,
     *  khớp in-memory parseOrMin/parseOrMax). */
    private static OffsetDateTime parseOrNull(String iso) {
        if (isBlank(iso)) {
            return null;
        }
        try {
            return OffsetDateTime.parse(iso);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static OffsetDateTime toTs(String iso) {
        return parseOrNull(iso);
    }

    private static String iso(OffsetDateTime dt) {
        return dt == null ? null : dt.toString();
    }

    /** OffsetDateTime → Instant (null-safe) — failed_at/created_time OrderSeed là Instant. */
    private static Instant instant(OffsetDateTime dt) {
        return dt == null ? null : dt.toInstant();
    }

    /** Escape % _ \ cho ILIKE literal-substring (ESCAPE '\'). */
    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String placeholders(int n) {
        return String.join(", ", Collections.nCopies(n, "?"));
    }

    // ---------------- SF-13 intake ----------------

    /**
     * Codegen atomic: pg_advisory_xact_lock('fulfill_code_gen') chặn 2 tx lấy
     * cùng dải (lock giữ đến hết tx); MAX substring bỏ qua code không ORD-n
     * (retry code NG-*, test code IT-* không đẩy max). Baseline 3000 ≡ seed.
     */
    @Override
    @Transactional
    public List<String> nextFulfillCodes(int n) {
        jdbc.execute("SELECT pg_advisory_xact_lock(hashtext('fulfill_code_gen'))");
        Integer max = jdbc.queryForObject(
                "SELECT COALESCE(MAX((substring(fulfill_code FROM 5))::INT), 3000) "
                        + "FROM orders WHERE fulfill_code ~ '^ORD-[0-9]+$'", Integer.class);
        List<String> codes = new ArrayList<>(n);
        for (int i = 1; i <= n; i++) {
            codes.add(String.format("ORD-%04d", max + i));
        }
        return codes;
    }

    /** Insert batch (đã gán codes, đã validate) — @Transactional all-or-nothing. */
    @Override
    @Transactional
    public List<SeedModels.OrderSeed> insertOrders(List<SeedModels.OrderSeed> orders) {
        List<SeedModels.OrderSeed> out = new ArrayList<>();
        for (SeedModels.OrderSeed o : orders) {
            jdbc.update("INSERT INTO orders (fulfill_code, order_code, status_code, batch_status, batch_code, "
                            + "shop_code, shop_name, shop_address, original_time_from, original_time_to, "
                            + "delivery_time_from, delivery_time_to, order_status, items, cod_amount, total_quantity, "
                            + "is_debt_splitting_order, customer_address, distance, note, "
                            + "customer_name, customer_phone, old_fulfill_code, created_time) "
                            // items là cột JSONB — text param cast tường minh (vị trí 14/24).
                            + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CAST(? AS jsonb),?,?,?,?,?,?,?,?,?,?)",
                    o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                    o.shopAssignment() == null ? null : o.shopAssignment().shopCode(),
                    o.shopAssignment() == null ? null : o.shopAssignment().shopName(),
                    o.shopAssignment() == null ? null : o.shopAssignment().address(),
                    toTs(o.originalTime() == null ? null : o.originalTime().from()),
                    toTs(o.originalTime() == null ? null : o.originalTime().to()),
                    toTs(o.deliveryTime() == null ? null : o.deliveryTime().from()),
                    toTs(o.deliveryTime() == null ? null : o.deliveryTime().to()),
                    o.orderStatus(), toJson(o.items()), o.codAmount(), o.totalQuantity(),
                    o.isDebtSplittingOrder(), o.customerAddress(), o.distance(), o.note(),
                    o.customerName(), o.customerPhone(), o.oldFulfillCode(),
                    o.createdTime() == null ? null : OffsetDateTime.ofInstant(o.createdTime(), ZoneOffset.UTC));
            out.add(findByExactFulfillCode(o.fulfillCode()).orElseThrow());
        }
        return out;
    }

    /** Mark-fail: phải tồn tại + chưa FAILED (service validate thêm — repo chặn double). */
    @Override
    @Transactional
    public SeedModels.OrderSeed markFailed(String fulfillCode, String reason, String note, Instant at) {
        OrderRow row = requireOrder(fulfillCode);
        if (row.order().failReason() != null) {
            throw new IllegalArgumentException("Đơn đã FAILED: " + fulfillCode);
        }
        jdbc.update("UPDATE orders SET fail_reason = ?, fail_note = ?, failed_at = ? WHERE id = ?",
                reason, note, OffsetDateTime.ofInstant(at, ZoneOffset.UTC), row.id());
        return row.order().withFail(reason, note, at);
    }

    @Override
    public boolean hasRetry(String fulfillCode) {
        Long c = jdbc.queryForObject(
                "SELECT count(*) FROM orders WHERE old_fulfill_code = ?", Long.class, fulfillCode);
        return c != null && c > 0;
    }

    /** Chỉ match fulfill_code — KHÔNG dual-match orderCode (lookup old code chính xác). */
    @Override
    public Optional<SeedModels.OrderSeed> findByExactFulfillCode(String fulfillCode) {
        return jdbc.query("SELECT " + ORDER_COLS + " FROM orders WHERE fulfill_code = ? ORDER BY id ASC LIMIT 1",
                        ORDER_ROW_MAPPER, fulfillCode).stream().findFirst()
                .map(OrderRow::order);
    }

    @Override
    @Transactional
    public void appendAudit(String actor, String action, String target, String detailJson) {
        // detail là cột JSONB — text param phải cast tường minh.
        jdbc.update("INSERT INTO activity_log (actor, action, target, detail, created_at) "
                        + "VALUES (?, ?, ?, CAST(? AS jsonb), now())",
                actor, action, target, detailJson);
    }

    @Override
    public List<AuditEntry> getAudit(String fulfillCode) {
        return jdbc.query("SELECT actor, action, target, detail::text AS detail, created_at FROM activity_log "
                        + "WHERE target = ? ORDER BY id ASC",
                (rs, n) -> new AuditEntry(rs.getString("actor"), rs.getString("action"),
                        rs.getString("target"), rs.getString("detail"),
                        instant(rs.getObject("created_at", OffsetDateTime.class))),
                fulfillCode);
    }

    /** items List<ProductSeed> → JSON string cho cột JSONB. */
    private static String toJson(List<SeedModels.ProductSeed> items) {
        try {
            return OBJECT_MAPPER.writeValueAsString(items == null ? List.of() : items);
        } catch (Exception e) {
            throw new IllegalStateException("fulfillment: serialize items thất bại — " + e.getMessage(), e);
        }
    }
}
