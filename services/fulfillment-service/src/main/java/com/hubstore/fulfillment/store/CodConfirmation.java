package com.hubstore.fulfillment.store;

import java.time.Instant;

/**
 * 1 dòng COD confirmation (SF-14, FI-259) — mirror bảng cod_confirmations (V3).
 * Snapshot pattern: expected_amount/shop_name chụp lúc hoàn tất phiếu — đối soát
 * tính trên snapshot, không đọc lại orders (cod_amount có thể đổi sau, không có path).
 *
 * @param collectedAmount null khi PENDING; CONFIRMED là số tiền thu thật (0 = thu
 *                        thật 0 đồng — KHÔNG dùng null thay 0, D3)
 * @param completedAt     anchor kỳ đối soát (lúc hoàn tất phiếu)
 * @param status          0 = PENDING, 1 = CONFIRMED (mirror enum CodCollectionStatus)
 */
public record CodConfirmation(String fulfillCode, String batchCode, String shopCode, String shopName,
        long expectedAmount, Long collectedAmount, String collectedBy,
        Instant collectedAt, Instant completedAt, int status) {

    public static final int STATUS_PENDING = 0;
    public static final int STATUS_CONFIRMED = 1;
}
