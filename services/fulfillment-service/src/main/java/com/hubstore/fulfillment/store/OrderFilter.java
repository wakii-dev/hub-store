package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.seed.SeedModels.TimeRangeSeed;

import java.util.Set;

/**
 * Filter spec cho D1 list (FilterOrdersRequest → domain, tách khỏi proto).
 * created_time: request có field nhưng seed orders KHÔNG có createdAt —
 * field được nhận nhưng chưa filter (spike; ghi chú trong service).
 */
public record OrderFilter(
        String fulfillCode,
        Set<Integer> batchStatuses,
        TimeRangeSeed deliveryTime,
        Set<String> regionCodes,
        Set<String> shopCodes,
        Set<Integer> orderStatuses,
        TimeRangeSeed createdTime,
        TimeRangeSeed originalTime,
        Set<String> excludeFulfillCodes,
        int page,
        int pageSize) {
}
