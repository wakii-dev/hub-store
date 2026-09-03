package com.hubstore.fulfillment.store;

import java.util.Optional;

/**
 * Store interface D2C/Dropship (SF-18, plan Task 2) — mirror OrderRepository:
 * Postgres là deliverable duy nhất, interface sạch để test in-memory parity.
 * Note khóa order_code (không phải surrogate id — precedent UpdateNote D1).
 */
public interface D2cOrderRepository {

    /** Filter + pagination nguyên tố (items + total khớp cùng lúc — không race). */
    D2cFilterResult filter(D2cOrderFilter filter);

    /** BFF expand/detail dùng — lookup theo order_code. */
    Optional<D2cOrderRecord> findByCode(String orderCode);

    /** UPDATE ... RETURNING * — không thấy code → Optional.empty(). */
    Optional<D2cOrderRecord> updateNote(String orderCode, String note);
}
