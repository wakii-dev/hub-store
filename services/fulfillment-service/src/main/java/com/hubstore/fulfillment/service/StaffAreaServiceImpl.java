package com.hubstore.fulfillment.service;

import com.hubstore.fulfillment.store.ServiceEmployeeRepository;
import com.hubstore.fulfillment.store.ServiceEmployeeRepository.ListFilter;
import com.hubstore.fulfillment.store.ServiceEmployeeRepository.ServiceEmployee;
import com.hubstore.staffarea.v1.CreateServiceEmployeeRequest;
import com.hubstore.staffarea.v1.CreateServiceEmployeeResponse;
import com.hubstore.staffarea.v1.GetServiceEmployeeRequest;
import com.hubstore.staffarea.v1.GetServiceEmployeeResponse;
import com.hubstore.staffarea.v1.ListServiceEmployeesRequest;
import com.hubstore.staffarea.v1.ListServiceEmployeesResponse;
import com.hubstore.staffarea.v1.SetServiceEmployeeActiveRequest;
import com.hubstore.staffarea.v1.SetServiceEmployeeActiveResponse;
import com.hubstore.staffarea.v1.StaffAreaServiceGrpc;
import com.hubstore.staffarea.v1.UpdateServiceEmployeeRequest;
import com.hubstore.staffarea.v1.UpdateServiceEmployeeResponse;
import com.hubstore.staffarea.v1.VerifyPaymentAccountRequest;
import com.hubstore.staffarea.v1.VerifyPaymentAccountResponse;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Impl 6 RPC của StaffAreaService (SF-17). Pattern FulfillmentServiceImpl:
 * reject = INVALID_ARGUMENT + metadata x-error-details (GrpcErrors), catch
 * RuntimeException → INTERNAL. KHÔNG enforce role ở Java (services trust BFF).
 *
 * Validate (spec SF-17 §5): employee_code ^[A-Z0-9_-]{3,32}$; payment_account
 * ^\d{9,16}$; title non-blank ≤32; full_name non-blank; region_codes cap 100.
 *
 * VerifyPaymentAccount: delegate adapter PaymentAccountVerifier (dual-mode:
 * mock mặc định, zalopay qua PAYMENT_VERIFY_PROVIDER — spec SF-17 §5).
 */
@GrpcService
public class StaffAreaServiceImpl extends StaffAreaServiceGrpc.StaffAreaServiceImplBase {

    static final Pattern EMPLOYEE_CODE_PATTERN = Pattern.compile("^[A-Z0-9_-]{3,32}$");
    static final Pattern PAYMENT_ACCOUNT_PATTERN = Pattern.compile("^\\d{9,16}$");

    /** Cap region_codes (spec SF-17 edge cases — "cap 100 (message vượt)"). */
    static final int MAX_REGIONS = 100;

    private final ServiceEmployeeRepository repo;
    private final com.hubstore.fulfillment.payment.PaymentAccountVerifier paymentVerifier;

    public StaffAreaServiceImpl(ServiceEmployeeRepository repo,
                                com.hubstore.fulfillment.payment.PaymentAccountVerifier paymentVerifier) {
        this.repo = repo;
        this.paymentVerifier = paymentVerifier;
    }

    // ---------------- reads ----------------

