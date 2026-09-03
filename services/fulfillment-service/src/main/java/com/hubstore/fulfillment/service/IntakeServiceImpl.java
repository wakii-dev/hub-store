package com.hubstore.fulfillment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubstore.fulfillment.events.OrderEventPublisher;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.store.OrderRepository;
import com.hubstore.fulfillment.v1.Product;
import com.hubstore.intake.v1.AuditEntry;
import com.hubstore.intake.v1.ConfirmImportOrdersRequest;
import com.hubstore.intake.v1.ConfirmImportOrdersResponse;
import com.hubstore.intake.v1.CreateManualOrderRequest;
import com.hubstore.intake.v1.CreateManualOrderResponse;
import com.hubstore.intake.v1.CreateWebhookOrderRequest;
import com.hubstore.intake.v1.CreateWebhookOrderResponse;
import com.hubstore.intake.v1.DeliveryFailReason;
import com.hubstore.intake.v1.GetOrderAuditRequest;
import com.hubstore.intake.v1.GetOrderAuditResponse;
import com.hubstore.intake.v1.IntakeOrder;
import com.hubstore.intake.v1.IntakeServiceGrpc;
import com.hubstore.intake.v1.MarkOrderFailedRequest;
import com.hubstore.intake.v1.MarkOrderFailedResponse;
import com.hubstore.intake.v1.RedeliverOrderRequest;
import com.hubstore.intake.v1.RedeliverOrderResponse;
import com.hubstore.intake.v1.ValidateImportOrdersRequest;
import com.hubstore.intake.v1.ValidateImportOrdersResponse;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.stub.StreamObserver;
import net.devh.boot.grpc.server.service.GrpcService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * IntakeService SF-13 (plan Task 5). Actor từ metadata "x-user-name" (ActorInterceptor).
 * Codegen + insert + audit chạy trong MỘT transaction (TransactionTemplate) —
 * pg_advisory_xact_lock chỉ giữ trong tx nên nextFulfillCodes + insertOrders
 * phải cùng tx mới atomic (T4 IT finding).
 *
 * SF-26 (FI-271): CreateWebhookOrder — dedupe webhook_events (state machine
 * PENDING/PROCESSED/FAILED, CAS transitions, stale-reclaim) theo spec §3.
 */
@GrpcService
public class IntakeServiceImpl extends IntakeServiceGrpc.IntakeServiceImplBase {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** Vòng lặp re-select sau CAS conflict — kỳ vọng hội tụ sau vài vòng; vượt → UNAVAILABLE. */
    private static final int MAX_CLAIM_ATTEMPTS = 5;

    private final OrderRepository repo;
    private final TransactionTemplate tx;
    private final WebhookEventsDao webhookEvents;
    private final OrderEventPublisher events;
    /** PENDING cũ hơn ngưỡng này (giây) = crash mồ côi → reclaim (WEBHOOK_CLAIM_STALE_SECONDS). */
    private final long claimStaleSeconds;

    public IntakeServiceImpl(OrderRepository repo, TransactionTemplate tx,
                             WebhookEventsDao webhookEvents, OrderEventPublisher events,
                             @Value("${webhook.claim-stale-seconds:120}") long claimStaleSeconds) {
        this.repo = repo;
        this.tx = tx;
        this.webhookEvents = webhookEvents;
        this.events = events;
        this.claimStaleSeconds = claimStaleSeconds;
    }

    // ---------------- ValidateImportOrders ----------------

