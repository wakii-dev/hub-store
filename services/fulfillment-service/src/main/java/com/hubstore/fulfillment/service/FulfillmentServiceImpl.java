package com.hubstore.fulfillment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.protobuf.Timestamp;
import com.hubstore.fulfillment.events.OrderEventPublisher;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.store.CodConfirmation;
import com.hubstore.fulfillment.store.CodConfirmationRepository;
import com.hubstore.fulfillment.store.D2cFilterResult;
import com.hubstore.fulfillment.store.D2cOrderFilter;
import com.hubstore.fulfillment.store.D2cOrderRecord;
import com.hubstore.fulfillment.store.D2cOrderRepository;
import com.hubstore.fulfillment.store.DashboardStatsData;
import com.hubstore.fulfillment.store.FilterResult;
import com.hubstore.fulfillment.store.OrderFilter;
import com.hubstore.fulfillment.store.OrderRepository;
import com.hubstore.fulfillment.v1.ConfirmBatchCodRequest;
import com.hubstore.fulfillment.v1.ConfirmBatchCodResponse;
import com.hubstore.fulfillment.v1.ConfirmCodItem;
import com.hubstore.fulfillment.v1.ConfirmCodRequest;
import com.hubstore.fulfillment.v1.ConfirmCodResponse;
import com.hubstore.fulfillment.v1.ConfirmCodResult;
import com.hubstore.fulfillment.v1.D2cOrder;
import com.hubstore.fulfillment.v1.FilterD2cOrdersRequest;
import com.hubstore.fulfillment.v1.FilterD2cOrdersResponse;
import com.hubstore.fulfillment.v1.GetCodPendingRequest;
import com.hubstore.fulfillment.v1.GetCodPendingResponse;
import com.hubstore.fulfillment.v1.UpdateD2cOrderNoteRequest;
import com.hubstore.fulfillment.v1.UpdateD2cOrderNoteResponse;
import com.hubstore.fulfillment.v1.AssignShopHubRequest;
import com.hubstore.fulfillment.v1.AssignShopHubResponse;
import com.hubstore.fulfillment.v1.BatchOrderCount;
import com.hubstore.fulfillment.v1.BatchStatus;
import com.hubstore.fulfillment.v1.CoordinationStatus;
import com.hubstore.fulfillment.v1.DayCount;
import com.hubstore.fulfillment.v1.DeliveryStaff;
import com.hubstore.fulfillment.v1.GetDashboardStatsRequest;
import com.hubstore.fulfillment.v1.GetDashboardStatsResponse;
import com.hubstore.fulfillment.v1.FilterOrdersRequest;
import com.hubstore.fulfillment.v1.FilterOrdersResponse;
import com.hubstore.fulfillment.v1.FulfillmentServiceGrpc;
import com.hubstore.fulfillment.v1.GetAssignHistoryRequest;
import com.hubstore.fulfillment.v1.GetAssignHistoryResponse;
import com.hubstore.fulfillment.v1.GetOrderDetailRequest;
import com.hubstore.fulfillment.v1.GetOrderDetailResponse;
import com.hubstore.fulfillment.v1.GetOrdersByCodesRequest;
import com.hubstore.fulfillment.v1.GetOrdersByCodesResponse;
import com.hubstore.fulfillment.v1.GetTimeDeliveryRequest;
import com.hubstore.fulfillment.v1.GetTimeDeliveryResponse;
import com.hubstore.fulfillment.v1.HubStoreOrderFilterItem;
import com.hubstore.fulfillment.v1.ListDeliveryStaffRequest;
import com.hubstore.fulfillment.v1.ListDeliveryStaffResponse;
import com.hubstore.fulfillment.v1.ListDistinctShopsRequest;
import com.hubstore.fulfillment.v1.ListDistinctShopsResponse;
import com.hubstore.fulfillment.v1.ListRegionsRequest;
import com.hubstore.fulfillment.v1.ListRegionsResponse;
import com.hubstore.fulfillment.v1.MutateOrderStatusRequest;
import com.hubstore.fulfillment.v1.MutateOrderStatusResponse;
import com.hubstore.fulfillment.v1.MutateOrderStatusResult;
import com.hubstore.fulfillment.v1.OrderStatus;
import com.hubstore.fulfillment.v1.Product;
import com.hubstore.fulfillment.v1.Region;
import com.hubstore.fulfillment.v1.RegionType;
import com.hubstore.fulfillment.v1.Shop;
import com.hubstore.fulfillment.v1.ShopAssignment;
import com.hubstore.fulfillment.v1.TimeRange;
import com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest;
import com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse;
import com.hubstore.fulfillment.v1.UpdateNoteRequest;
import com.hubstore.fulfillment.v1.UpdateNoteResponse;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Impl đủ 12 RPC của FulfillmentService (plan Task 3) + validations rule 2+3
 * (plan Task 4). Reject = INVALID_ARGUMENT + metadata x-error-details (pin SF-2).
 * SF-27: publish Kafka event best-effort SAU mutation thành công (side-channel,
 * KHÔNG vào path blocking — publisher không bao giờ throw).
 */
