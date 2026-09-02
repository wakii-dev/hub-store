package com.hubstore.fulfillment.events;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.kafka.KafkaAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/** SF-27 — flag off (mặc định + explicit false) → Noop, KHÔNG chạm Kafka; true → KafkaEventPublisher. */
class PublisherConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(KafkaAutoConfiguration.class))
            .withUserConfiguration(KafkaPublisherConfig.class);

    @Test
    void flagUnset() {
        runner.run(ctx -> assertThat(ctx.getBean(OrderEventPublisher.class)).isInstanceOf(NoopEventPublisher.class));
    }

    @Test
    void flagExplicitFalse() {
        runner.withPropertyValues("kafka.enabled=false")
                .run(ctx -> assertThat(ctx.getBean(OrderEventPublisher.class)).isInstanceOf(NoopEventPublisher.class));
    }

    @Test
    void flagTrue() {
        runner.withPropertyValues("kafka.enabled=true", "spring.kafka.bootstrap-servers=localhost:9092")
                .run(ctx -> assertThat(ctx.getBean(OrderEventPublisher.class)).isInstanceOf(KafkaEventPublisher.class));
    }
}
