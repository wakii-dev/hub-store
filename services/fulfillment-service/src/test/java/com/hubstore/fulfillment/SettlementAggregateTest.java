package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.store.CodConfirmation;
import com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.v1.CodCollectionStatus;
import com.hubstore.fulfillment.v1.GetSettlementDetailRequest;
import com.hubstore.fulfillment.v1.GetSettlementDetailResponse;
import com.hubstore.fulfillment.v1.GetSettlementRequest;
import com.hubstore.fulfillment.v1.GetSettlementResponse;
import com.google.protobuf.Timestamp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SF-14 (FI-259) — GetSettlement + GetSettlementDetail service-level qua
 * InMemory repos (pattern CodConfirmFlowTest, CollectingObserver):
 * GROUP BY shop semantics, mismatch count (CONFIRMED nhưng collected ≠
 * expected), pending count, kỳ [from, to) trên completed_at, D7 (đơn FAILED
 * loại khỏi aggregate + detail), mapper CodConfirmation → proto (T3).
 */
class SettlementAggregateTest {

    private static final Instant FROM = Instant.parse("2026-08-01T00:00:00Z");
    private static final Instant TO = Instant.parse("2026-09-01T00:00:00Z");
    private static final Instant IN_PERIOD = Instant.parse("2026-08-15T04:00:00Z");

    private InMemoryCodConfirmationRepository codRepo;
    private FulfillmentServiceImpl service;

    @BeforeEach
    void setUp() {
        SeedModels.SeedFile seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        // 4 đơn thuộc 4 shop khác nhau (S1 2 đơn + S2 + S3 + S4).
        List<SeedModels.OrderSeed> candidates = seed.orders().stream()
                .filter(o -> o.batchStatus() == 0 && !o.isDebtSplittingOrder()
                        && o.shopAssignment() != null)
                .limit(5)
                .toList();
        SeedModels.OrderSeed s1a = mutate(candidates.get(0), "S1", "Shop 1", 100_000L, null);
        SeedModels.OrderSeed s1b = mutate(candidates.get(1), "S1", "Shop 1", 100_000L, null);
        SeedModels.OrderSeed s2 = mutate(candidates.get(2), "S2", "Shop 2", 50_000L, null);
        // S3 — đơn FAILED (failReason set) → aggregate + detail phải loại (D7).
        SeedModels.OrderSeed s3 = mutate(candidates.get(3), "S3", "Shop 3", 30_000L, "OUT_OF_STOCK");
        // S4 — completed_at ngoài kỳ → aggregate loại.
        SeedModels.OrderSeed s4 = mutate(candidates.get(4), "S4", "Shop 4", 40_000L, null);
        SeedModels.SeedFile mutated = new SeedModels.SeedFile(
                List.of(s1a, s1b, s2, s3, s4), seed.batches(), seed.deliveryStaff(),
                seed.printers(), seed.regions());
        InMemoryOrderRepository repo = new InMemoryOrderRepository(mutated);
        codRepo = new InMemoryCodConfirmationRepository(repo::isFailed);
        service = new FulfillmentServiceImpl(repo, new RecordingEventPublisher(),
                new D2cFilterAndNoteTest.InMemoryD2cRepo(List.of()),
                codRepo, TestTx.noop());

        // S1: 1 PENDING + 1 CONFIRMED lệch tiền (collected 70k ≠ expected 100k).
        insert(s1a, IN_PERIOD, CodConfirmation.STATUS_PENDING, null);
        insert(s1b, IN_PERIOD, CodConfirmation.STATUS_PENDING, null);
        codRepo.confirmOne(s1b.fulfillCode(), 70_000L, "ops1", IN_PERIOD);
        // S2: CONFIRMED khớp tiền (collected = expected) — không mismatch.
        insert(s2, IN_PERIOD, CodConfirmation.STATUS_PENDING, null);
        codRepo.confirmOne(s2.fulfillCode(), null, "ops1", IN_PERIOD);
        // S3: PENDING nhưng đơn FAILED — D7 loại.
        insert(s3, IN_PERIOD, CodConfirmation.STATUS_PENDING, null);
        // S4: ngoài kỳ [from, to) — aggregate loại.
        insert(s4, TO.plus(1, ChronoUnit.DAYS), CodConfirmation.STATUS_PENDING, null);
    }

    // ---------------- helpers ----------------

    /** Seed không COD — hoán đổi shop + failReason giữ nguyên phần còn lại. */
    private static SeedModels.OrderSeed mutate(SeedModels.OrderSeed o, String shopCode,
            String shopName, long cod, String failReason) {
        return new SeedModels.OrderSeed(o.fulfillCode(), o.orderCode(), o.statusCode(),
                o.batchStatus(), o.batchCode(),
                new SeedModels.ShopAssignmentSeed(shopCode, shopName, "addr"),
                o.originalTime(), o.deliveryTime(), o.orderStatus(), o.items(), cod,
                o.totalQuantity(), o.isDebtSplittingOrder(), o.customerAddress(),
                o.distance(), o.note(), o.history(), o.customerName(),
                o.customerPhone(), o.oldFulfillCode(), failReason, o.failNote(),
                o.failedAt(), o.createdTime());
    }

    private void insert(SeedModels.OrderSeed o, Instant completedAt, int status, Long collected) {
        SeedModels.ShopAssignmentSeed shop = o.shopAssignment();
        codRepo.insertPendingIfAbsent(new CodConfirmation(o.fulfillCode(), o.batchCode(),
                shop.shopCode(), shop.shopName(), o.codAmount(), collected, null, null,
                completedAt, status));
    }

