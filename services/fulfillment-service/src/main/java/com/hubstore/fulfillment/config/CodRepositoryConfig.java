package com.hubstore.fulfillment.config;

import com.hubstore.fulfillment.store.CodConfirmationRepository;
import com.hubstore.fulfillment.store.InMemoryCodConfirmationRepository;
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
    public CodConfirmationRepository inMemoryCodConfirmationRepository() {
        // InMemory không cần seed path — confirmations chỉ sinh runtime (D1 eager insert).
        return new InMemoryCodConfirmationRepository();
    }
}
