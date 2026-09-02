package com.hubstore.fulfillment.store;

import java.util.List;

/**
 * Kết quả filter D2C nguyên tố: items đã slice theo page/pageSize (ORDER BY id
 * ASC) + total số đơn khớp — envelope FilterD2cOrdersResponse.
 */
public record D2cFilterResult(List<D2cOrderRecord> items, long total) {
}
