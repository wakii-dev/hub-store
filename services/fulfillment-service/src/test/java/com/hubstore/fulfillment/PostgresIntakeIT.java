package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.store.AuditEntry;
import com.hubstore.fulfillment.store.OrderFilter;
import com.hubstore.fulfillment.store.PostgresOrderRepository;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.abort;

/**
 * INTEGRATION TEST — SF-13 intake Postgres impl (nextFulfillCodes/insertOrders/
 * markFailed/hasRetry/findByExactFulfillCode/appendAudit/getAudit).
 *
 * Cùng pattern skip-when-no-DB với PostgresOrderRepositoryIT: mvn test mặc định
 * KHÔNG chạy *IT.java; chạy thủ công  mvn test -Dtest=PostgresIntakeIT.
 *
 * KHÔNG giả định DB rỗng (seed ORD-3001..3027 có sẵn): assert RELATIVE — codegen
 * chỉ check format/không-trùng, insert dùng code IT-* riêng, cleanup trong
 * @AfterAll. Retry insert tham chiếu IT-* gốc (FK old_fulfill_code).
 */
class PostgresIntakeIT {

    // Code test prefix IT-* — không khớp regex ORD-[0-9]+ của codegen, không đụng seed.
    private static final String ORIG_A = "IT-13A1";
    private static final String ORIG_B = "IT-13B2";
    private static final String RETRY_C = "IT-13C3";
    private static final List<String> TEST_CODES = List.of(ORIG_A, ORIG_B, RETRY_C);
    private static final String AUDIT_ACTOR = "it-sf13-actor";

    private static JdbcTemplate jdbc;
    private static PostgresOrderRepository pg;
    /** Codes ORD-* do codegen sinh trong test — cleanup @AfterAll (không đẩy max vĩnh viễn). */
    private static final List<String> GENERATED_CODES = new ArrayList<>();

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
        if (jdbc.queryForObject("SELECT to_regclass('public.orders') IS NULL", Boolean.class)) {
            abort("schema chưa migrate (bảng orders thiếu) — bỏ qua integration test. "
                    + "Chạy: docker compose up -d orders-migrate");
        }
        pg = new PostgresOrderRepository(jdbc);
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

    /** Dọn sót từ run trước (crash giữa chừng) + dọn giữa các test — test độc lập. */
    @BeforeEach
    void cleanTestRows() {
        cleanup();
    }

    @AfterAll
    static void cleanup() {
        if (jdbc == null) {
            return; // skip @BeforeAll — không có gì để dọn
        }
        // retry (FK old_fulfill_code) xóa trước order gốc.
        for (String code : GENERATED_CODES) {
            jdbc.update("DELETE FROM orders WHERE fulfill_code = ?", code);
        }
        GENERATED_CODES.clear();
        jdbc.update("DELETE FROM orders WHERE fulfill_code IN (?, ?, ?) OR old_fulfill_code IN (?, ?, ?)",
                ORIG_A, ORIG_B, RETRY_C, ORIG_A, ORIG_B, RETRY_C);
        jdbc.update("DELETE FROM activity_log WHERE actor = ?", AUDIT_ACTOR);
    }

    // ---------------- helpers ----------------

    /** Đơn intake tối giản: status 0 (pending), không shop/batch; time tùy chọn. */
    private static SeedModels.OrderSeed order(String fulfillCode, String oldFulfillCode) {
        return new SeedModels.OrderSeed(
                fulfillCode,
                "RSA-IT-" + fulfillCode,
                0, 0, null, null,
                new SeedModels.TimeRangeSeed("2026-09-10T08:00:00+07:00", "2026-09-10T12:00:00+07:00"),
                new SeedModels.TimeRangeSeed("2026-09-10T13:00:00+07:00", "2026-09-10T18:00:00+07:00"),
                0,
                List.of(new SeedModels.ProductSeed("SKU-IT-1", "Sản phẩm IT", 2)),
                150_000, 2, false,
                "Số 1 Đường IT, Quận Test, Hà Nội",
                3.5, null, List.of(),
                "Nguyễn Văn IT", "0912345678", oldFulfillCode,
                null, null, null, Instant.now());
    }

