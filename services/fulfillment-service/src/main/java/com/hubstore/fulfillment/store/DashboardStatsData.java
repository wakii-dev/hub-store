package com.hubstore.fulfillment.store;

import java.util.List;

/**
 * Aggregate dashboard (SF-9, FI-245) — kết quả thuần fulfillment DB, BFF merge
 * với phiếu (batching) phía trên. ordersPerDay đủ 30 ô cũ→mới (ngày thiếu = 0,
 * TZ do caller truyền — Asia/Ho_Chi_Minh); ordersPerBatch chỉ đơn ĐÃ vào phiếu
 * (batch_code khác rỗng).
 */
public record DashboardStatsData(List<DayCount> ordersPerDay, int totalToday,
        int pendingApproval, List<BatchCount> ordersPerBatch) {
    public record DayCount(String date, int count) {}
    public record BatchCount(String batchCode, int count) {}
}
