package com.hubstore.fulfillment.seed;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.List;

/**
 * Jackson models cho api/seed/canonical-seed.json — MỘT nguồn duy nhất, shape
 * do SF-2 owns (api/seed/validate.py là tham chiếu). KHÔNG tự seed riêng.
 * Records + Jackson 2.19: deserialize native, không cần boilerplate.
 */
public final class SeedModels {
    private SeedModels() {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SeedFile(
            List<OrderSeed> orders,
            List<Object> batches,           // SF-4 owns phiếu — Java chỉ validate shape tồn tại
            List<DeliveryStaffSeed> deliveryStaff,
            List<Object> printers,          // SF-5 owns printer
            List<RegionSeed> regions) {
    }

    /**
     * REQUIREMENTS §4 order — đầy đủ fields §4 (validate.py ORDER_REQUIRED).
     * SF-13 intake: 7 field cuối nullable (Jackson seed JSON thiếu → null):
     * intake fields (customerName/customerPhone/oldFulfillCode), mark-fail
     * (failReason/failNote/failedAt) + createdTime (audit trace).
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OrderSeed(
            String fulfillCode,
            String orderCode,
            int statusCode,
            int batchStatus,
            String batchCode,
            ShopAssignmentSeed shopAssignment,
            TimeRangeSeed originalTime,
            TimeRangeSeed deliveryTime,
            int orderStatus,
            List<ProductSeed> items,
            long codAmount,
            int totalQuantity,
            boolean isDebtSplittingOrder,
            String customerAddress,
            Double distance,
            String note,
            List<HistoryEntrySeed> history,
            String customerName,
            String customerPhone,
            String oldFulfillCode,
            String failReason,
            String failNote,
            Instant failedAt,
            Instant createdTime) {

        public OrderSeed withBatchStatus(int newStatus, String newBatchCode) {
            return new OrderSeed(fulfillCode, orderCode, statusCode, newStatus, newBatchCode,
                    shopAssignment, originalTime, deliveryTime, orderStatus, items,
                    codAmount, totalQuantity, isDebtSplittingOrder, customerAddress,
                    distance, note, history,
                    customerName, customerPhone, oldFulfillCode,
                    failReason, failNote, failedAt, createdTime);
        }

        public OrderSeed withShopAssignment(ShopAssignmentSeed newAssignment) {
            return new OrderSeed(fulfillCode, orderCode, statusCode, batchStatus, batchCode,
                    newAssignment, originalTime, deliveryTime, orderStatus, items,
                    codAmount, totalQuantity, isDebtSplittingOrder, customerAddress,
                    distance, note, history,
                    customerName, customerPhone, oldFulfillCode,
                    failReason, failNote, failedAt, createdTime);
        }

        public OrderSeed withDeliveryTime(TimeRangeSeed newTime) {
            return new OrderSeed(fulfillCode, orderCode, statusCode, batchStatus, batchCode,
                    shopAssignment, originalTime, newTime, orderStatus, items,
                    codAmount, totalQuantity, isDebtSplittingOrder, customerAddress,
                    distance, note, history,
                    customerName, customerPhone, oldFulfillCode,
                    failReason, failNote, failedAt, createdTime);
        }

        public OrderSeed withNote(String newNote) {
            return new OrderSeed(fulfillCode, orderCode, statusCode, batchStatus, batchCode,
                    shopAssignment, originalTime, deliveryTime, orderStatus, items,
                    codAmount, totalQuantity, isDebtSplittingOrder, customerAddress,
                    distance, newNote, history,
                    customerName, customerPhone, oldFulfillCode,
                    failReason, failNote, failedAt, createdTime);
        }

        /** Mark-fail (SF-13 intake): set fail fields, giữ nguyên phần còn lại. */
        public OrderSeed withFail(String reason, String failNote, Instant at) {
            return new OrderSeed(fulfillCode, orderCode, statusCode, batchStatus, batchCode,
                    shopAssignment, originalTime, deliveryTime, orderStatus, items,
                    codAmount, totalQuantity, isDebtSplittingOrder, customerAddress,
                    distance, note, history,
                    customerName, customerPhone, oldFulfillCode,
                    reason, failNote, at, createdTime);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TimeRangeSeed(String from, String to) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ProductSeed(String productCode, String productName, int quantity) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ShopAssignmentSeed(String shopCode, String shopName, String address) {
    }

    /** Entry history seed ({timestamp, action, note}) — khác shape assign-history proto. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record HistoryEntrySeed(String timestamp, String action, String note) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DeliveryStaffSeed(String staffId, String name, String shopCode, String phone) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RegionSeed(String code, String name, String type, String parentCode) {
    }

    /** Shop option — derive từ distinct shopCode của orders (không có entity riêng trong seed). */
    public record ShopSeed(String code, String name, String address) {
    }
}
