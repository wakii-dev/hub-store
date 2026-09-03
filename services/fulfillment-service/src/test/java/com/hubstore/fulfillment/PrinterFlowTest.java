package com.hubstore.fulfillment;

import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.service.GrpcErrors;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.store.InMemoryPrinterRepository;
import com.hubstore.fulfillment.store.PrinterRepository;
import com.hubstore.fulfillment.v1.CreatePrinterRequest;
import com.hubstore.fulfillment.v1.CreatePrinterResponse;
import com.hubstore.fulfillment.v1.ListPrintersRequest;
import com.hubstore.fulfillment.v1.ListPrintersResponse;
import com.hubstore.fulfillment.v1.Printer;
import com.hubstore.fulfillment.v1.UpdatePrinterRequest;
import com.hubstore.fulfillment.v1.UpdatePrinterResponse;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SF-21 (FI-266) — printer management service-level qua InMemory repos
 * (pattern CodConfirmFlowTest, mock StreamObserver CollectingObserver):
 * list theo shop, create + duplicate → ALREADY_EXISTS, update chỉ
 * name/ip/mac/type (identity immutable), update not-found → NOT_FOUND,
 * validation type bill|a4.
 */
class PrinterFlowTest {

    private InMemoryPrinterRepository repo;
    private FulfillmentServiceImpl service;

    @BeforeEach
    void setUp() {
        var seed = com.hubstore.fulfillment.seed.SeedLoader.load(
                Path.of("../../api/seed/canonical-seed.json"));
        repo = new InMemoryPrinterRepository();
        service = new FulfillmentServiceImpl(
                new InMemoryOrderRepository(seed), new RecordingEventPublisher(),
                new D2cFilterAndNoteTest.InMemoryD2cRepo(List.of()),
                new com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository(
                        c -> false),
                repo, new com.hubstore.fulfillment.store.InMemoryPrintErrorRepository(),
                TestTx.noop());
    }

    private static Printer printer(String shopCode, String printerId, String type) {
        return Printer.newBuilder()
                .setShopCode(shopCode).setPrinterId(printerId)
                .setName("Test Printer").setPrinterIp("10.0.0.9")
                .setMac("AA:BB:CC:DD:EE:FF").setType(type)
                .build();
    }

