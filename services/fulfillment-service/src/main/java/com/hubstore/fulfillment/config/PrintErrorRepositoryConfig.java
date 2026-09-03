package com.hubstore.fulfillment.config;

import com.hubstore.fulfillment.store.InMemoryPrintErrorRepository;
import com.hubstore.fulfillment.store.PostgresPrintErrorRepository;
import com.hubstore.fulfillment.store.PrintErrorRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Wiring PrintErrorRepository (SF-21) — pattern PrinterRepositoryConfig.
 * postgres là default (matchIfMissing=true); fulfillment.store=in-memory →
 * InMemory (unit test dùng wiring thủ công, không đi qua config này).
 */
@Configuration
public class PrintErrorRepositoryConfig {

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
    public PrintErrorRepository postgresPrintErrorRepository(JdbcTemplate jdbcTemplate) {
        return new PostgresPrintErrorRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "in-memory")
    public PrintErrorRepository inMemoryPrintErrorRepository() {
        return new InMemoryPrintErrorRepository();
    }
}