    /** Insert 3 đơn gốc + retry, đọc lại qua repo (dùng chung nhiều test). */
    private static void insertFixture() {
        pg.insertOrders(List.of(order(ORIG_A, null), order(ORIG_B, null)));
    }

    private static List<String> codes(List<SeedModels.OrderSeed> orders) {
        return orders.stream().map(SeedModels.OrderSeed::fulfillCode).toList();
    }

    /** detail JSONB → JsonNode (so nội dung, không so format jsonb normalize). */
    private static com.fasterxml.jackson.databind.JsonNode jsonTree(String json) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException("detail JSON hỏng: " + json, e);
        }
    }

    // ---------------- tests ----------------

    @Test
    void insertOrdersVisibleInFilterAndReadBack() {
        var inserted = pg.insertOrders(List.of(
                order(ORIG_A, null), order(ORIG_B, null), order(RETRY_C, ORIG_A)));
        // Trả về đúng các đơn như đã lưu, đúng thứ tự.
        assertThat(codes(inserted)).containsExactly(TEST_CODES.toArray(String[]::new));

        // DB state thật — filter theo substring code thấy đủ 3.
        var f = new OrderFilter("IT-13", Set.of(), null, Set.of(), Set.of(), Set.of(),
                null, null, Set.of(), 1, 100);
        var result = pg.filter(f);
        assertThat(result.total()).isEqualTo(3);
        assertThat(codes(result.items())).containsExactlyInAnyOrder(TEST_CODES.toArray(String[]::new));

        // Round-trip 7 cột intake + fields thường.
        SeedModels.OrderSeed a = pg.findByExactFulfillCode(ORIG_A).orElseThrow();
        assertThat(a.customerName()).isEqualTo("Nguyễn Văn IT");
        assertThat(a.customerPhone()).isEqualTo("0912345678");
        assertThat(a.oldFulfillCode()).isNull();
        assertThat(a.failReason()).isNull();
        assertThat(a.createdTime()).isNotNull();
        assertThat(a.items()).hasSize(1);
        assertThat(a.items().get(0).productCode()).isEqualTo("SKU-IT-1");

        SeedModels.OrderSeed c = pg.findByExactFulfillCode(RETRY_C).orElseThrow();
        assertThat(c.oldFulfillCode()).isEqualTo(ORIG_A);
    }

    @Test
    void nextFulfillCodesConsecutiveCyclesNeverDuplicate() {
        // Chu kỳ thật: sinh → insert → sinh tiếp (insert đẩy MAX → lần sau tiếp dải).
        // (2 call liên tiếp KHÔNG insert giữa sẽ trả cùng dải — MAX chưa đổi.)
        List<String> all = new ArrayList<>();
        for (int cycle = 0; cycle < 2; cycle++) {
            List<String> codes = pg.nextFulfillCodes(3);
            assertThat(codes).hasSize(3);
            all.addAll(codes);
            GENERATED_CODES.addAll(codes);
            pg.insertOrders(codes.stream().map(c -> order(c, null)).toList());
        }
        // Format ORD-nnnn, toàn cục không trùng, dải liên tiếp.
        assertThat(all).allMatch(c -> c.matches("ORD-[0-9]+"));
        assertThat(all).doesNotHaveDuplicates();
        assertThat(all.subList(3, 6)).containsExactlyElementsOf(all.subList(0, 3).stream()
                .map(c -> "ORD-%04d".formatted(Integer.parseInt(c.substring(4)) + 3)).toList());

        // Tiếp dải sau seed: mọi code > 3000 (seed tối đa ORD-3027 — không giả định rỗng).
        assertThat(all).allSatisfy(c ->
                assertThat(Integer.parseInt(c.substring(4))).isGreaterThan(3000));
    }

    @Test
    void markFailedSetsFailFieldsAndRejectsSecondFail() {
        insertFixture();
        Instant at = Instant.now().minusSeconds(30);

        SeedModels.OrderSeed failed = pg.markFailed(ORIG_A, "KHACH_TU_CHOI", "Không nghe máy", at);
        assertThat(failed.failReason()).isEqualTo("KHACH_TU_CHOI");
        assertThat(failed.failNote()).isEqualTo("Không nghe máy");
        assertThat(failed.failedAt()).isEqualTo(at);

        // Persist — đọc lại từ DB.
        SeedModels.OrderSeed reread = pg.findByExactFulfillCode(ORIG_A).orElseThrow();
        assertThat(reread.failReason()).isEqualTo("KHACH_TU_CHOI");
        assertThat(reread.failNote()).isEqualTo("Không nghe máy");
        assertThat(reread.failedAt()).isEqualTo(at);

        // Lần 2 trên đơn đã FAILED → chặn.
        assertThatThrownBy(() -> pg.markFailed(ORIG_A, "AGAIN", null, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(ORIG_A);
    }

    @Test
    void hasRetryReflectsRetryOrderExistence() {
        insertFixture();
        assertThat(pg.hasRetry(ORIG_A)).isFalse();

        pg.insertOrders(List.of(order(RETRY_C, ORIG_A)));
        assertThat(pg.hasRetry(ORIG_A)).isTrue();
        // Code không có retry → false; đơn gốc B không ai retry.
        assertThat(pg.hasRetry(ORIG_B)).isFalse();
        assertThat(pg.hasRetry("IT-KHONG-TON-TAI")).isFalse();
    }

    @Test
    void findByExactFulfillCodeMatchesOnlyFulfillCodeNotOrderCode() {
        insertFixture();
        // Exact ORD-code: thấy.
        assertThat(pg.findByExactFulfillCode(ORIG_A)).isPresent();
        // KHÔNG dual-match orderCode (RSA-IT-…) — khác findByFulfillCode.
        assertThat(pg.findByExactFulfillCode("RSA-IT-" + ORIG_A)).isEmpty();
        // Code lạ: empty.
        assertThat(pg.findByExactFulfillCode("IT-KHONG-TON-TAI")).isEmpty();
    }

    @Test
    void appendAuditThenGetAuditReturnsEntriesForTarget() {
        pg.appendAudit(AUDIT_ACTOR, "INTAKE_CREATE", ORIG_A, "{\"rows\":3}");
        pg.appendAudit(AUDIT_ACTOR, "MARK_FAIL", ORIG_A, "{\"reason\":\"KHACH_TU_CHOI\"}");
        pg.appendAudit(AUDIT_ACTOR, "INTAKE_CREATE", ORIG_B, "{\"rows\":1}");

        List<AuditEntry> auditA = pg.getAudit(ORIG_A);
        assertThat(auditA).hasSize(2);
        // ORDER BY id ASC — thứ tự append. detail cột JSONB normalize whitespace
        // ({"rows":3} → {"rows": 3}) — so parsed JSON, không so exact string.
        assertThat(auditA.get(0).action()).isEqualTo("INTAKE_CREATE");
        assertThat(jsonTree(auditA.get(0).detailJson()).get("rows").asInt()).isEqualTo(3);
        assertThat(auditA.get(1).action()).isEqualTo("MARK_FAIL");
        assertThat(jsonTree(auditA.get(1).detailJson()).get("reason").asText()).isEqualTo("KHACH_TU_CHOI");
        assertThat(auditA).allSatisfy(e -> {
            assertThat(e.actor()).isEqualTo(AUDIT_ACTOR);
            assertThat(e.target()).isEqualTo(ORIG_A);
            assertThat(e.createdAt()).isNotNull();
        });

        // Target khác chỉ thấy entry của mình — filter theo target đúng.
        List<AuditEntry> auditB = pg.getAudit(ORIG_B);
        assertThat(auditB).hasSize(1);
        assertThat(auditB.get(0).action()).isEqualTo("INTAKE_CREATE");
    }
}