    private CreatePrinterResponse create(Printer p) {
        CollectingObserver<CreatePrinterResponse> obs = new CollectingObserver<>();
        service.createPrinter(CreatePrinterRequest.newBuilder().setPrinter(p).build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private StatusRuntimeException createErr(Printer p) {
        CollectingObserver<CreatePrinterResponse> obs = new CollectingObserver<>();
        service.createPrinter(CreatePrinterRequest.newBuilder().setPrinter(p).build(), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        return (StatusRuntimeException) obs.error;
    }

    private UpdatePrinterResponse update(String shopCode, String printerId, Printer p) {
        CollectingObserver<UpdatePrinterResponse> obs = new CollectingObserver<>();
        service.updatePrinter(UpdatePrinterRequest.newBuilder()
                .setShopCode(shopCode).setPrinterId(printerId).setPrinter(p).build(), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    // ---------------- list ----------------

    @Test
    void listEmptyByShop() {
        CollectingObserver<ListPrintersResponse> obs = new CollectingObserver<>();
        service.listPrinters(ListPrintersRequest.newBuilder().setShopCode("30201").build(), obs);
        assertThat(obs.error).isNull();
        assertThat(obs.values.get(0).getPrintersList()).isEmpty();
    }

    @Test
    void createThenListByShop() {
        create(printer("30201", "PRN-1", "bill"));
        create(printer("30202", "PRN-1", "a4"));

        CollectingObserver<ListPrintersResponse> obs = new CollectingObserver<>();
        service.listPrinters(ListPrintersRequest.newBuilder().setShopCode("30201").build(), obs);
        assertThat(obs.values.get(0).getPrintersCount()).isEqualTo(1);
        assertThat(obs.values.get(0).getPrinters(0).getPrinterId()).isEqualTo("PRN-1");
        assertThat(obs.values.get(0).getPrinters(0).getType()).isEqualTo("bill");
    }

    // ---------------- create ----------------

    @Test
    void createDuplicateSameShopFailsAlreadyExists() {
        create(printer("30201", "PRN-1", "bill"));
        StatusRuntimeException err = createErr(printer("30201", "PRN-1", "a4"));
        assertThat(err.getStatus().getCode()).isEqualTo(Status.Code.ALREADY_EXISTS);
    }

    @Test
    void createSamePrinterIdDifferentShopOk() {
        create(printer("30201", "PRN-1", "bill"));
        create(printer("30202", "PRN-1", "a4"));
        assertThat(repo.list("")).hasSize(2);
    }

    @Test
    void createInvalidTypeRejected() {
        StatusRuntimeException err = createErr(printer("30201", "PRN-X", "dotmatrix"));
        assertThat(err.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(err.getTrailers().get(io.grpc.Metadata.Key.of(
                GrpcErrors.METADATA_DETAILS_KEY, io.grpc.Metadata.ASCII_STRING_MARSHALLER)))
                .isNotNull();
    }

    @Test
    void createBlankIdentityRejected() {
        StatusRuntimeException err = createErr(printer("", "", "bill"));
        assertThat(err.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
    }

    // ---------------- update ----------------

    @Test
    void updateMutableFieldsOnly() {
        create(printer("30201", "PRN-1", "bill"));
        Printer changes = Printer.newBuilder()
                .setShopCode("99999")      // BẮT BUỘC bỏ qua — identity immutable (D9)
                .setPrinterId("PRN-HACK")  // BẮT BUỘC bỏ qua
                .setName("Renamed").setPrinterIp("10.0.0.10")
                .setMac("11:22:33:44:55:66").setType("a4")
                .build();
        UpdatePrinterResponse resp = update("30201", "PRN-1", changes);

        assertThat(resp.getPrinter().getShopCode()).isEqualTo("30201");
        assertThat(resp.getPrinter().getPrinterId()).isEqualTo("PRN-1");
        assertThat(resp.getPrinter().getName()).isEqualTo("Renamed");
        assertThat(resp.getPrinter().getPrinterIp()).isEqualTo("10.0.0.10");
        assertThat(resp.getPrinter().getMac()).isEqualTo("11:22:33:44:55:66");
        assertThat(resp.getPrinter().getType()).isEqualTo("a4");
        // identity KHÔNG bị di chuyển — old key vẫn tồn tại, không có row mới.
        assertThat(repo.get("30201", "PRN-1")).isPresent();
        assertThat(repo.get("99999", "PRN-HACK")).isEmpty();
    }

    @Test
    void updateNotFoundFails() {
        CollectingObserver<UpdatePrinterResponse> obs = new CollectingObserver<>();
        service.updatePrinter(UpdatePrinterRequest.newBuilder()
                .setShopCode("30201").setPrinterId("PRN-MISSING")
                .setPrinter(printer("30201", "PRN-MISSING", "a4")).build(), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.NOT_FOUND);
    }

    @Test
    void updateInvalidTypeRejected() {
        create(printer("30201", "PRN-1", "bill"));
        CollectingObserver<UpdatePrinterResponse> obs = new CollectingObserver<>();
        service.updatePrinter(UpdatePrinterRequest.newBuilder()
                .setShopCode("30201").setPrinterId("PRN-1")
                .setPrinter(printer("30201", "PRN-1", "laser")).build(), obs);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.INVALID_ARGUMENT);
    }

    // ---------------- repo-level ----------------

    @Test
    void inMemoryRepoDuplicateThrows() {
        repo.create(new PrinterRepository.Printer("30201", "P1", "n", "ip", "mac", "bill"));
        org.junit.jupiter.api.Assertions.assertThrows(
                PrinterRepository.DuplicatePrinterException.class,
                () -> repo.create(new PrinterRepository.Printer("30201", "P1", "n", "ip", "mac", "a4")));
    }

    @Test
    void inMemoryRepoUpdateMissingThrows() {
        org.junit.jupiter.api.Assertions.assertThrows(
                PrinterRepository.PrinterNotFoundException.class,
                () -> repo.update("30201", "P1",
                        new PrinterRepository.Printer("30201", "P1", "n", "ip", "mac", "a4")));
    }
}