    @Override
    public void validateImportOrders(ValidateImportOrdersRequest request,
                                     StreamObserver<ValidateImportOrdersResponse> responseObserver) {
        try {
            List<IntakeValidator.IntakeRow> rows = stage(request.getOrdersList());
            responseObserver.onNext(ValidateImportOrdersResponse.newBuilder()
                    .addAllErrors(toProtoErrors(IntakeValidator.validate(rows, shopCodes())))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- ConfirmImportOrders / CreateManualOrder ----------------

    @Override
    public void confirmImportOrders(ConfirmImportOrdersRequest request,
                                    StreamObserver<ConfirmImportOrdersResponse> responseObserver) {
        try {
            List<String> codes = createOrders(stage(request.getOrdersList()), "order.imported");
            responseObserver.onNext(ConfirmImportOrdersResponse.newBuilder()
                    .addAllFulfillCodes(codes)
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    @Override
    public void createManualOrder(CreateManualOrderRequest request,
                                  StreamObserver<CreateManualOrderResponse> responseObserver) {
        try {
            List<String> codes = createOrders(List.of(stageRow(request.getOrder())), "order.created");
            responseObserver.onNext(CreateManualOrderResponse.newBuilder()
                    .setFulfillCode(codes.get(0))
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- CreateWebhookOrder (SF-26) ----------------

    /**
     * SF-26 webhook nhận đơn từ sàn — idempotency theo (source, external_id),
     * spec §3 flow 1-7 (CONTRACT):
     * <ol>
     *   <li>Blank source/external_id → INVALID_ARGUMENT (defense-in-depth cho
     *       caller gRPC trực tiếp — BFF đã chặn trước).</li>
     *   <li>PROCESSED → trả {fulfill_code lần đầu, replayed=true} (200).</li>
     *   <li>Chưa có row → claim INSERT ON CONFLICT (tx riêng, commit ngay);
     *       conflict → re-select: PROCESSED → replay; FAILED → casReprocess;
     *       PENDING fresh (&lt; stale secs) → UNAVAILABLE (caller retry);
     *       PENDING stale → casReclaim khóa trên stale ts đã đọc.</li>
     *   <li>Validate IntakeValidator → lỗi → markFailed + INVALID_ARGUMENT
     *       details rows (BFF map 422). FAILED không phải DeadlockHorror: gửi
     *       lại cùng externalId xử lý lại bình thường.</li>
     *   <li>TX xử lý: nextFulfillCodes → insertOrders → appendAudit → casProcess
     *       (PENDING→PROCESSED keyed claimed ts) TRONG CÙNG tx. casProcess
     *       != 1 → throw INTERNAL → rollback TOÀN BỘ: order KHÔNG tồn tại,
     *       KHÔNG publish — reclaimer thắng race sẽ tự xử lý.</li>
     *   <li>Publish order.created SAU commit — Task 5 (TODO bên dưới).</li>
     * </ol>
     */
    @Override
    public void createWebhookOrder(CreateWebhookOrderRequest request,
                                   StreamObserver<CreateWebhookOrderResponse> responseObserver) {
        try {
            String source = request.getSource() == null ? "" : request.getSource().trim();
            String externalId = request.getExternalId() == null ? "" : request.getExternalId().trim();
            // Bước 7 — defense-in-depth: proto3 default "" vẫn lọt tới đây nếu
            // caller gọi gRPC thẳng không qua BFF.
            List<GrpcErrors.ErrorDetail> blank = new ArrayList<>();
            if (source.isBlank()) {
                blank.add(new GrpcErrors.ErrorDetail("source", "source bắt buộc (vd header X-Source)."));
            }
            if (externalId.isBlank()) {
                blank.add(new GrpcErrors.ErrorDetail("externalId", "externalId bắt buộc (mã đơn phía sàn)."));
            }
            if (!blank.isEmpty()) {
                throw GrpcErrors.withDetails(Status.INVALID_ARGUMENT, "source/externalId bắt buộc.", blank);
            }
            CreateWebhookOrderResponse resp = webhookProcess(source, externalId, request.getOrder());
            responseObserver.onNext(resp);
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    /** Vòng claim/re-select (spec §3 bước 2-3) — CAS conflict → thử lại, bounded. */
    private CreateWebhookOrderResponse webhookProcess(String source, String externalId, IntakeOrder order) {
        String payloadJson = protoJson(order);
        for (int attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
            Optional<WebhookEventsDao.Row> cur = webhookEvents.findStatus(source, externalId);
            if (cur.isPresent()) {
                WebhookEventsDao.Row row = cur.get();
                if ("PROCESSED".equals(row.status())) {
                    // Replay — kết quả lần đầu, KHÔNG xử lý lại.
                    return webhookResponse(row.fulfillCode(), true);
                }
                if ("FAILED".equals(row.status())) {
                    if (webhookEvents.casReprocess(source, externalId) == 1) {
                        return processClaim(source, externalId, order, claimedTs(source, externalId));
                    }
                    continue; // đối thủ reprocess trước → re-select
                }
                // PENDING — fresh (request song song đang chạy) hay stale (crash mồ côi)?
                long ageSeconds = Duration.between(row.receivedAt(), Instant.now()).getSeconds();
                if (ageSeconds < claimStaleSeconds) {
                    throw Status.UNAVAILABLE.withDescription(
                            "Đơn webhook đang được xử lý bởi request khác — thử lại sau.").asRuntimeException();
                }
                if (webhookEvents.casReclaim(source, externalId, row.receivedAt()) == 1) {
                    return processClaim(source, externalId, order, claimedTs(source, externalId));
                }
                continue; // đối thủ reclaim trước → re-select
            }
            if (webhookEvents.claimInsert(source, externalId, payloadJson)) {
                return processClaim(source, externalId, order, claimedTs(source, externalId));
            }
            // Conflict — request song song claim trước → re-select.
        }
        throw Status.UNAVAILABLE.withDescription(
                "Webhook contention quá lâu (source=" + source + ") — thử lại sau.").asRuntimeException();
    }

    /**
     * Đã claim thành công (held claimedTs) → validate → TX xử lý. claimedTs
     * là received_at của claim HIỆN TẠI — mọi CAS dưới đây khóa trên nó.
     */
    private CreateWebhookOrderResponse processClaim(String source, String externalId,
                                                    IntakeOrder order, Instant claimedTs) {
        IntakeValidator.IntakeRow staged = stageRow(order);
        List<IntakeValidator.IntakeError> errors = IntakeValidator.validate(List.of(staged), shopCodes());
        if (!errors.isEmpty()) {
            // Bước 4 — markFailed commit ngay (ngoài tx xử lý): FAILED = lần gửi
            // này bị từ chối; mark đúng holder (keyed claimedTs).
            webhookEvents.markFailed(source, externalId, claimedTs);
            throw invalidArgumentRows("Đơn webhook có " + errors.size() + " lỗi dữ liệu.", errors);
        }
        String actor = ActorInterceptor.currentActor();
        String fulfillCode = tx.execute(status -> {
            String code = repo.nextFulfillCodes(1).get(0);
            Instant now = Instant.now();
            repo.insertOrders(List.of(buildOrder(code, staged, repo.distinctShops(), now, null)));
            repo.appendAudit(actor, "order.created", code, importDetail(now, List.of(code)));
            // Bước 5 — CAS final TRONG tx: rowsAffected != 1 → holder stale đã
            // bị reclaim → throw INTERNAL để TransactionTemplate ROLLBACK TOÀN
            // BỘ (order KHÔNG insert, code KHÔNG cấp, KHÔNG publish).
            if (webhookEvents.casProcess(source, externalId, code, claimedTs) != 1) {
                throw Status.INTERNAL.withDescription(
                        "Webhook claim đã bị reclaim trong lúc xử lý — giao dịch hoàn tác.").asRuntimeException();
            }
            return code;
        });
        // Bước 6 — TODO(SF-26 Task 5): publish "order.created" best-effort SAU
        // commit qua events.publish(...), CHỈ khi xử lý thành công lần đầu
        // (replayed=false path) — replay/rollback KHÔNG publish.
        return webhookResponse(fulfillCode, false);
    }

    /** claimed ts = received_at sau khi CAS claim thắng (re-select lấy giá trị now() mới). */
    private Instant claimedTs(String source, String externalId) {
        return webhookEvents.findStatus(source, externalId)
                .orElseThrow(() -> Status.INTERNAL.withDescription(
                        "webhook_events row mất sau claim (source=" + source + ").").asRuntimeException())
                .receivedAt();
    }

    private static CreateWebhookOrderResponse webhookResponse(String fulfillCode, boolean replayed) {
        return CreateWebhookOrderResponse.newBuilder()
                .setFulfillCode(fulfillCode == null ? "" : fulfillCode)
                .setReplayed(replayed)
                .build();
    }

    /**
     * IntakeOrder → JSON cho cột payload JSONB (spec: proto-JSON đã-map,
     * KHÔNG raw body). Jackson tự viết (protobuf-java-util KHÔNG có trong cây
     * deps — pom ngoài scope task này); camelCase khớp tên field proto.
     */
    private static String protoJson(IntakeOrder order) {
        try {
            java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
            m.put("customerName", order.getCustomerName());
            m.put("customerPhone", order.getCustomerPhone());
            m.put("customerAddress", order.getCustomerAddress());
            List<java.util.Map<String, Object>> items = new ArrayList<>(order.getItemsCount());
            for (Product p : order.getItemsList()) {
                items.add(java.util.Map.of("productCode", p.getProductCode(),
                        "productName", p.getProductName(), "quantity", p.getQuantity()));
            }
            m.put("items", items);
            m.put("codAmount", order.getCodAmount());
            m.put("quantity", order.getQuantity());
            m.put("shopHint", order.getShopHint());
            return JSON.writeValueAsString(m);
        } catch (Exception e) {
            throw Status.INTERNAL.withDescription("Serialize payload webhook thất bại.").asRuntimeException();
        }
    }

    /**
     * Validate lại → còn lỗi throw INVALID_ARGUMENT (BFF map 422 sẵn; KHÔNG dùng
     * FAILED_PRECONDITION — grpc-error.ts không map status 9) → 1 tx:
     * nextFulfillCodes(n) → insertOrders → appendAudit 1 entry PER ORDER
     * (action "order.imported" cho import, "order.created" cho tạo tay — spec §4).
     */
    private List<String> createOrders(List<IntakeValidator.IntakeRow> rows, String auditAction) {
        List<IntakeValidator.IntakeError> errors = IntakeValidator.validate(rows, shopCodes());
        if (!errors.isEmpty()) {
            throw invalidArgumentRows("Import có " + errors.size() + " dòng lỗi.", errors);
        }
        List<SeedModels.ShopSeed> shops = repo.distinctShops();
        String actor = ActorInterceptor.currentActor();
        return tx.execute(status -> {
            List<String> codes = repo.nextFulfillCodes(rows.size());
            Instant now = Instant.now();
            List<SeedModels.OrderSeed> orders = new ArrayList<>(rows.size());
            for (int i = 0; i < rows.size(); i++) {
                orders.add(buildOrder(codes.get(i), rows.get(i), shops, now, null));
            }
            repo.insertOrders(orders);
            String detail = importDetail(now, codes);
            for (String code : codes) {
                repo.appendAudit(actor, auditAction, code, detail);
            }
            return codes;
        });
    }

    // ---------------- MarkOrderFailed ----------------

    @Override
    public void markOrderFailed(MarkOrderFailedRequest request,
                                StreamObserver<MarkOrderFailedResponse> responseObserver) {
        try {
            String reason = reasonName(request.getReason());
            String note = request.getNote().isBlank() ? null : request.getNote();
            // 1 tx: read-gate + markFailed + appendAudit — crash giữa markFailed và
            // audit không mất entry; double-fail race → repo guard (IllegalArgumentException
            // khi FOR UPDATE thấy fail_reason đã set) → map 422 thay vì 500.
            tx.execute(status -> {
                SeedModels.OrderSeed order = repo.findByFulfillCode(request.getFulfillCode())
                        .orElseThrow(() -> GrpcErrors.notFound("fulfillCode", request.getFulfillCode()));
                if (order.failReason() != null) {
                    throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                            "fulfillCode", "Đơn đã FAILED.")));
                }
                try {
                    repo.markFailed(order.fulfillCode(), reason, note, Instant.now());
                } catch (IllegalArgumentException e) {
                    throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                            "fulfillCode", "Đơn đã FAILED.")));
                }
                repo.appendAudit(ActorInterceptor.currentActor(), "order.failed", order.fulfillCode(),
                        json("{\"reason\":\"" + reason + "\",\"note\":" + jsonOrNull(note) + "}"));
                return null;
            });
            responseObserver.onNext(MarkOrderFailedResponse.newBuilder().build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- RedeliverOrder ----------------

    @Override
    public void redeliverOrder(RedeliverOrderRequest request,
                               StreamObserver<RedeliverOrderResponse> responseObserver) {
        try {
            SeedModels.OrderSeed orig = repo.findByFulfillCode(request.getFulfillCode())
                    .orElseThrow(() -> GrpcErrors.notFound("fulfillCode", request.getFulfillCode()));
            if (orig.failReason() == null) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "fulfillCode", "Chỉ đơn FAILED được giao lại.")));
            }
            if (repo.hasRetry(orig.fulfillCode())) {
                throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                        "fulfillCode", "Đơn đã được giao lại.")));
            }
            String actor = ActorInterceptor.currentActor();
            String newCode = tx.execute(status -> {
                String code = repo.nextFulfillCodes(1).get(0);
                // Re-check AFTER nextFulfillCodes: advisory xact lock giữ đến commit
                // serialize 2 redeliver đồng thời — tx thua block đến khi tx thắng
                // commit rồi ĐỌC THẤY insert đã commit → chặn double-redeliver (D6).
                if (repo.hasRetry(orig.fulfillCode())) {
                    throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                            "fulfillCode", "Đơn đã được giao lại.")));
                }
                Instant now = Instant.now();
                // Copy customer fields/items/codAmount/totalQuantity/shopAssignment;
                // oldFulfillCode=code gốc; fail fields + times null (đơn mới).
                SeedModels.OrderSeed retry = new SeedModels.OrderSeed(
                        code, null, 0, 0, null,
                        orig.shopAssignment(), null, null, 1,
                        orig.items(), orig.codAmount(), orig.totalQuantity(), false,
                        orig.customerAddress(), null,
                        "Giao lại từ " + orig.fulfillCode(), List.of(),
                        orig.customerName(), orig.customerPhone(), orig.fulfillCode(),
                        null, null, null, now);
                repo.insertOrders(List.of(retry));
                repo.appendAudit(actor, "order.redelivered", code,
                        json("{\"oldFulfillCode\":\"" + orig.fulfillCode() + "\"}"));
                return code;
            });
            responseObserver.onNext(RedeliverOrderResponse.newBuilder()
                    .setNewFulfillCode(newCode)
                    .build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- GetOrderAudit ----------------

    @Override
    public void getOrderAudit(GetOrderAuditRequest request,
                              StreamObserver<GetOrderAuditResponse> responseObserver) {
        try {
            SeedModels.OrderSeed order = repo.findByFulfillCode(request.getFulfillCode())
                    .orElseThrow(() -> GrpcErrors.notFound("fulfillCode", request.getFulfillCode()));
            GetOrderAuditResponse.Builder resp = GetOrderAuditResponse.newBuilder();
            for (com.hubstore.fulfillment.store.AuditEntry e : repo.getAudit(order.fulfillCode())) {
                resp.addEntries(AuditEntry.newBuilder()
                        .setActor(orEmpty(e.actor()))
                        .setAction(orEmpty(e.action()))
                        .setTarget(orEmpty(e.target()))
                        // detail JSONB text giữ nguyên chuỗi — BFF parse.
                        .setDetailJson(orEmpty(e.detailJson()))
                        .setCreatedAt(e.createdAt() == null ? "" : e.createdAt().toString()));
            }
            responseObserver.onNext(resp.build());
            responseObserver.onCompleted();
        } catch (StatusRuntimeException e) {
            responseObserver.onError(e);
        } catch (RuntimeException e) {
            responseObserver.onError(Status.INTERNAL.withDescription(e.getMessage()).asRuntimeException());
        }
    }

    // ---------------- helpers ----------------

    /** proto IntakeOrder → dòng tạm (fulfillCode="", totalQuantity=quantity request). */
    private static IntakeValidator.IntakeRow stageRow(IntakeOrder o) {
        List<SeedModels.ProductSeed> items = new ArrayList<>(o.getItemsCount());
        for (Product p : o.getItemsList()) {
            items.add(new SeedModels.ProductSeed(
                    p.getProductCode(), p.getProductName(), p.getQuantity()));
        }
        SeedModels.OrderSeed staged = new SeedModels.OrderSeed(
                "", null, 0, 0, null, null, null, null, 0,
                items, o.getCodAmount(), o.getQuantity(), false,
                o.getCustomerAddress(), null, null, List.of(),
                o.getCustomerName(), o.getCustomerPhone(), null,
                null, null, null, null);
        return new IntakeValidator.IntakeRow(staged, o.getShopHint());
    }

    private static List<IntakeValidator.IntakeRow> stage(List<IntakeOrder> orders) {
        List<IntakeValidator.IntakeRow> rows = new ArrayList<>(orders.size());
        for (IntakeOrder o : orders) {
            rows.add(stageRow(o));
        }
        return rows;
    }

    private static List<com.hubstore.intake.v1.ImportError> toProtoErrors(
            List<IntakeValidator.IntakeError> errors) {
        List<com.hubstore.intake.v1.ImportError> out = new ArrayList<>(errors.size());
        for (IntakeValidator.IntakeError e : errors) {
            out.add(com.hubstore.intake.v1.ImportError.newBuilder()
                    .setRow(e.row())
                    .setColumn(e.column())
                    .setMessage(e.message())
                    .build());
        }
        return out;
    }

    private Set<String> shopCodes() {
        Set<String> codes = new LinkedHashSet<>();
        for (SeedModels.ShopSeed s : repo.distinctShops()) {
            codes.add(s.code());
        }
        return codes;
    }

    /** Dựng đơn hoàn chỉnh lúc insert: statusCode=0, orderStatus=1, batchStatus=0. */
    private static SeedModels.OrderSeed buildOrder(String code, IntakeValidator.IntakeRow row,
                                                   List<SeedModels.ShopSeed> shops, Instant now,
                                                   String oldFulfillCode) {
        SeedModels.OrderSeed staged = row.order();
        String shopHint = row.shopHint();
        SeedModels.ShopAssignmentSeed assignment = null;
        if (shopHint != null && !shopHint.isBlank()) {
            assignment = shops.stream()
                    .filter(s -> s.code().equals(shopHint))
                    .findFirst()
                    .map(s -> new SeedModels.ShopAssignmentSeed(s.code(), s.name(), s.address()))
                    .orElse(null);
        }
        return new SeedModels.OrderSeed(
                code, null, 0, 0, null,
                assignment, null, null, 1,
                staged.items(), staged.codAmount(), staged.totalQuantity(), false,
                staged.customerAddress(), null, null, List.of(),
                staged.customerName(), staged.customerPhone(), oldFulfillCode,
                null, null, null, now);
    }

    private static StatusRuntimeException invalidArgumentRows(String description,
                                                              List<IntakeValidator.IntakeError> errors) {
        List<GrpcErrors.ErrorDetail> details = new ArrayList<>(errors.size());
        for (IntakeValidator.IntakeError e : errors) {
            details.add(new GrpcErrors.ErrorDetail(e.column(), "Dòng " + e.row() + ": " + e.message()));
        }
        return GrpcErrors.withDetails(Status.INVALID_ARGUMENT, description, details);
    }

    /** DeliveryFailReason → enum name string spec (KHACH_VANG|SAI_DIA_CHI|KHACH_TU_CHOI|KHAC). */
    private static String reasonName(DeliveryFailReason reason) {
        if (reason == DeliveryFailReason.UNRECOGNIZED) {
            throw GrpcErrors.invalidArgument(List.of(new GrpcErrors.ErrorDetail(
                    "reason", "reason không hợp lệ.")));
        }
        return reason.name().replace("DELIVERY_FAIL_REASON_", "");
    }

    /** Audit detail import/manual — spec §4: "detail: count, codes" (kèm createdAt). */
    private static String importDetail(Instant now, List<String> codes) {
        try {
            java.util.Map<String, Object> detail = new java.util.LinkedHashMap<>();
            detail.put("createdAt", now.toString());
            detail.put("count", codes.size());
            detail.put("codes", codes);
            return JSON.writeValueAsString(detail);
        } catch (Exception e) {
            return "{\"createdAt\":\"" + now + "\"}";
        }
    }

    private static String json(String raw) {
        return raw;
    }

    /** JSON string value (có escape) hoặc null literal khi note rỗng. */
    private static String jsonOrNull(String s) {
        if (s == null) {
            return "null";
        }
        try {
            return JSON.writeValueAsString(s);
        } catch (Exception e) {
            return "null";
        }
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }
}
