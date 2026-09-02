package com.hubstore.fulfillment.store;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

/** Domain models + BE-authoritative button logic cho SF-19 (spec §5). */
public final class TechModels {
    private TechModels() {
    }

    public static final Set<String> ACTIVE_EXCLUDED = Set.of("DELIVERED", "CANCELLED", "RETURNED");

    public record TechItem(String code, String name, int quantity, String categoryL1, String categoryL2) {
    }

    public record Contact(String name, String phone, Double lat, Double lon) {
    }

    public record TechButtons(boolean allowCancel, boolean allowAssign, boolean allowReassign,
                              boolean allowAccept, boolean allowReschedule) {
    }

    public record DeliveryOrder(String code, String status, String driverName, String driverPhone,
                                Contact receiver, Contact sender, double fee, double tip, List<TechItem> items,
                                String regionCode, String province, String coordinationJson, LocalDate deliveryDate,
                                OffsetDateTime createdAt) {
    }

    public record InstallationOrder(String serviceOrderCode, String deliveryOrderCode,
                                    String technicianCode, String status, OffsetDateTime expectedTime, String timelineJson,
                                    double serviceFee, double feeAdjust, List<TechItem> items, String regionCode,
                                    String province, OffsetDateTime createdAt) {
    }

    public record Technician(String code, String name, String type, String regionCode) {
    }

    public record AssignmentHistoryEntry(String serviceOrderCode, String fromTechnicianCode,
                                         String toTechnicianCode, String changedBy, OffsetDateTime changedAt) {
    }

    public record SuggestedTechnician(Technician technician, int activeCount) {
    }

    public record DeliveryFilter(List<String> statuses, String driverName, List<String> categoryL1,
                                 List<String> categoryL2, String regionCode, String province, LocalDate dateFrom,
                                 LocalDate dateTo, int page, int pageSize) {
    }

    public record InstallationFilter(List<String> statuses, String technicianCode,
                                     List<String> categoryL1, List<String> categoryL2, String regionCode, String province,
                                     LocalDate dateFrom, LocalDate dateTo, int page, int pageSize) {
    }

    public record DeliveryPage(List<DeliveryOrder> items, long total) {
    }

    public record InstallationPage(List<InstallationOrder> items, long total) {
    }

    /** Buttons matrix — spec §5. Delivery chỉ allowCancel/allowReschedule. */
    public static TechButtons deliveryButtons(DeliveryOrder o) {
        return new TechButtons(cancellable(o.status()), false, false, false,
                reschedulable(o.status()));
    }

    public static TechButtons installationButtons(InstallationOrder o) {
        boolean assigned = o.technicianCode() != null && !o.technicianCode().isBlank();
        return new TechButtons(
                cancellable(o.status()),
                !assigned && assignableStatus(o.status()),
                assigned && reassignableStatus(o.status()),
                assigned && "CONFIRMED".equals(o.status()),
                reschedulable(o.status()));
    }

    static boolean cancellable(String s) {
        return Set.of("NEW", "CONFIRMED", "PROCESSING", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    static boolean reschedulable(String s) {
        return Set.of("NEW", "CONFIRMED", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    static boolean assignableStatus(String s) {
        return Set.of("NEW", "CONFIRMED", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    static boolean reassignableStatus(String s) {
        return Set.of("CONFIRMED", "PROCESSING", "REDELIVERY", "RESCHEDULED").contains(s);
    }
}
