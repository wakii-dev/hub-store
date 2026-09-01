package com.hubstore.fulfillment.seed;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Fail-fast seed validation lúc boot (plan Task 2, spec §3.5):
 *   - đủ 5 mảng top-level (Jackson bắt lỗi shape),
 *   - orders ≥25,
 *   - shop 30201 ≥5 đơn batchStatus=0 (Chưa soạn),
 *   - đủ 4 batchStatus 0-3,
 *   - ≥1 isDebtSplittingOrder=true.
 * Sai → IllegalStateException, server KHÔNG boot với seed hỏng.
 * Full validator tham chiếu: api/seed/validate.py (SF-2).
 */
public final class SeedValidator {

    private SeedValidator() {
    }

    public static void assertValid(SeedModels.SeedFile seed) {
        List<String> errors = new ArrayList<>();
        if (seed == null) {
            throw new IllegalStateException("Seed null.");
        }
        if (seed.orders() == null || seed.orders().size() < 25) {
            errors.add("orders cần ≥25, thấy "
                    + (seed.orders() == null ? 0 : seed.orders().size()));
        }
        if (seed.deliveryStaff() == null || seed.deliveryStaff().isEmpty()) {
            errors.add("deliveryStaff rỗng.");
        }
        if (seed.regions() == null || seed.regions().isEmpty()) {
            errors.add("regions rỗng.");
        }
        if (seed.orders() != null) {
            long shop30201NotPrepared = seed.orders().stream()
                    .filter(o -> o.shopAssignment() != null && "30201".equals(o.shopAssignment().shopCode()))
                    .filter(o -> o.batchStatus() == 0)
                    .count();
            if (shop30201NotPrepared < 5) {
                errors.add("shop 30201 cần ≥5 đơn batchStatus=0, thấy " + shop30201NotPrepared);
            }
            Set<Integer> batchStatuses = new HashSet<>();
            boolean hasDebt = false;
            for (SeedModels.OrderSeed o : seed.orders()) {
                batchStatuses.add(o.batchStatus());
                hasDebt |= o.isDebtSplittingOrder();
                if (o.shopAssignment() == null) {
                    errors.add(o.fulfillCode() + ": thiếu shopAssignment.");
                }
            }
            if (!batchStatuses.equals(Set.of(0, 1, 2, 3))) {
                errors.add("batchStatus phải đủ 0-3, thấy " + new ArrayList<>(batchStatuses).stream().sorted().toList());
            }
            if (!hasDebt) {
                errors.add("cần ≥1 isDebtSplittingOrder=true.");
            }
        }
        if (!errors.isEmpty()) {
            throw new IllegalStateException("canonical-seed.json FAIL validation: " + errors);
        }
    }
}
