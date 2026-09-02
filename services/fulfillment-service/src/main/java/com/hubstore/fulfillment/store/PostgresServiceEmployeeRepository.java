package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.store.ServiceEmployeeRepository.ListFilter;
import com.hubstore.fulfillment.store.ServiceEmployeeRepository.ServiceEmployee;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

/**
 * Postgres store SF-17 — pattern PostgresOrderRepository: plain class KHÔNG
 * stereotype (bean wiring do ServiceEmployeeRepositoryConfig lo), JdbcTemplate
 * + RowMapper, @Transactional trên mutate (Spring wrap bean qua proxy CGLIB).
 *
 * - list: WHERE động (title/query/region) — LUÔN gồm inactive (không điều kiện
 *   is_active). Total từ scalar subquery COUNT(*) với CÙNG WHERE (1 statement
 *   = 1 snapshot — pattern PostgresOrderRepository.filter).
 * - update: full replace 1 transaction — UPDATE mọi field trừ employee_code +
 *   regions delete-all rồi insert lại (dedupe, giữ thứ tự selection).
 */
public class PostgresServiceEmployeeRepository implements ServiceEmployeeRepository {

    private final JdbcTemplate jdbc;

    private static final String EMPLOYEE_COLS = """
            employee_code, full_name, title_code, payment_account, is_active,
            created_at, updated_at""";

    private static final RowMapper<ServiceEmployee> EMPLOYEE_ROW_MAPPER = (rs, n) ->
            new ServiceEmployee(
                    rs.getString("employee_code"),
                    rs.getString("full_name"),
                    rs.getString("title_code"),
                    rs.getString("payment_account"),
                    rs.getBoolean("is_active"),
                    List.of(), // regions hydrate riêng (batch query sau)
                    rs.getObject("created_at", java.time.OffsetDateTime.class),
                    rs.getObject("updated_at", java.time.OffsetDateTime.class));

    public PostgresServiceEmployeeRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    // ---------------- reads ----------------

    @Override
    public ListResult list(ListFilter filter) {
        StringBuilder where = new StringBuilder(" WHERE TRUE");
        List<Object> params = new ArrayList<>();

        if (nonBlank(filter.titleCode())) {
            where.append(" AND title_code = ?");
            params.add(filter.titleCode().trim());
        }
        if (nonBlank(filter.query())) {
            // ILIKE literal-substring trên employee_code + full_name (escape %/_/\).
            where.append(" AND (employee_code ILIKE ? ESCAPE '\\' OR full_name ILIKE ? ESCAPE '\\')");
            String like = "%" + escapeLike(filter.query().trim()) + "%";
            params.add(like);
            params.add(like);
        }
        if (nonBlank(filter.regionCode())) {
            where.append(" AND EXISTS (SELECT 1 FROM service_employee_regions ser "
                    + "WHERE ser.employee_code = se.employee_code AND ser.region_code = ?)");
            params.add(filter.regionCode().trim());
        }

        String whereSql = where.toString();
        // List không pagination → 2 query cùng WHERE (count + rows) là đủ; row
        // sort theo id ≡ thứ tự insert (pattern PostgresOrderRepository).
        List<ServiceEmployee> items = hydrateRegions(jdbc.query(
                "SELECT " + EMPLOYEE_COLS + " FROM service_employees se" + whereSql
                        + " ORDER BY id ASC",
                EMPLOYEE_ROW_MAPPER, params.toArray()));
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM service_employees se" + whereSql, Integer.class, params.toArray());
        return new ListResult(items, total == null ? items.size() : total);
    }

    @Override
    public Optional<ServiceEmployee> get(String employeeCode) {
        return jdbc.query("SELECT " + EMPLOYEE_COLS + " FROM service_employees WHERE employee_code = ?",
                EMPLOYEE_ROW_MAPPER, employeeCode).stream().findFirst().map(this::withRegions);
    }

    // ---------------- mutations ----------------

