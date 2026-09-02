package com.hubstore.fulfillment;

import com.hubstore.fulfillment.store.D2cFilterResult;
import com.hubstore.fulfillment.store.D2cOrderFilter;
import com.hubstore.fulfillment.store.D2cOrderRecord;
import com.hubstore.fulfillment.store.PostgresD2cOrderRepository;
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
 * Chạy thủ công:  mvn test -Dtest=PostgresD2cRepositoryIT
 * (cần: docker compose up -d postgres + migration V5 đã apply — bảng d2c_orders).
 *
 * `mvn test` mặc định KHÔNG chạy file này (surefire chỉ include *Test.java).
 *
 * Skip-if-no-DB: @BeforeAll thử connect qua FULFILLMENT_DB_* env (default
 * localhost:5432/fulfillment, user hubstore, password qua FULFILLMENT_DB_PASSWORD
 * hoặc POSTGRES_PASSWORD). Không kết nối được / bảng d2c_orders thiếu → abort.
 *
 * Parity: so PostgresD2cOrderRepository với InMemoryD2cRepo (D2cFilterAndNoteTest —
 * semantics đã unit-test) trên chính fixture rows insert trong @BeforeEach —
 * cleanup @AfterEach theo prefix, không phụ thuộc seed state.
 */
class PostgresD2cRepositoryIT {

    /** Prefix fixture — cleanup + assert key theo prefix (không đụng data khác). */
    private static final String PREFIX = "ZZD2C-";

    private static JdbcTemplate jdbc;
    private static PostgresD2cOrderRepository pg;
    private static List<D2cOrderRecord> fixtures;

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
        if (jdbc.queryForObject("SELECT to_regclass('public.d2c_orders') IS NULL", Boolean.class)) {
            abort("bảng d2c_orders thiếu (V5 chưa migrate) — bỏ qua integration test.");
        }
        pg = new PostgresD2cOrderRepository(jdbc);
        fixtures = D2cFixture.rows(PREFIX);
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

    @BeforeEach
    void insertFixtures() {
        for (D2cOrderRecord o : fixtures) {
            jdbc.update("INSERT INTO d2c_orders (order_code, order_id_inter, delivery_id, carrier, shop, "
                            + "export_employee, export_time, push_time, receiver_name, receiver_phone, "
                            + "receiver_address, service_type, product_category, product_type, "
                            + "is_debt_splitting, note, status, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    o.orderCode(), o.orderIdInter(), o.deliveryId(), o.carrier(), o.shop(),
                    o.exportEmployee(), ts(o.exportTime()), ts(o.pushTime()), o.receiverName(),
                    o.receiverPhone(), o.receiverAddress(), o.serviceType(), o.productCategory(),
                    o.productType(), o.isDebtSplitting(), o.note(), o.status(), ts(o.createdAt()));
        }
    }

    @AfterEach
    void cleanupFixtures() {
        jdbc.update("DELETE FROM d2c_orders WHERE order_code LIKE ?", PREFIX + "%");
    }

