package com.hubstore.fulfillment.store;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * SF-14 (FI-259): store COD confirmations — interface pattern OrderRepository
 * (Postgres + InMemory twin; bean wiring do CodRepositoryConfig lo, repo KHÔNG stereotype).
 *
 * D7 (spec): mọi path đọc/ghi THEO BATCH (findPendingByBatch/confirmBatch/
 * aggregate/detail) phải lọc đơn FAILED — Postgres JOIN orders.fail_reason IS NULL;
 * confirm 1 đơn (confirmOne) KHÔNG lọc (D7 liệt kê tường minh các path batch).
 */
public interface CodConfirmationRepository {

    /** Chèn row PENDING — trùng fulfill_code bỏ qua im lặng (ON CONFLICT DO NOTHING / putIfAbsent). */
    void insertPendingIfAbsent(CodConfirmation c);

    /** PENDING của batch — loại đơn FAILED (D7). */
    List<CodConfirmation> findPendingByBatch(String batchCode);

    /**
     * Bulk confirm PENDING của batch: status→CONFIRMED, collected = expected.
     * Trả số row cập nhật. Chỉ đụng PENDING — row CONFIRMED giữ nguyên giá trị
     * collected cũ (khác confirmOne last-write-wins).
     */
    int confirmBatch(String batchCode, String collectedBy, Instant collectedAt);

    Optional<CodConfirmation> findByFulfillCode(String fulfillCode);

    /**
     * Confirm 1 đơn (D3): last-write-wins — re-confirm đơn CONFIRMED được (UPDATE,
     * không 422). collectedAmount null = lấy expected; 0L = thu thật 0 đồng.
     * Trả 1 nếu tồn tại, 0 nếu không.
     */
    int confirmOne(String fulfillCode, Long collectedAmount, String collectedBy, Instant collectedAt);

    /**
     * Revert hoàn tất (D8): xóa CHỈ row PENDING theo fulfill_code — CONFIRMED giữ
     * nguyên (tiền đã thu là dữ liệu lịch sử). Trả số row xóa.
     */
    int deletePendingByFulfillCodes(List<String> fulfillCodes);

    /** GROUP BY shop theo kỳ [from, to) — JOIN fail_reason IS NULL (D7). */
    List<SettlementShopRow> aggregate(Instant from, Instant to);

    /**
     * Drill-down theo shop + kỳ; onlyMismatch = status=0 (chưa thu) HOẶC
     * (status=1 AND collected ≠ expected).
     */
    List<CodConfirmation> detail(String shopCode, Instant from, Instant to, boolean onlyMismatch);
}
