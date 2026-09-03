package com.hubstore.fulfillment.store;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

public interface TechOrderRepository {
    TechModels.DeliveryPage filterDelivery(TechModels.DeliveryFilter filter);

    TechModels.InstallationPage filterInstallation(TechModels.InstallationFilter filter);

    Optional<TechModels.InstallationOrder> findInstallation(String serviceOrderCode);

    Optional<TechModels.Technician> findTechnician(String code);

    /** Assign/re-assign: update technician_code + insert history (from NULL khi lần đầu) trong 1 transaction. Enforce assignableStatus → IllegalStateException. */
    TechModels.InstallationOrder assignTechnician(String serviceOrderCode, String technicianCode,
                                                  String changedBy, Instant changedAt);

    /** READ — lịch sử assign của đơn (seed trống + entries append bởi assignTechnician). */
    List<TechModels.AssignmentHistoryEntry> assignmentHistory(String serviceOrderCode);

    List<TechModels.SuggestedTechnician> suggestTechnicians(String regionCode);

    // ---------------- SF-25 (FI-270) — accept/complete/reschedule (spec §4.2) ----------------

    /** CONFIRMED|RESCHEDULED → PROCESSING + timeline append "KTV nhận việc".
     *  Enforce owner (technicianCode khớp) + trạng thái → IllegalStateException. */
    TechModels.InstallationOrder acceptInstallation(String serviceOrderCode, String technicianCode,
                                                    OffsetDateTime at);

    /** PROCESSING → DELIVERED + timeline append "Hoàn tất lắp đặt". Guard như accept. */
    TechModels.InstallationOrder completeInstallation(String serviceOrderCode, String technicianCode,
                                                      OffsetDateTime at);

    /** CONFIRMED|PROCESSING|REDELIVERY|RESCHEDULED → RESCHEDULED + expected_time = newTime
     *  + timeline append note. Guard như accept. */
    TechModels.InstallationOrder rescheduleInstallation(String serviceOrderCode, String technicianCode,
                                                        OffsetDateTime newExpectedTime, String note,
                                                        OffsetDateTime at);
}