    @Override
    @Transactional
    public ServiceEmployee create(ServiceEmployee employee) {
        java.time.OffsetDateTime now = java.time.OffsetDateTime.now();
        jdbc.update("INSERT INTO service_employees "
                        + "(employee_code, full_name, title_code, payment_account, is_active, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                employee.employeeCode(), employee.fullName(), employee.titleCode(),
                employee.paymentAccount(), employee.isActive(), now, now);
        insertRegions(employee.employeeCode(), employee.regionCodes());
        return employee;
    }

    @Override
    @Transactional
    public ServiceEmployee update(String employeeCode, ServiceEmployee employee) {
        jdbc.update("UPDATE service_employees SET full_name = ?, title_code = ?, "
                        + "payment_account = ?, is_active = ?, updated_at = now() "
                        + "WHERE employee_code = ?",
                employee.fullName(), employee.titleCode(), employee.paymentAccount(),
                employee.isActive(), employeeCode);
        // Full replace vùng: delete-all + insert lại (dedupe giữ thứ tự).
        jdbc.update("DELETE FROM service_employee_regions WHERE employee_code = ?", employeeCode);
        insertRegions(employeeCode, employee.regionCodes());
        return withRegions(get(employeeCode).orElseThrow(() ->
                new IllegalArgumentException("ServiceEmployee không tồn tại: " + employeeCode)));
    }

    @Override
    @Transactional
    public ServiceEmployee setActive(String employeeCode, boolean active) {
        jdbc.update("UPDATE service_employees SET is_active = ?, updated_at = now() "
                + "WHERE employee_code = ?", active, employeeCode);
        return withRegions(get(employeeCode).orElseThrow(() ->
                new IllegalArgumentException("ServiceEmployee không tồn tại: " + employeeCode)));
    }

    // ---------------- helpers ----------------

    private void insertRegions(String employeeCode, List<String> regionCodes) {
        if (regionCodes == null || regionCodes.isEmpty()) {
            return;
        }
        List<String> distinct = new ArrayList<>(new LinkedHashSet<>(regionCodes));
        jdbc.batchUpdate("INSERT INTO service_employee_regions (employee_code, region_code) VALUES (?, ?)",
                distinct, distinct.size(),
                (ps, regionCode) -> {
                    ps.setString(1, employeeCode);
                    ps.setString(2, regionCode);
                });
    }

    private ServiceEmployee withRegions(ServiceEmployee employee) {
        List<String> regionCodes = jdbc.query(
                "SELECT region_code FROM service_employee_regions WHERE employee_code = ? "
                        + "ORDER BY id ASC",
                (rs, n) -> rs.getString(1),
                employee.employeeCode());
        return new ServiceEmployee(employee.employeeCode(), employee.fullName(), employee.titleCode(),
                employee.paymentAccount(), employee.isActive(), regionCodes,
                employee.createdAt(), employee.updatedAt());
    }

    /** Batch-hydrate region_codes cho list (tránh N+1): 1 query IN (...), nhóm theo employee. */
    private List<ServiceEmployee> hydrateRegions(List<ServiceEmployee> employees) {
        if (employees.isEmpty()) {
            return employees;
        }
        List<String> codes = employees.stream().map(ServiceEmployee::employeeCode).toList();
        String placeholders = String.join(", ", Collections.nCopies(codes.size(), "?"));
        java.util.Map<String, List<String>> byEmployee = new java.util.HashMap<>();
        jdbc.query("SELECT employee_code, region_code FROM service_employee_regions "
                        + "WHERE employee_code IN (" + placeholders + ") ORDER BY id ASC",
                rs -> {
                    byEmployee.computeIfAbsent(rs.getString(1), k -> new ArrayList<>())
                            .add(rs.getString(2));
                }, codes.toArray());
        return employees.stream()
                .map(e -> new ServiceEmployee(e.employeeCode(), e.fullName(), e.titleCode(),
                        e.paymentAccount(), e.isActive(),
                        byEmployee.getOrDefault(e.employeeCode(), List.of()),
                        e.createdAt(), e.updatedAt()))
                .toList();
    }

    private static boolean nonBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
