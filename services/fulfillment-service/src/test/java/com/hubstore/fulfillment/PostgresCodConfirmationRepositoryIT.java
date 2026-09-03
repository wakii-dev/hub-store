package com.hubstore.fulfillment;

import com.hubstore.fulfillment.store.CodConfirmation;
import com.hubstore.fulfillment.store.PostgresCodConfirmationRepository;
import com.hubstore.fulfillment.store.SettlementShopRow;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.abort;

/**
 * INTEGRATION TEST — CHẠY KHI POSTGRES CÓ SẴN (KHÔNG testcontainers).
 *
 * Chạy thủ công:  mvn test -Dtest=PostgresCodConfirmationRepositoryIT
 * (cần: docker compose up -d postgres + migration V3 đã apply — bảng cod_confirmations).
 *
 * `mvn test` mặc định KHÔNG chạy file này (surefire chỉ include *Test.java).
 *
 * Skip-if-no-DB: @BeforeAll thử connect qua FULFILLMENT_DB_* env (pattern
 * PostgresD2cRepositoryIT). Không kết nối được / bảng cod_confirmations thiếu
 * (V3 chưa migrate) → abort.
 *
 * Fixture: orders prefix ZZCOD- (JOIN fail_reason) + confirmations chèn qua repo
 * — cleanup @AfterEach theo prefix trên CẢ HAI bảng, không đụng data khác.
 */
class PostgresCodConfirmationRepositoryIT {

    private static final String PREFIX = "ZZCOD-";
    private static final Instant T0 = Instant.parse("2026-09-01T03:00:00Z");
    private static final Instant T1 = Instant.parse("2026-09-02T03:00:00Z");
    private static final Instant FROM = Instant.parse("2026-09-01T00:00:00Z");
    private static final Instant TO = Instant.parse("2026-09-03T00:00:00Z");

