package com.hubstore.fulfillment.config;

import com.hubstore.fulfillment.store.D2cOrderRepository;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.store.OrderRepository;
import com.hubstore.fulfillment.store.PostgresD2cOrderRepository;
import com.hubstore.fulfillment.store.PostgresOrderRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Chọn impl OrderRepository lúc boot (SF-2, FI-245):
 * <ul>
 *   <li>fulfillment.store=postgres (default, matchIfMissing=true):
 *       PostgresOrderRepository qua JdbcTemplate (Spring Boot auto-config khi
 *       spring-boot-starter-jdbc + datasource có mặt). Runtime thiếu datasource
 *       → Spring Boot FAIL-LOUD khi start (không fallback in-memory âm thầm).</li>
 *   <li>fulfillment.store=inmemory: chỉ dùng trong unit test context.</li>
 * </ul>
 * InMemoryOrderRepository không còn @Component — bean duy nhất đến từ đây.
 */
@Configuration
public class OrderRepositoryConfig {

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
    public OrderRepository postgresOrderRepository(JdbcTemplate jdbcTemplate) {
        return new PostgresOrderRepository(jdbcTemplate);
    }

    /** SF-18 (FI-263): D2C store — Postgres là impl duy nhất (in-memory chỉ sống trong unit test). */
    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
    public D2cOrderRepository postgresD2cOrderRepository(JdbcTemplate jdbcTemplate) {
        return new PostgresD2cOrderRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "inmemory")
    public OrderRepository inMemoryOrderRepository(
            @Value("${fulfillment.seed-path:}") String seedPathEnv) {
        // Constructor @Value của InMemory tự resolve seed path (SEED_PATH > fallback).
        return new InMemoryOrderRepository(seedPathEnv);
    }
}
