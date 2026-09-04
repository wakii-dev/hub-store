package com.hubstore.fulfillment;

import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.IntakeServiceImpl;
import com.hubstore.fulfillment.service.WebhookEventsDao;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.intake.v1.CreateWebhookOrderRequest;
import com.hubstore.intake.v1.CreateWebhookOrderResponse;
import com.hubstore.intake.v1.IntakeOrder;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SF-26 (FI-271) Task 5 — UNIT: publish "order.created" SAU commit, best-effort.
 * Spy publisher (RecordingEventPublisher) + fake WebhookEventsDao in-memory →
 * chạy KHÔNG cần Postgres:
 * <ul>
 *   <li>Lần đầu thành công → ĐÚNG 1 publish, type "order.created", key=fulfillCode,
 *       payload {fulfillCode, source, externalId, customerName}.</li>
 *   <li>Replay (PROCESSED) → 0 publish thêm (đơn không mới).</li>
 *   <li>Validation fail → 0 publish.</li>
 * </ul>
 * State machine trên Postgres thật (reclaim/CAS/rollback) xem {@link WebhookOrderDbTest}.
 */
class WebhookOrderPublishTest {

    private static final String SRC = "unit-sf26";

    /** In-memory dao — đủ state machine cho các path publish; không chạm DB. */
    static class FakeWebhookEventsDao extends WebhookEventsDao {
        final Map<String, WebhookEventsDao.Row> rows = new HashMap<>();

        FakeWebhookEventsDao() {
            super(new JdbcTemplate(new DriverManagerDataSource("jdbc:postgresql://localhost:1/none")));
        }

        private static String key(String source, String externalId) {
            return source + "|" + externalId;
        }

        @Override
        public Optional<WebhookEventsDao.Row> findStatus(String source, String externalId) {
            return Optional.ofNullable(rows.get(key(source, externalId)));
        }

        @Override
        public boolean claimInsert(String source, String externalId, String payloadJson) {
            return rows.putIfAbsent(key(source, externalId),
                    new WebhookEventsDao.Row("PENDING", null, Instant.now())) == null;
        }

        @Override
        public int casProcess(String source, String externalId, String fulfillCode, Instant claimedTs) {
            WebhookEventsDao.Row cur = rows.get(key(source, externalId));
            if (cur == null || !"PENDING".equals(cur.status())) {
                return 0;
            }
            rows.put(key(source, externalId),
                    new WebhookEventsDao.Row("PROCESSED", fulfillCode, cur.receivedAt()));
            return 1;
        }

        @Override
        public int markFailed(String source, String externalId, Instant claimedTs) {
            WebhookEventsDao.Row cur = rows.get(key(source, externalId));
            if (cur == null || !"PENDING".equals(cur.status())) {
                return 0;
            }
            rows.put(key(source, externalId),
                    new WebhookEventsDao.Row("FAILED", null, cur.receivedAt()));
            return 1;
        }
    }

    private FakeWebhookEventsDao dao;
    private RecordingEventPublisher publisher;
    private IntakeServiceImpl service;

    @BeforeEach
    void setUp() {
        SeedModels.SeedFile seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        dao = new FakeWebhookEventsDao();
        publisher = new RecordingEventPublisher();
        service = new IntakeServiceImpl(new InMemoryOrderRepository(seed), TestTx.noop(),
                dao, publisher, 120);
    }

    @Test
    void firstProcessSuccessPublishesExactlyOnceWithArgs() {
        CreateWebhookOrderResponse r = call("ext-pub-1", WebhookOrderValidationTest.validOrder());

        assertThat(r.getReplayed()).isFalse();
        assertThat(publisher.events).hasSize(1);
        RecordingEventPublisher.Event ev = publisher.events.get(0);
        assertThat(ev.type()).isEqualTo("order.created");
        assertThat(ev.key()).isEqualTo(r.getFulfillCode());
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) ev.payload();
        assertThat(payload.get("fulfillCode")).isEqualTo(r.getFulfillCode());
        assertThat(payload.get("source")).isEqualTo(SRC);
        assertThat(payload.get("externalId")).isEqualTo("ext-pub-1");
        assertThat(payload.get("customerName")).isEqualTo("Khách Webhook");
    }

    @Test
    void replayDoesNotPublishAgain() {
        CreateWebhookOrderResponse first = call("ext-pub-2", WebhookOrderValidationTest.validOrder());
        assertThat(publisher.events).hasSize(1);

        CreateWebhookOrderResponse second = call("ext-pub-2", WebhookOrderValidationTest.validOrder());
        assertThat(second.getReplayed()).isTrue();
        assertThat(second.getFulfillCode()).isEqualTo(first.getFulfillCode());
        // Replay KHÔNG publish — vẫn đúng 1 event từ lần đầu.
        assertThat(publisher.events).hasSize(1);
    }

    @Test
    void validationFailDoesNotPublish() {
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        IntakeOrder invalid = WebhookOrderValidationTest.validOrder().toBuilder()
                .setCustomerPhone("123")
                .build();
        service.createWebhookOrder(request("ext-pub-3", invalid), obs);
        assertThat(obs.error).isInstanceOf(StatusRuntimeException.class);
        assertThat(((StatusRuntimeException) obs.error).getStatus().getCode())
                .isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(publisher.events).isEmpty();
        assertThat(dao.findStatus(SRC, "ext-pub-3")).hasValueSatisfying(
                row -> assertThat(row.status()).isEqualTo("FAILED"));
    }

    // ---------------- helpers ----------------

    private CreateWebhookOrderResponse call(String externalId, IntakeOrder order) {
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request(externalId, order), obs);
        assertThat(obs.error).isNull();
        return obs.values.get(0);
    }

    private static CreateWebhookOrderRequest request(String externalId, IntakeOrder order) {
        return CreateWebhookOrderRequest.newBuilder()
                .setSource(SRC)
                .setExternalId(externalId)
                .setOrder(order)
                .build();
    }
}
