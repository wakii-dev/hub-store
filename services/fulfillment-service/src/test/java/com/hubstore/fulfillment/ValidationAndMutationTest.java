package com.hubstore.fulfillment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.service.GrpcErrors;
import com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository;
import com.hubstore.fulfillment.store.InMemoryPrinterRepository;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.v1.AssignShopHubRequest;
import com.hubstore.fulfillment.v1.AssignShopHubResponse;
import com.hubstore.fulfillment.v1.BatchStatus;
import com.hubstore.fulfillment.v1.GetAssignHistoryRequest;
import com.hubstore.fulfillment.v1.GetAssignHistoryResponse;
import com.hubstore.fulfillment.v1.MutateOrderStatusRequest;
import com.hubstore.fulfillment.v1.MutateOrderStatusResponse;
import com.hubstore.fulfillment.v1.TimeRange;
import com.hubstore.fulfillment.v1.UpdateDeliveryTimeRequest;
import com.hubstore.fulfillment.v1.UpdateDeliveryTimeResponse;
import com.hubstore.fulfillment.v1.UpdateNoteRequest;
import com.hubstore.fulfillment.v1.UpdateNoteResponse;
import io.grpc.Metadata;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validations rule 2 + 3 (reject TỪNG điều kiện), mutate status chain,
 * history READ-semantics, note update — plan Task 5.
 */
class ValidationAndMutationTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private SeedModels.SeedFile seed;
    private InMemoryOrderRepository repo;
    private RecordingEventPublisher publisher;
    private FulfillmentServiceImpl service;

    @BeforeEach
    void setUp() {
        seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        repo = new InMemoryOrderRepository(seed);
        publisher = new RecordingEventPublisher();
        service = new FulfillmentServiceImpl(repo, publisher,
                new D2cFilterAndNoteTest.InMemoryD2cRepo(List.of()),
                new InMemoryCodConfirmationRepository(repo::isFailed),
                new InMemoryPrinterRepository(),
                new com.hubstore.fulfillment.store.InMemoryPrintErrorRepository(), TestTx.noop());
    }

    // ---------------- helpers ----------------

    private SeedModels.OrderSeed find(java.util.function.Predicate<SeedModels.OrderSeed> p) {
        return seed.orders().stream().filter(p).findFirst().orElseThrow();
    }

    private SeedModels.OrderSeed aNotPreparedOrder() {
        return find(o -> o.batchStatus() == 0 && !o.isDebtSplittingOrder());
    }

    private SeedModels.OrderSeed aDebtOrder() {
        return find(SeedModels.OrderSeed::isDebtSplittingOrder);
    }

    private SeedModels.OrderSeed anInBatchOrder() {
        return find(o -> o.batchStatus() != 0);
    }

    private StatusRuntimeException statusOf(Throwable t) {
        assertThat(t).isInstanceOf(StatusRuntimeException.class);
        return (StatusRuntimeException) t;
    }

    private JsonNode errorDetailsOf(Throwable t) throws Exception {
        StatusRuntimeException e = statusOf(t);
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        String encoded = e.getTrailers()
                .get(Metadata.Key.of(GrpcErrors.METADATA_DETAILS_KEY, Metadata.ASCII_STRING_MARSHALLER));
        assertThat(encoded).isNotNull();
        // Decode đúng convention BFF: encodeURIComponent → URLDecoder (ngược '+' ok vì
        // Java encode đã thay '+' bằng %20).
        String json = URLDecoder.decode(encoded, StandardCharsets.UTF_8);
        JsonNode arr = JSON.readTree(json);
        assertThat(arr.isArray()).isTrue();
        assertThat(arr.size()).isGreaterThan(0);
        assertThat(arr.get(0).has("field")).isTrue();
        assertThat(arr.get(0).has("message")).isTrue();
        return arr;
    }

    // ---------------- MutateOrderStatus chain ----------------

    @Test
    void mutateStatusChainCreateCompleteCancelRevert() {
        SeedModels.OrderSeed order = aNotPreparedOrder();
        String code = order.fulfillCode();

        // create → batchStatus 1 (Go tạo phiếu).
        MutateOrderStatusResponse resp1 = mutate(List.of(code), BatchStatus.BATCH_STATUS_PREPARING);
        assertThat(resp1.getResults(0).getSuccess()).isTrue();
        assertThat(repo.findByFulfillCode(code).orElseThrow().batchStatus()).isEqualTo(1);

        // complete → 2.
        mutate(List.of(code), BatchStatus.BATCH_STATUS_PREPARED);
        assertThat(repo.findByFulfillCode(code).orElseThrow().batchStatus()).isEqualTo(2);

        // cancel-revert → 0 + clear batchCode (§9).
        mutate(List.of(code), BatchStatus.BATCH_STATUS_NOT_PREPARED);
        SeedModels.OrderSeed reverted = repo.findByFulfillCode(code).orElseThrow();
        assertThat(reverted.batchStatus()).isEqualTo(0);
        assertThat(reverted.batchCode()).isNull();
    }

    @Test
    void mutateAndLookupResolveByOrderCodeRsa() {
        // Go chỉ có order_code (RSA-…) trong BatchingItem (proto không có
        // fulfill_code) — MutateOrderStatus + GetOrdersByCodes từ Go phải
        // resolve được theo orderCode (fix integration FI-241 walkthrough).
        SeedModels.OrderSeed order = aNotPreparedOrder();
        String rsa = order.orderCode();

        MutateOrderStatusResponse resp = mutate(List.of(rsa), BatchStatus.BATCH_STATUS_PREPARING);
        assertThat(resp.getResults(0).getSuccess()).isTrue();
        assertThat(repo.findByFulfillCode(rsa).orElseThrow().batchStatus()).isEqualTo(1);

        // Cả findByCodes (Go validate rule 1 khi tạo phiếu) resolve theo RSA.
        assertThat(repo.findByCodes(List.of(rsa))).hasSize(1);
    }

    @Test
    void mutateReportsUnknownCodeAsFailureNotError() {
        MutateOrderStatusResponse resp = mutate(
                List.of("ORD-KHONG-TON-TAI", aNotPreparedOrder().fulfillCode()),
                BatchStatus.BATCH_STATUS_PREPARING);
        assertThat(resp.getResultsCount()).isEqualTo(2);
        assertThat(resp.getResults(0).getSuccess()).isFalse();
        assertThat(resp.getResults(1).getSuccess()).isTrue();
    }

    @Test
    void mutateRejectsTargetWeightExceeded() {
        CollectingObserver<MutateOrderStatusResponse> obs = new CollectingObserver<>();
        service.mutateOrderStatus(MutateOrderStatusRequest.newBuilder()
                .addFulfillCodes(aNotPreparedOrder().fulfillCode())
                .setTargetBatchStatus(BatchStatus.BATCH_STATUS_WEIGHT_EXCEEDED)
                .build(), obs);
        assertThat(statusOf(obs.error).getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        // State không đổi.
        assertThat(repo.findByFulfillCode(aNotPreparedOrder().fulfillCode()).orElseThrow().batchStatus())
                .isEqualTo(0);
    }

    private MutateOrderStatusResponse mutate(List<String> codes, BatchStatus target) {
        CollectingObserver<MutateOrderStatusResponse> obs = new CollectingObserver<>();
        service.mutateOrderStatus(MutateOrderStatusRequest.newBuilder()
                .addAllFulfillCodes(codes)
                .setTargetBatchStatus(target)
                .build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    // ---------------- SF-27 — Kafka side-channel publish ----------------

    @Test
    @SuppressWarnings("unchecked")
    void mutatePublishesOrderEventsByTarget() {
        SeedModels.OrderSeed order = aNotPreparedOrder();

        // target 1 (PREPARING) → KHÔNG publish (đủ bởi batch.created phía Go).
        mutate(List.of(order.fulfillCode()), BatchStatus.BATCH_STATUS_PREPARING);
        assertThat(publisher.events).isEmpty();

        // target 0 (hủy) → order.cancelled kèm reason.
        CollectingObserver<MutateOrderStatusResponse> obs = new CollectingObserver<>();
        service.mutateOrderStatus(MutateOrderStatusRequest.newBuilder()
                .addFulfillCodes(order.fulfillCode())
                .setTargetBatchStatus(BatchStatus.BATCH_STATUS_NOT_PREPARED)
                .setReason("lỗi weights")
                .build(), obs);
        assertThat(obs.error).isNull();
        assertThat(publisher.events).hasSize(1);
        RecordingEventPublisher.Event ev = publisher.events.get(0);
        assertThat(ev.type()).isEqualTo("order.cancelled");
        assertThat(ev.key()).isEqualTo(order.fulfillCode());
        assertThat(((Map<String, Object>) ev.payload()).get("reason")).isEqualTo("lỗi weights");

        // target 2 (hoàn tất soạn) → order.completed.
        publisher.events.clear();
        service.mutateOrderStatus(MutateOrderStatusRequest.newBuilder()
                .addFulfillCodes(order.fulfillCode())
                .setTargetBatchStatus(BatchStatus.BATCH_STATUS_PREPARED)
                .build(), new CollectingObserver<>());
        assertThat(publisher.events).hasSize(1);
        assertThat(publisher.events.get(0).type()).isEqualTo("order.completed");
        assertThat(publisher.events.get(0).key()).isEqualTo(order.fulfillCode());
    }

    @Test
    void assignShopHubPublishesOrderAssigned() {
        SeedModels.OrderSeed order = aNotPreparedOrder();
        CollectingObserver<AssignShopHubResponse> obs = new CollectingObserver<>();
        service.assignShopHub(AssignShopHubRequest.newBuilder()
                .setFulfillCode(order.fulfillCode()).setTargetShopCode("30201").build(), obs);
        assertThat(obs.error).isNull();
        assertThat(publisher.events).hasSize(1);
        RecordingEventPublisher.Event ev = publisher.events.get(0);
        assertThat(ev.type()).isEqualTo("order.assigned");
        assertThat(ev.key()).isEqualTo(order.fulfillCode());
        assertThat(ev.payload().toString()).contains("targetShop");
    }

    // ---------------- Rule 2 — chuyển kho ----------------

    @Test
    void assignRejectsEmptyFulfillCode() throws Exception {
        CollectingObserver<AssignShopHubResponse> obs = new CollectingObserver<>();
        service.assignShopHub(AssignShopHubRequest.newBuilder().setTargetShopCode("30201").build(), obs);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("fulfillCode");
    }

    @Test
    void assignRejectsDebtSplittingOrder() throws Exception {
        SeedModels.OrderSeed debt = aDebtOrder();
        CollectingObserver<AssignShopHubResponse> obs = new CollectingObserver<>();
        service.assignShopHub(AssignShopHubRequest.newBuilder()
                .setFulfillCode(debt.fulfillCode()).setTargetShopCode("30201").build(), obs);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("fulfillCode");
        // State không đổi.
        assertThat(repo.findByFulfillCode(debt.fulfillCode()).orElseThrow().shopAssignment().shopCode())
                .isEqualTo(debt.shopAssignment().shopCode());
    }

    @Test
    void assignRejectsOrderNotBatchStatusZero() throws Exception {
        SeedModels.OrderSeed inBatch = anInBatchOrder();
        CollectingObserver<AssignShopHubResponse> obs = new CollectingObserver<>();
        service.assignShopHub(AssignShopHubRequest.newBuilder()
                .setFulfillCode(inBatch.fulfillCode()).setTargetShopCode("30201").build(), obs);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("batchStatus");
    }

    @Test
    void assignRejectsUnknownTargetShop() throws Exception {
        CollectingObserver<AssignShopHubResponse> obs = new CollectingObserver<>();
        service.assignShopHub(AssignShopHubRequest.newBuilder()
                .setFulfillCode(aNotPreparedOrder().fulfillCode())
                .setTargetShopCode("99999").build(), obs);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("targetShopCode");
    }

    @Test
    void assignSuccessMutatesShopAndAppendsHistory() {
        SeedModels.OrderSeed order = aNotPreparedOrder();
        SeedModels.ShopSeed target = repo.distinctShops().stream()
                .filter(s -> !s.code().equals(order.shopAssignment().shopCode()))
                .findFirst().orElseThrow();

        CollectingObserver<AssignShopHubResponse> obs = new CollectingObserver<>();
        service.assignShopHub(AssignShopHubRequest.newBuilder()
                .setFulfillCode(order.fulfillCode()).setTargetShopCode(target.code()).build(), obs);
        assertThat(obs.error).isNull();
        SeedModels.OrderSeed after = repo.findByFulfillCode(order.fulfillCode()).orElseThrow();
        assertThat(after.shopAssignment().shopCode()).isEqualTo(target.code());
        assertThat(after.shopAssignment().shopName()).isEqualTo(target.name());

        // History entry appended (from → to).
        CollectingObserver<GetAssignHistoryResponse> histObs = new CollectingObserver<>();
        service.getAssignHistory(GetAssignHistoryRequest.newBuilder()
                .setFulfillCode(order.fulfillCode()).build(), histObs);
        GetAssignHistoryResponse hist = histObs.values.get(0);
        assertThat(hist.getEntriesCount()).isEqualTo(order.history().size() + 1);
        var last = hist.getEntries(hist.getEntriesCount() - 1);
        assertThat(last.getFromShop().getShopCode()).isEqualTo(order.shopAssignment().shopCode());
        assertThat(last.getToShop().getShopCode()).isEqualTo(target.code());
    }

    // ---------------- History READ semantics ----------------

    @Test
    void getAssignHistoryIsReadOnly() {
        String code = aNotPreparedOrder().fulfillCode();
        List<com.hubstore.fulfillment.v1.ShopAssignmentHistoryEntry> before = repo.getHistory(code);
        int snapshotSize = before.size();

        for (int i = 0; i < 3; i++) {
            CollectingObserver<GetAssignHistoryResponse> obs = new CollectingObserver<>();
            service.getAssignHistory(GetAssignHistoryRequest.newBuilder().setFulfillCode(code).build(), obs);
            assertThat(obs.error).isNull();
            assertThat(obs.values.get(0).getEntriesCount()).isEqualTo(snapshotSize);
        }
        // Store KHÔNG đổi sau nhiều lần đọc.
        assertThat(repo.getHistory(code)).hasSize(snapshotSize);
        assertThat(repo.filter(new com.hubstore.fulfillment.store.OrderFilter(
                "", java.util.Set.of(), null, java.util.Set.of(), java.util.Set.of(),
                java.util.Set.of(), null, null, java.util.Set.of(), 1, 100)).total())
                .isEqualTo(seed.orders().size());
    }

    // ---------------- Rule 3 — edit TG giao ----------------

    @Test
    void updateDeliveryTimeRejectsWhenNotBatchStatusZero() throws Exception {
        SeedModels.OrderSeed inBatch = anInBatchOrder();
        CollectingObserver<UpdateDeliveryTimeResponse> obs = new CollectingObserver<>();
        service.updateDeliveryTime(UpdateDeliveryTimeRequest.newBuilder()
                .setFulfillCode(inBatch.fulfillCode())
                .setDeliveryTime(TimeRange.newBuilder().setFrom("2026-09-05T08:00:00+07:00")
                        .setTo("2026-09-05T12:00:00+07:00"))
                .build(), obs);
        JsonNode details = errorDetailsOf(obs.error);
        assertThat(details.get(0).get("field").asText()).isEqualTo("batchStatus");
        // State không đổi.
        assertThat(repo.findByFulfillCode(inBatch.fulfillCode()).orElseThrow().deliveryTime())
                .isEqualTo(inBatch.deliveryTime());
    }

    @Test
    void updateDeliveryTimeRejectsMissingRange() throws Exception {
        CollectingObserver<UpdateDeliveryTimeResponse> obs = new CollectingObserver<>();
        service.updateDeliveryTime(UpdateDeliveryTimeRequest.newBuilder()
                .setFulfillCode(aNotPreparedOrder().fulfillCode()).build(), obs);
        assertThat(errorDetailsOf(obs.error).get(0).get("field").asText()).isEqualTo("deliveryTime");
    }

    @Test
    void updateDeliveryTimeSuccessWhenNotPrepared() {
        String code = aNotPreparedOrder().fulfillCode();
        CollectingObserver<UpdateDeliveryTimeResponse> obs = new CollectingObserver<>();
        service.updateDeliveryTime(UpdateDeliveryTimeRequest.newBuilder()
                .setFulfillCode(code)
                .setDeliveryTime(TimeRange.newBuilder().setFrom("2026-09-06T08:00:00+07:00")
                        .setTo("2026-09-06T12:00:00+07:00"))
                .build(), obs);
        assertThat(obs.error).isNull();
        var updated = obs.values.get(0).getOrder();
        assertThat(updated.getDeliveryTime().getFrom()).isEqualTo("2026-09-06T08:00:00+07:00");
        assertThat(repo.findByFulfillCode(code).orElseThrow().deliveryTime().from())
                .isEqualTo("2026-09-06T08:00:00+07:00");
    }

    // ---------------- Note ----------------

    @Test
    void updateNoteWritesAndReturnsOrder() {
        String code = aNotPreparedOrder().fulfillCode();
        CollectingObserver<UpdateNoteResponse> obs = new CollectingObserver<>();
        service.updateNote(UpdateNoteRequest.newBuilder()
                .setFulfillCode(code).setNote("Giao sau 18h").build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.values.get(0).getOrder().getNote()).isEqualTo("Giao sau 18h");
        assertThat(repo.findByFulfillCode(code).orElseThrow().note()).isEqualTo("Giao sau 18h");
    }

    @Test
    void updateNoteUnknownCodeIsNotFound() {
        CollectingObserver<UpdateNoteResponse> obs = new CollectingObserver<>();
        service.updateNote(UpdateNoteRequest.newBuilder()
                .setFulfillCode("ORD-9999").setNote("x").build(), obs);
        assertThat(statusOf(obs.error).getStatus().getCode()).isEqualTo(Status.Code.NOT_FOUND);
    }
}
