package com.hubstore.fulfillment;

import com.hubstore.fulfillment.service.ActorInterceptor;
import com.hubstore.fulfillment.service.IntakeServiceImpl;
import com.hubstore.fulfillment.service.WebhookEventsDao;
import com.hubstore.fulfillment.store.AuditEntry;
import com.hubstore.fulfillment.store.PostgresOrderRepository;
import com.hubstore.intake.v1.CreateWebhookOrderRequest;
import com.hubstore.intake.v1.CreateWebhookOrderResponse;
import com.hubstore.intake.v1.IntakeOrder;
import io.grpc.Metadata;
import io.grpc.MethodDescriptor;
import io.grpc.ServerCall;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.abort;

/**
 * INTEGRATION TEST — SF-26 (FI-271) CreateWebhookOrder state machine trên
 * Postgres THẬT (webhook_events V11 + orders + activity_log cùng DB).
 *
 * Skip-when-no-DB pattern SF-2 (PostgresIntakeIT): mvn test CHẠY class này,
 * PostgreSQL không có sẵn → abort (skip) chứ không fail.
 *
 * KHÔNG giả định DB rỗng: source test "it-sf26" riêng + codes ORD-* sinh ra
 * được track để cleanup (@AfterAll / @BeforeEach). webhook_events tự áp DDL
 * V11 (IF NOT EXISTS idempotent — giống hệt migration, Flyway boot sẽ no-op)
 * để test self-contained khi service chưa từng boot.
 */
class WebhookOrderDbTest {

    private static final String SRC = "it-sf26";
    /** DDL mirror V11__webhook_events.sql (IF NOT EXISTS — an toàn chạy trước Flyway). */
    private static final String V11_DDL = """
            CREATE TABLE IF NOT EXISTS webhook_events (
              id BIGSERIAL PRIMARY KEY,
              source VARCHAR NOT NULL,
              external_id VARCHAR NOT NULL,
              payload JSONB NOT NULL,
              status VARCHAR NOT NULL DEFAULT 'PENDING',
              fulfill_code VARCHAR,
              received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              processed_at TIMESTAMPTZ,
              CONSTRAINT uq_webhook_events_source_external UNIQUE (source, external_id)
            );
            CREATE INDEX IF NOT EXISTS idx_webhook_events_fulfill_code ON webhook_events (fulfill_code);
            """;

    private static JdbcTemplate jdbc;
    private static DriverManagerDataSource ds;
    private static IntakeServiceImpl service;
    private static RecordingEventPublisher publisher;
    /** Codes ORD-* codegen sinh trong test — cleanup (không đẩy max vĩnh viễn). */
    private static final List<String> GENERATED_CODES = new ArrayList<>();

