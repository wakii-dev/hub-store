package com.hubstore.fulfillment;

import com.hubstore.fulfillment.store.D2cOrderRecord;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Fixture D2C dùng chung unit (D2cFilterAndNoteTest) + IT (PostgresD2cRepositoryIT).
 * Prefix param cho IT (order_code ZZD2C-… để cleanup an toàn); id trong record chỉ
 * mang ý nghĩa thứ tự in-memory — Postgres BIGSERIAL tự gán (IT assert theo codes).
 */
final class D2cFixture {

    private D2cFixture() {
    }

    static List<D2cOrderRecord> rows(String prefix) {
        return List.of(
                order(1, prefix + "100%_LIT", "DL-001", "GHN", "Shop A", "NV Xuất 1",
                        "2026-08-15T08:30:00+07:00", "2026-08-01T03:00:00Z",
                        "Điện tử", "Điện thoại", false, "NEW"),
                order(2, prefix + "2001", "DL-002", "GHTK", "Shop B", "NV Xuất 1",
                        "2026-08-15T14:45:00+07:00", "2026-08-02T03:00:00Z",
                        "Thời trang", "Áo", true, "PUSHED"),
                order(3, prefix + "3001", "DL-003", "GHN", "Shop A", "NV Xuất 2",
                        "2026-08-15T20:10:00+07:00", "2026-08-03T03:00:00Z",
                        "Điện tử", "Máy tính bảng", false, "DELIVERED"),
                order(4, prefix + "4001", "DL-004", "ViettelPost", "Shop C", "NV Xuất 2",
                        null, "2026-08-04T03:00:00Z",
                        "Nhà cửa", "Gia dụng", false, "NEW"),
                order(5, prefix + "5001", "DL-001", "GHN", "Shop B", "NV Xuất 1",
                        "2026-08-15T08:45:00+07:00", "2026-08-05T03:00:00Z",
                        "Điện tử", "Điện thoại", true, "PUSHED"));
    }

    private static D2cOrderRecord order(long id, String code, String deliveryId, String carrier,
                                        String shop, String exportEmployee, String pushIso, String createdIso,
                                        String category, String type, boolean debtSplitting, String status) {
        Instant push = pushIso == null ? null : OffsetDateTime.parse(pushIso).toInstant();
        return new D2cOrderRecord(code, "INTER-" + id, deliveryId, carrier, shop, exportEmployee,
                push, push,
                "Nguyễn Văn A", "0901234567", "123 Lê Lợi, Q1, TP.HCM",
                "Giao hàng tiêu chuẩn", category, type, debtSplitting,
                "", status, Instant.parse(createdIso), id);
    }
}
