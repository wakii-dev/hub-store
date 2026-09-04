package com.hubstore.fulfillment.store;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;

/** Domain models + BE-authoritative button logic cho SF-19 (spec §5) + SF-25
 * (spec §4.2 — accept/complete/reschedule + matrix mở rộng). */
public final class TechModels {
    private TechModels() {
    }

    private static final ObjectMapper TIMELINE_MAPPER = new ObjectMapper();

    public static final Set<String> ACTIVE_EXCLUDED = Set.of("DELIVERED", "CANCELLED", "RETURNED");

    public record TechItem(String code, String name, int quantity, String categoryL1, String categoryL2) {
    }

    public record Contact(String name, String phone, Double lat, Double lon) {
    }

    public record TechButtons(boolean allowCancel, boolean allowAssign, boolean allowReassign,
                              boolean allowAccept, boolean allowReschedule, boolean allowComplete) {
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

    /** Buttons matrix — spec §5 + SF-25 §4.2 (matrix mở rộng). Delivery chỉ
     * allowCancel/allowReschedule — không flag gán/hoàn thành. */
    public static TechButtons deliveryButtons(DeliveryOrder o) {
        return new TechButtons(cancellable(o.status()), false, false, false,
                reschedulable(o.status()), false);
    }

    public static TechButtons installationButtons(InstallationOrder o) {
        boolean assigned = o.technicianCode() != null && !o.technicianCode().isBlank();
        return new TechButtons(
                cancellable(o.status()),
                !assigned && assignableStatus(o.status()),
                assigned && reassignableStatus(o.status()),
                // SF-25 §4.2: accept cả RESCHEDULED (dead-end fix — sau reschedule
                // KTV nhận việc lại → PROCESSING → complete → DELIVERED).
                assigned && acceptStatus(o.status()),
                installationReschedulable(o.status()),
                assigned && "PROCESSING".equals(o.status()));
    }

    static boolean cancellable(String s) {
        return Set.of("NEW", "CONFIRMED", "PROCESSING", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    static boolean reschedulable(String s) {
        return Set.of("NEW", "CONFIRMED", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    // SF-25 §4.2: matrix lắp đặt mở rộng +PROCESSING — KTV đang làm cần dời lịch.
    // Delivery GIỮ matrix cũ (desktop contract — review 05 assert delivery PROCESSING
    // không reschedulable). RPC guard KHÔNG gồm NEW (spec §4.2 — đơn NEW chưa có lịch).
    static boolean installationReschedulable(String s) {
        return Set.of("NEW", "CONFIRMED", "PROCESSING", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    static boolean acceptStatus(String s) {
        return Set.of("CONFIRMED", "RESCHEDULED").contains(s);
    }

    static boolean assignableStatus(String s) {
        return Set.of("NEW", "CONFIRMED", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    static boolean reassignableStatus(String s) {
        return Set.of("CONFIRMED", "PROCESSING", "REDELIVERY", "RESCHEDULED").contains(s);
    }

    /**
     * SF-25 (spec §4.2) — append 1 entry {at,status,note,actor} vào timeline
     * JSONB passthrough (null/rỗng → mảng mới). Schema + thứ tự key mirror
     * seed tech-sample.json; JSON hỏng → ISE (không nuốt — timeline là data).
     */
    public static String appendTimeline(String timelineJson, String at, String status,
                                        String note, String actor) {
        try {
            ArrayNode arr = timelineJson == null || timelineJson.isBlank()
                    ? TIMELINE_MAPPER.createArrayNode()
                    : (ArrayNode) TIMELINE_MAPPER.readTree(timelineJson);
            ObjectNode entry = arr.addObject();
            entry.put("at", at);
            entry.put("status", status);
            entry.put("note", note == null ? "" : note);
            entry.put("actor", actor);
            return TIMELINE_MAPPER.writeValueAsString(arr);
        } catch (Exception e) {
            throw new IllegalStateException("fulfillment: timeline JSONB hỏng — " + e.getMessage(), e);
        }
    }
}
