package com.hubstore.fulfillment.store;

import java.time.Instant;
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
}
