package com.hubstore.fulfillment.events;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;

/**
 * SF-27 — dual bean theo flag kafka.enabled (= KAFKA_ENABLED env):
 * - true  → KafkaEventPublisher (spring-kafka autoconfig KafkaTemplate)
 * - false/unset → NoopEventPublisher. havingValue="false" + matchIfMissing=true
 *   phủ CẢ explicit-false lẫn unset (chỉ matchIfMissing là thiếu explicit-false
 *   → context fail thiếu bean khi .env set false tường minh).
 */
@Configuration
public class KafkaPublisherConfig {

    @Bean
    @ConditionalOnProperty(name = "kafka.enabled", havingValue = "true")
    public OrderEventPublisher kafkaEventPublisher(KafkaTemplate<String, String> template) {
        return new KafkaEventPublisher(template);
    }

    @Bean
    @ConditionalOnProperty(name = "kafka.enabled", havingValue = "false", matchIfMissing = true)
    public OrderEventPublisher noopEventPublisher() {
        return new NoopEventPublisher();
    }
}