    private GetSettlementResponse settlement() {
        CollectingObserver<GetSettlementResponse> obs = new CollectingObserver<>();
        service.getSettlement(GetSettlementRequest.newBuilder()
                .setPeriodFrom(tsOf(FROM)).setPeriodTo(tsOf(TO)).build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private GetSettlementDetailResponse detail(String shopCode) {
        CollectingObserver<GetSettlementDetailResponse> obs = new CollectingObserver<>();
        service.getSettlementDetail(GetSettlementDetailRequest.newBuilder()
                .setShopCode(shopCode).setPeriodFrom(tsOf(FROM)).setPeriodTo(tsOf(TO))
                .build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private static Timestamp tsOf(Instant i) {
        return Timestamp.newBuilder().setSeconds(i.getEpochSecond()).setNanos(i.getNano()).build();
    }

    // ---------------- GetSettlement — GROUP BY semantics ----------------

    @Test
    void aggregate3ShopsGroupByTotalsAndCounts() {
        GetSettlementResponse resp = settlement();
        assertThat(resp.getRowsCount()).isEqualTo(2); // S3 FAILED + S4 ngoài kỳ loại
        var s1 = resp.getRows(0);
        assertThat(s1.getShopCode()).isEqualTo("S1");
        assertThat(s1.getTotalOrders()).isEqualTo(2);
        assertThat(s1.getTotalExpected()).isEqualTo(200_000L);
        assertThat(s1.getTotalCollected()).isEqualTo(70_000L); // PENDING đếm 0
        assertThat(s1.getDiffAmount()).isEqualTo(130_000L);
        assertThat(s1.getPendingCount()).isEqualTo(1);
        assertThat(s1.getMismatchCount()).isEqualTo(1); // CONFIRMED nhưng 70k ≠ 100k

        var s2 = resp.getRows(1);
        assertThat(s2.getShopCode()).isEqualTo("S2");
        assertThat(s2.getTotalOrders()).isEqualTo(1);
        assertThat(s2.getTotalExpected()).isEqualTo(50_000L);
        assertThat(s2.getTotalCollected()).isEqualTo(50_000L);
        assertThat(s2.getDiffAmount()).isEqualTo(0L);
        assertThat(s2.getPendingCount()).isEqualTo(0);
        assertThat(s2.getMismatchCount()).isEqualTo(0);
    }

    @Test
    void confirmZeroDongCountsAsMismatchNotPending() {
        // Case biên D3: confirm 0 đồng (presence 0) — là mismatch (thu lệch),
        // KHÔNG còn pending; không đụng diff (expected − 0).
        String pendingCode = detail("S1").getConfirmationsList().stream()
                .filter(c -> c.getStatus() == CodCollectionStatus.COD_PENDING)
                .findFirst().orElseThrow().getFulfillCode();
        codRepo.confirmOne(pendingCode, 0L, "ops1", IN_PERIOD);
        GetSettlementResponse resp = settlement();
        var s1 = resp.getRows(0);
        assertThat(s1.getPendingCount()).isEqualTo(0);
        assertThat(s1.getMismatchCount()).isEqualTo(2); // 70k lệch + 0 đồng lệch
        assertThat(s1.getTotalCollected()).isEqualTo(70_000L);
        assertThat(s1.getDiffAmount()).isEqualTo(130_000L);
    }

    @Test
    void shopCodeFilterReturnsSingleRow() {
        CollectingObserver<GetSettlementResponse> obs = new CollectingObserver<>();
        service.getSettlement(GetSettlementRequest.newBuilder()
                .setPeriodFrom(tsOf(FROM)).setPeriodTo(tsOf(TO))
                .setShopCode("S2").build(), obs);
        assertThat(obs.error).isNull();
        GetSettlementResponse resp = obs.values.get(0);
        assertThat(resp.getRowsCount()).isEqualTo(1);
        assertThat(resp.getRows(0).getShopCode()).isEqualTo("S2");
    }

    // ---------------- GetSettlementDetail ----------------

    @Test
    void detailMapsProtoInclStatusAndCollectedPresence() {
        GetSettlementDetailResponse resp = detail("S1");
        assertThat(resp.getConfirmationsCount()).isEqualTo(2);
        var confirmed = resp.getConfirmationsList().stream()
                .filter(c -> c.getStatus() == CodCollectionStatus.COD_CONFIRMED)
                .findFirst().orElseThrow();
        assertThat(confirmed.getFulfillCode()).isNotBlank();
        assertThat(confirmed.getCollectedAmount()).isEqualTo(70_000L);
        assertThat(confirmed.getCollectedBy()).isEqualTo("ops1");
        assertThat(confirmed.hasCollectedAt()).isTrue();
        assertThat(confirmed.hasCompletedAt()).isTrue();
        var pending = resp.getConfirmationsList().stream()
                .filter(c -> c.getStatus() == CodCollectionStatus.COD_PENDING)
                .findFirst().orElseThrow();
        assertThat(pending.hasCollectedAmount()).isFalse(); // optional presence — D3
        assertThat(pending.getExpectedAmount()).isEqualTo(100_000L);
    }

    @Test
    void detailExcludesFailedOrders() {
        GetSettlementDetailResponse resp = detail("S3");
        assertThat(resp.getConfirmationsCount()).isEqualTo(0); // đơn FAILED — D7
    }

    @Test
    void missingPeriodRejectedAsInvalidArgument() {
        CollectingObserver<GetSettlementResponse> obs = new CollectingObserver<>();
        service.getSettlement(GetSettlementRequest.newBuilder().build(), obs);
        assertThat(obs.error).isInstanceOf(io.grpc.StatusRuntimeException.class);
        assertThat(((io.grpc.StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(io.grpc.Status.Code.INVALID_ARGUMENT);
    }
}
