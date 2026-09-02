package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.IntakeValidator;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SF-13 intake — validation thuần (plan Task 5): phone sai định dạng, quantity
 * lệch sum(items), items rỗng, shopHint lạ, lỗi đúng row (1-based) + column.
 */
class IntakeValidatorTest {

    private static final Set<String> SHOPS = Set.of("30201", "30202");

    private static SeedModels.ProductSeed item(String code, String name, int qty) {
        return new SeedModels.ProductSeed(code, name, qty);
    }

    private static IntakeValidator.IntakeRow row(SeedModels.OrderSeed order, String shopHint) {
        return new IntakeValidator.IntakeRow(order, shopHint);
    }

    /** Đơn hợp lệ chuẩn — test mutate từng field. */
    private static SeedModels.OrderSeed validOrder() {
        return new SeedModels.OrderSeed(
                "", null, 0, 0, null, null, null, null, 0,
                List.of(item("SP01", "Áo thun", 2)), 150000, 2, false,
                "123 Lê Lợi, Q1, TP.HCM", null, null, List.of(),
                "Nguyễn Văn A", "0901234567", null,
                null, null, null, null);
    }

    private static List<IntakeValidator.IntakeError> validate(IntakeValidator.IntakeRow... rows) {
        return IntakeValidator.validate(List.of(rows), SHOPS);
    }

    private static IntakeValidator.IntakeError errorOn(List<IntakeValidator.IntakeError> errors,
                                                       String column) {
        return errors.stream().filter(e -> e.column().equals(column)).findFirst().orElseThrow();
    }

    // ---------------- happy path ----------------

    @Test
    void validRowHasNoErrors() {
        assertThat(validate(row(validOrder(), "30201"))).isEmpty();
    }

    // ---------------- phone ----------------

