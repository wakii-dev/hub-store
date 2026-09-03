package com.hubstore.fulfillment.store;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * In-memory impl PrinterRepository — unit test + fallback (pattern
 * InMemoryCodConfirmationRepository). Key = shopCode + '/' + printerId,
 * insertion-order giữ thứ tự list ổn định.
 */
public class InMemoryPrinterRepository implements PrinterRepository {

    private final Map<String, Printer> rows = new LinkedHashMap<>();

    private static String key(String shopCode, String printerId) {
        return shopCode + "/" + printerId;
    }

    @Override
    public List<Printer> list(String shopCode) {
        synchronized (rows) {
            return rows.values().stream()
                    .filter(p -> shopCode == null || shopCode.isBlank() || p.shopCode().equals(shopCode))
                    .toList();
        }
    }

    @Override
    public Optional<Printer> get(String shopCode, String printerId) {
        synchronized (rows) {
            return Optional.ofNullable(rows.get(key(shopCode, printerId)));
        }
    }

    @Override
    public Printer create(Printer printer) {
        String k = key(printer.shopCode(), printer.printerId());
        synchronized (rows) {
            if (rows.containsKey(k)) {
                throw new DuplicatePrinterException(printer.shopCode(), printer.printerId());
            }
            rows.put(k, printer);
            return printer;
        }
    }

    @Override
    public Printer update(String shopCode, String printerId, Printer printer) {
        String k = key(shopCode, printerId);
        synchronized (rows) {
            Printer existing = rows.get(k);
            if (existing == null) {
                throw new PrinterNotFoundException(shopCode, printerId);
            }
            Printer updated = new Printer(shopCode, printerId,
                    printer.name(), printer.printerIp(), printer.mac(), printer.type());
            // put trên key ĐÃ có giữ nguyên insertion-order (Map contract).
            rows.put(k, updated);
            return updated;
        }
    }
}
