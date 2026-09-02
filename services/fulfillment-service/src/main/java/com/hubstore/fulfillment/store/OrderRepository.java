package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.v1.ShopAssignmentHistoryEntry;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Store interface (plan Task 2): in-memory là deliverable — interface sạch để
 * cắm DB sau (không thiết kế vượt). Mutations thay thế record bất biến trong list.
 */
public interface OrderRepository {

    /** Filter + pagination nguyên tố (items + total khớp cùng lúc — không race). */
    FilterResult filter(OrderFilter filter);

    Optional<SeedModels.OrderSeed> findByFulfillCode(String fulfillCode);

    /** Hydration (rule 1 §3.6) — trả truth theo đúng thứ tự codes yêu cầu, bỏ code lạ. */
    List<SeedModels.OrderSeed> findByCodes(List<String> fulfillCodes);

    /** MutateOrderStatus (Go gọi): target 0/1/2; target=0 clear batchCode (revert §9). */
    List<SeedModels.OrderSeed> mutateBatchStatus(List<String> fulfillCodes, int targetBatchStatus);

    /** Rule 2 đã validate ở service — repo chỉ mutate + append history entry. */
    SeedModels.OrderSeed assignShopHub(String fulfillCode, SeedModels.ShopAssignmentSeed targetShop,
                                       String changedBy, Instant changedAt);

    SeedModels.OrderSeed updateDeliveryTime(String fulfillCode, SeedModels.TimeRangeSeed deliveryTime);

    SeedModels.OrderSeed updateNote(String fulfillCode, String note);

    /** READ — lịch sử hiện có của đơn (seed history + entries append bởi assignShopHub). */
    List<ShopAssignmentHistoryEntry> getHistory(String fulfillCode);

    List<SeedModels.RegionSeed> regions();

    List<SeedModels.DeliveryStaffSeed> deliveryStaff();

    /** Distinct shopCode từ orders (first-seen order) — backing GET /master-data/shops. */
    List<SeedModels.ShopSeed> distinctShops();

    /** Dashboard aggregate (SF-9): 30 ô theo original_time_from (TZ zone),
     *  totalToday, pendingApproval (order_status=0), per-batch (batch_code ≠ ''). */
    DashboardStatsData dashboardStats(java.time.LocalDate today, java.time.ZoneId zone);

    // ---------------- SF-13 intake ----------------

    /** Sinh fulfillCode ORD-* tiếp dải (atomic per impl); n = số đơn cần sinh. */
    List<String> nextFulfillCodes(int n);

    /** Insert batch đơn (đã gán codes) — all-or-nothing; trả các đơn như đã lưu. */
    List<SeedModels.OrderSeed> insertOrders(List<SeedModels.OrderSeed> orders);

    /** Mark-fail: yêu cầu order tồn tại + chưa FAILED — service validate, repo mutate. */
    SeedModels.OrderSeed markFailed(String fulfillCode, String reason, String note, Instant at);

    /** Tồn tại đơn retry của code? (chặn double-redeliver). */
    boolean hasRetry(String fulfillCode);

    /** Đơn gốc của 1 retry (oldFulfillCode) — chỉ match fulfill_code, KHÔNG dual-match orderCode. */
    Optional<SeedModels.OrderSeed> findByExactFulfillCode(String fulfillCode);

    /** Append 1 dòng activity_log (target = fulfillCode). */
    void appendAudit(String actor, String action, String target, String detailJson);

    /** READ — audit entries của 1 target (fulfillCode), không mutate state. */
    List<AuditEntry> getAudit(String fulfillCode);
}
