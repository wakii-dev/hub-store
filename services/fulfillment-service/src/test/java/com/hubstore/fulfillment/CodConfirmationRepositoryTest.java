package com.hubstore.fulfillment;

import com.hubstore.fulfillment.store.CodConfirmation;
import com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository;
import com.hubstore.fulfillment.store.SettlementShopRow;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test InMemoryCodConfirmationRepository (SF-14, FI-259) — chạy KHÔNG DB
 * (convention SF-2). Semantics phải khớp PostgresCodConfirmationRepository:
 * insertPendingIfAbsent idempotent (first-wins), confirmBatch chỉ touch PENDING
 * + loại đơn FAILED (D7), confirmOne null→expected / 0L→0 / last-write-wins (D3),
 * deletePendingByFulfillCodes giữ CONFIRMED (D8), aggregate GROUP BY shop +
 * fail filter (D7), detail onlyMismatch.
 */
class CodConfirmationRepositoryTest {

    private static final Instant T0 = Instant.parse("2026-09-01T03:00:00Z"); // 10:00 +07:00
    private static final Instant T1 = Instant.parse("2026-09-02T03:00:00Z");
    private static final Instant FROM = Instant.parse("2026-09-01T00:00:00Z");
    private static final Instant TO = Instant.parse("2026-09-03T00:00:00Z");

    private static CodConfirmation pending(String fulfillCode, String batchCode, String shopCode,
            String shopName, long expected, Instant completedAt) {
        return new CodConfirmation(fulfillCode, batchCode, shopCode, shopName,
                expected, null, null, null, completedAt, CodConfirmation.STATUS_PENDING);
    }

    // ---------------- insertPendingIfAbsent ----------------

    @Test
    void insertPendingIfAbsentIsIdempotentFirstWins() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        // Trùng fulfill_code — DO NOTHING, KHÔNG ghi đè (mirror ON CONFLICT DO NOTHING).
        repo.insertPendingIfAbsent(pending("ORD-1", "B2", "S9", "Shop Chín", 999, T1));

