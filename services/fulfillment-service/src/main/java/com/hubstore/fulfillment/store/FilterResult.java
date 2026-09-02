package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.seed.SeedModels;

import java.util.List;

/**
 * Kết quả filter nguyên tố: items đã slice theo page/pageSize + total số đơn
 * khớp (pagination envelope của FilterOrdersResponse).
 */
public record FilterResult(List<SeedModels.OrderSeed> items, long total) {
}
