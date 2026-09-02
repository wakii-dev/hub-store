package com.hubstore.fulfillment.store;

import java.util.List;
import java.util.Optional;

/**
 * Store cho định nghĩa NV phụ trách khu vực (SF-17). Pattern OrderRepository:
 * interface thuần, impl do config wiring (ServiceEmployeeRepositoryConfig).
 *
 * Semantics (spec SF-17 §5):
 * - list LUÔN gồm cả inactive (FE dim client-side — không có filter include_inactive).
 * - update = FULL REPLACE: mọi field trừ employeeCode (immutable); regions
 *   delete-all + insert lại trong 1 transaction.
 * - API không có delete — off-switch là {@link #setActive}.
 */
public interface ServiceEmployeeRepository {

    /** Filter list — field blank/null = bỏ điều kiện (LUÔN gồm inactive). */
    record ListFilter(String titleCode, String query, String regionCode) {
    }

    /** 1 định nghĩa NV. times = DB timestamptz (map ISO ở tầng gRPC). */
    record ServiceEmployee(String employeeCode, String fullName, String titleCode,
                           String paymentAccount, boolean isActive,
                           List<String> regionCodes,
                           java.time.OffsetDateTime createdAt,
                           java.time.OffsetDateTime updatedAt) {
    }

    record ListResult(List<ServiceEmployee> items, int total) {
    }

    ListResult list(ListFilter filter);

    Optional<ServiceEmployee> get(String employeeCode);

    /** employeeCode phải chưa tồn tại (DB UNIQUE chặn; trùng → DataIntegrityViolation). */
    ServiceEmployee create(ServiceEmployee employee);

    /** Full replace theo employeeCode (immutable); thiếu → IllegalArgumentException. */
    ServiceEmployee update(String employeeCode, ServiceEmployee employee);

    /** Toggle on/off; thiếu → IllegalArgumentException. */
    ServiceEmployee setActive(String employeeCode, boolean active);
}
