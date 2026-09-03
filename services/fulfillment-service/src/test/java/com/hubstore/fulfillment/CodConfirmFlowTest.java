package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.store.AuditEntry;
import com.hubstore.fulfillment.store.CodConfirmation;
import com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.v1.BatchStatus;
import com.hubstore.fulfillment.v1.ConfirmBatchCodRequest;
import com.hubstore.fulfillment.v1.ConfirmBatchCodResponse;
import com.hubstore.fulfillment.v1.ConfirmCodItem;
import com.hubstore.fulfillment.v1.ConfirmCodRequest;
import com.hubstore.fulfillment.v1.ConfirmCodResponse;
import com.hubstore.fulfillment.v1.GetCodPendingRequest;
import com.hubstore.fulfillment.v1.GetCodPendingResponse;
import com.hubstore.fulfillment.v1.MutateOrderStatusRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SF-14 (FI-259) — confirm flow service-level qua InMemory repos (pattern
 * ValidationAndMutationTest, mock StreamObserver CollectingObserver):
 * eager PENDING lúc hoàn tất phiếu (D1), revert cleanup (D8), per-order +
 * batch confirm (D3/D7), GetCodPending badge.
 */
class CodConfirmFlowTest {

    private static final String BATCH = "B-COD-1";

    private SeedModels.SeedFile seed;
    private InMemoryOrderRepository repo;
    private InMemoryCodConfirmationRepository codRepo;
    private RecordingEventPublisher publisher;
    private FulfillmentServiceImpl service;

    /** 2 đơn COD (giá trị khác nhau) + 1 đơn không COD — từ seed, ép batchCode/cod. */
    @BeforeEach
    void setUp() {
        seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        List<SeedModels.OrderSeed> candidates = seed.orders().stream()
                .filter(o -> o.batchStatus() == 0 && !o.isDebtSplittingOrder()
                        && o.shopAssignment() != null)
                .limit(3)
                .toList();
        SeedModels.OrderSeed cod1 = withCod(candidates.get(0), 150_000L, BATCH);
        SeedModels.OrderSeed cod2 = withCod(candidates.get(1), 90_000L, BATCH);
        // Đơn thứ 3 không COD — assert skip insert khi hoàn tất.
        SeedModels.OrderSeed noCod = withCod(candidates.get(2), 0L, BATCH);
        seed = new SeedModels.SeedFile(
                List.of(cod1, cod2, noCod), seed.batches(), seed.deliveryStaff(),
                seed.printers(), seed.regions());
        repo = new InMemoryOrderRepository(seed);
        codRepo = new InMemoryCodConfirmationRepository(repo::isFailed);
        publisher = new RecordingEventPublisher();
        service = new FulfillmentServiceImpl(repo, publisher,
                new D2cFilterAndNoteTest.InMemoryD2cRepo(List.of()),
                codRepo, TestTx.noop());
    }

    // ---------------- helpers ----------------

    /** Seed không có đơn COD — hoán đổi codAmount giữ nguyên phần còn lại (positional ctor). */
    private static SeedModels.OrderSeed withCod(SeedModels.OrderSeed o, long cod) {
        return withCod(o, cod, o.batchCode());
    }

    private static SeedModels.OrderSeed withCod(SeedModels.OrderSeed o, long cod, String batchCode) {
        return new SeedModels.OrderSeed(o.fulfillCode(), o.orderCode(), o.statusCode(),
                o.batchStatus(), batchCode, o.shopAssignment(), o.originalTime(),
                o.deliveryTime(), o.orderStatus(), o.items(), cod, o.totalQuantity(),
                o.isDebtSplittingOrder(), o.customerAddress(), o.distance(), o.note(),
                o.history(), o.customerName(), o.customerPhone(), o.oldFulfillCode(),
                o.failReason(), o.failNote(), o.failedAt(), o.createdTime());
    }

    private String codeOf(int i) {
        return seed.orders().get(i).fulfillCode();
    }

    private void mutate(List<String> codes, BatchStatus target) {
        CollectingObserver<com.hubstore.fulfillment.v1.MutateOrderStatusResponse> obs =
                new CollectingObserver<>();
        service.mutateOrderStatus(MutateOrderStatusRequest.newBuilder()
                .addAllFulfillCodes(codes).setTargetBatchStatus(target).build(), obs);
        assertThat(obs.error).isNull();
    }

