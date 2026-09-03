package com.hubstore.fulfillment.config;

import com.hubstore.fulfillment.store.CodConfirmationRepository;
import com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository;
import com.hubstore.fulfillment.store.InMemoryOrderRepository;
import com.hubstore.fulfillment.store.PostgresCodConfirmationRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Chọn impl CodConfirmationRepository lúc boot (SF-14, FI-259) — pattern
 * OrderRepositoryConfig: plain repo class, bean wiring do config lo theo
 * fulfillment.store (postgres mặc định / inmemory test-only). Không bean nào
 * match (giá trị lạ) → Spring FAIL-LOUD lúc inject, không fallback âm thầm.
 */
@Configuration
public class CodRepositoryConfig {

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
    public CodConfirmationRepository postgresCodConfirmationRepository(JdbcTemplate jdbcTemplate) {
        return new PostgresCodConfirmationRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "inmemory")
    public CodConfirmationRepository inMemoryCodConfirmationRepository(
            InMemoryOrderRepository orderRepository) {
        // Wire D7: predicate failed-codes từ order repo (isFailed) — mirror JOIN
        // orders.fail_reason IS NULL phía Postgres. KHÔNG dùng no-arg ctor ở đây:
        // predicate `code -> false` làm D7 filter no-op âm thầm trên 4 batch paths
        // (twin parity break — P1 review 45a5fc5).
        return new InMemoryCodConfirmationRepository(orderRepository::isFailed);
    }

    /**
     * P0 plan-critic round 2 (SF-14 Task 2): inmemory không có DataSource →
     * không có PlatformTransactionManager auto-config → FulfillmentServiceImpl
     * không inject được TransactionTemplate (eager PENDING span 2 repos, D1).
     * spring-tx 6.x KHÔNG còn ResourcelessTransactionManager → no-op PTM 15
     * dòng: getTransaction trả status mới, commit/rollback không làm gì (repos
     * in-memory đã synchronized — tx chỉ cần "chạy được", không có gì để rollback).
     */
    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "inmemory")
    public org.springframework.transaction.PlatformTransactionManager noopTransactionManager() {
        return new org.springframework.transaction.PlatformTransactionManager() {
            @Override
            public org.springframework.transaction.TransactionStatus getTransaction(
                    org.springframework.transaction.TransactionDefinition definition) {
                return new org.springframework.transaction.support.SimpleTransactionStatus();
            }

            @Override
            public void commit(org.springframework.transaction.TransactionStatus status) {
                // no-op
            }

            @Override
            public void rollback(org.springframework.transaction.TransactionStatus status) {
                // no-op
            }
        };
    }
}
