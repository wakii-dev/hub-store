package com.hubstore.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubstore.fulfillment.seed.TechSeedLoader;
import com.hubstore.fulfillment.store.InMemoryTechOrderRepository;
import com.hubstore.fulfillment.store.PostgresTechOrderRepository;
import com.hubstore.fulfillment.store.TechModels;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.abort;

/**
 * INTEGRATION TEST — CHẠY KHI POSTGRES CÓ SẴN (KHÔNG testcontainers) — pattern
 * PostgresOrderRepositoryIT.
 *
 * Chạy thủ công:  mvn test -Dtest=PostgresTechOrderRepositoryIT
 * (cần: postgres đã migrate V6 + seed tech — docker compose up -d postgres
 * orders-migrate && bash scripts/seed-db.sh, hoặc container isolated SF-19).
 *
 * `mvn test` mặc định KHÔNG chạy file này (surefire chỉ include *Test.java).
 *
 * Skip-if-no-DB: @BeforeAll thử connect qua FULFILLMENT_DB_* env (default
 * localhost:5432/fulfillment, user hubstore). Không kết nối được / chưa migrate
 * / chưa seed tech → abort (skip, không fail CI).
 *
 * Parity: so PostgresTechOrderRepository với InMemoryTechOrderRepository cùng
 * load tech-sample.json (TODAY resolve LocalDate.now() ≡ DB CURRENT_DATE khi
 * timezone DB khớp JVM). Mutating tests (assignTechnician) RESTORE technician_code
 * + history trong @AfterEach — không phá seed state.
 */
class PostgresTechOrderRepositoryIT {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static JdbcTemplate jdbc;
    private static PostgresTechOrderRepository pg;
    private static TechSeedLoader.TechSeedFile seed;
    private static InMemoryTechOrderRepository mem;

    // State snapshot trước assign — restore trong @AfterEach (KHÔNG phá seed).
    private static final List<String> ASSIGN_CODES =
            List.of("SO-0001", "SO-0004", "SO-0006", "SO-0008");
    private static final List<String> SAVED_TECH = new java.util.ArrayList<>();
    private static long savedMaxHistoryId;

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
        Integer missing = jdbc.queryForObject(
                "SELECT (to_regclass('public.technicians') IS NULL)::int "
                        + "+ (to_regclass('public.delivery_orders') IS NULL)::int "
                        + "+ (to_regclass('public.installation_orders') IS NULL)::int", Integer.class);
        if (missing == null || missing > 0) {
            abort("schema chưa migrate (bảng tech thiếu) — bỏ qua integration test. "
                    + "Chạy: docker compose up -d orders-migrate (Flyway V6)");
        }
        Integer techCount = jdbc.queryForObject("SELECT count(*) FROM technicians", Integer.class);
        Integer delCount = jdbc.queryForObject("SELECT count(*) FROM delivery_orders WHERE code = 'TD-0001'", Integer.class);
        Integer insCount = jdbc.queryForObject("SELECT count(*) FROM installation_orders WHERE service_order_code = 'SO-0001'", Integer.class);
        if (techCount == null || techCount == 0 || delCount == null || delCount == 0
                || insCount == null || insCount == 0) {
            abort("tech seed rỗng — bỏ qua integration test. Chạy: bash scripts/seed-db.sh");
        }
        pg = new PostgresTechOrderRepository(jdbc);
        seed = TechSeedLoader.load(Path.of("../../api/seed/tech-sample.json"));
        mem = new InMemoryTechOrderRepository(seed);
        snapshotSeedState();
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

    private static void snapshotSeedState() {
        for (String code : ASSIGN_CODES) {
            String tech = jdbc.queryForObject(
                    "SELECT technician_code FROM installation_orders WHERE service_order_code = ?",
                    String.class, code);
            SAVED_TECH.add(tech);
        }
        Long maxId = jdbc.queryForObject(
                "SELECT COALESCE(max(id), 0) FROM installation_assignment_history", Long.class);
        savedMaxHistoryId = maxId == null ? 0 : maxId;
    }

