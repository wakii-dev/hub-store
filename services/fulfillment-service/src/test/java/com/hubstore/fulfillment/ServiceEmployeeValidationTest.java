package com.hubstore.fulfillment;

import com.hubstore.fulfillment.service.StaffAreaServiceImpl;
import com.hubstore.staffarea.v1.ServiceEmployee;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test validation StaffAreaServiceImpl (SF-17) — KHÔNG cần DB/gRPC runtime
 * (validate() static). Rule: employee_code ^[A-Z0-9_-]{3,32}$; payment_account
 * ^\d{9,16}$; title/full_name non-blank; region_codes cap 100.
 */
class ServiceEmployeeValidationTest {

    private static ServiceEmployee validProto() {
        return ServiceEmployee.newBuilder()
                .setEmployeeCode("NV-001")
                .setFullName("Nguyễn Văn A")
                .setTitleCode("SHIPPER")
                .setPaymentAccount("0123456789")
                .addRegionCodes("25")
                .addRegionCodes("9201")
                .build();
    }

    @Test
    void validInputPasses() {
        assertThat(StaffAreaServiceImpl.validate(validProto())).isEmpty();
    }

    @Test
    void employeeCodeRules() {
        // sai format: thường / quá ngắn / ký tự lạ
        for (String bad : List.of("nv-001", "AB", "NV 001", "NHÂN-VIÊN", "")) {
            List<?> details = StaffAreaServiceImpl.validate(
                    validProto().toBuilder().setEmployeeCode(bad).build());
            assertThat(details).as("employee_code='" + bad + "' phải bị từ chối").isNotEmpty();
        }
        // biên hợp lệ: 3 ký tự, 32 ký tự
        assertThat(StaffAreaServiceImpl.validate(
                validProto().toBuilder().setEmployeeCode("ABC").build())).isEmpty();
        assertThat(StaffAreaServiceImpl.validate(
                validProto().toBuilder().setEmployeeCode("A".repeat(32)).build())).isEmpty();
        // 33 ký tự → từ chối
        assertThat(StaffAreaServiceImpl.validate(
                validProto().toBuilder().setEmployeeCode("A".repeat(33)).build())).isNotEmpty();
    }

    @Test
    void paymentAccountRules() {
        for (String bad : List.of("", "abcdefghij", "12345678", "12345678901234567", "0123-456")) {
            List<?> details = StaffAreaServiceImpl.validate(
                    validProto().toBuilder().setPaymentAccount(bad).build());
            assertThat(details).as("payment_account='" + bad + "' phải bị từ chối").isNotEmpty();
        }
        assertThat(StaffAreaServiceImpl.validate(
                validProto().toBuilder().setPaymentAccount("123456789").build())).isEmpty(); // 9 chữ số biên dưới
        assertThat(StaffAreaServiceImpl.validate(
                validProto().toBuilder().setPaymentAccount("1".repeat(16)).build())).isEmpty(); // 16 biên trên
    }

    @Test
    void titleAndNameRequired() {
        List<?> noTitle = StaffAreaServiceImpl.validate(
                validProto().toBuilder().setTitleCode("  ").build());
        assertThat(noTitle).anySatisfy(d -> assertThat(d.toString()).contains("titleCode"));

        List<?> noName = StaffAreaServiceImpl.validate(
                validProto().toBuilder().setFullName("").build());
        assertThat(noName).anySatisfy(d -> assertThat(d.toString()).contains("fullName"));
    }

    @Test
    void regionCap100() {
        ServiceEmployee.Builder b = validProto().toBuilder().clearRegionCodes();
        for (int i = 0; i < 100; i++) {
            b.addRegionCodes(String.format("R%03d", i));
        }
        assertThat(StaffAreaServiceImpl.validate(b.build())).isEmpty();
        b.addRegionCodes("OVERFLOW");
        assertThat(StaffAreaServiceImpl.validate(b.build()))
                .anySatisfy(d -> assertThat(d.toString()).contains("regionCodes"));
    }
}