    private ConfirmCodResponse confirmCod(String code, Long collected) {
        ConfirmCodItem.Builder item = ConfirmCodItem.newBuilder().setFulfillCode(code);
        if (collected != null) {
            item.setCollectedAmount(collected);
        }
        CollectingObserver<ConfirmCodResponse> obs = new CollectingObserver<>();
        service.confirmCod(ConfirmCodRequest.newBuilder().addItems(item).build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private ConfirmBatchCodResponse confirmBatch() {
        CollectingObserver<ConfirmBatchCodResponse> obs = new CollectingObserver<>();
        service.confirmBatchCod(ConfirmBatchCodRequest.newBuilder()
                .setBatchCode(BATCH).build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private GetCodPendingResponse pending() {
        CollectingObserver<GetCodPendingResponse> obs = new CollectingObserver<>();
        service.getCodPending(GetCodPendingRequest.newBuilder()
                .setBatchCode(BATCH).build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private List<AuditEntry> auditOf(String target) {
        return repo.getAudit(target);
    }

    // ---------------- eager PENDING (D1) ----------------

    @Test
    void completePickingInsertsPendingRowForCodOrder() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        Optional<CodConfirmation> row = codRepo.findByFulfillCode(codeOf(0));
        assertThat(row).isPresent();
        CodConfirmation c = row.get();
        assertThat(c.status()).isEqualTo(CodConfirmation.STATUS_PENDING);
        assertThat(c.expectedAmount()).isEqualTo(150_000L);
        assertThat(c.batchCode()).isEqualTo(BATCH);
        assertThat(c.collectedAmount()).isNull();
        assertThat(c.completedAt()).isNotNull();
        assertThat(c.shopCode()).isEqualTo(seed.orders().get(0).shopAssignment().shopCode());
        assertThat(c.shopName()).isEqualTo(seed.orders().get(0).shopAssignment().shopName());
    }

    @Test
    void completePickingSkipsZeroCodOrder() {
        mutate(List.of(codeOf(0), codeOf(2)), BatchStatus.BATCH_STATUS_PREPARED);
        assertThat(codRepo.findByFulfillCode(codeOf(2))).isEmpty();
        assertThat(codRepo.findByFulfillCode(codeOf(0))).isPresent();
    }

    @Test
    void insertIsIdempotentOnReComplete() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        assertThat(pending().getPendingCount()).isEqualTo(1);
    }

    // ---------------- revert cleanup (D8) ----------------

    @Test
    void revertDeletesPendingRow() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        assertThat(codRepo.findByFulfillCode(codeOf(0))).isPresent();
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_NOT_PREPARED);
        assertThat(codRepo.findByFulfillCode(codeOf(0))).isEmpty();
    }

    @Test
    void revertKeepsConfirmedRow() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        confirmCod(codeOf(0), null);
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_NOT_PREPARED);
        Optional<CodConfirmation> row = codRepo.findByFulfillCode(codeOf(0));
        assertThat(row).isPresent();
        assertThat(row.get().status()).isEqualTo(CodConfirmation.STATUS_CONFIRMED);
    }

    // ---------------- per-order confirm (D3) ----------------