    @BeforeAll
    static void connectOrSkip() {
        ds = new DriverManagerDataSource(dataSourceUrl(),
                env("FULFILLMENT_DB_USER", "hubstore"), dbPassword());
        try (var conn = ds.getConnection()) {
            // kết nối OK — giữ datasource.
        } catch (Exception e) {
            abort("postgres không có sẵn — bỏ qua integration test (" + e.getMessage() + "). "
                    + "Chạy: docker compose up -d postgres");
        }
        jdbc = new JdbcTemplate(ds);
        if (jdbc.queryForObject("SELECT to_regclass('public.orders') IS NULL", Boolean.class)) {
            abort("schema chưa migrate (bảng orders thiếu) — bỏ qua integration test.");
        }
        jdbc.execute(V11_DDL);
        publisher = new RecordingEventPublisher();
        service = new IntakeServiceImpl(
                new PostgresOrderRepository(jdbc),
                new TransactionTemplate(new DataSourceTransactionManager(ds)),
                new WebhookEventsDao(jdbc),
                publisher,
                120);
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

    @BeforeEach
    void cleanBetweenTests() {
        cleanup();
    }

    @AfterAll
    static void cleanup() {
        if (jdbc == null) {
            return; // skip @BeforeAll — không có gì để dọn
        }
        for (String code : GENERATED_CODES) {
            jdbc.update("DELETE FROM activity_log WHERE target = ?", code);
            jdbc.update("DELETE FROM orders WHERE fulfill_code = ?", code);
        }
        GENERATED_CODES.clear();
        jdbc.update("DELETE FROM webhook_events WHERE source = ?", SRC);
    }

    // ---------------- helpers ----------------

    private static CreateWebhookOrderRequest request(String externalId, IntakeOrder order) {
        return CreateWebhookOrderRequest.newBuilder()
                .setSource(SRC)
                .setExternalId(externalId)
                .setOrder(order)
                .build();
    }

    private static IntakeOrder invalidOrder() {
        // Phone sai format — IntakeValidator từ chối, phần còn lại hợp lệ.
        return WebhookOrderValidationTest.validOrder().toBuilder()
                .setCustomerPhone("123")
                .build();
    }

    /** Gọi RPC, trả response (fail test nếu error). */
    private static CreateWebhookOrderResponse call(String externalId, IntakeOrder order) {
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request(externalId, order), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    /**
     * Task 7: gọi RPC QUA {@link ActorInterceptor} thật với metadata
     * "x-user-name" (mô phỏng BFF gửi actor 'webhook:&lt;source&gt;') —
     * currentActor() đọc từ grpc Context do interceptor thiết lập.
     */
    private static CollectingObserver<CreateWebhookOrderResponse> callAsActor(
            String actor, String externalId, IntakeOrder order) {
        Metadata headers = new Metadata();
        headers.put(ActorInterceptor.USER_NAME_METADATA, actor);
        ServerCall<CreateWebhookOrderRequest, CreateWebhookOrderResponse> call =
                new ServerCall<>() {
                    @Override
                    public void request(int numMessages) {
                    }

                    @Override
                    public void sendHeaders(Metadata responseHeaders) {
                    }

                    @Override
                    public void sendMessage(CreateWebhookOrderResponse responseMessage) {
                    }

                    @Override
                    public void close(Status status, Metadata trailers) {
                    }

                    @Override
                    public boolean isCancelled() {
                        return false;
                    }

                    @Override
                    public MethodDescriptor<CreateWebhookOrderRequest, CreateWebhookOrderResponse>
                            getMethodDescriptor() {
                        return null;
                    }
                };
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        new ActorInterceptor().interceptCall(call, headers,
                (c, m) -> {
                    service.createWebhookOrder(request(externalId, order), obs);
                    return new ServerCall.Listener<CreateWebhookOrderRequest>() {
                    };
                });
        return obs;
    }

    private static int webhookAuditCount() {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM activity_log WHERE actor LIKE 'webhook:%'", Integer.class);
        return n == null ? 0 : n;
    }

    private static String webhookStatus(String externalId) {
        return jdbc.queryForObject(
                "SELECT status FROM webhook_events WHERE source = ? AND external_id = ?",
                String.class, SRC, externalId);
    }

    /** customerPhone trong cột payload JSONB — kiểm chứng payload không stale. */
    private static String payloadPhone(String externalId) {
        return jdbc.queryForObject(
                "SELECT payload->>'customerPhone' FROM webhook_events "
                        + "WHERE source = ? AND external_id = ?",
                String.class, SRC, externalId);
    }

    private static int orderCount(String fulfillCode) {
        Integer n = jdbc.queryForObject(
                "SELECT count(*) FROM orders WHERE fulfill_code = ?", Integer.class, fulfillCode);
        return n == null ? 0 : n;
    }

    private static int totalOrders() {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM orders", Integer.class);
        return n == null ? 0 : n;
    }

    private static void track(CreateWebhookOrderResponse r) {
        GENERATED_CODES.add(r.getFulfillCode());
    }

    // ---------------- tests ----------------

    @Test
    void replayProcessedReturnsSameCodeWithoutSecondOrder() {
        publisher.events.clear(); // publisher static dùng chung — đo riêng test này
        CreateWebhookOrderResponse first = call("ext-replay", WebhookOrderValidationTest.validOrder());
        track(first);
        assertThat(first.getReplayed()).isFalse();
        assertThat(first.getFulfillCode()).matches("ORD-[0-9]+");

        CreateWebhookOrderResponse second = call("ext-replay", WebhookOrderValidationTest.validOrder());
        assertThat(second.getReplayed()).isTrue();
        assertThat(second.getFulfillCode()).isEqualTo(first.getFulfillCode());

        // Replay KHÔNG tạo đơn thứ 2 + status vẫn PROCESSED.
        assertThat(orderCount(first.getFulfillCode())).isEqualTo(1);
        assertThat(webhookStatus("ext-replay")).isEqualTo("PROCESSED");
        // Task 5: đúng 1 publish "order.created" (lần đầu) — replay KHÔNG publish.
        assertThat(publisher.events).hasSize(1);
        assertThat(publisher.events.get(0).type()).isEqualTo("order.created");
        assertThat(publisher.events.get(0).key()).isEqualTo(first.getFulfillCode());
    }

    @Test
    void failedReprocessIssuesNewFulfillCode() {
        // Lần 1: payload lỗi → INVALID_ARGUMENT, webhook FAILED, KHÔNG có đơn.
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request("ext-fix", invalidOrder()), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(webhookStatus("ext-fix")).isEqualTo("FAILED");

        // Lần 2: sửa payload, CÙNG externalId → xử lý lại, code MỚI, replayed=false.
        CreateWebhookOrderResponse second = call("ext-fix", WebhookOrderValidationTest.validOrder());
        track(second);
        assertThat(second.getReplayed()).isFalse();
        assertThat(second.getFulfillCode()).matches("ORD-[0-9]+");
        assertThat(webhookStatus("ext-fix")).isEqualTo("PROCESSED");
        assertThat(orderCount(second.getFulfillCode())).isEqualTo(1);
    }

    @Test
    void failedReprocessRefreshesPayloadColumn() {
        // Lần 1: payload lỗi (phone "123") → FAILED; cột payload = payload lỗi.
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request("ext-payload", invalidOrder()), obs);
        assertThat(obs.error).isNotNull();
        assertThat(webhookStatus("ext-payload")).isEqualTo("FAILED");
        assertThat(payloadPhone("ext-payload")).isEqualTo("123");

        // Lần 2: gửi lại payload KHÁC (hợp lệ, phone 0912345678) cùng
        // externalId → casReprocess phải REFRESH payload khớp lần gửi mới
        // (P1 review: cột stale làm audit/Task 5 publish thấy order cũ).
        CreateWebhookOrderResponse r = call("ext-payload", WebhookOrderValidationTest.validOrder());
        track(r);
        assertThat(r.getReplayed()).isFalse();
        assertThat(webhookStatus("ext-payload")).isEqualTo("PROCESSED");
        assertThat(payloadPhone("ext-payload")).isEqualTo("0912345678");
    }

    @Test
    void freshPendingClaimReturnsUnavailable() {
        // Row PENDING fresh (received_at = now()) — request song song đang giữ.
        assertThat(new WebhookEventsDao(jdbc).claimInsert(SRC, "ext-pending", "{}")).isTrue();

        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request("ext-pending", WebhookOrderValidationTest.validOrder()), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.UNAVAILABLE);
        // Row không bị động vào.
        assertThat(webhookStatus("ext-pending")).isEqualTo("PENDING");
    }