    @Test
    void rejectsWrongPhoneFormat() {
        SeedModels.OrderSeed o = validOrder();
        SeedModels.OrderSeed badPhone = new SeedModels.OrderSeed(
                o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                o.shopAssignment(), o.originalTime(), o.deliveryTime(), o.orderStatus(), o.items(),
                o.codAmount(), o.totalQuantity(), o.isDebtSplittingOrder(), o.customerAddress(),
                o.distance(), o.note(), o.history(),
                o.customerName(), "0912345", o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
        List<IntakeValidator.IntakeError> errors = validate(row(badPhone, null));
        assertThat(errors).hasSize(1);
        IntakeValidator.IntakeError e = errorOn(errors, "customerPhone");
        assertThat(e.row()).isEqualTo(1);
        assertThat(e.message()).contains("định dạng");
    }

    @Test
    void rejectsPhoneWithLetters() {
        SeedModels.OrderSeed o = validOrder();
        SeedModels.OrderSeed bad = new SeedModels.OrderSeed(
                o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                o.shopAssignment(), o.originalTime(), o.deliveryTime(), o.orderStatus(), o.items(),
                o.codAmount(), o.totalQuantity(), o.isDebtSplittingOrder(), o.customerAddress(),
                o.distance(), o.note(), o.history(),
                o.customerName(), "090123456abc", o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
        assertThat(errorOn(validate(row(bad, null)), "customerPhone")).isNotNull();
    }

    @Test
    void rejectsBlankPhone() {
        SeedModels.OrderSeed o = validOrder();
        SeedModels.OrderSeed blank = new SeedModels.OrderSeed(
                o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                o.shopAssignment(), o.originalTime(), o.deliveryTime(), o.orderStatus(), o.items(),
                o.codAmount(), o.totalQuantity(), o.isDebtSplittingOrder(), o.customerAddress(),
                o.distance(), o.note(), o.history(),
                o.customerName(), " ", o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
        assertThat(validate(row(blank, null)).stream().map(IntakeValidator.IntakeError::column))
                .containsExactly("customerPhone");
    }

    // ---------------- quantity vs items ----------------

    @Test
    void rejectsQuantityMismatchWithItemsSum() {
        SeedModels.OrderSeed o = validOrder();
        SeedModels.OrderSeed mismatch = new SeedModels.OrderSeed(
                o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                o.shopAssignment(), o.originalTime(), o.deliveryTime(), o.orderStatus(), o.items(),
                o.codAmount(), 5, o.isDebtSplittingOrder(), o.customerAddress(),
                o.distance(), o.note(), o.history(),
                o.customerName(), o.customerPhone(), o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
        List<IntakeValidator.IntakeError> errors = validate(row(mismatch, null));
        assertThat(errors).hasSize(1);
        IntakeValidator.IntakeError e = errorOn(errors, "quantity");
        assertThat(e.row()).isEqualTo(1);
        assertThat(e.message()).contains("quantity");
    }

    // ---------------- items ----------------

    @Test
    void rejectsEmptyItemsOnItemsColumn() {
        SeedModels.OrderSeed o = validOrder();
        SeedModels.OrderSeed empty = new SeedModels.OrderSeed(
                o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                o.shopAssignment(), o.originalTime(), o.deliveryTime(), o.orderStatus(), List.of(),
                o.codAmount(), 0, o.isDebtSplittingOrder(), o.customerAddress(),
                o.distance(), o.note(), o.history(),
                o.customerName(), o.customerPhone(), o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
        List<IntakeValidator.IntakeError> errors = validate(row(empty, null));
        assertThat(errors).hasSize(1);
        assertThat(errorOn(errors, "items").column()).isEqualTo("items");
    }

    @Test
    void rejectsItemWithBlankNameOrZeroQty() {
        SeedModels.OrderSeed o = validOrder();
        SeedModels.OrderSeed badItem = new SeedModels.OrderSeed(
                o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                o.shopAssignment(), o.originalTime(), o.deliveryTime(), o.orderStatus(),
                List.of(item("SP01", " ", 0)), 150000, 1, o.isDebtSplittingOrder(),
                o.customerAddress(), o.distance(), o.note(), o.history(),
                o.customerName(), o.customerPhone(), o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
        assertThat(errorOn(validate(row(badItem, null)), "items")).isNotNull();
    }

    // ---------------- shopHint ----------------

    @Test
    void rejectsUnknownShopHint() {
        List<IntakeValidator.IntakeError> errors = validate(row(validOrder(), "99999"));
        assertThat(errors).hasSize(1);
        assertThat(errorOn(errors, "shopHint").row()).isEqualTo(1);
    }

    @Test
    void blankShopHintIsAllowed() {
        assertThat(validate(row(validOrder(), ""))).isEmpty();
    }

    @Test
    void nullShopCodesSkipsShopHintCheck() {
        // shopCodes=null (unit test validator) — shopHint lạ vẫn pass.
        assertThat(IntakeValidator.validate(List.of(row(validOrder(), "99999")), null)).isEmpty();
    }

    // ---------------- required fields ----------------

    @Test
    void rejectsBlankNameAddressNegativeCodOnOwnColumns() {
        SeedModels.OrderSeed o = validOrder();
        SeedModels.OrderSeed bad = new SeedModels.OrderSeed(
                o.fulfillCode(), o.orderCode(), o.statusCode(), o.batchStatus(), o.batchCode(),
                o.shopAssignment(), o.originalTime(), o.deliveryTime(), o.orderStatus(), o.items(),
                -1, o.totalQuantity(), o.isDebtSplittingOrder(), " ",
                o.distance(), o.note(), o.history(),
                "", o.customerPhone(), o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
        List<IntakeValidator.IntakeError> errors = validate(row(bad, null));
        assertThat(errors.stream().map(IntakeValidator.IntakeError::column).sorted())
                .containsExactly("codAmount", "customerAddress", "customerName");
    }

    // ---------------- row numbering ----------------

    @Test
    void errorsCarryOneBasedRowNumbers() {
        IntakeValidator.IntakeRow badRow2 = row(new SeedModels.OrderSeed(
                "", null, 0, 0, null, null, null, null, 0,
                List.of(), 0, 0, false, null, null, null, List.of(),
                "Trần Văn B", "0987654321", null,
                null, null, null, null), null);
        List<IntakeValidator.IntakeError> errors = validate(row(validOrder(), null), badRow2);
        assertThat(errors).isNotEmpty();
        assertThat(errors).allSatisfy(e -> assertThat(e.row()).isEqualTo(2));
    }
}
