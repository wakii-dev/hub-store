package com.hubstore.fulfillment.health;

import io.grpc.health.v1.HealthCheckResponse;
import io.grpc.protobuf.services.HealthStatusManager;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Readiness thật cho grpc.health.v1 (SF-2, context pack FI-272).
 *
 * <p>Health service CŨNG được register sẵn bởi devh starter
 * (GrpcHealthServiceAutoConfiguration — tự bật khi grpc-services trên classpath;
 * mvn dependency:tree: grpc-services:1.69.0 transitive → pom KHÔNG đổi).
 * Class này CHỈ điều khiển status của manager bean đó:
 *
 * <ul>
 *   <li>NOT_SERVING ngay khi bean tạo (HealthStatusManager mặc định SERVING —
 *       readiness KHÔNG được nói dối);</li>
 *   <li>SERVING CHỈ sau {@link ApplicationReadyEvent} — seed đã load sync trong
 *       InMemoryOrderRepository trước đó (application.yml: fulfillment.seed-path).</li>
 * </ul>
 */
@Component
public class FulfillmentHealthReadiness {

    private final HealthStatusManager manager;

    public FulfillmentHealthReadiness(HealthStatusManager manager) {
        this.manager = manager;
        this.manager.setStatus("", HealthCheckResponse.ServingStatus.NOT_SERVING);
    }

    /** Seed load xong (app context sẵn sàng) → SERVING. */
    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        manager.setStatus("", HealthCheckResponse.ServingStatus.SERVING);
    }
}
