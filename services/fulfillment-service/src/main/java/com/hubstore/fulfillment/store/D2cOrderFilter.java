package com.hubstore.fulfillment.store;

import java.time.Instant;
import java.util.List;

/**
 * Filter spec cho D2C/Dropship list (FilterD2cOrdersRequest → domain, tách khỏi
 * proto — mirror OrderFilter). Normalize mặc định trong compact constructor:
 * page&lt;1→1, pageSize&lt;=0→10, cap pageSize≤500; list null→rỗng (= không filter);
 * multi-select rỗng = không filter; productCategory/productType exact (blank = bỏ).
 */
public record D2cOrderFilter(
        String search,
        List<String> statuses,
        List<String> carriers,
        List<String> shops,
        List<String> exportEmployees,
        String productCategory,
        String productType,
        Instant createdFrom,
        Instant createdTo,
        Instant pushFrom,
        Instant pushTo,
        String pushSlotFrom,
        String pushSlotTo,
        int page,
        int pageSize) {

    public static final int MAX_PAGE_SIZE = 500;

    public D2cOrderFilter {
        search = search == null ? "" : search;
        statuses = statuses == null ? List.of() : List.copyOf(statuses);
        carriers = carriers == null ? List.of() : List.copyOf(carriers);
        shops = shops == null ? List.of() : List.copyOf(shops);
        exportEmployees = exportEmployees == null ? List.of() : List.copyOf(exportEmployees);
        productCategory = productCategory == null ? "" : productCategory;
        productType = productType == null ? "" : productType;
        // proto3 default "" → null (= không filter slot) — khớp isBlank semantics Postgres.
        pushSlotFrom = pushSlotFrom == null || pushSlotFrom.isBlank() ? null : pushSlotFrom;
        pushSlotTo = pushSlotTo == null || pushSlotTo.isBlank() ? null : pushSlotTo;
        page = page < 1 ? 1 : page;
        pageSize = pageSize <= 0 ? 10 : Math.min(pageSize, MAX_PAGE_SIZE);
    }
}
