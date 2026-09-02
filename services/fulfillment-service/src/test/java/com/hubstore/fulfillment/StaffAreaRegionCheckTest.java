package com.hubstore.fulfillment;

import com.hubstore.fulfillment.payment.PaymentAccountVerifier;
import com.hubstore.fulfillment.service.GrpcErrors;
import com.hubstore.fulfillment.service.StaffAreaServiceImpl;
import com.hubstore.fulfillment.store.ServiceEmployeeRepository;
import com.hubstore.fulfillment.store.ServiceEmployeeRepository.InvalidRegionCodesException;
import com.hubstore.fulfillment.store.ServiceEmployeeRepository.ListFilter;
import com.hubstore.staffarea.v1.CreateServiceEmployeeRequest;
import com.hubstore.staffarea.v1.CreateServiceEmployeeResponse;
import com.hubstore.staffarea.v1.ServiceEmployee;
import com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest;
import com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse;
import io.grpc.Metadata;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Review P1 fix — region_codes không tồn tại → INVALID_ARGUMENT (chi tiết liệt kê
 * code sai), KHÔNG rơi vào catch DataIntegrityViolation → ALREADY_EXISTS nhầm.
 * Stub repo ném InvalidRegionCodesException đúng như Postgres repo pre-check.
 */
class StaffAreaRegionCheckTest {

    private StaffAreaServiceImpl service;

    @BeforeEach
    void setUp() {
        ServiceEmployeeRepository repo = new ServiceEmployeeRepository() {
            @Override
            public ListResult list(ListFilter filter) {
                throw new UnsupportedOperationException();
            }

            @Override
            public Optional<ServiceEmployeeRepository.ServiceEmployee> get(String employeeCode) {
                // Trả employee tồn tại để update path đi qua check tồn tại tới repo.update.
                return Optional.of(new ServiceEmployeeRepository.ServiceEmployee(
                        employeeCode, "Nguyễn Văn A", "SHIPPER", "0123456789", true,
                        List.of(), null, null));
            }

            @Override
            public ServiceEmployeeRepository.ServiceEmployee create(ServiceEmployeeRepository.ServiceEmployee e) {
                throw new InvalidRegionCodesException(List.of("ZZZZ", "YYYY"));
            }

            @Override
            public ServiceEmployeeRepository.ServiceEmployee update(String employeeCode,
                                                                   ServiceEmployeeRepository.ServiceEmployee e) {
                throw new InvalidRegionCodesException(List.of("ZZZZ"));
            }

            @Override
            public ServiceEmployeeRepository.ServiceEmployee setActive(String employeeCode, boolean active) {
                throw new UnsupportedOperationException();
            }
        };
        PaymentAccountVerifier neverCalled = account ->
                new PaymentAccountVerifier.VerifyResult(false, "MOCK", "unused trong test này");
        service = new StaffAreaServiceImpl(repo, neverCalled);
    }

    private static ServiceEmployee validProto() {
        return ServiceEmployee.newBuilder()
                .setEmployeeCode("NV-001")
                .setFullName("Nguyễn Văn A")
                .setTitleCode("SHIPPER")
                .setPaymentAccount("0123456789")
                .addRegionCodes("ZZZZ")
                .addRegionCodes("YYYY")
                .build();
    }

    private String detailsJson(Throwable t) {
        String encoded = ((StatusRuntimeException) t).getTrailers()
                .get(Metadata.Key.of(GrpcErrors.METADATA_DETAILS_KEY, Metadata.ASCII_STRING_MARSHALLER));
        return URLDecoder.decode(encoded, StandardCharsets.UTF_8);
    }

    @Test
    void createRejectsUnknownRegionCodesAsInvalidArgument() throws Exception {
        CollectingObserver<CreateServiceEmployeeResponse> obs = new CollectingObserver<>();
        service.createServiceEmployee(
                CreateServiceEmployeeRequest.newBuilder().setEmployee(validProto()).build(), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        StatusRuntimeException e = (StatusRuntimeException) obs.error;
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        // Chi tiết field=regionCodes + liệt kê đúng code sai.
        String json = detailsJson(obs.error);
        assertThat(json).contains("regionCodes");
        assertThat(json).contains("ZZZZ").contains("YYYY");
    }

    @Test
    void updateRejectsUnknownRegionCodesAsInvalidArgument() throws Exception {
        CollectingObserver<UpdateServiceEmployeeResponse> obs = new CollectingObserver<>();
        service.updateServiceEmployee(UpdateServiceEmployeeRequest.newBuilder()
                .setEmployeeCode("NV-001").setEmployee(validProto()).build(), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        StatusRuntimeException e = (StatusRuntimeException) obs.error;
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(detailsJson(obs.error)).contains("regionCodes").contains("ZZZZ");
    }
}
