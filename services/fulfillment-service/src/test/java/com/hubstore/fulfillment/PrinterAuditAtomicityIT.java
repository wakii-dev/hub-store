package com.hubstore.fulfillment;

import com.hubstore.fulfillment.service.FulfillmentServiceImpl;
import com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository;
import com.hubstore.fulfillment.store.InMemoryPrintErrorRepository;
import com.hubstore.fulfillment.store.OrderRepository;
import com.hubstore.fulfillment.store.PostgresOrderRepository;
import com.hubstore.fulfillment.store.PostgresPrinterRepository;
import com.hubstore.fulfillment.store.PrinterRepository;
import com.hubstore.fulfillment.v1.CreatePrinterRequest;
import com.hubstore.fulfillment.v1.Printer;
import com.hubstore.fulfillment.v1.UpdatePrinterRequest;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Proxy;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.abort;

/**
 * INTEGRATION TEST — Review-nhóm-2 P1: atomic audit printer create/update
 * (FulfillmentServiceImpl wrap mutation + appendAudit trong 1 TransactionTemplate
 * — audit INSERT fail → rollback, KHÔNG để row printers mồ côi).
 *
 * Chạy thủ công:  mvn test -Dtest=PrinterAuditAtomicityIT
 * (cần: docker compose up -d postgres + migration V5/V12 đã apply).
 *
 * `mvn test` mặc định KHÔNG chạy file này (surefire chỉ include *Test.java).
 * Tên bắt đầu "Printer" để -Dtest='Printer*IT*' chọn được → skip khi không DB.
 *
 * Skip-if-no-DB: @BeforeAll thử connect qua FULFILLMENT_DB_* env (pattern
 * PostgresCodConfirmationRepositoryIT). Không kết nối được / bảng thiếu → abort.
 *
 * Fixture: shop_code prefix ZZIT- (không đụng seed 302xx); cleanup @AfterEach
 * trên printers + activity_log theo prefix.
 */
class PrinterAuditAtomicityIT {

    private static final String SHOP = "ZZIT-SHOP";
    private static final String PID_CREATE = "ZZIT-PRN-CREATE";
    private static final String PID_UPDATE = "ZZIT-PRN-UPDATE";

    private static JdbcTemplate jdbc;
    private static PostgresPrinterRepository printers;
    private static FulfillmentServiceImpl serviceGoodAudit;
    private static FulfillmentServiceImpl serviceFailingAudit;

    @BeforeAll
    static void connectOrSkip() {
        DriverManagerDataSource ds = new DriverManagerDataSource(dataSourceUrl(),
                env("FULFILLMENT_DB_USER", "hubstore"), dbPassword());
        try (var conn = ds.getConnection()) {
            // kết nối OK — giữ datasource.
        } catch (Exception e) {
            abort("postgres không có sẵn — bỏ qua integration test (" + e.getMessage() + "). "
                    + "Chạy: docker compose up -d postgres");
        }
        jdbc = new JdbcTemplate(ds);
        if (jdbc.queryForObject("SELECT to_regclass('public.printers') IS NULL", Boolean.class)) {
            abort("bảng printers thiếu (V12 chưa migrate) — bỏ qua integration test.");
        }
        if (jdbc.queryForObject("SELECT to_regclass('public.activity_log') IS NULL", Boolean.class)) {
            abort("bảng activity_log thiếu (V2/V5 chưa migrate) — bỏ qua integration test.");
        }
        printers = new PostgresPrinterRepository(jdbc);
        PostgresOrderRepository orders = new PostgresOrderRepository(jdbc);
        // TransactionTemplate THẬT (không phải TestTx.noop) — rollback phải có tác dụng.
        TransactionTemplate tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
        serviceGoodAudit = service(orders, printers, tx);
        // Audit sink hỏng: JDK proxy bọc OrderRepository thật — appendAudit ném,
        // mọi method khác delegate (service printer path chỉ gọi appendAudit).
        OrderRepository failingAudit = (OrderRepository) Proxy.newProxyInstance(
                OrderRepository.class.getClassLoader(), new Class<?>[]{OrderRepository.class},
                (proxy, method, args) -> {
                    if (method.getName().equals("appendAudit")) {
                        throw new IllegalStateException("audit sink down (IT)");
                    }
                    return method.invoke(orders, args);
                });
        serviceFailingAudit = service(failingAudit, printers, tx);
    }

    private static FulfillmentServiceImpl service(OrderRepository orderRepo,
            PrinterRepository printerRepo, TransactionTemplate tx) {
        return new FulfillmentServiceImpl(orderRepo, new RecordingEventPublisher(),
                new D2cFilterAndNoteTest.InMemoryD2cRepo(List.of()),
                new InMemoryCodConfirmationRepository(c -> false),
                printerRepo, new InMemoryPrintErrorRepository(), tx);
    }

    private static String dataSourceUrl() {
        return "jdbc:postgresql://" + env("FULFILLMENT_DB_HOST", "localhost")
                + ":" + env("FULFILLMENT_DB_PORT", "5432")
                + "/" + env("FULFILLMENT_DB_NAME", "fulfillment");
    }