@GrpcService
public class FulfillmentServiceImpl extends FulfillmentServiceGrpc.FulfillmentServiceImplBase {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(FulfillmentServiceImpl.class);

    private static final ObjectMapper JSON = new ObjectMapper();

    private final OrderRepository repo;
    private final OrderEventPublisher events;
    private final D2cOrderRepository d2cRepo;
    private final CodConfirmationRepository codRepo;
    private final TransactionTemplate transactions;

    public FulfillmentServiceImpl(OrderRepository repo, OrderEventPublisher events,
            D2cOrderRepository d2cRepo, CodConfirmationRepository codRepo,
            TransactionTemplate transactions) {
        this.repo = repo;
        this.events = events;
        this.d2cRepo = d2cRepo;
        this.codRepo = codRepo;
        this.transactions = transactions;
    }

    // ---------------- D1 list + detail + hydration ----------------

    @Override
    public void filterOrders(FilterOrdersRequest request, StreamObserver<FilterOrdersResponse> responseObserver) {
        try {
            OrderFilter filter = new OrderFilter(
                    request.getFulfillCode(),
                    enumsOf(request.getBatchStatusesList(), BatchStatus.class, BatchStatus::getNumber),
                    request.hasDeliveryTime() ? fromProto(request.getDeliveryTime()) : null,
                    Set.copyOf(request.getRegionCodesList()),
                    Set.copyOf(request.getShopCodesList()),
                    enumsOf(request.getOrderStatusesList(), OrderStatus.class, OrderStatus::getNumber),
                    request.hasCreatedTime() ? fromProto(request.getCreatedTime()) : null,
                    request.hasOriginalTime() ? fromProto(request.getOriginalTime()) : null,
                    Set.copyOf(request.getExcludeFulfillCodesList()),
                    request.getPage(),
                    request.getPageSize());
            FilterResult result = repo.filter(filter);
            FilterOrdersResponse.Builder resp = FilterOrdersResponse.newBuilder()
                    .setTotal(result.total())
                    .setPage(Math.max(request.getPage(), 1))
                    .setPageSize(request.getPageSize() <= 0 ? 10 : request.getPageSize());
            result.items().forEach(o -> resp.addItems(toFilterItem(o)));
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void getOrderDetail(GetOrderDetailRequest request, StreamObserver<GetOrderDetailResponse> responseObserver) {
        try {
            SeedModels.OrderSeed order = repo.findByFulfillCode(request.getFulfillCode())
                    .orElseThrow(() -> GrpcErrors.notFound("fulfillCode", request.getFulfillCode()));
            responseObserver.onNext(GetOrderDetailResponse.newBuilder()
                    .setOrder(toFilterItem(order))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /** Hydration — Go gọi validate rule 1 (cùng kho + batchStatus=0). Trả truth, không filter. */
    @Override
    public void getOrdersByCodes(GetOrdersByCodesRequest request, StreamObserver<GetOrdersByCodesResponse> responseObserver) {
        try {
            GetOrdersByCodesResponse.Builder resp = GetOrdersByCodesResponse.newBuilder();
            repo.findByCodes(request.getFulfillCodesList())
                    .forEach(o -> resp.addOrders(toFilterItem(o)));
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- MutateOrderStatus (Go caller) ----------------

    @Override
    public void mutateOrderStatus(MutateOrderStatusRequest request, StreamObserver<MutateOrderStatusResponse> responseObserver) {
        try {
            int target = request.getTargetBatchStatus().getNumber();
            if (target < 0 || target > 2) {
                // 3 (lỗi vượt trọng lượng) chỉ seed đặt tay — mutation chỉ 0/1/2.
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "targetBatchStatus", "Chỉ chấp nhận target 0 (Chưa soạn) / 1 (Đang soạn) / 2 (Đã soạn).")));
            }
            MutateOrderStatusResponse.Builder resp = MutateOrderStatusResponse.newBuilder();
            // Dedup codes — mỗi code đúng 1 result.
            List<String> codes = List.copyOf(new LinkedHashSet<>(request.getFulfillCodesList()));
            for (String code : codes) {
                if (repo.findByFulfillCode(code).isEmpty()) {
                    resp.addResults(MutateOrderStatusResult.newBuilder()
                            .setFulfillCode(code).setSuccess(false)
                            .setMessage("Order " + code + " không tồn tại."));
                }
            }
            // SF-14 D1/D8 — mutation + cod_confirmations trong 1 transaction thật
            // (TransactionTemplate, KHÔNG @Transactional self-invocation qua this).
            // target=2: eager chèn PENDING cho đơn cod>0 (completed_at = anchor).
            // target=0: revert → xóa PENDING rows (CONFIRMED giữ — D8).
            // target=1: không đụng COD — mutate thẳng (repo tự tx bên Postgres).
            List<SeedModels.OrderSeed> updated;
            if (target == 2 || target == 0) {
                updated = transactions.execute(tx -> {
                    List<SeedModels.OrderSeed> res = repo.mutateBatchStatus(codes, target);
                    if (target == 2) {
                        Instant completedAt = Instant.now();
                        for (SeedModels.OrderSeed o : res) {
                            if (o.codAmount() > 0) {
                                codRepo.insertPendingIfAbsent(new CodConfirmation(
                                        o.fulfillCode(), o.batchCode(),
                                        o.shopAssignment() == null ? null : o.shopAssignment().shopCode(),
                                        o.shopAssignment() == null ? null : o.shopAssignment().shopName(),
                                        o.codAmount(), null, null, null, completedAt,
                                        CodConfirmation.STATUS_PENDING));
                            }
                        }
                    } else {
                        codRepo.deletePendingByFulfillCodes(codes);
                    }
                    return res;
                });
            } else {
                updated = repo.mutateBatchStatus(codes, target);
            }
            if (updated == null) {
                updated = List.of();
            }
            if (updated.isEmpty() && !codes.isEmpty()) {
                // SF-27 carry-in (spec-critic): repo trả rỗng dù có codes → không publish.
                log.warn("fulfillment: mutateOrderStatus updated none of {} codes — skip publish", codes.size());
            }
            for (SeedModels.OrderSeed o : updated) {
                resp.addResults(MutateOrderStatusResult.newBuilder()
                        .setFulfillCode(o.fulfillCode()).setSuccess(true)
                        .setMessage("batchStatus=" + o.batchStatus() + "."));
                // SF-27 — side-channel publish per-order (target 1/PREPARING không
                // publish — đủ bởi batch.created phía Go).
                if (target == 0) {
                    events.publish("order.cancelled", o.fulfillCode(),
                            Map.of("fulfillCode", o.fulfillCode(), "reason", request.getReason()));
                } else if (target == 2) {
                    events.publish("order.completed", o.fulfillCode(), Map.of("fulfillCode", o.fulfillCode()));
                }
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- Chuyển kho + history ----------------

    /**
     * Rule 2 (spec §3.6): đúng 1 đơn + isDebtSplittingOrder=false + batchStatus=0.
     * Mỗi lần chỉ 1 fulfillCode (proto single field); code trống = 0 đơn → reject.
     */
    @Override
    public void assignShopHub(AssignShopHubRequest request, StreamObserver<AssignShopHubResponse> responseObserver) {
        try {
            if (request.getFulfillCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "fulfillCode", "Chuyển kho yêu cầu đúng 1 đơn.")));
            }
            if (request.getTargetShopCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "targetShopCode", "targetShopCode bắt buộc.")));
            }
            SeedModels.OrderSeed order = repo.findByFulfillCode(request.getFulfillCode())
                    .orElseThrow(() -> GrpcErrors.notFound("fulfillCode", request.getFulfillCode()));
            if (order.isDebtSplittingOrder()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "fulfillCode", "Đơn chia nợ (" + order.fulfillCode() + ") không được chuyển kho.")));
            }
            if (order.batchStatus() != 0) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "batchStatus", "Chỉ đơn Chưa soạn (0) được chuyển kho; đơn đang batchStatus="
                                + order.batchStatus() + " (có thể nằm trong phiếu ACTIVE).")));
            }
            SeedModels.ShopSeed targetShop = repo.distinctShops().stream()
                    .filter(s -> s.code().equals(request.getTargetShopCode()))
                    .findFirst()
                    .orElseThrow(() -> GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                            "targetShopCode", "Không tồn tại kho CN '" + request.getTargetShopCode() + "'."))));
            SeedModels.OrderSeed updated = repo.assignShopHub(
                    request.getFulfillCode(),
                    new SeedModels.ShopAssignmentSeed(targetShop.code(), targetShop.name(), targetShop.address()),
                    "fulfillment-service",
                    Instant.now());
            // SF-27 — side-channel publish (best-effort, không block response).
            events.publish("order.assigned", updated.fulfillCode(), Map.of(
                    "fulfillCode", updated.fulfillCode(),
                    "targetShop", Map.of("code", targetShop.code(), "name", targetShop.name(),
                            "address", targetShop.address())));
            responseObserver.onNext(AssignShopHubResponse.newBuilder()
                    .setOrder(toFilterItem(updated))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /** READ semantics (spec §3.8): POST-ngữ-nhưng-ĐỌC — trả history hiện có, KHÔNG mutate. */
    @Override
    public void getAssignHistory(GetAssignHistoryRequest request, StreamObserver<GetAssignHistoryResponse> responseObserver) {
        try {
            GetAssignHistoryResponse.Builder resp = GetAssignHistoryResponse.newBuilder();
            repo.getHistory(request.getFulfillCode()).forEach(resp::addEntries);
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- Edit TG giao / ghi chú ----------------

    /** Rule 3 (spec §3.6): chỉ hợp lệ khi batchStatus=0. */
    @Override
    public void updateDeliveryTime(UpdateDeliveryTimeRequest request, StreamObserver<UpdateDeliveryTimeResponse> responseObserver) {
        try {
            if (request.getFulfillCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "fulfillCode", "fulfillCode bắt buộc.")));
            }
            if (!request.hasDeliveryTime() || request.getDeliveryTime().getFrom().isBlank()
                    || request.getDeliveryTime().getTo().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "deliveryTime", "deliveryTime phải có from/to.")));
            }
            SeedModels.OrderSeed order = repo.findByFulfillCode(request.getFulfillCode())
                    .orElseThrow(() -> GrpcErrors.notFound("fulfillCode", request.getFulfillCode()));
            if (order.batchStatus() != 0) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "batchStatus", "Chỉ sửa TG giao khi đơn Chưa soạn (0); đơn đang batchStatus="
                                + order.batchStatus() + ".")));
            }
            SeedModels.OrderSeed updated = repo.updateDeliveryTime(request.getFulfillCode(),
                    fromProto(request.getDeliveryTime()));
            responseObserver.onNext(UpdateDeliveryTimeResponse.newBuilder()
                    .setOrder(toFilterItem(updated))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void updateNote(UpdateNoteRequest request, StreamObserver<UpdateNoteResponse> responseObserver) {
        try {
            if (request.getFulfillCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "fulfillCode", "fulfillCode bắt buộc.")));
            }
            SeedModels.OrderSeed order = repo.findByFulfillCode(request.getFulfillCode())
                    .orElseThrow(() -> GrpcErrors.notFound("fulfillCode", request.getFulfillCode()));
            SeedModels.OrderSeed updated = repo.updateNote(request.getFulfillCode(), request.getNote());
            responseObserver.onNext(UpdateNoteResponse.newBuilder()
                    .setOrder(toFilterItem(updated))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- D2C/Dropship (SF-18, FI-263) ----------------

    /** List + filter đa chiều — normalize paging trong D2cOrderFilter; total từ repo. */
    @Override
    public void filterD2cOrders(FilterD2cOrdersRequest request, StreamObserver<FilterD2cOrdersResponse> responseObserver) {
        try {
            D2cOrderFilter filter = new D2cOrderFilter(
                    request.getSearch(),
                    request.getStatusesList(),
                    request.getCarriersList(),
                    request.getShopsList(),
                    request.getExportEmployeesList(),
                    request.getProductCategory(),
                    request.getProductType(),
                    instantOf(request.hasCreatedFrom(), request.getCreatedFrom()),
                    instantOf(request.hasCreatedTo(), request.getCreatedTo()),
                    instantOf(request.hasPushFrom(), request.getPushFrom()),
                    instantOf(request.hasPushTo(), request.getPushTo()),
                    request.getPushSlotFrom(),
                    request.getPushSlotTo(),
                    request.getPage(),
                    request.getPageSize());
            D2cFilterResult result = d2cRepo.filter(filter);
            FilterD2cOrdersResponse.Builder resp = FilterD2cOrdersResponse.newBuilder()
                    .setTotal(result.total());
            result.items().forEach(o -> resp.addItems(toD2cOrder(o)));
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /** Note khóa order_code; không thấy → NOT_FOUND (precedent UpdateNote). */
    @Override
    public void updateD2cOrderNote(UpdateD2cOrderNoteRequest request, StreamObserver<UpdateD2cOrderNoteResponse> responseObserver) {
        try {
            if (request.getOrderCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "orderCode", "orderCode bắt buộc.")));
            }
            // actor_role chỉ phục vụ audit BFF — repo không dùng (giữ contract proto).
            D2cOrderRecord updated = d2cRepo.updateNote(request.getOrderCode(), request.getNote())
                    .orElseThrow(() -> GrpcErrors.notFound("orderCode", request.getOrderCode()));
            responseObserver.onNext(UpdateD2cOrderNoteResponse.newBuilder()
                    .setOrder(toD2cOrder(updated))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- COD confirm (SF-14, FI-259) ----------------

    /**
     * Per-order confirm — D3 last-write-wins (re-confirm CONFIRMED được, không 422).
     * collected_amount absence = lấy expected; presence 0 = thu thật 0 đồng.
     * Per-code result — 1 code hỏng không kill cả request. Actor từ metadata
     * x-user-name (ActorInterceptor — cùng pattern IntakeServiceImpl).
     */
    @Override
    public void confirmCod(ConfirmCodRequest request, StreamObserver<ConfirmCodResponse> responseObserver) {
        try {
            String actor = ActorInterceptor.currentActor();
            ConfirmCodResponse.Builder resp = ConfirmCodResponse.newBuilder();
            for (ConfirmCodItem item : request.getItemsList()) {
                String code = item.getFulfillCode();
                Optional<CodConfirmation> existing = codRepo.findByFulfillCode(code);
                if (existing.isEmpty()) {
                    resp.addResults(ConfirmCodResult.newBuilder()
                            .setFulfillCode(code).setSuccess(false)
                            .setMessage("Confirmation " + code + " không tồn tại."));
                    continue;
                }
                Long collectedArg = item.hasCollectedAmount() ? item.getCollectedAmount() : null;
                long collected = collectedArg == null ? existing.get().expectedAmount() : collectedArg;
                codRepo.confirmOne(code, collectedArg, actor, Instant.now());
                repo.appendAudit(actor, "cod.confirmed", code, json(Map.of(
                        "expected", existing.get().expectedAmount(),
                        "collected", collected)));
                resp.addResults(ConfirmCodResult.newBuilder()
                        .setFulfillCode(code).setSuccess(true)
                        .setMessage("collected=" + collected + "."));
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /**
     * Bulk confirm phiếu — chỉ PENDING của batch, đơn FAILED loại (D7, filter
     * trong repo). Audit 1 entry per-batch với danh sách codes (tránh spam).
     * confirmed_count = số row đổi; total_amount = tổng expected đã chốt.
     */
    @Override
    public void confirmBatchCod(ConfirmBatchCodRequest request, StreamObserver<ConfirmBatchCodResponse> responseObserver) {
        try {
            if (request.getBatchCode().isBlank()) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "batchCode", "batchCode bắt buộc.")));
            }
            List<CodConfirmation> pending = codRepo.findPendingByBatch(request.getBatchCode());
            long total = pending.stream().mapToLong(CodConfirmation::expectedAmount).sum();
            String actor = ActorInterceptor.currentActor();
            int confirmed = codRepo.confirmBatch(request.getBatchCode(), actor, Instant.now());
            if (confirmed > 0) {
                repo.appendAudit(actor, "cod.batch_confirmed", request.getBatchCode(), json(Map.of(
                        "count", confirmed, "total", total,
                        "codes", pending.stream().map(CodConfirmation::fulfillCode).toList())));
            }
            responseObserver.onNext(ConfirmBatchCodResponse.newBuilder()
                    .setConfirmedCount(confirmed).setTotalAmount(total).build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /** Badge D2 "COD chờ thu (n)" — count/sum PENDING theo phiếu (D7 trong repo). */
    @Override
    public void getCodPending(GetCodPendingRequest request, StreamObserver<GetCodPendingResponse> responseObserver) {
        try {
            List<CodConfirmation> pending = codRepo.findPendingByBatch(request.getBatchCode());
            responseObserver.onNext(GetCodPendingResponse.newBuilder()
                    .setPendingCount(pending.size())
                    .setTotalAmount(pending.stream().mapToLong(CodConfirmation::expectedAmount).sum())
                    .build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- Master data / order-promising ----------------

    @Override
    public void listRegions(ListRegionsRequest request, StreamObserver<ListRegionsResponse> responseObserver) {
        try {
            ListRegionsResponse.Builder resp = ListRegionsResponse.newBuilder();
            for (SeedModels.RegionSeed r : repo.regions()) {
                Region.Builder b = Region.newBuilder().setCode(orEmpty(r.code())).setName(orEmpty(r.name()));
                boolean isWard = "ward".equals(r.type());
                b.setType(isWard ? RegionType.REGION_TYPE_WARD : RegionType.REGION_TYPE_PROVINCE);
                if (isWard && r.parentCode() != null) {
                    b.setParentCode(r.parentCode());
                }
                resp.addRegions(b);
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void listDeliveryStaff(ListDeliveryStaffRequest request, StreamObserver<ListDeliveryStaffResponse> responseObserver) {
        try {
            ListDeliveryStaffResponse.Builder resp = ListDeliveryStaffResponse.newBuilder();
            boolean filterByShop = request.hasShopCode() && !request.getShopCode().isBlank();
            for (SeedModels.DeliveryStaffSeed s : repo.deliveryStaff()) {
                if (filterByShop && !request.getShopCode().equals(s.shopCode())) {
                    continue;
                }
                resp.addItems(DeliveryStaff.newBuilder()
                        .setId(orEmpty(s.staffId()))
                        .setName(orEmpty(s.name()))
                        .setShopCode(orEmpty(s.shopCode()))
                        .build());
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void listDistinctShops(ListDistinctShopsRequest request, StreamObserver<ListDistinctShopsResponse> responseObserver) {
        try {
            ListDistinctShopsResponse.Builder resp = ListDistinctShopsResponse.newBuilder();
            for (SeedModels.ShopSeed s : repo.distinctShops()) {
                resp.addItems(Shop.newBuilder()
                        .setCode(s.code()).setName(orEmpty(s.name())).setAddress(orEmpty(s.address()))
                        .build());
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /**
     * D4 hint TG giao — deterministic đơn giản (spike, không phải order-promising thật):
     * from = now + 2h (làm tròn lên giờ kế), to = from + 1 ngày, timezone +07:00.
     */
    @Override
    public void getTimeDelivery(GetTimeDeliveryRequest request, StreamObserver<GetTimeDeliveryResponse> responseObserver) {
        try {
            ZoneId tz = ZoneId.of("Asia/Ho_Chi_Minh");
            ZonedDateTime from = ZonedDateTime.ofInstant(Instant.now().plus(Duration.ofHours(2)), tz)
                    .plusHours(1).truncatedTo(java.time.temporal.ChronoUnit.HOURS);
            ZonedDateTime to = from.plusDays(1);
            DateTimeFormatter iso = DateTimeFormatter.ISO_OFFSET_DATE_TIME;
            responseObserver.onNext(GetTimeDeliveryResponse.newBuilder()
                    .setSuggestedTime(TimeRange.newBuilder()
                            .setFrom(from.format(iso)).setTo(to.format(iso)))
                    .build());
            responseObserver.onCompleted();
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- Dashboard (SF-9) ----------------

    /** GET /fulfillment/dashboard-stats — aggregate thuần fulfillment DB
     *  (30 ngày theo original_time_from, TZ Asia/Ho_Chi_Minh; BFF merge phiếu). */
    @Override
    public void getDashboardStats(GetDashboardStatsRequest request,
            StreamObserver<GetDashboardStatsResponse> responseObserver) {
        try {
            ZoneId zone = ZoneId.of("Asia/Ho_Chi_Minh");
            LocalDate today = LocalDate.now(zone);
            DashboardStatsData s = repo.dashboardStats(today, zone);
            GetDashboardStatsResponse.Builder b = GetDashboardStatsResponse.newBuilder()
                    .setTotalToday(s.totalToday()).setPendingApproval(s.pendingApproval());
            for (DashboardStatsData.DayCount d : s.ordersPerDay()) {
                b.addOrdersPerDay(DayCount.newBuilder().setDate(d.date()).setCount(d.count()));
            }
            for (DashboardStatsData.BatchCount c : s.ordersPerBatch()) {
                b.addOrdersPerBatch(BatchOrderCount.newBuilder()
                        .setBatchCode(c.batchCode()).setCount(c.count()));
            }
            responseObserver.onNext(b.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- mapping helpers ----------------

    private static HubStoreOrderFilterItem toFilterItem(SeedModels.OrderSeed o) {
        HubStoreOrderFilterItem.Builder b = HubStoreOrderFilterItem.newBuilder()
                .setFulfillCode(orEmpty(o.fulfillCode()))
                .setStatusCodeValue(o.statusCode())
                .setBatchStatusValue(o.batchStatus())
                .setOrderStatusValue(o.orderStatus())
                .setCodAmount(o.codAmount())
                .setTotalQuantity(o.totalQuantity())
                .setIsDebtSplittingOrder(o.isDebtSplittingOrder())
                .setCustomerAddress(orEmpty(o.customerAddress()))
                // SF-13 fields 16-20 (intake) — fail state phải tới FE (D2 exception UI).
                .setCustomerName(orEmpty(o.customerName()))
                .setCustomerPhone(orEmpty(o.customerPhone()))
                .setFailReason(orEmpty(o.failReason()))
                .setFailNote(orEmpty(o.failNote()))
                .setOldFulfillCode(orEmpty(o.oldFulfillCode()));
        if (o.batchCode() != null) {
            b.setBatchCode(o.batchCode());
        }
        if (o.shopAssignment() != null) {
            b.setShopAssignment(ShopAssignment.newBuilder()
                    .setShopCode(orEmpty(o.shopAssignment().shopCode()))
                    .setShopName(orEmpty(o.shopAssignment().shopName()))
                    .setAddress(orEmpty(o.shopAssignment().address())));
        }
        if (o.originalTime() != null) {
            b.setOriginalTime(toTimeRange(o.originalTime()));
        }
        if (o.deliveryTime() != null) {
            b.setDeliveryTime(toTimeRange(o.deliveryTime()));
        }
        for (SeedModels.ProductSeed p : o.items()) {
            b.addItems(Product.newBuilder()
                    .setProductCode(orEmpty(p.productCode()))
                    .setProductName(orEmpty(p.productName()))
                    .setQuantity(p.quantity()));
        }
        if (o.distance() != null) {
            b.setDistance(o.distance());
        }
        if (o.note() != null) {
            b.setNote(o.note());
        }
        return b.build();
    }

    private static TimeRange toTimeRange(SeedModels.TimeRangeSeed t) {
        TimeRange.Builder b = TimeRange.newBuilder();
        if (t.from() != null) {
            b.setFrom(t.from());
        }
        if (t.to() != null) {
            b.setTo(t.to());
        }
        return b.build();
    }

    private static SeedModels.TimeRangeSeed fromProto(TimeRange t) {
        return new SeedModels.TimeRangeSeed(t.getFrom(), t.getTo());
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    /** Audit detail JSON — lỗi serialize không được kill RPC (fallback {}). */
    private static String json(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception e) {
            return "{}";
        }
    }

    // ---------------- D2C mapping helpers (SF-18) ----------------

    /** proto3 getter trả default instance (không null) — có field → Instant. */
    private static Instant instantOf(boolean has, Timestamp t) {
        return has ? Instant.ofEpochSecond(t.getSeconds(), t.getNanos()) : null;
    }

    private static Timestamp tsOf(Instant i) {
        return Timestamp.newBuilder().setSeconds(i.getEpochSecond()).setNanos(i.getNano()).build();
    }

    private static D2cOrder toD2cOrder(D2cOrderRecord o) {
        D2cOrder.Builder b = D2cOrder.newBuilder()
                .setOrderCode(orEmpty(o.orderCode()))
                .setOrderIdInter(orEmpty(o.orderIdInter()))
                .setDeliveryId(orEmpty(o.deliveryId()))
                .setCarrier(orEmpty(o.carrier()))
                .setShop(orEmpty(o.shop()))
                .setExportEmployee(orEmpty(o.exportEmployee()))
                .setReceiverName(orEmpty(o.receiverName()))
                .setReceiverPhone(orEmpty(o.receiverPhone()))
                .setReceiverAddress(orEmpty(o.receiverAddress()))
                .setServiceType(orEmpty(o.serviceType()))
                .setProductCategory(orEmpty(o.productCategory()))
                .setProductType(orEmpty(o.productType()))
                .setIsDebtSplitting(o.isDebtSplitting())
                .setNote(orEmpty(o.note()))
                .setStatus(orEmpty(o.status()))
                .setId(o.id());
        if (o.exportTime() != null) {
            b.setExportTime(tsOf(o.exportTime()));
        }
        if (o.pushTime() != null) {
            b.setPushTime(tsOf(o.pushTime()));
        }
        if (o.createdAt() != null) {
            b.setCreatedAt(tsOf(o.createdAt()));
        }
        return b.build();
    }

    private static <E extends Enum<E>> Set<Integer> enumsOf(List<E> values, Class<E> type,
                                                            java.util.function.Function<E, Integer> toNumber) {
        Set<Integer> out = new LinkedHashSet<>();
        values.forEach(v -> out.add(toNumber.apply(v)));
        return out;
    }
}
