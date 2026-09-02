package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.store.OrderFilter;
import com.hubstore.fulfillment.store.PostgresOrderRepository;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.abort;

/**
 * INTEGRATION TEST — CHẠY KHI POSTGRES CÓ SẴN (KHÔNG testcontainers).
 *
 * Chạy thủ công:  mvn test -Dtest=PostgresOrderRepositoryIT
 * (cần: docker compose up -d postgres orders-migrate && bash scripts/seed-db.sh)
 *
 * `mvn test` mặc định KHÔNG chạy file này (surefire chỉ include *Test.java,
 * không *IT.java) — unit test không cần DB.
 *
 * Skip-if-no-DB: @BeforeAll thử connect qua FULFILLMENT_DB_* env (default
 * localhost:5432/fulfillment, user hubstore, password qua FULFILLMENT_DB_PASSWORD
 * hoặc POSTGRES_PASSWORD). Không kết nối được / chưa migrate / chưa seed → abort
 * (skip, không fail CI).
 *
 * Parity: so PostgresOrderRepository với InMemoryOrderRepository cùng load
 * canonical-seed.json. Mutating tests (mutateBatchStatus, assignShopHub) RESTORE
 * đúng state cũ trong @AfterEach — không phá seed state.
 */
class PostgresOrderRepositoryIT {

    private static JdbcTemplate jdbc;
    private static PostgresOrderRepository pg;
    private static SeedModels.SeedFile seed;
    private static InMemoryOrderRepository mem;

    // Region test chứa đặc tự LIKE (% _ \) — INSERT trong @BeforeAll, DELETE @AfterAll.
    private static final String ESCAPE_REGION_CODE = "ZZTEST-ESC";
    private static final String ESCAPE_REGION_NAME = "Quận%Giấy_\\";