    // ---------------- helpers ----------------

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }

    private static D2cOrderFilter filter(D2cOrderFilter f) {
        return f;
    }

    private static List<String> codes(D2cFilterResult r) {
        return r.items().stream().map(D2cOrderRecord::orderCode).toList();
    }

    // ---------------- tests ----------------

    @Test
    void allFilterParityWithInMemory() {
        var f = filter(new D2cOrderFilter(null, null, null, null, null,
                null, null, null, null, null, null, null, null, 1, 100));
        var p = pg.filter(f);
        var m = mem().filter(f);
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(fixtures.size());
        assertThat(codes(p)).containsExactlyElementsOf(codes(m));
    }

    @Test
    void searchCarrierAndMultiStatusParity() {
        // search "ZZD2C-1" khớp code (prefix literal substring) + carrier GHN.
        var f = filter(new D2cOrderFilter(PREFIX + "1", null, List.of("GHN"), null, null,
                null, null, null, null, null, null, null, null, 1, 100));
        var p = pg.filter(f);
        var m = mem().filter(f);
        assertThat(p.total()).isEqualTo(m.total());
        assertThat(codes(p)).containsExactlyElementsOf(codes(m));
        // Wildcard % _ là literal — không row nào chứa → 0.
        var fEsc = filter(new D2cOrderFilter("%_\\", null, null, null, null,
                null, null, null, null, null, null, null, null, 1, 100));
        assertThat(pg.filter(fEsc).total()).isZero();
        var fStatus = filter(new D2cOrderFilter(null, List.of("NEW", "PUSHED"), null, null, null,
                null, null, null, null, null, null, null, null, 1, 100));
        var pStatus = pg.filter(fStatus);
        assertThat(pStatus.total()).isEqualTo(mem().filter(fStatus).total());
        assertThat(codes(pStatus)).containsExactlyElementsOf(codes(mem().filter(fStatus)));
    }

    @Test
    void slotFilterParityNullPushTimeNeverMatches() {
        // 08:00-09:00 VN → fixture 08:30 + 08:45; fixture push_time NULL không match.
        var f = filter(new D2cOrderFilter(null, null, null, null, null,
                null, null, null, null, null, null, "08:00", "09:00", 1, 100));
        var p = pg.filter(f);
        var m = mem().filter(f);
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(2);
        assertThat(codes(p)).containsExactlyElementsOf(codes(m));
        // Khung ngoài tất cả → 0.
        var fOff = filter(new D2cOrderFilter(null, null, null, null, null,
                null, null, null, null, null, null, "01:00", "02:00", 1, 100));
        assertThat(pg.filter(fOff).total()).isZero();
        // created/push Instant range parity (created >= 08-03, push trong 08-15 ≤ 10Z).
        var fRange = filter(new D2cOrderFilter(null, null, null, null, null,
                null, null, Instant.parse("2026-08-03T00:00:00Z"), null,
                Instant.parse("2026-08-15T00:00:00Z"), Instant.parse("2026-08-15T10:00:00Z"),
                null, null, 1, 100));
        var pRange = pg.filter(fRange);
        assertThat(pRange.total()).isEqualTo(mem().filter(fRange).total());
        // created>=08-03 ∩ push∈[00Z,10Z] → chỉ 5001 (3001 push 13:10Z, 4001 NULL).
        assertThat(codes(pRange)).containsExactly(PREFIX + "5001");
    }

    @Test
    void emptyPageBeyondLastKeepsTotal() {
        var f = filter(new D2cOrderFilter(null, null, null, null, null,
                null, null, null, null, null, null, null, null, 99, 10));
        var p = pg.filter(f);
        assertThat(p.items()).isEmpty();
        assertThat(p.total()).isEqualTo(fixtures.size());
    }

    @Test
    void paginationSlicesByInsertOrderAsc() {
        // BIGSERIAL gán id theo thứ tự INSERT — ORDER BY id ASC ≡ fixture order.
        var f1 = filter(new D2cOrderFilter(null, null, null, null, null,
                null, null, null, null, null, null, null, null, 1, 2));
        var f3 = filter(new D2cOrderFilter(null, null, null, null, null,
                null, null, null, null, null, null, null, null, 3, 2));
        assertThat(codes(pg.filter(f1))).containsExactly(PREFIX + "100%_LIT", PREFIX + "2001");
        assertThat(codes(pg.filter(f3))).containsExactly(PREFIX + "5001");
        assertThat(pg.filter(f3).total()).isEqualTo(fixtures.size());
    }

    @Test
    void findByCodeParityAndUpdateNotePersists() {
        var expected = fixtures.get(1); // 2001
        var p = pg.findByCode(expected.orderCode()).orElseThrow();
        var m = mem().findByCode(expected.orderCode()).orElseThrow();
        assertThat(p.orderCode()).isEqualTo(m.orderCode());
        assertThat(p.carrier()).isEqualTo(m.carrier());
        assertThat(p.pushTime()).isEqualTo(m.pushTime());
        assertThat(p.isDebtSplitting()).isEqualTo(m.isDebtSplitting());
        assertThat(p.createdAt()).isEqualTo(m.createdAt());

        var updated = pg.updateNote(expected.orderCode(), "IT ghi chú, có dấu phẩy").orElseThrow();
        assertThat(updated.note()).isEqualTo("IT ghi chú, có dấu phẩy");
        // DB state thật đã đổi + read-back.
        assertThat(jdbc.queryForObject(
                "SELECT note FROM d2c_orders WHERE order_code = ?", String.class, expected.orderCode()))
                .isEqualTo("IT ghi chú, có dấu phẩy");
        assertThat(pg.findByCode(expected.orderCode()).orElseThrow().note())
                .isEqualTo("IT ghi chú, có dấu phẩy");
        // Code lạ → empty.
        assertThat(pg.updateNote(PREFIX + "KHONG-TON-TAI", "x")).isEmpty();
        assertThat(pg.findByCode(PREFIX + "KHONG-TON-TAI")).isEmpty();
        // restore qua @AfterEach DELETE.
    }

    // ---------------- in-memory parity harness ----------------

    /** InMemoryD2cRepo khởi tạo từ cùng fixtures (semantics đã unit-test). */
    private static D2cFilterAndNoteTest.InMemoryD2cRepo mem() {
        return new D2cFilterAndNoteTest.InMemoryD2cRepo(fixtures);
    }
}