    private static String dbPassword() {
        String p = System.getenv("FULFILLMENT_DB_PASSWORD");
        return p != null && !p.isBlank() ? p : env("POSTGRES_PASSWORD", "");
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? def : v;
    }

    @AfterEach
    void cleanupFixtures() {
        jdbc.update("DELETE FROM printers WHERE shop_code = ?", SHOP);
        jdbc.update("DELETE FROM activity_log WHERE target LIKE 'ZZIT-%'");
    }

    // ---------------- helpers ----------------

    private static Printer proto(String printerId, String name, String type) {
        return Printer.newBuilder()
                .setShopCode(SHOP).setPrinterId(printerId)
                .setName(name).setLocation("Khu IT")
                .setPrinterIp("10.9.9.9")
                .setMac("AA:BB:CC:DD:EE:99").setType(type)
                .build();
    }

    private static void seedPrinterRow(String printerId, String name) {
        jdbc.update("INSERT INTO printers (shop_code, printer_id, name, location, "
                        + "printer_ip, mac, type) VALUES (?, ?, ?, ?, ?, ?, ?)",
                SHOP, printerId, name, "Khu IT", "10.9.9.9", "AA:BB:CC:DD:EE:99", "bill");
    }

    private static long printerRowCount(String printerId) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM printers WHERE shop_code = ? AND printer_id = ?",
                Long.class, SHOP, printerId);
    }

    private static long auditCount(String action, String printerId) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM activity_log WHERE action = ? AND target = ?",
                Long.class, action, printerId);
    }

    // ---------------- negative: audit fail → mutation roll back ----------------

    @Test
    void createPrinterAuditFailRollsBackPrinterRow() {
        CollectingObserver<com.hubstore.fulfillment.v1.CreatePrinterResponse> obs =
                new CollectingObserver<>();
        serviceFailingAudit.createPrinter(CreatePrinterRequest.newBuilder()
                .setPrinter(proto(PID_CREATE, "Test", "bill")).build(), obs);

        // audit sink ném RuntimeException → service map INTERNAL (không crash).
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.INTERNAL);
        // P1: row printers KHÔNG được để lại sau khi audit INSERT fail.
        assertThat(printerRowCount(PID_CREATE)).isZero();
        assertThat(auditCount("printer.created", PID_CREATE)).isZero();
    }

    @Test
    void updatePrinterAuditFailRollsBackUpdate() {
        seedPrinterRow(PID_UPDATE, "Before");

        CollectingObserver<com.hubstore.fulfillment.v1.UpdatePrinterResponse> obs =
                new CollectingObserver<>();
        serviceFailingAudit.updatePrinter(UpdatePrinterRequest.newBuilder()
                .setShopCode(SHOP).setPrinterId(PID_UPDATE)
                .setPrinter(proto(PID_UPDATE, "After", "a4")).build(), obs);

        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.INTERNAL);
        // P1: mutation bị roll back — tên giữ nguyên "Before", không "After".
        String name = jdbc.queryForObject(
                "SELECT name FROM printers WHERE shop_code = ? AND printer_id = ?",
                String.class, SHOP, PID_UPDATE);
        assertThat(name).isEqualTo("Before");
        assertThat(auditCount("printer.updated", PID_UPDATE)).isZero();
    }

    // ---------------- positive: audit OK → row + audit cùng tồn tại ----------------

    @Test
    void createPrinterSuccessLeavesRowAndAudit() {
        CollectingObserver<com.hubstore.fulfillment.v1.CreatePrinterResponse> obs =
                new CollectingObserver<>();
        serviceGoodAudit.createPrinter(CreatePrinterRequest.newBuilder()
                .setPrinter(proto(PID_CREATE, "Test", "bill")).build(), obs);

        assertThat(obs.error).isNull();
        assertThat(printerRowCount(PID_CREATE)).isEqualTo(1);
        assertThat(auditCount("printer.created", PID_CREATE)).isEqualTo(1);
    }

    @Test
    void updatePrinterSuccessLeavesRowAndAudit() {
        seedPrinterRow(PID_UPDATE, "Before");

        CollectingObserver<com.hubstore.fulfillment.v1.UpdatePrinterResponse> obs =
                new CollectingObserver<>();
        serviceGoodAudit.updatePrinter(UpdatePrinterRequest.newBuilder()
                .setShopCode(SHOP).setPrinterId(PID_UPDATE)
                .setPrinter(proto(PID_UPDATE, "After", "a4")).build(), obs);

        assertThat(obs.error).isNull();
        String name = jdbc.queryForObject(
                "SELECT name FROM printers WHERE shop_code = ? AND printer_id = ?",
                String.class, SHOP, PID_UPDATE);
        assertThat(name).isEqualTo("After");
        assertThat(auditCount("printer.updated", PID_UPDATE)).isEqualTo(1);
    }
}
