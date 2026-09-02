package com.hubstore.fulfillment.service;

import com.hubstore.fulfillment.seed.SeedModels;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validation thuần SF-13 intake (plan Task 5) — KHÔNG gRPC, KHÔNG repo.
 * Mỗi rule lỗi → 1 {@link IntakeError} (row 1-based theo thứ tự file, column
 * = tên header template: customerName/customerPhone/customerAddress/items/
 * quantity/codAmount/shopHint). Rỗng = valid hết.
 */
public final class IntakeValidator {

    private static final Pattern PHONE = Pattern.compile("^(\\+84|0)\\d{9}$");

    private IntakeValidator() {
    }

    /**
     * 1 dòng intake: OrderSeed tạm (chưa có fulfillCode) + shopHint riêng
     * (OrderSeed không có field shopHint — shopHint chỉ là hint lookup
     * shopAssignment lúc confirm).
     */
    public record IntakeRow(SeedModels.OrderSeed order, String shopHint) {
    }

    public record IntakeError(int row, String column, String message) {
    }

    /**
     * @param shopCodes set kho CN hợp lệ từ repo.distinctShops(); null = BỎ check
     *                  shopHint (unit test thuần validator).
     */
    public static List<IntakeError> validate(List<IntakeRow> rows, Set<String> shopCodes) {
        List<IntakeError> errors = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            validateRow(i + 1, rows.get(i), shopCodes, errors);
        }
        return errors;
    }

    private static void validateRow(int row, IntakeRow intakeRow, Set<String> shopCodes,
                                    List<IntakeError> errors) {
        SeedModels.OrderSeed o = intakeRow.order();
        if (isBlank(o.customerName())) {
            errors.add(new IntakeError(row, "customerName", "Tên khách hàng bắt buộc."));
        }
        if (isBlank(o.customerPhone())) {
            errors.add(new IntakeError(row, "customerPhone", "Số điện thoại bắt buộc."));
        } else if (!PHONE.matcher(o.customerPhone().trim()).matches()) {
            errors.add(new IntakeError(row, "customerPhone",
                    "Số điện thoại sai định dạng (0xxxxxxxxx hoặc +84xxxxxxxxx)."));
        }
        if (isBlank(o.customerAddress())) {
            errors.add(new IntakeError(row, "customerAddress", "Địa chỉ khách hàng bắt buộc."));
        }
        if (o.items() == null || o.items().isEmpty()) {
            errors.add(new IntakeError(row, "items", "Đơn phải có ít nhất 1 sản phẩm."));
        } else {
            int sum = 0;
            for (int j = 0; j < o.items().size(); j++) {
                SeedModels.ProductSeed p = o.items().get(j);
                if (isBlank(p.productCode()) || isBlank(p.productName()) || p.quantity() < 1) {
                    errors.add(new IntakeError(row, "items",
                            "Sản phẩm thứ " + (j + 1) + ": code/tên bắt buộc, số lượng ≥ 1."));
                }
                sum += Math.max(p.quantity(), 0);
            }
            if (o.totalQuantity() != sum) {
                errors.add(new IntakeError(row, "quantity",
                        "Tổng số lượng (" + o.totalQuantity() + ") ≠ tổng quantity của items (" + sum + ")."));
            }
        }
        if (o.codAmount() < 0) {
            errors.add(new IntakeError(row, "codAmount", "COD không được âm."));
        }
        String shopHint = intakeRow.shopHint();
        if (!isBlank(shopHint) && shopCodes != null && !shopCodes.contains(shopHint)) {
            errors.add(new IntakeError(row, "shopHint", "Không tồn tại kho CN '" + shopHint + "'."));
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