    @Test
    void stalePendingIsReclaimedAndProcessed() {
        // Crash mồ côi: PENDING cũ hơn ngưỡng 120s.
        assertThat(new WebhookEventsDao(jdbc).claimInsert(SRC, "ext-stale", "{}")).isTrue();
        jdbc.update("UPDATE webhook_events SET received_at = now() - interval '300 seconds' "
                + "WHERE source = ? AND external_id = ?", SRC, "ext-stale");

        CreateWebhookOrderResponse r = call("ext-stale", WebhookOrderValidationTest.validOrder());
        track(r);
        // Reclaim + xử lý như lần đầu (replayed=false — khớp contract reprocess).
        assertThat(r.getReplayed()).isFalse();
        assertThat(r.getFulfillCode()).matches("ORD-[0-9]+");
        assertThat(webhookStatus("ext-stale")).isEqualTo("PROCESSED");
        assertThat(orderCount(r.getFulfillCode())).isEqualTo(1);
        // casReclaim REFRESH payload: trước reclaim là "{}" của claimInsert —
        // sau reclaim phải là payload của reclaimer (phone hợp lệ).
        assertThat(payloadPhone("ext-stale")).isEqualTo("0912345678");
    }

    @Test
    void casProcessLostRaceRollsBackWholeTransaction() {
        int before = totalOrders();
        // Mô phỏng thua race: reclaimer đã lấy row giữa claim và process →
        // casProcess trả 0 → INTERNAL → TransactionTemplate rollback TOÀN BỘ.
        WebhookEventsDao losingDao = new WebhookEventsDao(jdbc) {
            @Override
            public int casProcess(String source, String externalId, String fulfillCode,
                                  java.time.Instant claimedTs) {
                return 0;
            }
        };
        IntakeServiceImpl loser = new IntakeServiceImpl(
                new PostgresOrderRepository(jdbc),
                new TransactionTemplate(new DataSourceTransactionManager(ds)),
                losingDao, publisher, 120);

        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        loser.createWebhookOrder(request("ext-rollback", WebhookOrderValidationTest.validOrder()), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.INTERNAL);

        // Rollback thật: KHÔNG order mới sinh ra.
        assertThat(totalOrders()).isEqualTo(before);
        // Claim vẫn PENDING (casProcess bị override no-op) — reclaimer sẽ xử lý.
        assertThat(webhookStatus("ext-rollback")).isEqualTo("PENDING");
    }

