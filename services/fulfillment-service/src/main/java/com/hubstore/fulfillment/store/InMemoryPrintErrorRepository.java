package com.hubstore.fulfillment.store;

import com.hubstore.fulfillment.store.PrintErrorRepository.OrderErrorCount;
import com.hubstore.fulfillment.store.PrintErrorRepository.PrintError;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * In-memory impl PrintErrorRepository — unit test + fallback (pattern
 * InMemoryPrinterRepository). countsByBatch group theo order_code.
 */
public class InMemoryPrintErrorRepository implements PrintErrorRepository {

    private final List<PrintError> rows = new ArrayList<>();

    @Override
    public void insert(PrintError error) {
        synchronized (rows) {
            rows.add(error);
        }
    }

    @Override
    public List<OrderErrorCount> countsByBatch(String batchCode) {
        synchronized (rows) {
            Map<String, Long> counts = new LinkedHashMap<>();
            for (PrintError e : rows) {
                if (e.batchCode() != null && e.batchCode().equals(batchCode)) {
                    counts.merge(e.orderCode(), 1L, Long::sum);
                }
            }
            return counts.entrySet().stream()
                    .map(en -> new OrderErrorCount(en.getKey(), en.getValue()))
                    .toList();
        }
    }
}