    @AfterAll
    static void cleanup() {
        // Không đụng gì ngoài seed state — restore đã xong trong @AfterEach.
    }

    @BeforeEach
    void freshInMemory() {
        // mem MUTATE qua test assign — dựng lại từ seed mỗi test để parity read
        // không phụ thuộc thứ tự method (JUnit5 order cố định nhưng không rõ ràng).
        mem = new InMemoryTechOrderRepository(seed);
    }

    @AfterEach
    void restoreSeedState() {
        if (jdbc == null) {
            return; // skip @BeforeAll — không có gì để restore
        }
        for (int i = 0; i < ASSIGN_CODES.size(); i++) {
            jdbc.update("UPDATE installation_orders SET technician_code = ? WHERE service_order_code = ?",
                    SAVED_TECH.get(i), ASSIGN_CODES.get(i));
        }
        jdbc.update("DELETE FROM installation_assignment_history WHERE id > ?", savedMaxHistoryId);
    }

    // ---------------- helpers ----------------

    /** So parity 2 DeliveryOrder bỏ qua createdAt (seed loader để null vs DB now()). */
    private static void assertSameDelivery(TechModels.DeliveryOrder a, TechModels.DeliveryOrder b) {
        assertThat(a.code()).isEqualTo(b.code());
        assertThat(a.status()).isEqualTo(b.status());
        assertThat(a.driverName()).isEqualTo(b.driverName());
        assertThat(a.driverPhone()).isEqualTo(b.driverPhone());
        assertThat(a.receiver()).isEqualTo(b.receiver());
        assertThat(a.sender()).isEqualTo(b.sender());
        assertThat(a.fee()).isEqualTo(b.fee());
        assertThat(a.tip()).isEqualTo(b.tip());
        assertThat(a.items()).isEqualTo(b.items());
        assertThat(a.regionCode()).isEqualTo(b.regionCode());
        assertThat(a.province()).isEqualTo(b.province());
        // JSONB ::text format khác Jackson compact — so node, không so string.
        assertThat(json(a.coordinationJson())).isEqualTo(json(b.coordinationJson()));
        assertThat(a.deliveryDate()).isEqualTo(b.deliveryDate());
    }

    private static void assertSameInstallation(TechModels.InstallationOrder a, TechModels.InstallationOrder b) {
        assertThat(a.serviceOrderCode()).isEqualTo(b.serviceOrderCode());
        assertThat(a.deliveryOrderCode()).isEqualTo(b.deliveryOrderCode());
        assertThat(a.technicianCode()).isEqualTo(b.technicianCode());
        assertThat(a.status()).isEqualTo(b.status());
        assertThat(a.expectedTime() == null ? null : a.expectedTime().toInstant())
                .isEqualTo(b.expectedTime() == null ? null : b.expectedTime().toInstant());
        assertThat(a.serviceFee()).isEqualTo(b.serviceFee());
        assertThat(a.feeAdjust()).isEqualTo(b.feeAdjust());
        assertThat(a.items()).isEqualTo(b.items());
        assertThat(a.regionCode()).isEqualTo(b.regionCode());
        assertThat(a.province()).isEqualTo(b.province());
        assertThat(json(a.timelineJson())).isEqualTo(json(b.timelineJson()));
    }

    private static JsonNode json(String raw) {
        try {
            return raw == null ? null : JSON.readTree(raw);
        } catch (Exception e) {
            throw new IllegalStateException("JSON hỏng: " + raw, e);
        }
    }

    private static List<String> deliveryCodes(TechModels.DeliveryPage page) {
        return page.items().stream().map(TechModels.DeliveryOrder::code).toList();
    }

