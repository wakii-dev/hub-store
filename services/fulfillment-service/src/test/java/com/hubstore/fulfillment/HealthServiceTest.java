package com.hubstore.fulfillment;

import com.hubstore.fulfillment.health.FulfillmentHealthReadiness;
import io.grpc.ManagedChannel;
import io.grpc.Server;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;
import io.grpc.health.v1.HealthCheckRequest;
import io.grpc.health.v1.HealthCheckResponse;
import io.grpc.health.v1.HealthGrpc;
import io.grpc.inprocess.InProcessChannelBuilder;
import io.grpc.inprocess.InProcessServerBuilder;
import io.grpc.protobuf.services.HealthStatusManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SF-2 — grpc.health.v1 qua real-wire in-process server (register
 * manager.getHealthService() như devh GrpcHealthServiceAutoConfiguration làm):
 * NOT_SERVING trước ready (seed chưa xong), SERVING sau onReady.
 */
class HealthServiceTest {

    private Server server;
    private ManagedChannel channel;
    private HealthGrpc.HealthBlockingStub stub;
    private FulfillmentHealthReadiness readiness;

    @BeforeEach
    void setUp() throws Exception {
        HealthStatusManager manager = new HealthStatusManager();
        readiness = new FulfillmentHealthReadiness(manager); // ctor → NOT_SERVING
        String name = UUID.randomUUID().toString();
        server = InProcessServerBuilder.forName(name)
                .addService(manager.getHealthService())
                .build().start();
        channel = InProcessChannelBuilder.forName(name).directExecutor().build();
        stub = HealthGrpc.newBlockingStub(channel);
    }

    @AfterEach
    void tearDown() {
        channel.shutdownNow();
        server.shutdownNow();
    }

    @Test
    void notServingBeforeReady_thenServingAfterReady() {
        // Trước seed ready → NOT_SERVING (readiness thật).
        assertThat(stub.check(HealthCheckRequest.getDefaultInstance()).getStatus())
                .isEqualTo(HealthCheckResponse.ServingStatus.NOT_SERVING);

        readiness.onReady(); // = ApplicationReadyEvent sau khi seed load xong

        assertThat(stub.check(HealthCheckRequest.getDefaultInstance()).getStatus())
                .isEqualTo(HealthCheckResponse.ServingStatus.SERVING);
    }

    @Test
    void unknownServiceIsNotFound() {
        assertThatThrownBy(() -> stub.check(
                HealthCheckRequest.newBuilder().setService("no-such").build()))
                .isInstanceOfSatisfying(StatusRuntimeException.class,
                        e -> assertThat(e.getStatus().getCode())
                                .isEqualTo(Status.Code.NOT_FOUND));
    }
}
