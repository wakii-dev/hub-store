package com.hubstore.fulfillment;

import com.hubstore.fulfillment.events.OrderEventPublisher;
import com.hubstore.fulfillment.seed.SeedLoader;
import com.hubstore.fulfillment.seed.SeedModels;
import com.hubstore.fulfillment.service.GrpcErrors;
import com.hubstore.fulfillment.service.IntakeServiceImpl;
import com.hubstore.fulfillment.service.WebhookEventsDao;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.v1.Product;
import com.hubstore.intake.v1.CreateWebhookOrderRequest;
import com.hubstore.intake.v1.CreateWebhookOrderResponse;
import com.hubstore.intake.v1.IntakeOrder;
import io.grpc.Metadata;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SF-26 (FI-271) — UNIT: defense-in-depth blank source/external_id →
 * INVALID_ARGUMENT (spec §3 bước 7; chạy KHÔNG cần DB — check trước mọi Dao call).
 * State machine đầy đủ (replay/FAILED/PENDING/CAS) xem {@link WebhookOrderDbTest}.
 */
class WebhookOrderValidationTest {

    private IntakeServiceImpl service;

    @BeforeEach
    void setUp() {
        SeedModels.SeedFile seed = SeedLoader.load(Path.of("../../api/seed/canonical-seed.json"));
        // Dao không bao giờ được chạm (blank check trước mọi Dao call) — dummy
        // datasource chỉ để JdbcTemplate construct được.
        WebhookEventsDao neverCalledDao = new WebhookEventsDao(
                new JdbcTemplate(new DriverManagerDataSource("jdbc:postgresql://localhost:1/none")));
        service = new IntakeServiceImpl(new InMemoryOrderRepository(seed), TestTx.noop(),
                neverCalledDao, new OrderEventPublisher() {
                    @Override
                    public void publish(String type, String key, Object payload) {
                        // no-op
                    }
                }, 120);
    }

    @Test
    void blankSourceIsInvalidArgumentWithFieldDetail() {
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request("", "ext-blank-1"), obs);
        StatusRuntimeException e = (StatusRuntimeException) obs.error;
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(firstErrorField(e)).isEqualTo("source");
    }

    @Test
    void blankExternalIdIsInvalidArgumentWithFieldDetail() {
        CollectingObserver<CreateWebhookOrderResponse> obs = new CollectingObserver<>();
        service.createWebhookOrder(request("shopee", "  "), obs);
        StatusRuntimeException e = (StatusRuntimeException) obs.error;
        assertThat(e.getStatus().getCode()).isEqualTo(Status.Code.INVALID_ARGUMENT);
        assertThat(firstErrorField(e)).isEqualTo("externalId");
    }

    // ---------------- helpers ----------------

    private static CreateWebhookOrderRequest request(String source, String externalId) {
        return CreateWebhookOrderRequest.newBuilder()
                .setSource(source)
                .setExternalId(externalId)
                .setOrder(validOrder())
                .build();
    }

    static IntakeOrder validOrder() {
        return IntakeOrder.newBuilder()
                .setCustomerName("Khách Webhook")
                .setCustomerPhone("0912345678")
                .setCustomerAddress("Số 1 Đường Webhook, Hà Nội")
                .addItems(Product.newBuilder()
                        .setProductCode("SKU-WH-1").setProductName("Sản phẩm WH").setQuantity(2))
                .setQuantity(2)
                .setCodAmount(150_000)
                .build();
    }

    /** Decode metadata x-error-details (convention GrpcErrors) → field của lỗi đầu. */
    private static String firstErrorField(StatusRuntimeException e) {
        try {
            String encoded = e.getTrailers()
                    .get(Metadata.Key.of(GrpcErrors.METADATA_DETAILS_KEY, Metadata.ASCII_STRING_MARSHALLER));
            String json = URLDecoder.decode(encoded, StandardCharsets.UTF_8);
            return new com.fasterxml.jackson.databind.ObjectMapper().readTree(json)
                    .get(0).get("field").asText();
        } catch (Exception ex) {
            throw new IllegalStateException("Decode x-error-details thất bại", ex);
        }
    }
}