    @Test
    void concurrentClaimsSameExternalIdCreateExactlyOneOrder() throws Exception {
        int before = totalOrders();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier gate = new CyclicBarrier(2);
        Callable<Object> task = () -> {
            gate.await(5, TimeUnit.SECONDS);
            CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
            service.createWebhookOrder(request("ext-race", WebhookOrderValidationTest.validOrder()), obs);
            return obs.error != null ? obs.error : obs.values.get(0);
        };
        Future<Object> fa = pool.submit(task);
        Future<Object> fb = pool.submit(task);
        Object ra = fa.get(15, TimeUnit.SECONDS);
        Object rb = fb.get(15, TimeUnit.SECONDS);
        pool.shutdownNow();

        List<CreateWebhookOrderResponse> successes = new ArrayList<>();
        for (Object r : List.of(ra, rb)) {
            if (r instanceof CreateWebhookOrderResponse resp) {
                successes.add(resp);
                track(resp);
            } else {
                // Nhánh chấp nhận: thua claim → PENDING fresh → UNAVAILABLE (caller retry).
                assertThat(((StatusRuntimeException) r).getStatus().getCode())
                        .isEqualTo(Status.Code.UNAVAILABLE);
            }
        }
        // Đúng 1 order được tạo; tối đa 1 success (thắng CAS), nếu 2 success thì
        // 1 phải là replay (PROCESSED nhìn thấy sau commit) — vẫn 1 order.
        assertThat(totalOrders() - before).isEqualTo(1);
        assertThat(successes.size()).isLessThanOrEqualTo(2);
        long freshSuccesses = successes.stream().filter(r -> !r.getReplayed()).count();
        assertThat(freshSuccesses).isEqualTo(1);
        if (successes.size() == 2) {
            assertThat(successes.get(0).getFulfillCode()).isEqualTo(successes.get(1).getFulfillCode());
        }
        assertThat(webhookStatus("ext-race")).isEqualTo("PROCESSED");
    }

    @Test
    void validationFailureDoesNotPublishEvent() {
        // Hợp đồng Task 5: validate fail KHÔNG publish. Publisher là static dùng
        // chung các test (test success khác đã publish) — clear trước khi gọi để
        // assert chính xác bất kể thứ tự chạy test.
        publisher.events.clear();
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request("ext-nopublish", invalidOrder()), obs);
        assertThat(obs.error).isNotNull();
        assertThat(publisher.events).isEmpty();
    }

    // ---------------- Task 7: audit-integration ----------------

    @Test
    void auditRecordsActorWebhookSourceWithOrderCreatedAction() {
        // Đúng 1 entry action "order.created", actor 'webhook:shopee' (metadata
        // x-user-name mà BFF gửi 'webhook:' + source) — đọc lại qua
        // repo.getAudit, cùng nguồn dữ liệu RPC GetOrderAudit.
        CollectingObserver<CreateWebhookOrderResponse> ok =
                callAsActor("webhook:shopee", "ext-audit", WebhookOrderValidationTest.validOrder());
        assertThat(ok.error).isNull();
        CreateWebhookOrderResponse r = ok.values.get(0);
        track(r);

        List<AuditEntry> entries = new PostgresOrderRepository(jdbc).getAudit(r.getFulfillCode());
        assertThat(entries).hasSize(1);
        assertThat(entries.get(0).action()).isEqualTo("order.created");
        assertThat(entries.get(0).actor()).isEqualTo("webhook:shopee");
        assertThat(entries.get(0).target()).isEqualTo(r.getFulfillCode());
    }

    @Test
    void failedPathWritesNoAuditEntry() {
        // Validate fail → INVALID_ARGUMENT, KHÔNG order được tạo → không có
        // audit nào (không có fulfillCode để GetOrderAudit — assert qua SQL:
        // tổng row actor 'webhook:%' không đổi sau lần gửi lỗi).
        int before = webhookAuditCount();
        CollectingObserver<CreateWebhookOrderResponse> obs =
                callAsActor("webhook:shopee", "ext-noaudit", invalidOrder());
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(webhookAuditCount()).isEqualTo(before);
    }
}
