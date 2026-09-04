package com.hubstore.fulfillment.store;

import java.util.List;

/**
 * Store lỗi in thật (SF-21, spec D2) — pattern PrinterRepository: interface
 * thuần, impl do config wiring (PrintErrorRepositoryConfig). Bảng
 * print_errors (V9): BFF record trên failure path của lệnh IN THẬT —
 * badge D3 = count per order_code theo batch.
 */
public interface PrintErrorRepository {

    /** 1 dòng lỗi in. order_code rỗng khi batch chưa hydrate được (D2). */
    record PrintError(String orderCode, String batchCode,
                      String printType, String printerId, String errorMessage) {
    }

    /** Count per order trong 1 phiếu (GROUP BY order_code). */
    record OrderErrorCount(String orderCode, long count) {
    }

    /** Insert 1 dòng lỗi (không trả về gì — fire-and-forget fail-open ở BFF). */
    void insert(PrintError error);

    /** Số lỗi per đơn theo phiếu — thứ tự không cam kết (BFF/FE sort). */
    List<OrderErrorCount> countsByBatch(String batchCode);
}