    // State snapshot trước mutate/assign — restore trong @AfterEach (KHÔNG phá seed).
    private static final String MUTATE_CODE = "ORD-3007"; // seed: batchStatus=1, batchCode=BATCH-0001
    private static final String ASSIGN_CODE = "ORD-3001";
    private static int savedBatchStatus;
    private static String savedBatchCode;
    private static String savedShopCode;
    private static String savedShopName;
    private static String savedShopAddress;
    private static long savedMaxHistoryId;
    private static int savedHistoryCount;

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
        Integer orderCount = jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class);
        if (orderCount == null || orderCount == 0 || countCode("ORD-3001") == 0) {
            abort("seed rỗng — bỏ qua integration test. Chạy: bash scripts/seed-db.sh");
        }
        pg = new PostgresOrderRepository(jdbc);
        seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        mem = new InMemoryOrderRepository(seed);
        insertEscapeRegion();
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

    private static int countCode(String code) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM orders WHERE fulfill_code = ? OR order_code = ?", Integer.class, code, code);
        return n == null ? 0 : n;
    }

    private static void insertEscapeRegion() {
        jdbc.update("INSERT INTO regions (code, name, type) VALUES (?, ?, 'ward') "
                        + "ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name",
                ESCAPE_REGION_CODE, ESCAPE_REGION_NAME);
    }

    private static void snapshotSeedState() {
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT batch_status, batch_code FROM orders WHERE fulfill_code = ?", MUTATE_CODE);
        savedBatchStatus = ((Number) row.get("batch_status")).intValue();
        savedBatchCode = (String) row.get("batch_code");
        Map<String, Object> shop = jdbc.queryForMap(
                "SELECT shop_code, shop_name, shop_address FROM orders WHERE fulfill_code = ?", ASSIGN_CODE);
        savedShopCode = (String) shop.get("shop_code");
        savedShopName = (String) shop.get("shop_name");
        savedShopAddress = (String) shop.get("shop_address");
        Long maxId = jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM shop_assignment_history", Long.class);
        savedMaxHistoryId = maxId == null ? 0 : maxId;
        Integer hist = jdbc.queryForObject(
                "SELECT count(*) FROM shop_assignment_history WHERE fulfill_code = ?", Integer.class, ASSIGN_CODE);
        savedHistoryCount = hist == null ? 0 : hist;
    }

    @AfterAll
    static void cleanup() {
        if (jdbc != null) {
            jdbc.update("DELETE FROM regions WHERE code = ?", ESCAPE_REGION_CODE);
        }
    }

    @AfterEach
    void restoreSeedState() {
        if (jdbc == null) {
            return; // skip @BeforeAll — không có gì để restore
        }
        jdbc.update("UPDATE orders SET batch_status = ?, batch_code = ? WHERE fulfill_code = ?",
                savedBatchStatus, savedBatchCode, MUTATE_CODE);
        jdbc.update("UPDATE orders SET shop_code = ?, shop_name = ?, shop_address = ? WHERE fulfill_code = ?",
                savedShopCode, savedShopName, savedShopAddress, ASSIGN_CODE);
        jdbc.update("DELETE FROM shop_assignment_history WHERE fulfill_code = ? AND id > ?",
                ASSIGN_CODE, savedMaxHistoryId);
    }

    // ---------------- helpers ----------------

    private static OrderFilter filter(String fulfillCode, Set<Integer> batchStatuses,
                                      Set<String> regionCodes, Set<String> shopCodes,
                                      int page, int pageSize) {
        return new OrderFilter(fulfillCode, batchStatuses, null, regionCodes, shopCodes,
                Set.of(), null, null, Set.of(), page, pageSize);
    }

    /** So parity 2 records bỏ qua time-format khác (DB ISO-UTC vs seed +07:00). */
    private static void assertSameOrder(SeedModels.OrderSeed a, SeedModels.OrderSeed b) {
        assertThat(a.fulfillCode()).isEqualTo(b.fulfillCode());
        assertThat(a.orderCode()).isEqualTo(b.orderCode());
        assertThat(a.batchStatus()).isEqualTo(b.batchStatus());
        assertThat(a.batchCode()).isEqualTo(b.batchCode());
        assertThat(a.orderStatus()).isEqualTo(b.orderStatus());
        assertThat(a.codAmount()).isEqualTo(b.codAmount());
        assertThat(a.totalQuantity()).isEqualTo(b.totalQuantity());
        assertThat(a.isDebtSplittingOrder()).isEqualTo(b.isDebtSplittingOrder());
        assertThat(a.customerAddress()).isEqualTo(b.customerAddress());
        assertThat(a.distance()).isEqualTo(b.distance());
        assertThat(a.note()).isEqualTo(b.note());
        if (a.shopAssignment() == null) {
            assertThat(b.shopAssignment()).isNull();
        } else {
            assertThat(b.shopAssignment()).isNotNull();
            assertThat(a.shopAssignment().shopCode()).isEqualTo(b.shopAssignment().shopCode());
            assertThat(a.shopAssignment().shopName()).isEqualTo(b.shopAssignment().shopName());
            assertThat(a.shopAssignment().address()).isEqualTo(b.shopAssignment().address());
        }
        assertThat(a.items()).extracting(SeedModels.ProductSeed::productCode)
                .isEqualTo(b.items().stream().map(SeedModels.ProductSeed::productCode).toList());
    }

    private static List<String> codes(List<SeedModels.OrderSeed> orders) {
        return orders.stream().map(SeedModels.OrderSeed::fulfillCode).toList();
    }

    // ---------------- reads parity ----------------

    @Test
    void allFilterParityWithInMemory() {
        var p = pg.filter(filter(null, Set.of(), Set.of(), Set.of(), 1, 100));
        var m = mem.filter(filter(null, Set.of(), Set.of(), Set.of(), 1, 100));
        assertThat(p.total()).isEqualTo(m.total()).isEqualTo(seed.orders().size());
        assertThat(codes(p.items())).containsExactlyElementsOf(codes(m.items()));
    }

    @Test
    void searchAndMultiBatchStatusParity() {
        var f = filter("ORD-30", Set.of(0, 1), Set.of(), Set.of(), 1, 100);
        var p = pg.filter(f);
        var m = mem.filter(f);
        assertThat(p.total()).isEqualTo(m.total());
        assertThat(codes(p.items())).containsExactlyElementsOf(codes(m.items()));
    }

    @Test
    void paginationSlicesWithStableWindowTotal() {
        var page1 = pg.filter(filter(null, Set.of(), Set.of(), Set.of(), 1, 10));
        var page2 = pg.filter(filter(null, Set.of(), Set.of(), Set.of(), 2, 10));
        var memPage1 = mem.filter(filter(null, Set.of(), Set.of(), Set.of(), 1, 10));
        var memPage2 = mem.filter(filter(null, Set.of(), Set.of(), Set.of(), 2, 10));

        // Slice đúng — khớp in-memory từng trang.
        assertThat(codes(page1.items())).containsExactlyElementsOf(codes(memPage1.items()));
        assertThat(codes(page2.items())).containsExactlyElementsOf(codes(memPage2.items()));
        assertThat(page1.items()).hasSize(10);
        assertThat(page2.items()).hasSize(10);
        assertThat(codes(page1.items())).doesNotContainAnyElementsOf(codes(page2.items()));
        // Total đồng nhất giữa 2 page (COUNT(*) OVER() — window count, không phải count trang).
        assertThat(page1.total()).isEqualTo(page2.total());
    }

    @Test
    void findByFulfillCodeDualMatchOrdAndRsa() {
        SeedModels.OrderSeed seedOrder = seed.orders().get(0);
        for (String code : List.of(seedOrder.fulfillCode(), seedOrder.orderCode())) {
            var p = pg.findByFulfillCode(code).orElseThrow();
            var m = mem.findByFulfillCode(code).orElseThrow();
            assertSameOrder(p, m);
        }
        assertThat(pg.findByFulfillCode("ORD-KHONG-TON-TAI")).isEmpty();
    }

    @Test
    void findByCodesPreservesRequestedOrderAndSkipsUnknown() {
        List<String> req = List.of("ORD-KHONG-TON-TAI",
                seed.orders().get(3).fulfillCode(),
                seed.orders().get(0).orderCode(), // RSA code — resolve theo orderCode
                seed.orders().get(0).fulfillCode());
        var p = pg.findByCodes(req);
        var m = mem.findByCodes(req);
        assertThat(codes(p)).containsExactlyElementsOf(codes(m));
        // Thứ tự theo yêu cầu, code lạ bỏ, ORD-3001 khớp cả RSA lẫn ORD → 2 entries.
        assertThat(codes(p)).containsExactly(
                seed.orders().get(3).fulfillCode(),
                seed.orders().get(0).fulfillCode(),
                seed.orders().get(0).fulfillCode());
    }

    @Test
    void regionLikeEscapeDoesNotTreatWildcards() {
        // Region test tên chứa % _ \ — nếu escape hỏng, '%'/'_' thành wildcard khớp
        // địa chỉ thật (seed có 7 đơn chứa "Quận") → total > 0. Escape đúng → literal
        // "Quận%Giấy_\" không có trong địa chỉ nào → 0. In-memory cũng 0 (region test
        // không có trong seed của nó) — parity.
        var p = pg.filter(filter(null, Set.of(), Set.of(ESCAPE_REGION_CODE), Set.of(), 1, 100));
        var m = mem.filter(filter(null, Set.of(), Set.of(ESCAPE_REGION_CODE), Set.of(), 1, 100));
        assertThat(p.total()).isEqualTo(0);
        assertThat(m.total()).isEqualTo(0);
        // Positive control: region seed '0101' (Quận Cầu Giấy) — parity kết quả thật.
        var p2 = pg.filter(filter(null, Set.of(), Set.of("0101"), Set.of(), 1, 100));
        var m2 = mem.filter(filter(null, Set.of(), Set.of("0101"), Set.of(), 1, 100));
        assertThat(p2.total()).isEqualTo(m2.total());
        assertThat(codes(p2.items())).containsExactlyElementsOf(codes(m2.items()));
    }

    @Test
    void distinctShopsMatchesInMemorySortedCodes() {
        List<String> p = pg.distinctShops().stream().map(SeedModels.ShopSeed::code).toList();
        List<String> m = mem.distinctShops().stream().map(SeedModels.ShopSeed::code)
                .sorted(Comparator.naturalOrder()).toList();
        assertThat(p).containsExactlyElementsOf(m);
    }

    // ---------------- mutations (restore trong @AfterEach) ----------------

    @Test
    void mutateBatchStatusUpdatesDbRowAndClearsBatchCodeOnZero() {
        // Pre-condition seed: ORD-3007 in-batch (batchStatus=1, batchCode=BATCH-0001).
        assertThat(savedBatchStatus).isEqualTo(1);
        assertThat(savedBatchCode).isEqualTo("BATCH-0001");

        List<SeedModels.OrderSeed> updated = pg.mutateBatchStatus(List.of(MUTATE_CODE, "ORD-KHONG-TON-TAI"), 0);
        assertThat(updated).hasSize(1); // code lạ skip
        assertThat(updated.get(0).fulfillCode()).isEqualTo(MUTATE_CODE);

        // DB state thật đã đổi: batch_status=0 VÀ batch_code cleared (revert §9).
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT batch_status, batch_code FROM orders WHERE fulfill_code = ?", MUTATE_CODE);
        assertThat(((Number) row.get("batch_status")).intValue()).isEqualTo(0);
        assertThat(row.get("batch_code")).isNull();

        // Persist — đọc lại qua repo.
        assertThat(pg.findByFulfillCode(MUTATE_CODE).orElseThrow().batchStatus()).isEqualTo(0);
        assertThat(pg.findByFulfillCode(MUTATE_CODE).orElseThrow().batchCode()).isNull();
    }

    @Test
    void assignShopHubUpdatesShopAndAppendsOrderedHistory() {
        SeedModels.ShopSeed target = pg.distinctShops().stream()
                .filter(s -> !s.code().equals(savedShopCode))
                .findFirst().orElseThrow();
        Instant t1 = Instant.now().minusSeconds(60);
        Instant t2 = Instant.now();

        SeedModels.OrderSeed after1 = pg.assignShopHub(ASSIGN_CODE,
                new SeedModels.ShopAssignmentSeed(target.code(), target.name(), target.address()),
                "it-test", t1);
        assertThat(after1.shopAssignment().shopCode()).isEqualTo(target.code());
        SeedModels.OrderSeed after2 = pg.assignShopHub(ASSIGN_CODE,
                new SeedModels.ShopAssignmentSeed(target.code(), target.name(), target.address()),
                "it-test-2", t2);
        assertThat(after2.shopAssignment().shopCode()).isEqualTo(target.code());

        // History +2 entries so với seed, ORDER BY occurred_at ASC — 2 entry mới cuối, đúng thứ tự.
        var hist = pg.getHistory(ASSIGN_CODE);
        assertThat(hist).hasSize(savedHistoryCount + 2);
        assertThat(hist.get(hist.size() - 2).getChangedBy()).isEqualTo("it-test");
        assertThat(hist.get(hist.size() - 1).getChangedBy()).isEqualTo("it-test-2");
        // FK canonical code — ORD- (assign với ORD-code).
        assertThat(hist.get(hist.size() - 1).getFulfillCode()).isEqualTo(ASSIGN_CODE);
    }
}
