package com.hubstore.fulfillment.service;

import com.hubstore.fulfillment.store.TechModels;
import com.hubstore.fulfillment.store.TechOrderRepository;
import com.hubstore.fulfillment.v1.AcceptOrderRequest;
import com.hubstore.fulfillment.v1.AssignTechnicianRequest;
import com.hubstore.fulfillment.v1.AssignTechnicianResponse;
import com.hubstore.fulfillment.v1.CompleteOrderRequest;
import com.hubstore.fulfillment.v1.Contact;
import com.hubstore.fulfillment.v1.DeliveryOrder;
import com.hubstore.fulfillment.v1.DeliveryStatus;
import com.hubstore.fulfillment.v1.FilterDeliveryOrdersRequest;
import com.hubstore.fulfillment.v1.FilterDeliveryOrdersResponse;
import com.hubstore.fulfillment.v1.FilterInstallationOrdersRequest;
import com.hubstore.fulfillment.v1.FilterInstallationOrdersResponse;
import com.hubstore.fulfillment.v1.GeoPoint;
import com.hubstore.fulfillment.v1.InstallationOrder;
import com.hubstore.fulfillment.v1.MutateTechOrderResponse;
import com.hubstore.fulfillment.v1.RescheduleOrderRequest;
import com.hubstore.fulfillment.v1.SuggestTechniciansRequest;
import com.hubstore.fulfillment.v1.SuggestTechniciansResponse;
import com.hubstore.fulfillment.v1.SuggestedTechnician;
import com.hubstore.fulfillment.v1.TechButtons;
import com.hubstore.fulfillment.v1.TechItem;
import com.hubstore.fulfillment.v1.TechServiceGrpc;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;

import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * Impl 4 RPC của TechService (SF-19, plan Task 5) — validation + enum mapping
 * ở biên proto. Status trong models/repo = string thường ("NEW"...); proto
 * enum value prefix DELIVERY_STATUS_* map tại đây (plan §4). Buttons flags
 * BE-authoritative (spec §5) — tính bằng TechModels, không do client.
 */
@GrpcService
public class TechServiceImpl extends TechServiceGrpc.TechServiceImplBase {

    private static final String ENUM_PREFIX = "DELIVERY_STATUS_";

    private final TechOrderRepository repo;

    public TechServiceImpl(TechOrderRepository repo) {
        this.repo = repo;
    }

    // ---------------- filter delivery ----------------