    @Test
    void confirmWithoutAmountUsesExpected() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        ConfirmCodResponse resp = confirmCod(codeOf(0), null);
        assertThat(resp.getResults(0).getSuccess()).isTrue();
        CodConfirmation c = codRepo.findByFulfillCode(codeOf(0)).orElseThrow();
        assertThat(c.status()).isEqualTo(CodConfirmation.STATUS_CONFIRMED);
        assertThat(c.collectedAmount()).isEqualTo(150_000L);
    }

    @Test
    void confirmWithZeroIsRealZeroNotExpected() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        ConfirmCodResponse resp = confirmCod(codeOf(0), 0L);
        assertThat(resp.getResults(0).getSuccess()).isTrue();
        assertThat(codRepo.findByFulfillCode(codeOf(0)).orElseThrow().collectedAmount()).isZero();
    }

    @Test
    void reConfirmIsLastWriteWins() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        confirmCod(codeOf(0), null);
        ConfirmCodResponse resp = confirmCod(codeOf(0), 120_000L);
        assertThat(resp.getResults(0).getSuccess()).isTrue();
        CodConfirmation c = codRepo.findByFulfillCode(codeOf(0)).orElseThrow();
        assertThat(c.collectedAmount()).isEqualTo(120_000L);
        // 2 lần confirm → 2 audit entries.
        assertThat(auditOf(codeOf(0))).hasSize(2);
    }

    @Test
    void confirmUnknownCodeFailsThatItemOnly() {
        ConfirmCodResponse resp = confirmCod("ORD-KHONG-TON-TAI", null);
        assertThat(resp.getResults(0).getSuccess()).isFalse();
        assertThat(resp.getResults(0).getMessage()).contains("ORD-KHONG-TON-TAI");
    }

    @Test
    void confirmAppendsAuditWithExpectedAndCollected() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        confirmCod(codeOf(0), 100_000L);
        List<AuditEntry> entries = auditOf(codeOf(0));
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).action()).isEqualTo("cod.confirmed");
        assertThat(entries.get(0).detailJson()).contains("150000").contains("100000");
    }

    // ---------------- batch confirm + badge (D7) ----------------

    @Test
    void batchConfirmConfirmsAllPendingWithExpected() {
        mutate(List.of(codeOf(0), codeOf(1)), BatchStatus.BATCH_STATUS_PREPARED);
        ConfirmBatchCodResponse resp = confirmBatch();
        assertThat(resp.getConfirmedCount()).isEqualTo(2);
        assertThat(resp.getTotalAmount()).isEqualTo(240_000L);
        assertThat(codRepo.findByFulfillCode(codeOf(0)).orElseThrow().status())
                .isEqualTo(CodConfirmation.STATUS_CONFIRMED);
        assertThat(codRepo.findByFulfillCode(codeOf(0)).orElseThrow().collectedAmount())
                .isEqualTo(150_000L);
        assertThat(codRepo.findByFulfillCode(codeOf(1)).orElseThrow().collectedAmount())
                .isEqualTo(90_000L);
    }

    @Test
    void batchConfirmExcludesFailedOrdersAndKeepsThemPending() {
        mutate(List.of(codeOf(0), codeOf(1)), BatchStatus.BATCH_STATUS_PREPARED);
        repo.markFailed(codeOf(1), "WRONG_ADDRESS", "KH không nhận", Instant.now());
        ConfirmBatchCodResponse resp = confirmBatch();
        assertThat(resp.getConfirmedCount()).isEqualTo(1);
        assertThat(resp.getTotalAmount()).isEqualTo(150_000L);
        // Đơn FAILED giữ PENDING (retry sau sẽ confirm qua đơn mới của nó).
        assertThat(codRepo.findByFulfillCode(codeOf(1)).orElseThrow().status())
                .isEqualTo(CodConfirmation.STATUS_PENDING);
    }

    @Test
    void batchConfirmAuditsOneEntryPerBatch() {
        mutate(List.of(codeOf(0), codeOf(1)), BatchStatus.BATCH_STATUS_PREPARED);
        confirmBatch();
        List<AuditEntry> entries = auditOf(BATCH);
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).action()).isEqualTo("cod.batch_confirmed");
        assertThat(entries.get(0).detailJson()).contains(codeOf(0)).contains(codeOf(1));
    }

    @Test
    void batchConfirmTwiceDoesNotDoubleCount() {
        mutate(List.of(codeOf(0)), BatchStatus.BATCH_STATUS_PREPARED);
        assertThat(confirmBatch().getConfirmedCount()).isEqualTo(1);
        assertThat(confirmBatch().getConfirmedCount()).isZero();
        assertThat(auditOf(BATCH)).hasSize(1); // lần 2 không audit (confirmed=0)
    }

    @Test
    void getCodPendingCountsAndSumsExpected() {
        assertThat(pending().getPendingCount()).isZero();
        mutate(List.of(codeOf(0), codeOf(1)), BatchStatus.BATCH_STATUS_PREPARED);
        assertThat(pending().getPendingCount()).isEqualTo(2);
        assertThat(pending().getTotalAmount()).isEqualTo(240_000L);
        confirmBatch();
        assertThat(pending().getPendingCount()).isZero();
    }

    @Test
    void getCodPendingExcludesFailedOrders() {
        mutate(List.of(codeOf(0), codeOf(1)), BatchStatus.BATCH_STATUS_PREPARED);
        repo.markFailed(codeOf(0), "WRONG_ADDRESS", "x", Instant.now());
        assertThat(pending().getPendingCount()).isEqualTo(1);
        assertThat(pending().getTotalAmount()).isEqualTo(90_000L);
    }
}
