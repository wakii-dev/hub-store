package com.hubstore.fulfillment;

import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.store.InMemoryPrintErrorRepository;
import com.hubstore.fulfillment.store.PrintErrorRepository;
import com.hubstore.fulfillment.v1.GetPrintErrorCountsRequest;
import com.hubstore.fulfillment.v1.GetPrintErrorCountsResponse;
import com.hubstore.fulfillment.v1.PrintErrorRecord;
import com.hubstore.fulfillment.v1.RecordPrintErrorRequest;
import com.hubstore.fulfillment.v1.RecordPrintErrorResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SF-21 (FI-266) — print errors service-level qua InMemory repo (pattern
 * PrinterFlowTest, mock StreamObserver CollectingObserver): record insert +
 * counts GROUP BY order_code theo batch (D2 badge/sort D3).
 */
class PrintErrorFlowTest {

    private InMemoryPrintErrorRepository repo;
    private FulfillmentServiceImpl service;

    @BeforeEach
    void setUp() {
        var seed = com.hubstore.fulfillment.seed.SeedLoader.load(
                Path.of("../../api/seed/canonical-seed.json"));
        repo = new InMemoryPrintErrorRepository();
        service = new FulfillmentServiceImpl(
                new InMemoryOrderRepository(seed), new RecordingEventPublisher(),
                new D2cFilterAndNoteTest.InMemoryD2cRepo(List.of()),
                new com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository(
                        c -> false),
                new com.hubstore.fulfillment.store.InMemoryPrinterRepository(),
                repo, TestTx.noop());
    }

    private RecordPrintErrorResponse record(String orderCode, String batchCode) {
        CollectingObserver<RecordPrintErrorResponse> obs = new CollectingObserver<>();
        service.recordPrintError(RecordPrintErrorRequest.newBuilder()
                .setRecord(PrintErrorRecord.newBuilder()
                        .setOrderCode(orderCode).setBatchCode(batchCode)
                        .setPrintType("bill").setPrinterId("PRN-1")
                        .setErrorMessage("print-service unavailable"))
                .build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private GetPrintErrorCountsResponse counts(String batchCode) {
        CollectingObserver<GetPrintErrorCountsResponse> obs = new CollectingObserver<>();
        service.getPrintErrorCounts(
                GetPrintErrorCountsRequest.newBuilder().setBatchCode(batchCode).build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    @Test
    void recordInsertsRow() {
        RecordPrintErrorResponse resp = record("RSA-1", "BAT-1001");
        assertThat(resp).isEqualTo(RecordPrintErrorResponse.getDefaultInstance());
        assertThat(repo.countsByBatch("BAT-1001"))
                .containsExactly(new PrintErrorRepository.OrderErrorCount("RSA-1", 1L));
    }

    @Test
    void countsGroupByOrder() {
        record("RSA-1", "BAT-1001");
        record("RSA-1", "BAT-1001");
        record("RSA-2", "BAT-1001");
        record("RSA-9", "BAT-OTHER"); // phiếu khác — KHÔNG tính

        GetPrintErrorCountsResponse resp = counts("BAT-1001");
        assertThat(resp.getCountsList()).extracting(
                        com.hubstore.fulfillment.v1.PrintErrorCount::getOrderCode,
                        com.hubstore.fulfillment.v1.PrintErrorCount::getCount)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("RSA-1", 2L),
                        org.assertj.core.groups.Tuple.tuple("RSA-2", 1L));
    }

    @Test
    void emptyOrderCodeRecordedAndCounted() {
        // D2: batch chưa hydrate được → record với order_code rỗng (batch_code only).
        record("", "BAT-1001");
        assertThat(counts("BAT-1001").getCountsList()).hasSize(1);
        assertThat(counts("BAT-1001").getCounts(0).getOrderCode()).isEmpty();
    }

    @Test
    void countsUnknownBatchEmpty() {
        assertThat(counts("BAT-NONE").getCountsList()).isEmpty();
    }
}