    private static JdbcTemplate jdbc;
    private static PostgresCodConfirmationRepository pg;

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
        if (jdbc.queryForObject("SELECT to_regclass('public.cod_confirmations') IS NULL", Boolean.class)) {
            abort("bảng cod_confirmations thiếu (V3 chưa migrate) — bỏ qua integration test.");
        }
        pg = new PostgresCodConfirmationRepository(jdbc);
    }

    private static String dataSourceUrl() {
        return "jdbc:postgresql://" + env("FULFILLMENT_DB_HOST", "localhost")
                + ":" + env("FULFILLMENT_DB_PORT", "5432")
                + "/" + env("FULFILLMENT_DB_NAME", "fulfillment");
    }

    private static String dbPassword() {
        String p = System.getenv("FULFILLMENT_DB_PASSWORD");
        return p != null && !p.isBlank() ? p : env("POSTGRES_PASSWORD", "");
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? def : v;
    }

    /** Orders JOIN-side: failReason null = đơn ổn, khác null = FAILED (D7). */
    @BeforeEach
    void insertOrderFixtures() {
        order("ORD-1", "B1", "S1", "Shop Một", 5000, null);
        order("ORD-2", "B1", "S1", "Shop Một", 3000, null);
        order("ORD-3", "B1", "S2", "Shop Hai", 4000, null);
        order("ORD-FAIL", "B1", "S3", "Shop Ba", 9000, "hàng hỏng");
    }

    @AfterEach
    void cleanupFixtures() {
        // cod_confirmations trước (không FK cascade sang orders nhưng xóa con trước cho sạch).
        jdbc.update("DELETE FROM cod_confirmations WHERE fulfill_code LIKE ?", PREFIX + "%");
        jdbc.update("DELETE FROM orders WHERE fulfill_code LIKE ?", PREFIX + "%");
    }

    // ---------------- helpers ----------------

    private static void order(String fulfillCode, String batchCode, String shopCode, String shopName,
            long codAmount, String failReason) {
        jdbc.update("INSERT INTO orders (fulfill_code, batch_code, shop_code, shop_name, "
                        + "cod_amount, fail_reason) VALUES (?, ?, ?, ?, ?, ?)",
                PREFIX + fulfillCode, PREFIX + batchCode, PREFIX + shopCode, shopName,
                codAmount, failReason);
    }

    private static CodConfirmation pending(String fulfillCode, String batchCode, String shopCode,
            String shopName, long expected, Instant completedAt) {
        return new CodConfirmation(PREFIX + fulfillCode, PREFIX + batchCode, PREFIX + shopCode,
                shopName, expected, null, null, null, completedAt, CodConfirmation.STATUS_PENDING);
    }

    private static String code(CodConfirmation c) {
        return c.fulfillCode().substring(PREFIX.length());
    }

    private static Timestamp ts(Instant i) {
        return Timestamp.from(i);
    }

    // ---------------- tests ----------------

    @Test
    void insertPendingIfAbsentOnConflictDoNothingFirstWins() {
        pg.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        pg.insertPendingIfAbsent(pending("ORD-1", "B9", "S9", "Shop Chín", 999, T1));

        var found = pg.findByFulfillCode(PREFIX + "ORD-1").orElseThrow();
        assertThat(found.batchCode()).isEqualTo(PREFIX + "B1");
        assertThat(found.expectedAmount()).isEqualTo(5000L);
        assertThat(found.completedAt()).isEqualTo(T0);
        assertThat(found.status()).isZero();
        assertThat(found.collectedAmount()).isNull();
        // DB state thật: đúng 1 row.
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM cod_confirmations WHERE fulfill_code = ?",
                Long.class, PREFIX + "ORD-1")).isEqualTo(1L);
    }

    @Test
    void confirmBatchPendingOnlyAndFailFilterD7() {
        pg.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        pg.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 3000, T0));
        pg.insertPendingIfAbsent(pending("ORD-3", "B1", "S2", "Shop Hai", 4000, T0));
        pg.insertPendingIfAbsent(pending("ORD-FAIL", "B1", "S3", "Shop Ba", 9000, T0));

        // pending của batch B1: ORD-FAIL loại (JOIN fail_reason IS NULL).
        assertThat(pg.findPendingByBatch(PREFIX + "B1"))
                .extracting(PostgresCodConfirmationRepositoryIT::code)
                .containsExactly("ORD-1", "ORD-2", "ORD-3");

        int updated = pg.confirmBatch(PREFIX + "B1", "nv2", T1);
        assertThat(updated).isEqualTo(3); // ORD-FAIL không đụng (D7)
        assertThat(pg.findByFulfillCode(PREFIX + "ORD-FAIL").orElseThrow().status()).isZero();

        var confirmed = pg.findByFulfillCode(PREFIX + "ORD-1").orElseThrow();
        assertThat(confirmed.status()).isEqualTo(CodConfirmation.STATUS_CONFIRMED);
        assertThat(confirmed.collectedAmount()).isEqualTo(5000L); // collected = expected
        assertThat(confirmed.collectedBy()).isEqualTo("nv2");

        // Re-run confirmBatch → 0 row (chỉ PENDING được touch).
        assertThat(pg.confirmBatch(PREFIX + "B1", "nv3", T1)).isZero();
    }

    @Test
    void confirmOneNullUsesExpectedAndZeroIsRealZero() {
        pg.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        pg.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 3000, T0));

        assertThat(pg.confirmOne(PREFIX + "ORD-1", null, "nv", T1)).isEqualTo(1);
        // null = lấy expected.
        assertThat(pg.findByFulfillCode(PREFIX + "ORD-1").orElseThrow().collectedAmount())
                .isEqualTo(5000L);
        // 0L = thu thật 0 đồng — KHÔNG thay bằng expected (D3, pgjdbc không lạc type).
        assertThat(pg.confirmOne(PREFIX + "ORD-2", 0L, "nv", T1)).isEqualTo(1);
        assertThat(pg.findByFulfillCode(PREFIX + "ORD-2").orElseThrow().collectedAmount())
                .isZero();

        // Code lạ → 0.
        assertThat(pg.confirmOne(PREFIX + "KHONG-TON-TAI", null, "nv", T1)).isZero();
    }

    @Test
    void deletePendingKeepsConfirmedD8() {
        pg.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        pg.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 3000, T0));
        pg.confirmOne(PREFIX + "ORD-2", null, "nv", T1); // CONFIRMED

        assertThat(pg.deletePendingByFulfillCodes(
                List.of(PREFIX + "ORD-1", PREFIX + "ORD-2"))).isEqualTo(1);
        assertThat(pg.findByFulfillCode(PREFIX + "ORD-1")).isEmpty();
        assertThat(pg.findByFulfillCode(PREFIX + "ORD-2")).isPresent();
        // Danh sách rỗng — không SQL hỏng, trả 0.
        assertThat(pg.deletePendingByFulfillCodes(List.of())).isZero();
    }

    @Test
    void aggregateGroupByShopJoinFailFilter() {
        seedThreeShops();

        List<SettlementShopRow> rows = pg.aggregate(FROM, TO);
        assertThat(rows).extracting(SettlementShopRow::shopCode)
                .containsExactly(PREFIX + "S1", PREFIX + "S2"); // S3 (FAILED) loại

        var s1 = rows.get(0);
        assertThat(s1.shopName()).isEqualTo("Shop Một");
        assertThat(s1.totalOrders()).isEqualTo(2);
        assertThat(s1.totalExpected()).isEqualTo(8000L);
        assertThat(s1.totalCollected()).isEqualTo(5000L);
        assertThat(s1.diffAmount()).isEqualTo(3000L);
        assertThat(s1.pendingCount()).isEqualTo(1);
        assertThat(s1.mismatchCount()).isZero();

        var s2 = rows.get(1);
        assertThat(s2.totalCollected()).isEqualTo(3500L);
        assertThat(s2.diffAmount()).isEqualTo(500L);
        assertThat(s2.pendingCount()).isZero();
        assertThat(s2.mismatchCount()).isEqualTo(1);
    }

    @Test
    void detailOnlyMismatchAndShopScope() {
        seedThreeShops();

        var mismatch = pg.detail(null, FROM, TO, true);
        assertThat(mismatch).extracting(PostgresCodConfirmationRepositoryIT::code)
                .containsExactly("ORD-2", "ORD-3"); // pending + lệch; FAILED loại

        var all = pg.detail(null, FROM, TO, false);
        assertThat(all).extracting(PostgresCodConfirmationRepositoryIT::code)
                .containsExactly("ORD-1", "ORD-2", "ORD-3");

        var s1 = pg.detail(PREFIX + "S1", FROM, TO, false);
        assertThat(s1).extracting(PostgresCodConfirmationRepositoryIT::code)
                .containsExactly("ORD-1", "ORD-2");

        assertThat(pg.detail(null, Instant.parse("2026-08-01T00:00:00Z"),
                Instant.parse("2026-08-02T00:00:00Z"), false)).isEmpty();
    }

    /** 3 shops + FAILED: S1 confirmed-ok + pending; S2 confirmed lệch; S3 FAILED. */
    private void seedThreeShops() {
        pg.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        pg.confirmOne(PREFIX + "ORD-1", 5000L, "nv", T1);
        pg.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 3000, T0));
        pg.insertPendingIfAbsent(pending("ORD-3", "B1", "S2", "Shop Hai", 4000, T0));
        pg.confirmOne(PREFIX + "ORD-3", 3500L, "nv", T1);
        pg.insertPendingIfAbsent(pending("ORD-FAIL", "B1", "S3", "Shop Ba", 9000, T0));
    }
}