    private static List<String> installationCodes(TechModels.InstallationPage page) {
        return page.items().stream().map(TechModels.InstallationOrder::serviceOrderCode).toList();
    }

    private static TechModels.DeliveryFilter deliveryFilter(List<String> statuses, String driverName,
                                                            List<String> l1, List<String> l2,
                                                            String region, String province,
                                                            LocalDate from, LocalDate to,
                                                            int page, int pageSize) {
        return new TechModels.DeliveryFilter(statuses, driverName, l1, l2, region, province,
                from, to, page, pageSize);
    }

    private static TechModels.InstallationFilter installationFilter(List<String> statuses, String technician,
                                                                    List<String> l1, List<String> l2,
                                                                    String region, String province,
                                                                    LocalDate from, LocalDate to,
                                                                    int page, int pageSize) {
        return new TechModels.InstallationFilter(statuses, technician, l1, l2, region, province,
                from, to, page, pageSize);
    }

    // ---------------- reads parity: delivery ----------------

    @Test
    void filterDelivery_noDates_todayDefaultParity() {
        // Cả from+to null → today default (repo-side CURRENT_DATE ≡ in-memory now()).
        var p = pg.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 1, 100));
        var m = mem.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 1, 100));
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(9L); // seed: 9 TODAY, TD-0009 TODAY-1
        assertThat(deliveryCodes(p)).containsExactlyElementsOf(deliveryCodes(m));
        assertSameDelivery(p.items().get(0), m.items().get(0));
    }

    @Test
    void filterDelivery_statusAndDateRangeParity() {
        LocalDate today = LocalDate.now();
        var f = deliveryFilter(List.of("SHIPPING"), null, null, null, null, null, today, today, 1, 100);
        var p = pg.filterDelivery(f);
        var m = mem.filterDelivery(f);
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(1L);
        assertThat(deliveryCodes(p)).containsExactly("TD-0004");

        // Hôm qua → đúng đơn TODAY-1.
        var f2 = deliveryFilter(null, null, null, null, null, null, today.minusDays(1), today.minusDays(1), 1, 100);
        var p2 = pg.filterDelivery(f2);
        var m2 = mem.filterDelivery(f2);
        assertThat(p2.total()).isEqualTo(m2.total()).isEqualTo(1L);
        assertThat(deliveryCodes(p2)).containsExactly("TD-0009");
    }

    @Test
    void filterDelivery_categoryL1L2JsonbParity() {
        var f = deliveryFilter(null, null, List.of("Điện máy"), null, null, null, null, null, 1, 100);
        var p = pg.filterDelivery(f);
        var m = mem.filterDelivery(f);
        assertThat(p.total()).isEqualTo(m.total()).isGreaterThan(0);
        assertThat(deliveryCodes(p)).containsExactlyElementsOf(deliveryCodes(m));

        var f2 = deliveryFilter(null, null, null, List.of("TV", "Loa"), null, null, null, null, 1, 100);
        var p2 = pg.filterDelivery(f2);
        var m2 = mem.filterDelivery(f2);
        assertThat(p2.total()).isEqualTo(m2.total()).isGreaterThan(0);
        assertThat(deliveryCodes(p2)).containsExactlyElementsOf(deliveryCodes(m2));
    }

    @Test
    void filterDelivery_driverSubstringRegionProvinceParity() {
        // driver ILIKE substring case-insensitive — today-default áp dụng (không date)
        // nên TD-0009 (TODAY-1) bị loại → chỉ TD-0001, TD-0005.
        var f = deliveryFilter(null, "hiếu", null, null, null, null, null, null, 1, 100);
        var p = pg.filterDelivery(f);
        var m = mem.filterDelivery(f);
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(2L);
        assertThat(deliveryCodes(p)).containsExactlyElementsOf(deliveryCodes(m));

        var f2 = deliveryFilter(null, null, null, null, "R2", "TP. Hồ Chí Minh", null, null, 1, 100);
        var p2 = pg.filterDelivery(f2);
        var m2 = mem.filterDelivery(f2);
        assertThat(p2.total()).isEqualTo(m2.total()).isEqualTo(3L); // TD-0002, TD-0007, TD-0008
        assertThat(deliveryCodes(p2)).containsExactlyElementsOf(deliveryCodes(m2));
    }

    @Test
    void filterDelivery_paginationStableTotalParity() {
        var p1 = pg.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 1, 4));
        var p2 = pg.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 2, 4));
        var m1 = mem.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 1, 4));
        var m2 = mem.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 2, 4));
        assertThat(deliveryCodes(p1)).containsExactlyElementsOf(deliveryCodes(m1));
        assertThat(deliveryCodes(p2)).containsExactlyElementsOf(deliveryCodes(m2));
        assertThat(p1.items()).hasSize(4);
        assertThat(p2.items()).hasSize(4);
        assertThat(p1.total()).isEqualTo(p2.total()).isEqualTo(9L);

        // Page vượt last page → items rỗng NHƯNG total vẫn đúng (anchor LATERAL).
        var p99 = pg.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 99, 10));
        var m99 = mem.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 99, 10));
        assertThat(p99.items()).isEmpty();
        assertThat(m99.items()).isEmpty();
        assertThat(p99.total()).isEqualTo(m99.total()).isEqualTo(9L);

        // page<1 → 1, pageSize<=0 → 10 — cả 2 impl cùng normalize
        // (today-default matched = 9 → page 1 đủ 9 items).
        var p0 = pg.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 0, 0));
        var m0 = mem.filterDelivery(deliveryFilter(null, null, null, null, null, null, null, null, 0, 0));
        assertThat(deliveryCodes(p0)).containsExactlyElementsOf(deliveryCodes(m0));
        assertThat(p0.items()).hasSize(9);
    }

    // ---------------- reads parity: installation ----------------

    @Test
    void filterInstallation_noFilterParityAndRowFields() {
        var p = pg.filterInstallation(installationFilter(null, null, null, null, null, null, null, null, 1, 100));
        var m = mem.filterInstallation(installationFilter(null, null, null, null, null, null, null, null, 1, 100));
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(8L);
        assertThat(installationCodes(p)).containsExactlyElementsOf(installationCodes(m));
        for (int i = 0; i < p.items().size(); i++) {
            assertSameInstallation(p.items().get(i), m.items().get(i));
        }
    }

    @Test
    void filterInstallation_technicianStatusCategoryParity() {
        var f = installationFilter(null, "KTV-001", null, null, null, null, null, null, 1, 100);
        var p = pg.filterInstallation(f);
        var m = mem.filterInstallation(f);
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(1L);
        assertThat(installationCodes(p)).containsExactly("SO-0004");

        var f2 = installationFilter(List.of("REDELIVERY"), null, null, null, null, null, null, null, 1, 100);
        var p2 = pg.filterInstallation(f2);
        var m2 = mem.filterInstallation(f2);
        assertThat(p2.total()).isEqualTo(m2.total()).isEqualTo(1L);
        assertThat(installationCodes(p2)).containsExactly("SO-0008");

        var f3 = installationFilter(null, null, null, List.of("TV"), null, null, null, null, 1, 100);
        var p3 = pg.filterInstallation(f3);
        var m3 = mem.filterInstallation(f3);
        assertThat(p3.total()).isEqualTo(m3.total()).isEqualTo(2L); // SO-0002, SO-0006
        assertThat(installationCodes(p3)).containsExactlyElementsOf(installationCodes(m3));
    }

    @Test
    void filterInstallation_dateFilterExcludesNullExpectedTimeParity() {
        // SO-0003 expectedTime NULL → bị loại khi có date filter (cả 2 impl).
        LocalDate today = LocalDate.now();
        var f = installationFilter(null, null, null, null, null, null, today, today, 1, 100);
        var p = pg.filterInstallation(f);
        var m = mem.filterInstallation(f);
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(7L);
        assertThat(installationCodes(p)).doesNotContain("SO-0003");
        assertThat(installationCodes(p)).containsExactlyElementsOf(installationCodes(m));

        // KHÔNG date filter → SO-0003 có mặt (parity ngược lại đã cover ở test trên).
        var fNoDate = installationFilter(null, "KTV-003", null, null, null, null, null, null, 1, 100);
        assertThat(pg.filterInstallation(fNoDate).total()).isEqualTo(1L); // SO-0006
    }

    @Test
    void findInstallationAndTechnicianParity() {
        var seedIns = seed.installationOrders().get(0);
        var p = pg.findInstallation(seedIns.serviceOrderCode()).orElseThrow();
        var m = mem.findInstallation(seedIns.serviceOrderCode()).orElseThrow();
        assertSameInstallation(p, m);
        assertThat(pg.findInstallation("SO-KHONG-TON-TAI")).isEmpty();

        assertThat(pg.findTechnician("KTV-001")).isEqualTo(mem.findTechnician("KTV-001"));
        assertThat(pg.findTechnician("TV-KHONG-TON-TAI")).isEmpty();
    }

    // ---------------- suggest parity ----------------

    @Test
    void suggestByRegionWorkloadAscParity() {
        var p = pg.suggestTechnicians("R1");
        var m = mem.suggestTechnicians("R1");
        // Seed R1: KTV-001 (SO-0004 PROCESSING active=1), KTV-002 (SO-0005 SHIPPING active=1),
        // KTV-003 (SO-0006 DELIVERED excluded → 0), KTV-004 (0) — sort activeCount asc, seq asc.
        assertThat(p).extracting(s -> s.technician().code())
                .containsExactly("KTV-003", "KTV-004", "KTV-001", "KTV-002");
        assertThat(p).extracting(TechModels.SuggestedTechnician::activeCount)
                .containsExactly(0, 0, 1, 1);
        assertThat(p).usingRecursiveFieldByFieldElementComparator()
                .containsExactlyElementsOf(m);

        var p2 = pg.suggestTechnicians("R2");
        var m2 = mem.suggestTechnicians("R2");
        // CTV-001 (SO-0007 FAILED vẫn active=1), CTV-002 (SO-0008 REDELIVERY active=1) — seq asc.
        assertThat(p2).extracting(s -> s.technician().code()).containsExactly("CTV-001", "CTV-002");
        assertThat(p2).usingRecursiveFieldByFieldElementComparator()
                .containsExactlyElementsOf(m2);

        // Region không có KTV → rỗng cả 2 impl.
        assertThat(pg.suggestTechnicians("R999")).isEmpty();
        assertThat(mem.suggestTechnicians("R999")).isEmpty();
    }

    // ---------------- mutations (restore trong @AfterEach) ----------------

    @Test
    void assignFirstTimeHistoryFromNullParityWithInMemory() {
        Instant t = Instant.now();
        // SO-0001: NEW, chưa assign (technician NULL) → assign được, history from=NULL.
        var pNext = pg.assignTechnician("SO-0001", "KTV-001", null, t);
        var mNext = mem.assignTechnician("SO-0001", "KTV-001", null, t);
        assertThat(pNext.technicianCode()).isEqualTo("KTV-001");
        assertThat(pNext.technicianCode()).isEqualTo(mNext.technicianCode());
        assertThat(pNext.status()).isEqualTo("NEW");

        // DB state thật đã đổi.
        assertThat(jdbc.queryForObject(
                "SELECT technician_code FROM installation_orders WHERE service_order_code = 'SO-0001'",
                String.class)).isEqualTo("KTV-001");

        // History: 1 row, from NULL → KTV-001; changedBy NULL → "fulfillment-service".
        var hist = pg.assignmentHistory("SO-0001");
        assertThat(hist).hasSize(1);
        assertThat(hist.get(0).fromTechnicianCode()).isNull();
        assertThat(hist.get(0).toTechnicianCode()).isEqualTo("KTV-001");
        assertThat(hist.get(0).changedBy()).isEqualTo("fulfillment-service");
        assertThat(hist.get(0).serviceOrderCode()).isEqualTo("SO-0001");
        assertThat(hist.get(0).changedAt().toInstant()).isEqualTo(t);
    }

    @Test
    void assignReassignHistoryFromToOrderedParityWithInMemory() {
        Instant t1 = Instant.now().minusSeconds(60);
        Instant t2 = Instant.now();
        // SO-0008 REDELIVERY (reassignable + assignable) đã có CTV-002 → gán lại KTV-002.
        pg.assignTechnician("SO-0008", "KTV-001", "it-test-1", t1);
        pg.assignTechnician("SO-0008", "KTV-002", "it-test-2", t2);

        var hist = pg.assignmentHistory("SO-0008");
        assertThat(hist).hasSize(2);
        assertThat(hist.get(0).fromTechnicianCode()).isEqualTo("CTV-002");
        assertThat(hist.get(0).toTechnicianCode()).isEqualTo("KTV-001");
        assertThat(hist.get(1).fromTechnicianCode()).isEqualTo("KTV-001");
        assertThat(hist.get(1).toTechnicianCode()).isEqualTo("KTV-002");
        // ORDER BY changed_at ASC, id ASC — entry t1 trước t2.
        assertThat(hist.get(0).changedBy()).isEqualTo("it-test-1");
        assertThat(hist.get(1).changedBy()).isEqualTo("it-test-2");

        // DB state thật: technician_code = lần assign cuối.
        assertThat(jdbc.queryForObject(
                "SELECT technician_code FROM installation_orders WHERE service_order_code = 'SO-0008'",
                String.class)).isEqualTo("KTV-002");

        // Parity in-memory: 2 lần assign tương ứng → cùng from/to.
        mem.assignTechnician("SO-0008", "KTV-001", "it-test-1", t1);
        mem.assignTechnician("SO-0008", "KTV-002", "it-test-2", t2);
        var mHist = mem.assignmentHistory("SO-0008");
        assertThat(mHist).extracting(TechModels.AssignmentHistoryEntry::fromTechnicianCode)
                .containsExactlyElementsOf(hist.stream()
                        .map(TechModels.AssignmentHistoryEntry::fromTechnicianCode).toList());
        assertThat(mHist).extracting(TechModels.AssignmentHistoryEntry::toTechnicianCode)
                .containsExactlyElementsOf(hist.stream()
                        .map(TechModels.AssignmentHistoryEntry::toTechnicianCode).toList());
    }

    @Test
    void assignWrongStatusThrowsIseAndKeepsState() {
        // SO-0006 DELIVERED — không assignable (cả 2 impl cùng ISE).
        assertThatThrownBy(() -> pg.assignTechnician("SO-0006", "KTV-001", "it-test", Instant.now()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("DELIVERED");
        assertThatThrownBy(() -> mem.assignTechnician("SO-0006", "KTV-001", "it-test", Instant.now()))
                .isInstanceOf(IllegalStateException.class);

        // DB không đổi.
        assertThat(jdbc.queryForObject(
                "SELECT technician_code FROM installation_orders WHERE service_order_code = 'SO-0006'",
                String.class)).isEqualTo("KTV-003");
        assertThat(pg.assignmentHistory("SO-0006")).isEmpty();

        // Code lạ → IAE cả 2 impl (khớp in-memory orElseThrow).
        assertThatThrownBy(() -> pg.assignTechnician("SO-KHONG-TON-TAI", "KTV-001", "it-test", Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> pg.assignTechnician("SO-0001", "TV-KHONG-TON-TAI", "it-test", Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
