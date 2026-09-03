package com.hubstore.fulfillment.store;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.function.Predicate;

/**
 * In-memory twin (SF-14, FI-259) — pattern InMemoryOrderRepository: synchronized
 * quanh LinkedHashMap (thứ tự insert ≡ ORDER BY id ASC bên Postgres). Bean do
 * CodRepositoryConfig lo (fulfillment.store=inmemory, test-only).
 *
 * Đơn FAILED thuộc bảng orders (repo khác) — repo này không tự biết: constructor
 * nhận Predicate failedCodes để mirror JOIN orders.fail_reason IS NULL (D7) trên
 * các path batch; mặc định không đơn nào FAILED.
 */
public class InMemoryCodConfirmationRepository implements CodConfirmationRepository {

    /** Key fulfill_code — putIfAbsent ≡ ON CONFLICT DO NOTHING. */
    private final Map<String, CodConfirmation> store = new LinkedHashMap<>();
    private final Predicate<String> failedCodes;

    public InMemoryCodConfirmationRepository() {
        this(code -> false);
    }

    /** Test harness truyền predicate (VD Set::contains) để mirror D7. */
    public InMemoryCodConfirmationRepository(Predicate<String> failedCodes) {
        this.failedCodes = failedCodes;
    }

    @Override
    public synchronized void insertPendingIfAbsent(CodConfirmation c) {
        store.putIfAbsent(c.fulfillCode(), c);
    }

    @Override
    public synchronized List<CodConfirmation> findPendingByBatch(String batchCode) {
        return store.values().stream()
                .filter(c -> c.status() == CodConfirmation.STATUS_PENDING
                        && Objects.equals(c.batchCode(), batchCode)
                        && !failedCodes.test(c.fulfillCode()))
                .toList();
    }

    @Override
    public synchronized int confirmBatch(String batchCode, String collectedBy, Instant collectedAt) {
        int updated = 0;
        for (Map.Entry<String, CodConfirmation> e : store.entrySet()) {
            CodConfirmation c = e.getValue();
            if (c.status() == CodConfirmation.STATUS_PENDING
                    && Objects.equals(c.batchCode(), batchCode)
                    && !failedCodes.test(c.fulfillCode())) {
                e.setValue(withCollected(c, c.expectedAmount(), collectedBy, collectedAt));
                updated++;
            }
        }
        return updated;
    }

    @Override
    public synchronized Optional<CodConfirmation> findByFulfillCode(String fulfillCode) {
        return Optional.ofNullable(store.get(fulfillCode));
    }

    @Override
    public synchronized int confirmOne(String fulfillCode, Long collectedAmount,
            String collectedBy, Instant collectedAt) {
        CodConfirmation c = store.get(fulfillCode);
        if (c == null) {
            return 0;
        }
        // D3: last-write-wins — không đụng status hiện tại (re-confirm được).
        long collected = collectedAmount == null ? c.expectedAmount() : collectedAmount;
        store.put(fulfillCode, withCollected(c, collected, collectedBy, collectedAt));
        return 1;
    }

    @Override
    public synchronized int deletePendingByFulfillCodes(List<String> fulfillCodes) {
        int deleted = 0;
        for (String code : fulfillCodes == null ? List.<String>of() : fulfillCodes) {
            CodConfirmation c = store.get(code);
            if (c != null && c.status() == CodConfirmation.STATUS_PENDING) {
                store.remove(code);
                deleted++;
            }
        }
        return deleted;
    }

    @Override
    public synchronized List<SettlementShopRow> aggregate(Instant from, Instant to) {
        // GROUP BY shop_code, shop_name — key ghép; TreeMap để ra thứ tự shop_code ASC
        // (≡ ORDER BY c.shop_code bên SQL).
        Map<String, long[]> agg = new TreeMap<>();
        Map<String, String> names = new java.util.HashMap<>();
        for (CodConfirmation c : store.values()) {
            if (failedCodes.test(c.fulfillCode()) || !inPeriod(c, from, to)) {
                continue;
            }
            String key = c.shopCode() + "\u0000" + c.shopName();
            long[] a = agg.computeIfAbsent(key, k -> new long[6]);
            long collected = c.collectedAmount() == null ? 0L : c.collectedAmount();
            a[0]++;                          // total_orders
            a[1] += c.expectedAmount();      // total_expected
            a[2] += collected;               // total_collected
            a[3] += c.expectedAmount() - collected; // diff
            if (c.status() == CodConfirmation.STATUS_PENDING) {
                a[4]++;                      // pending_count
            }
            if (c.status() == CodConfirmation.STATUS_CONFIRMED && collected != c.expectedAmount()) {
                a[5]++;                      // mismatch_count
            }
            names.putIfAbsent(key, c.shopName());
        }
        List<SettlementShopRow> rows = new ArrayList<>();
        for (Map.Entry<String, long[]> e : agg.entrySet()) {
            String key = e.getKey();
            long[] a = e.getValue();
            rows.add(new SettlementShopRow(key.split("\u0000", 2)[0], names.get(key),
                    a[0], a[1], a[2], a[3], (int) a[4], (int) a[5]));
        }
        return rows;
    }

    @Override
    public synchronized List<CodConfirmation> detail(String shopCode, Instant from, Instant to,
            boolean onlyMismatch) {
        return store.values().stream()
                .filter(c -> !failedCodes.test(c.fulfillCode()))
                .filter(c -> inPeriod(c, from, to))
                .filter(c -> shopCode == null || shopCode.isBlank()
                        || shopCode.equals(c.shopCode()))
                // SQL: collected NULL <> expected → NULL (không match) — mirror bằng null-guard.
                .filter(c -> !onlyMismatch || c.status() == CodConfirmation.STATUS_PENDING
                        || (c.status() == CodConfirmation.STATUS_CONFIRMED
                                && c.collectedAmount() != null
                                && c.collectedAmount() != c.expectedAmount()))
                .toList();
    }

    // ---------------- helpers ----------------

    /** Bản CONFIRMED với collected/by/at mới — giữ nguyên snapshot còn lại. */
    private static CodConfirmation withCollected(CodConfirmation c, long collected,
            String collectedBy, Instant collectedAt) {
        return new CodConfirmation(c.fulfillCode(), c.batchCode(), c.shopCode(), c.shopName(),
                c.expectedAmount(), collected, collectedBy, collectedAt, c.completedAt(),
                CodConfirmation.STATUS_CONFIRMED);
    }

    /** Kỳ [from, to) trên completed_at — mirror SQL completed_at >= ? AND completed_at < ?. */
    private static boolean inPeriod(CodConfirmation c, Instant from, Instant to) {
        Instant at = c.completedAt();
        if (at == null) {
            return false;
        }
        return (from == null || !at.isBefore(from)) && (to == null || at.isBefore(to));
    }
}
