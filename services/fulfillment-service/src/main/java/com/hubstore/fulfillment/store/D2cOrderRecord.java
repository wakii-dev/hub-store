package com.hubstore.fulfillment.store;

import java.time.Instant;

/**
 * 19 fields khớp proto D2cOrder (SF-18, FI-263) — domain record tách khỏi proto.
 * Timestamps proto → Instant; nullable DB columns → null (note mặc định "").
 */
public record D2cOrderRecord(
        String orderCode,
        String orderIdInter,
        String deliveryId,
        String carrier,
        String shop,
        String exportEmployee,
        Instant exportTime,
        Instant pushTime,
        String receiverName,
        String receiverPhone,
        String receiverAddress,
        String serviceType,
        String productCategory,
        String productType,
        boolean isDebtSplitting,
        String note,
        String status,
        Instant createdAt,
        long id) {
}
