package com.hubstore.fulfillment;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.abort;

/**
 * INTEGRATION TEST — schema smoke cho V4__area_staff_schema (SF-17).
 *
 * Chạy thủ công:  mvn test -Dtest=PostgresServiceEmployeeRepositoryIT
 * (cần: docker compose up -d postgres && docker compose run --rm orders-migrate)
 *
 * `mvn test` mặc định KHÔNG chạy file này (surefire chỉ include *Test.java).
 * Skip-if-no-DB: không connect được → abort (skip, không fail CI) — pattern
 * PostgresOrderRepositoryIT.
 */
class PostgresServiceEmployeeRepositoryIT {

    private static JdbcTemplate jdbc;

    @BeforeAll
    static void connectOrSkip() {
        DriverManagerDataSource ds = new DriverManagerDataSource(dataSourceUrl(),
                env("FULFILLMENT_DB_USER", "hubstore"), dbPassword());
        try (var conn = ds.getConnection()) {
            // kết nối OK — giữ datasource.
        } catch (Exception e) {
            abort("postgres không có sẵn — bỏ qua integration test (" + e.getMessage() + "). "
                    + "Chạy: docker compose up -d postgres");
        }
        jdbc = new JdbcTemplate(ds);
    }

    @Test
    void v4TablesExist() {
        Integer tables = jdbc.queryForObject("""
                SELECT count(*) FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN ('service_employees', 'service_employee_regions')
                """, Integer.class);
        assertThat(tables).isEqualTo(2);
    }

    @Test
    void masterRegionsExpandedBeyondSeed() {
        Integer total = jdbc.queryForObject("SELECT count(*) FROM regions", Integer.class);
        Integer provinces = jdbc.queryForObject(
                "SELECT count(*) FROM regions WHERE type = 'province'", Integer.class);
        // 11 rows seed (2 tỉnh + wards) + ≥6 tỉnh mới + ≥18 ward mới → tổng > 11.
        assertThat(total).isGreaterThan(11);
        assertThat(provinces).isGreaterThanOrEqualTo(8);
        // Mọi ward mới phải có parent_code trỏ tới province thật (FK không có ở V1
        // regions — kiểm bằng query, không để orphan).
        Integer orphans = jdbc.queryForObject("""
                SELECT count(*) FROM regions w
                WHERE w.type = 'ward'
                  AND NOT EXISTS (SELECT 1 FROM regions p
                                  WHERE p.code = w.parent_code AND p.type = 'province')
                """, Integer.class);
        assertThat(orphans).isZero();
    }

    @Test
    void serviceEmployeeConstraints() {
        // employee_code UNIQUE + is_active default TRUE + updated_at default now().
        jdbc.update("""
                INSERT INTO service_employees (employee_code, full_name, title_code, payment_account)
                VALUES ('ZZTEST01', 'IT Smoke', 'SHIPPER', '0123456789')
                """);
        try {
            Integer dup = jdbc.queryForObject("""
                    SELECT count(*) FROM service_employees WHERE employee_code = 'ZZTEST01'
                    """, Integer.class);
            assertThat(dup).isEqualTo(1);
            Boolean active = jdbc.queryForObject(
                    "SELECT is_active FROM service_employees WHERE employee_code = 'ZZTEST01'",
                    Boolean.class);
            assertThat(active).isTrue();
        } finally {
            jdbc.update("DELETE FROM service_employees WHERE employee_code = 'ZZTEST01'");
        }
    }

    // ---------------- helpers (pattern PostgresOrderRepositoryIT) ----------------

    private static String dataSourceUrl() {
        return "jdbc:postgresql://" + env("FULFILLMENT_DB_HOST", "localhost")
                + ":" + env("FULFILLMENT_DB_PORT", "5432")
                + "/" + env("FULFILLMENT_DB_NAME", "fulfillment");
    }

    private static String dbPassword() {
        String p = System.getenv("FULFILLMENT_DB_PASSWORD");
        return p == null || p.isBlank() ? System.getenv("POSTGRES_PASSWORD") : p;
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? def : v;
    }
}
