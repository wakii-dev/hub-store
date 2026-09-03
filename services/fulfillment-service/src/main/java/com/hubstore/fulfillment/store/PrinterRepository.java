package com.hubstore.fulfillment.store;

import java.util.List;
import java.util.Optional;

/**
 * Store máy in (SF-21) — pattern ServiceEmployeeRepository: interface thuần,
 * impl do config wiring (PrinterRepositoryConfig). Bảng printers (V8):
 * identity = (shop_code, printer_id) — KHÔNG sửa sau tạo (spec SF-21 D9);
 * update chỉ name/location/printer_ip/mac/type. KHÔNG có delete trong SF này.
 */
public interface PrinterRepository {

    /** 1 máy in. times bỏ qua — printers không audit-timestamp (D9 minimal). */
    record Printer(String shopCode, String printerId, String name, String location,
                   String printerIp, String mac, String type) {
    }

    /** Duplicate (shop_code, printer_id) — impl map ALREADY_EXISTS (BFF → 409). */
    class DuplicatePrinterException extends RuntimeException {
        public DuplicatePrinterException(String shopCode, String printerId) {
            super("Printer " + printerId + " đã tồn tại ở shop " + shopCode + ".");
        }
    }

    /** Không tìm thấy theo identity — impl map NOT_FOUND (BFF → 404). */
    class PrinterNotFoundException extends RuntimeException {
        public PrinterNotFoundException(String shopCode, String printerId) {
            super("Printer " + printerId + " không tồn tại ở shop " + shopCode + ".");
        }
    }

    /** List theo shop; shopCode trống = tất cả (defensive — BFF luôn truyền shop). */
    List<Printer> list(String shopCode);

    Optional<Printer> get(String shopCode, String printerId);

    /** (shop_code, printer_id) phải chưa tồn tại — trùng → DuplicatePrinterException. */
    Printer create(Printer printer);

    /** Chỉ name/location/printer_ip/mac/type cập nhật; thiếu identity → PrinterNotFoundException. */
    Printer update(String shopCode, String printerId, Printer printer);
}