    @Override
    public void listServiceEmployees(ListServiceEmployeesRequest request,
                                     StreamObserver<ListServiceEmployeesResponse> responseObserver) {
        try {
            var result = repo.list(new ListFilter(
                    request.getTitleCode(), request.getQuery(), request.getRegionCode()));
            ListServiceEmployeesResponse.Builder resp = ListServiceEmployeesResponse.newBuilder()
                    .setTotal(result.total());
            result.items().forEach(e -> resp.addItems(toProto(e)));
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void getServiceEmployee(GetServiceEmployeeRequest request,
                                   StreamObserver<GetServiceEmployeeResponse> responseObserver) {
        try {
            ServiceEmployee employee = repo.get(request.getEmployeeCode())
                    .orElseThrow(() -> notFound(request.getEmployeeCode()));
            responseObserver.onNext(GetServiceEmployeeResponse.newBuilder()
                    .setEmployee(toProto(employee)).build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- mutations ----------------

    @Override
    public void createServiceEmployee(CreateServiceEmployeeRequest request,
                                      StreamObserver<CreateServiceEmployeeResponse> responseObserver) {
        try {
            ServiceEmployee input = requireValid(request.getEmployee());
            ServiceEmployee created = repo.create(input);
            responseObserver.onNext(CreateServiceEmployeeResponse.newBuilder()
                    .setEmployee(toProto(repo.get(created.employeeCode())
                            .orElse(created))).build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (ServiceEmployeeRepository.InvalidRegionCodesException e) {
            responseObserver.onError(GrpcErrors.withDetails(
                    Status.INVALID_ARGUMENT, e.getMessage(),
                    List.of(new GrpcErrors.ErrorDetail("regionCodes", e.getMessage()))));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            responseObserver.onError(GrpcErrors.withDetails(
                    Status.ALREADY_EXISTS, "employee_code đã tồn tại.",
                    List.of(new GrpcErrors.ErrorDetail("employeeCode",
                            "employee_code đã tồn tại."))));
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void updateServiceEmployee(UpdateServiceEmployeeRequest request,
                                      StreamObserver<UpdateServiceEmployeeResponse> responseObserver) {
        try {
            if (request.getEmployeeCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "employeeCode", "employeeCode bắt buộc.")));
            }
            // Validate employee_code theo PATH PARAM (immutable — bỏ qua proto field).
            ServiceEmployee input = requireValid(request.getEmployee().toBuilder()
                    .setEmployeeCode(request.getEmployeeCode()).build());
            repo.get(request.getEmployeeCode())
                    .orElseThrow(() -> notFound(request.getEmployeeCode()));
            ServiceEmployee updated = repo.update(request.getEmployeeCode(),
                    new ServiceEmployee(request.getEmployeeCode(), input.fullName(), input.titleCode(),
                            input.paymentAccount(), input.isActive(), input.regionCodes(),
                            input.createdAt(), input.updatedAt()));
            responseObserver.onNext(UpdateServiceEmployeeResponse.newBuilder()
                    .setEmployee(toProto(updated)).build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (ServiceEmployeeRepository.InvalidRegionCodesException e) {
            responseObserver.onError(GrpcErrors.withDetails(
                    Status.INVALID_ARGUMENT, e.getMessage(),
                    List.of(new GrpcErrors.ErrorDetail("regionCodes", e.getMessage()))));
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void setServiceEmployeeActive(SetServiceEmployeeActiveRequest request,
                                         StreamObserver<SetServiceEmployeeActiveResponse> responseObserver) {
        try {
            if (request.getEmployeeCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "employeeCode", "employeeCode bắt buộc.")));
            }
            repo.get(request.getEmployeeCode())
                    .orElseThrow(() -> notFound(request.getEmployeeCode()));
            ServiceEmployee updated = repo.setActive(request.getEmployeeCode(), request.getIsActive());
            responseObserver.onNext(SetServiceEmployeeActiveResponse.newBuilder()
                    .setEmployee(toProto(updated)).build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- verify (dual-mode — task 2: MOCK inline) ----------------

    @Override
    public void verifyPaymentAccount(VerifyPaymentAccountRequest request,
                                     StreamObserver<VerifyPaymentAccountResponse> responseObserver) {
        try {
            // Delegate adapter dual-mode (mock default / zalopay qua env) — task 3.
            com.hubstore.fulfillment.payment.PaymentAccountVerifier.VerifyResult r =
                    paymentVerifier.verify(request.getPaymentAccount().trim());
            responseObserver.onNext(VerifyPaymentAccountResponse.newBuilder()
                    .setValid(r.valid())
                    .setSource(r.source() == null ? "" : r.source())
                    .setMessage(r.message() == null ? "" : r.message())
                    .build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- validation ----------------

    /**
     * Validate đầy đủ input create/update → trả record đã normalize (dedupe
     * region_codes, giữ thứ tự). Lỗi → INVALID_ARGUMENT gộp mọi detail.
     * Static để unit test không cần DB/gRPC runtime.
     */
    static ServiceEmployee requireValid(com.hubstore.staffarea.v1.ServiceEmployee proto) {
        List<GrpcErrors.ErrorDetail> details = validate(proto);
        if (!details.isEmpty()) {
            throw GrpcErrors.invalidArgument(details);
        }
        List<String> regions = List.copyOf(new LinkedHashSet<>(proto.getRegionCodesList()));
        return new ServiceEmployee(proto.getEmployeeCode(), proto.getFullName().trim(),
                proto.getTitleCode().trim(), proto.getPaymentAccount(), proto.getIsActive(),
                regions, null, null);
    }

    public static List<GrpcErrors.ErrorDetail> validate(com.hubstore.staffarea.v1.ServiceEmployee proto) {
        java.util.List<GrpcErrors.ErrorDetail> details = new java.util.ArrayList<>();
        if (!EMPLOYEE_CODE_PATTERN.matcher(proto.getEmployeeCode()).matches()) {
            details.add(new GrpcErrors.ErrorDetail("employeeCode",
                    "employee_code phải khớp ^[A-Z0-9_-]{3,32}$ (3-32 ký tự IN HOA/số/_/-)."));
        }
        if (proto.getFullName().isBlank()) {
            details.add(new GrpcErrors.ErrorDetail("fullName", "full_name bắt buộc."));
        } else if (proto.getFullName().trim().length() > 128) {
            details.add(new GrpcErrors.ErrorDetail("fullName", "full_name tối đa 128 ký tự."));
        }
        if (proto.getTitleCode().isBlank()) {
            details.add(new GrpcErrors.ErrorDetail("titleCode", "title_code bắt buộc (non-blank)."));
        } else if (proto.getTitleCode().trim().length() > 32) {
            details.add(new GrpcErrors.ErrorDetail("titleCode", "title_code tối đa 32 ký tự."));
        }
        if (!PAYMENT_ACCOUNT_PATTERN.matcher(proto.getPaymentAccount()).matches()) {
            details.add(new GrpcErrors.ErrorDetail("paymentAccount",
                    "payment_account phải có 9-16 chữ số."));
        }
        if (proto.getRegionCodesCount() > MAX_REGIONS) {
            details.add(new GrpcErrors.ErrorDetail("regionCodes",
                    "Tối đa " + MAX_REGIONS + " khu vực được chọn (hiện "
                            + proto.getRegionCodesCount() + ")."));
        }
        return details;
    }

    // ---------------- mapping helpers ----------------

    private static com.hubstore.staffarea.v1.ServiceEmployee toProto(ServiceEmployee e) {
        com.hubstore.staffarea.v1.ServiceEmployee.Builder b =
                com.hubstore.staffarea.v1.ServiceEmployee.newBuilder()
                        .setEmployeeCode(orEmpty(e.employeeCode()))
                        .setFullName(orEmpty(e.fullName()))
                        .setTitleCode(orEmpty(e.titleCode()))
                        .setPaymentAccount(orEmpty(e.paymentAccount()))
                        .setIsActive(e.isActive())
                        .setCreatedAt(e.createdAt() == null ? "" : e.createdAt().toString())
                        .setUpdatedAt(e.updatedAt() == null ? "" : e.updatedAt().toString());
        e.regionCodes().forEach(b::addRegionCodes);
        return b.build();
    }

    private static StatusRuntimeException notFound(String employeeCode) {
        return GrpcErrors.withDetails(Status.NOT_FOUND, "ServiceEmployee " + employeeCode
                        + " not found.",
                List.of(new GrpcErrors.ErrorDetail("employeeCode",
                        "ServiceEmployee " + employeeCode + " không tồn tại.")));
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
