package com.hubstore.fulfillment.store;

/**
 * 1 dòng aggregate đối soát theo shop (SF-14, FI-259) — GROUP BY shop_code,
 * shop_name theo kỳ. diff = expected − COALESCE(collected, 0); pending = còn
 * status=0; mismatch = đã confirm (status=1) nhưng collected ≠ expected.
 */
public record SettlementShopRow(String shopCode, String shopName,
        long totalOrders, long totalExpected, long totalCollected, long diffAmount,
        int pendingCount, int mismatchCount) {
}