        var found = repo.findByFulfillCode("ORD-1").orElseThrow();
        assertThat(found.batchCode()).isEqualTo("B1");
        assertThat(found.shopCode()).isEqualTo("S1");
        assertThat(found.expectedAmount()).isEqualTo(5000L);
        assertThat(found.completedAt()).isEqualTo(T0);
        assertThat(found.status()).isZero();
        assertThat(found.collectedAmount()).isNull();
    }

    // ---------------- confirmBatch ----------------

    @Test
    void confirmBatchOnlyTouchesPending() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        // ORD-2 cùng batch nhưng đã CONFIRMED (thu tay 1000 trước đó) — bulk KHÔNG đụng.
        repo.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 2000, T0));
        repo.confirmOne("ORD-2", 1000L, "nv1", T0);

        int updated = repo.confirmBatch("B1", "nv2", T1);
        assertThat(updated).isEqualTo(1); // chỉ ORD-1 (ORD-2 đã CONFIRMED trước đó)

        var p = repo.findByFulfillCode("ORD-1").orElseThrow();
        assertThat(p.status()).isEqualTo(CodConfirmation.STATUS_CONFIRMED);
        assertThat(p.collectedAmount()).isEqualTo(5000L); // collected = expected
        assertThat(p.collectedBy()).isEqualTo("nv2");
        assertThat(p.collectedAt()).isEqualTo(T1);

        var c = repo.findByFulfillCode("ORD-2").orElseThrow();
        assertThat(c.collectedAmount()).isEqualTo(1000L); // giữ giá trị thu cũ
        assertThat(c.collectedBy()).isEqualTo("nv1");
    }

    @Test
    void confirmBatchSkipsFailedOrdersD7() {
        // Mirror JOIN orders.fail_reason IS NULL: ORD-1 coi như FAILED.
        var failed = Set.of("ORD-1");
        var repo = new InMemoryCodConfirmationRepository(failed::contains);
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        repo.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 3000, T0));

        assertThat(repo.findPendingByBatch("B1"))
                .extracting(CodConfirmation::fulfillCode)
                .containsExactly("ORD-2");

        assertThat(repo.confirmBatch("B1", "nv", T1)).isEqualTo(1);
        assertThat(repo.findByFulfillCode("ORD-1").orElseThrow().status()).isZero(); // FAILED không đụng
        assertThat(repo.findByFulfillCode("ORD-2").orElseThrow().status())
                .isEqualTo(CodConfirmation.STATUS_CONFIRMED);
    }

    // ---------------- confirmOne ----------------

    @Test
    void confirmOneNullCollectedUsesExpected() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));

        assertThat(repo.confirmOne("ORD-1", null, "nv", T1)).isEqualTo(1);
        var c = repo.findByFulfillCode("ORD-1").orElseThrow();
        assertThat(c.collectedAmount()).isEqualTo(5000L);
        assertThat(c.status()).isEqualTo(CodConfirmation.STATUS_CONFIRMED);
    }

    @Test
    void confirmOneZeroIsRealZeroNotExpected() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));

        assertThat(repo.confirmOne("ORD-1", 0L, "nv", T1)).isEqualTo(1);
        // 0 VND là case lệch tiền thật (KH không trả) — KHÔNG thay bằng expected (D3).
        assertThat(repo.findByFulfillCode("ORD-1").orElseThrow().collectedAmount()).isZero();
    }

    @Test
    void confirmOneLastWriteWinsOnConfirmed() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        repo.confirmOne("ORD-1", 5000L, "nv1", T0);

        // Re-confirm đơn CONFIRMED (D3): UPDATE, không duplicate, không lỗi.
        assertThat(repo.confirmOne("ORD-1", 4000L, "nv2", T1)).isEqualTo(1);
        var c = repo.findByFulfillCode("ORD-1").orElseThrow();
        assertThat(c.collectedAmount()).isEqualTo(4000L);
        assertThat(c.collectedBy()).isEqualTo("nv2");
        assertThat(c.collectedAt()).isEqualTo(T1);
    }

    @Test
    void confirmOneUnknownCodeReturnsZero() {
        var repo = new InMemoryCodConfirmationRepository();
        assertThat(repo.confirmOne("ORD-KHONG-TON-TAI", null, "nv", T1)).isZero();
    }

    // ---------------- deletePendingByFulfillCodes (D8) ----------------

    @Test
    void deletePendingKeepsConfirmed() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        repo.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 3000, T0));
        repo.confirmOne("ORD-2", null, "nv", T1); // ORD-2 giờ CONFIRMED

        assertThat(repo.deletePendingByFulfillCodes(List.of("ORD-1", "ORD-2"))).isEqualTo(1);
        assertThat(repo.findByFulfillCode("ORD-1")).isEmpty(); // PENDING bị xóa (revert)
        assertThat(repo.findByFulfillCode("ORD-2")).isPresent(); // CONFIRMED giữ (lịch sử)
    }

    // ---------------- aggregate ----------------

    @Test
    void aggregateGroupsByShopAndFiltersFailedD7() {
        var repo = new InMemoryCodConfirmationRepository(Set.of("ORD-FAIL")::contains);
        // S1: 1 confirmed khớp + 1 pending.
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        repo.confirmOne("ORD-1", 5000L, "nv", T1);
        repo.insertPendingIfAbsent(pending("ORD-2", "B1", "S1", "Shop Một", 3000, T0));
        // S2: 1 confirmed LỆCH (thu 3500 / kỳ vọng 4000).
        repo.insertPendingIfAbsent(pending("ORD-3", "B1", "S2", "Shop Hai", 4000, T0));
        repo.confirmOne("ORD-3", 3500L, "nv", T1);
        // S3: đơn FAILED — loại khỏi aggregate (D7).
        repo.insertPendingIfAbsent(pending("ORD-FAIL", "B1", "S3", "Shop Ba", 9000, T0));

        List<SettlementShopRow> rows = repo.aggregate(FROM, TO);
        assertThat(rows).extracting(SettlementShopRow::shopCode).containsExactly("S1", "S2");

        var s1 = rows.get(0);
        assertThat(s1.shopName()).isEqualTo("Shop Một");
        assertThat(s1.totalOrders()).isEqualTo(2);
        assertThat(s1.totalExpected()).isEqualTo(8000L);
        assertThat(s1.totalCollected()).isEqualTo(5000L);
        assertThat(s1.diffAmount()).isEqualTo(3000L); // pending thiếu 3000
        assertThat(s1.pendingCount()).isEqualTo(1);
        assertThat(s1.mismatchCount()).isZero();

        var s2 = rows.get(1);
        assertThat(s2.totalOrders()).isEqualTo(1);
        assertThat(s2.totalCollected()).isEqualTo(3500L);
        assertThat(s2.diffAmount()).isEqualTo(500L);
        assertThat(s2.pendingCount()).isZero();
        assertThat(s2.mismatchCount()).isEqualTo(1); // đã confirm nhưng lệch tiền
    }

    @Test
    void aggregateFiltersByPeriod() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-IN", "B1", "S1", "Shop Một", 1000, T0));
        repo.insertPendingIfAbsent(pending("ORD-OUT", "B2", "S2", "Shop Hai", 2000,
                Instant.parse("2026-08-01T00:00:00Z"))); // ngoài kỳ

        List<SettlementShopRow> rows = repo.aggregate(FROM, TO);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).shopCode()).isEqualTo("S1");
    }

    // ---------------- detail ----------------

    @Test
    void detailOnlyMismatchFilterAndShopScope() {
        var repo = new InMemoryCodConfirmationRepository(Set.of("ORD-FAIL")::contains);
        repo.insertPendingIfAbsent(pending("ORD-PENDING", "B1", "S1", "Shop Một", 5000, T0));   // mismatch (chưa thu)
        repo.insertPendingIfAbsent(pending("ORD-OK", "B1", "S1", "Shop Một", 3000, T0));
        repo.confirmOne("ORD-OK", 3000L, "nv", T1);                                              // khớp — không mismatch
        repo.insertPendingIfAbsent(pending("ORD-LECH", "B1", "S2", "Shop Hai", 4000, T0));
        repo.confirmOne("ORD-LECH", 1000L, "nv", T1);                                            // lệch
        repo.insertPendingIfAbsent(pending("ORD-FAIL", "B1", "S1", "Shop Một", 9000, T0));       // FAILED — loại (D7)

        // onlyMismatch: pending + lệch; FAILED loại.
        var mismatch = repo.detail(null, FROM, TO, true);
        assertThat(mismatch).extracting(CodConfirmation::fulfillCode)
                .containsExactly("ORD-PENDING", "ORD-LECH");

        // Không filter: đủ 3 (FAILED loại).
        var all = repo.detail(null, FROM, TO, false);
        assertThat(all).extracting(CodConfirmation::fulfillCode)
                .containsExactly("ORD-PENDING", "ORD-OK", "ORD-LECH");

        // Scope shop.
        var s1 = repo.detail("S1", FROM, TO, false);
        assertThat(s1).extracting(CodConfirmation::fulfillCode)
                .containsExactly("ORD-PENDING", "ORD-OK");

        // Kỳ ngoài — rỗng.
        assertThat(repo.detail(null, Instant.parse("2026-08-01T00:00:00Z"),
                Instant.parse("2026-08-02T00:00:00Z"), false)).isEmpty();
    }

    // ---------------- findPendingByBatch ----------------

    @Test
    void findPendingByBatchReturnsOnlyPendingOfBatch() {
        var repo = new InMemoryCodConfirmationRepository();
        repo.insertPendingIfAbsent(pending("ORD-1", "B1", "S1", "Shop Một", 5000, T0));
        repo.insertPendingIfAbsent(pending("ORD-2", "B2", "S1", "Shop Một", 3000, T0)); // batch khác
        repo.insertPendingIfAbsent(pending("ORD-3", "B1", "S2", "Shop Hai", 4000, T0));
        repo.confirmOne("ORD-3", null, "nv", T1); // đã confirm — không còn pending

        var pending = repo.findPendingByBatch("B1");
        assertThat(pending).extracting(CodConfirmation::fulfillCode).containsExactly("ORD-1");
    }
}