    @Override
    public void filterDeliveryOrders(FilterDeliveryOrdersRequest request,
                                     StreamObserver<FilterDeliveryOrdersResponse> responseObserver) {
        try {
            TechModels.DeliveryFilter filter = new TechModels.DeliveryFilter(
                    statusesOf(request.getStatusesList()),
                    request.getDriverName(),
                    List.copyOf(request.getCategoryL1List()),
                    List.copyOf(request.getCategoryL2List()),
                    request.getRegionCode(),
                    request.getProvince(),
                    parseDate(request.getDateFrom(), "dateFrom"),
                    parseDate(request.getDateTo(), "dateTo"),
                    request.getPage(),
                    request.getPageSize());
            TechModels.DeliveryPage page = repo.filterDelivery(filter);
            FilterDeliveryOrdersResponse.Builder resp = FilterDeliveryOrdersResponse.newBuilder()
                    .setTotal(page.total())
                    .setPage(Math.max(request.getPage(), 1))
                    .setPageSize(request.getPageSize() <= 0 ? 10 : request.getPageSize());
            page.items().forEach(o -> resp.addItems(toProtoDelivery(o)));
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- filter installation ----------------

    @Override
    public void filterInstallationOrders(FilterInstallationOrdersRequest request,
                                         StreamObserver<FilterInstallationOrdersResponse> responseObserver) {
        try {
            TechModels.InstallationFilter filter = new TechModels.InstallationFilter(
                    statusesOf(request.getStatusesList()),
                    request.getTechnicianCode(),
                    List.copyOf(request.getCategoryL1List()),
                    List.copyOf(request.getCategoryL2List()),
                    request.getRegionCode(),
                    request.getProvince(),
                    parseDate(request.getDateFrom(), "dateFrom"),
                    parseDate(request.getDateTo(), "dateTo"),
                    request.getPage(),
                    request.getPageSize());
            TechModels.InstallationPage page = repo.filterInstallation(filter);
            FilterInstallationOrdersResponse.Builder resp = FilterInstallationOrdersResponse.newBuilder()
                    .setTotal(page.total())
                    .setPage(Math.max(request.getPage(), 1))
                    .setPageSize(request.getPageSize() <= 0 ? 10 : request.getPageSize());
            page.items().forEach(o -> resp.addItems(toProtoInstallation(o)));
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- assign technician ----------------

    /**
     * Lỗi phân tầng: blank → INVALID_ARGUMENT; SO lạ → NOT_FOUND; KTV lạ →
     * INVALID_ARGUMENT (spec §6.1); sai trạng thái → FAILED_PRECONDITION.
     * Check findInstallation/findTechnician TRƯỚC khi assign để error code
     * chính xác (repo chỉ ném chung IllegalStateException cho sai trạng thái).
     */
    @Override
    public void assignTechnician(AssignTechnicianRequest request,
                                 StreamObserver<AssignTechnicianResponse> responseObserver) {
        try {
            if (request.getServiceOrderCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "serviceOrderCode", "serviceOrderCode bắt buộc.")));
            }
            if (request.getTechnicianCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "technicianCode", "technicianCode bắt buộc.")));
            }
            if (repo.findInstallation(request.getServiceOrderCode()).isEmpty()) {
                throw GrpcErrors.notFound("serviceOrderCode", request.getServiceOrderCode());
            }
            if (repo.findTechnician(request.getTechnicianCode()).isEmpty()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "technicianCode", "KTV không tồn tại: " + request.getTechnicianCode())));
            }
            TechModels.InstallationOrder updated = repo.assignTechnician(
                    request.getServiceOrderCode(), request.getTechnicianCode(),
                    "fulfillment-service", Instant.now());
            responseObserver.onNext(AssignTechnicianResponse.newBuilder()
                    .setOrder(toProtoInstallation(updated))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (IllegalStateException e) {
            responseObserver.onError(Status.FAILED_PRECONDITION
                    .withDescription(e.getMessage()).asRuntimeException());
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- suggest technicians ----------------

    @Override
    public void suggestTechnicians(SuggestTechniciansRequest request,
                                   StreamObserver<SuggestTechniciansResponse> responseObserver) {
        try {
            if (request.getRegionCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "regionCode", "regionCode bắt buộc.")));
            }
            SuggestTechniciansResponse.Builder resp = SuggestTechniciansResponse.newBuilder();
            for (TechModels.SuggestedTechnician s : repo.suggestTechnicians(request.getRegionCode())) {
                resp.addItems(SuggestedTechnician.newBuilder()
                        .setCode(orEmpty(s.technician().code()))
                        .setName(orEmpty(s.technician().name()))
                        .setType(orEmpty(s.technician().type()))
                        .setActiveCount(s.activeCount()));
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- SF-25 accept/complete/reschedule (spec §4.2) ----------------

    private static final ZoneOffset ZONE_HCM = ZoneOffset.of("+07:00");

    /**
     * Lỗi phân tầng như assign: blank → INVALID_ARGUMENT; SO lạ → NOT_FOUND;
     * không phải chủ đơn / sai trạng thái → FAILED_PRECONDITION (spec §4.2 —
     * not-owner trùng mapping wrong-state là pattern-consistency, flag Linear).
     * Response = đơn re-fetched với flags re-computed.
     */
    @Override
    public void acceptOrder(AcceptOrderRequest request,
                            StreamObserver<MutateTechOrderResponse> responseObserver) {
        try {
            TechModels.InstallationOrder updated = repo.acceptInstallation(
                    requireOrderAndOwner(request.getServiceOrderCode(), request.getTechnicianCode()),
                    request.getTechnicianCode(), OffsetDateTime.now(ZONE_HCM));
            respondMutated(updated, responseObserver);
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (IllegalStateException e) {
            responseObserver.onError(Status.FAILED_PRECONDITION
                    .withDescription(e.getMessage()).asRuntimeException());
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void completeOrder(CompleteOrderRequest request,
                              StreamObserver<MutateTechOrderResponse> responseObserver) {
        try {
            TechModels.InstallationOrder updated = repo.completeInstallation(
                    requireOrderAndOwner(request.getServiceOrderCode(), request.getTechnicianCode()),
                    request.getTechnicianCode(), OffsetDateTime.now(ZONE_HCM));
            respondMutated(updated, responseObserver);
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (IllegalStateException e) {
            responseObserver.onError(Status.FAILED_PRECONDITION
                    .withDescription(e.getMessage()).asRuntimeException());
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /**
     * Reschedule: CONFIRMED|PROCESSING|REDELIVERY|RESCHEDULED → RESCHEDULED +
     * expected_time = newExpectedTime (ISO-8601; quá khứ → INVALID_ARGUMENT).
     */
    @Override
    public void rescheduleOrder(RescheduleOrderRequest request,
                                StreamObserver<MutateTechOrderResponse> responseObserver) {
        try {
            String soCode = requireOrderAndOwner(request.getServiceOrderCode(), request.getTechnicianCode());
            OffsetDateTime newTime = parseExpectedTime(request.getNewExpectedTime());
            if (newTime.isBefore(OffsetDateTime.now(ZONE_HCM))) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "newExpectedTime", "newExpectedTime không được ở quá khứ: " + request.getNewExpectedTime())));
            }
            TechModels.InstallationOrder updated = repo.rescheduleInstallation(
                    soCode, request.getTechnicianCode(), newTime, request.getNote(),
                    OffsetDateTime.now(ZONE_HCM));
            respondMutated(updated, responseObserver);
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (IllegalStateException e) {
            responseObserver.onError(Status.FAILED_PRECONDITION
                    .withDescription(e.getMessage()).asRuntimeException());
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /** Blank → INVALID_ARGUMENT; SO lạ → NOT_FOUND; không chủ đơn → FAILED_PRECONDITION. Trả SO code. */
    private String requireOrderAndOwner(String serviceOrderCode, String technicianCode) {
        if (serviceOrderCode == null || serviceOrderCode.isBlank()) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "serviceOrderCode", "serviceOrderCode bắt buộc.")));
        }
        if (technicianCode == null || technicianCode.isBlank()) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "technicianCode", "technicianCode bắt buộc.")));
        }
        TechModels.InstallationOrder order = repo.findInstallation(serviceOrderCode)
                .orElseThrow(() -> GrpcErrors.notFound("serviceOrderCode", serviceOrderCode));
        // SF-25 security-audit P1: case-insensitive — KC 26 lowercase username khi
        // import → token sub 'ktv-001' vs DB 'KTV-001'; check service-layer chạy
        // TRƯỚC repo (repo cũng equalsIgnoreCase — parity 2 tầng).
        if (!technicianCode.equalsIgnoreCase(order.technicianCode())) {
            throw Status.FAILED_PRECONDITION.withDescription("Đơn " + serviceOrderCode
                    + " không thuộc KTV " + technicianCode).asRuntimeException();
        }
        return serviceOrderCode;
    }

    private static OffsetDateTime parseExpectedTime(String raw) {
        if (raw == null || raw.isBlank()) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "newExpectedTime", "newExpectedTime bắt buộc.")));
        }
        try {
            return OffsetDateTime.parse(raw);
        } catch (DateTimeParseException e) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "newExpectedTime", "newExpectedTime phải là ISO-8601: " + raw)));
        }
    }

    private static void respondMutated(TechModels.InstallationOrder updated,
                                       StreamObserver<MutateTechOrderResponse> responseObserver) {
        responseObserver.onNext(MutateTechOrderResponse.newBuilder()
                .setOrder(toProtoInstallation(updated))
                .build());
        responseObserver.onCompleted();
    }

    // ---------------- proto ↔ models mapping ----------------

    /** Enum → string thường; UNRECOGNIZED trong filter bỏ qua (plan §4). */
    private static List<String> statusesOf(List<DeliveryStatus> statuses) {
        List<String> out = new ArrayList<>();
        for (DeliveryStatus s : statuses) {
            if (s == DeliveryStatus.UNRECOGNIZED) {
                continue;
            }
            out.add(s.name().substring(ENUM_PREFIX.length()));
        }
        return out;
    }

    private static DeliveryStatus toProtoStatus(String status) {
        try {
            return DeliveryStatus.valueOf(ENUM_PREFIX + status);
        } catch (IllegalArgumentException e) {
            return DeliveryStatus.UNRECOGNIZED;
        }
    }

    private static LocalDate parseDate(String raw, String field) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException e) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    field, field + " phải là ISO yyyy-MM-dd: " + raw)));
        }
    }

    private static DeliveryOrder toProtoDelivery(TechModels.DeliveryOrder o) {
        DeliveryOrder.Builder b = DeliveryOrder.newBuilder()
                .setCode(orEmpty(o.code()))
                .setStatus(toProtoStatus(o.status()))
                .setDriverName(orEmpty(o.driverName()))
                .setDriverPhone(orEmpty(o.driverPhone()))
                .setReceiver(toProtoContact(o.receiver()))
                .setSender(toProtoContact(o.sender()))
                .setFee(o.fee())
                .setTip(o.tip())
                .setRegionCode(orEmpty(o.regionCode()))
                .setProvince(orEmpty(o.province()))
                .setCoordinationJson(orEmpty(o.coordinationJson()))
                .setDeliveryDate(o.deliveryDate() == null ? "" : o.deliveryDate().toString())
                .setCreatedAt(isoOrEmpty(o.createdAt()))
                .setButtons(toProtoButtons(TechModels.deliveryButtons(o)));
        o.items().forEach(i -> b.addItems(toProtoItem(i)));
        return b.build();
    }

    private static InstallationOrder toProtoInstallation(TechModels.InstallationOrder o) {
        InstallationOrder.Builder b = InstallationOrder.newBuilder()
                .setServiceOrderCode(orEmpty(o.serviceOrderCode()))
                .setDeliveryOrderCode(orEmpty(o.deliveryOrderCode()))
                .setTechnicianCode(orEmpty(o.technicianCode()))
                .setStatus(toProtoStatus(o.status()))
                .setExpectedTime(isoOrEmpty(o.expectedTime()))
                .setTimelineJson(orEmpty(o.timelineJson()))
                .setServiceFee(o.serviceFee())
                .setFeeAdjust(o.feeAdjust())
                .setRegionCode(orEmpty(o.regionCode()))
                .setProvince(orEmpty(o.province()))
                .setCreatedAt(isoOrEmpty(o.createdAt()))
                .setButtons(toProtoButtons(TechModels.installationButtons(o)));
        o.items().forEach(i -> b.addItems(toProtoItem(i)));
        return b.build();
    }

    private static TechItem toProtoItem(TechModels.TechItem i) {
        return TechItem.newBuilder()
                .setCode(orEmpty(i.code()))
                .setName(orEmpty(i.name()))
                .setQuantity(i.quantity())
                .setCategoryL1(orEmpty(i.categoryL1()))
                .setCategoryL2(orEmpty(i.categoryL2()))
                .build();
    }

    private static Contact toProtoContact(TechModels.Contact c) {
        Contact.Builder b = Contact.newBuilder()
                .setName(c == null ? "" : orEmpty(c.name()))
                .setPhone(c == null ? "" : orEmpty(c.phone()));
        if (c != null && c.lat() != null && c.lon() != null) {
            b.setLocation(GeoPoint.newBuilder().setLat(c.lat()).setLong(c.lon()));
        }
        return b.build();
    }

    private static TechButtons toProtoButtons(TechModels.TechButtons btn) {
        return TechButtons.newBuilder()
                .setAllowCancel(btn.allowCancel())
                .setAllowAssign(btn.allowAssign())
                .setAllowReassign(btn.allowReassign())
                .setAllowAccept(btn.allowAccept())
                .setAllowReschedule(btn.allowReschedule())
                .setAllowComplete(btn.allowComplete())
                .build();
    }

    private static String isoOrEmpty(OffsetDateTime t) {
        return t == null ? "" : t.format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
